-- 0007 — a ministry's own public page, at /m/<slug>: made from one form, read by a steward before anyone sees it.
--
--   * One page per ministry (lm.pages). It holds two copies of its words: the DRAFT the lead is working on and the LIVE copy a
--     steward read. The public reads the live copy only, so a lead can edit at any time and the public still sees only what a
--     person read. A change waits (state 'waiting') and replaces the live copy when a steward approves it (lm.page_review).
--   * A page is public only while it has a live copy AND its ministry is public. A change of the ministry's public name or city
--     sends the ministry back to be read (0002's rule); the page goes dark with it and returns when the ministry is read again.
--   * The slug (the address, /m/<slug>) is chosen from the ministry's name, is unique and lowercase, can be edited once before the
--     page first goes public, and never after.
--   * A photo is stored as bytes (jpeg or png, at most 1.5 MB, at most two on a page) and is served only when the live copy of a
--     public page names it, or to the ministry's own people, or to a steward reading a waiting page.
--   * Every insert and update writes an lm.events row with a name on it (ids and field names, never the words).
--   * A ministry that leaves (0006) takes its page and its photos with it.
-- New functions get no grant until they need one (CLAUDE.md rule 14): each is revoked here and granted by name.

create table lm.pages (
  id            uuid primary key default gen_random_uuid(),
  ministry_id   uuid not null unique references lm.ministries (id),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 60),
  slug_edits    smallint not null default 0 check (slug_edits between 0 and 1),
  draft         jsonb not null check (jsonb_typeof(draft) = 'object'),
  live          jsonb check (live is null or jsonb_typeof(live) = 'object'),
  state         text not null default 'draft' check (state in ('draft', 'waiting', 'sent_back', 'approved')),
  review_note   text check (review_note is null or length(review_note) <= 1000),
  submitted_at  timestamptz,
  live_by       uuid references auth.users (id),
  live_at       timestamptz,
  created_by    uuid not null references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check ((live is null) = (live_at is null) and (live is null) = (live_by is null)),     -- a live page always carries the steward's name and the time
  check (state <> 'approved' or live is not null)
);
create index pages_waiting on lm.pages (submitted_at) where state = 'waiting';

create table lm.page_photos (
  id           uuid primary key default gen_random_uuid(),
  ministry_id  uuid not null references lm.ministries (id),
  content_type text not null check (content_type in ('image/jpeg', 'image/png')),
  bytes        bytea not null check (octet_length(bytes) between 100 and 1572864),
  alt          text check (alt is null or (length(alt) <= 160 and alt !~ '[[:cntrl:]]')),
  created_by   uuid not null references auth.users (id),
  created_at   timestamptz not null default now(),
  check ((content_type = 'image/jpeg' and substring(bytes from 1 for 3) = '\xffd8ff'::bytea)
      or (content_type = 'image/png' and substring(bytes from 1 for 8) = '\x89504e470d0a1a0a'::bytea))      -- the bytes are what the label says
);
create index page_photos_by_ministry on lm.page_photos (ministry_id, created_at);

alter table lm.pages enable row level security;          -- no policy and no grant: only the functions below reach it
alter table lm.page_photos enable row level security;

-- ---- the record -------------------------------------------------------------------------------------------------------------------
create trigger touch before update on lm.pages for each row execute function lm.touch();
create trigger audit after insert or update on lm.pages for each row execute function lm.audit();
create function lm.audit_photo() returns trigger language plpgsql security definer set search_path = lm, app, pg_temp as $$
begin   -- ids only: the row itself holds the picture's bytes, which are never copied into the record
  insert into lm.events (ministry_id, actor_id, actor_label, kind, payload)
  values (coalesce(new.ministry_id, old.ministry_id), auth.uid(), lm.actor_label(), 'page_photos.' || lower(tg_op), jsonb_build_object('id', coalesce(new.id, old.id)));
  return coalesce(new, old);
end $$;
create trigger audit after insert or delete on lm.page_photos for each row execute function lm.audit_photo();

-- ---- guards the database keeps whatever calls it -----------------------------------------------------------------------------------
create function lm.pages_guard() returns trigger language plpgsql security definer set search_path = lm, app, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    if new.slug is distinct from old.slug then
      if old.live is not null then raise exception 'slug_locked' using hint = 'The address cannot change once the page has been public.'; end if;
      if old.slug_edits >= 1 then raise exception 'slug_edited_once' using hint = 'The address can be changed once before the page is public. That one change is used.'; end if;
      new.slug_edits := old.slug_edits + 1;
    end if;
    -- only a steward (or the operator's SQL, where nobody is signed in) changes what the public reads
    if new.live is distinct from old.live and auth.uid() is not null and not lm.is_steward() then
      raise exception 'steward_required' using hint = 'Only a steward at Linked Ministries can make a page public.';
    end if;
  end if;
  return new;
end $$;
create trigger pages_guard before update on lm.pages for each row execute function lm.pages_guard();

create function lm.photos_guard() returns trigger language plpgsql security definer set search_path = lm, app, pg_temp as $$
begin
  if (select count(*) from lm.page_photos where ministry_id = new.ministry_id) >= 6 then
    raise exception 'too_many_photos' using hint = 'Take a picture off your page first. A page holds two pictures.';
  end if;
  return new;
end $$;
create trigger photos_guard before insert on lm.page_photos for each row execute function lm.photos_guard();

-- a ministry that leaves takes its page and its pictures with it
create function lm.pages_leave() returns trigger language plpgsql security definer set search_path = lm, app, pg_temp as $$
begin
  if new.status = 'left' and old.status is distinct from 'left' then
    delete from lm.page_photos where ministry_id = new.id;
    delete from lm.pages where ministry_id = new.id;
  end if;
  return new;
end $$;
create trigger pages_leave after update on lm.ministries for each row execute function lm.pages_leave();

-- ---- the address ----------------------------------------------------------------------------------------------------------------------
create function lm.page_slug_for(p_name text) returns text language plpgsql stable security definer set search_path = lm, app, pg_temp as $$
declare base text; cand text; n int := 1;
begin
  base := btrim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'), '-');
  base := btrim(left(base, 50), '-');
  if length(base) < 3 then base := 'ministry'; end if;
  cand := base;
  while exists (select 1 from lm.pages where slug = cand) loop n := n + 1; cand := base || '-' || n; end loop;
  return cand;
end $$;

-- ---- clean and check the words of a page (the database holds every rule the form shows) ----------------------------------------------------
create function lm.page_clean(p_ministry uuid, d jsonb) returns jsonb language plpgsql stable security definer set search_path = lm, app, pg_temp as $$
declare
  tag text := btrim(coalesce(d ->> 'tagline', '')); about text := btrim(coalesce(d ->> 'about', ''));
  em text := lower(btrim(coalesce(d ->> 'email', ''))); ph text := btrim(coalesce(d ->> 'phone', ''));
  web text := btrim(coalesce(d ->> 'website', '')); give text := btrim(coalesce(d ->> 'give_url', '')); vs text := btrim(coalesce(d ->> 'verse', ''));
  meets jsonb := coalesce(d -> 'meets', '[]'::jsonb); photos jsonb := coalesce(d -> 'photos', '[]'::jsonb);
  out_meets jsonb := '[]'::jsonb; out_photos jsonb := '[]'::jsonb; r jsonb; dy text; tm text; pl text; pid uuid; al text;
begin
  if d is null or jsonb_typeof(d) <> 'object' then raise exception 'page_not_readable'; end if;
  if length(tag) < 5 or length(tag) > 140 or tag ~ '[[:cntrl:]]' then raise exception 'tagline_needed' using hint = 'Write one line that says what your ministry is. At least 5 letters, at most 140, on one line.'; end if;
  if length(about) < 20 or length(about) > 3000 then raise exception 'about_page_needed' using hint = 'Tell people about your ministry in your own words. At least 20 letters, at most 3000.'; end if;
  if about ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' then raise exception 'about_page_needed' using hint = 'The words have a mark a page cannot show. Take it out.'; end if;
  if jsonb_typeof(meets) <> 'array' or jsonb_array_length(meets) > 8 then raise exception 'meets_too_many' using hint = 'A page lists up to 8 times and places.'; end if;
  for r in select * from jsonb_array_elements(meets) loop
    dy := btrim(coalesce(r ->> 'day', '')); tm := btrim(coalesce(r ->> 'time', '')); pl := btrim(coalesce(r ->> 'place', ''));
    continue when dy = '' and tm = '' and pl = '';
    if length(dy) < 2 or length(dy) > 30 or length(tm) < 1 or length(tm) > 30 or length(pl) < 2 or length(pl) > 120 or (dy || tm || pl) ~ '[[:cntrl:]]' then
      raise exception 'meets_not_complete' using hint = 'Each row needs a day, a time and a place.';
    end if;
    out_meets := out_meets || jsonb_build_array(jsonb_build_object('day', dy, 'time', tm, 'place', pl));
  end loop;
  if em <> '' and (length(em) > 254 or em !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$') then raise exception 'email_not_readable' using hint = 'That email address does not look right. Or leave it empty.'; end if;
  if ph <> '' and ph !~ '^[0-9 ()+.-]{7,30}$' then raise exception 'phone_not_readable' using hint = 'A phone number has digits, spaces, dashes and brackets only. Or leave it empty.'; end if;
  if web <> '' and (web !~* '^https?://[^[:space:]]+$' or length(web) > 200) then raise exception 'website_not_readable' using hint = 'A website starts with http:// or https://. Or leave it empty.'; end if;
  if give <> '' and (give !~* '^https://[^[:space:]@]+$' or length(give) > 300) then raise exception 'give_url_not_readable' using hint = 'The link for gifts starts with https://. Or leave it empty.'; end if;
  if vs <> '' and vs !~ '^[a-z0-9_]{1,30}$' then raise exception 'verse_not_readable' using hint = 'Choose a verse from the list, or none.'; end if;
  if jsonb_typeof(photos) <> 'array' or jsonb_array_length(photos) > 2 then raise exception 'too_many_photos' using hint = 'A page holds two pictures at most.'; end if;
  for r in select * from jsonb_array_elements(photos) loop
    begin pid := (r ->> 'id')::uuid; exception when others then raise exception 'photo_not_found' using hint = 'That picture was not found. Add it again.'; end;
    if not exists (select 1 from lm.page_photos where id = pid and ministry_id = p_ministry) then raise exception 'photo_not_found' using hint = 'That picture was not found. Add it again.'; end if;
    al := left(btrim(coalesce(r ->> 'alt', '')), 160);
    if al ~ '[[:cntrl:]]' then al := ''; end if;
    out_photos := out_photos || jsonb_build_array(jsonb_build_object('id', pid::text, 'alt', al));
  end loop;
  return jsonb_strip_nulls(jsonb_build_object('tagline', tag, 'about', about, 'meets', out_meets,
    'email', nullif(em, ''), 'phone', nullif(ph, ''), 'website', nullif(web, ''), 'give_url', nullif(give, ''), 'verse', nullif(vs, ''), 'photos', out_photos));
end $$;

-- ---- the lead's side: read my page, add a picture, save (and send) -----------------------------------------------------------------------------------
create function lm.page_mine() returns jsonb language plpgsql stable security definer set search_path = lm, app, pg_temp as $$
declare m lm.ministries; g lm.pages;
begin
  select * into m from lm.ministries where id = lm.my_ministry();
  if m.id is null then return null; end if;
  select * into g from lm.pages where ministry_id = m.id;
  if g.id is null then
    return jsonb_build_object('exists', false, 'suggested_slug', lm.page_slug_for(m.name), 'ministry', jsonb_build_object('name', m.name, 'city', m.city, 'state', m.state, 'status', m.status));
  end if;
  return jsonb_build_object('exists', true, 'slug', g.slug, 'slug_edits', g.slug_edits, 'slug_locked', g.live is not null or g.slug_edits >= 1,
    'state', g.state, 'review_note', g.review_note, 'draft', g.draft, 'has_live', g.live is not null, 'live_at', g.live_at,
    'public', g.live is not null and m.status = 'public',
    'ministry', jsonb_build_object('name', m.name, 'city', m.city, 'state', m.state, 'status', m.status));
end $$;

create function lm.photo_add(p_type text, p_bytes bytea, p_alt text) returns uuid language plpgsql security definer set search_path = lm, app, pg_temp as $$
declare v_id uuid; m uuid := lm.my_ministry();
begin
  if m is null then raise exception 'ministry_required'; end if;
  if not lm.is_lead() then raise exception 'lead_required' using hint = 'Only a lead can change the ministry''s page.'; end if;
  -- a picture that no draft or live copy names, and is a day old, was never used: it goes
  delete from lm.page_photos p where p.ministry_id = m and p.created_at < now() - interval '1 day'
    and not exists (select 1 from lm.pages g where g.ministry_id = m and (g.draft -> 'photos' @> jsonb_build_array(jsonb_build_object('id', p.id::text)) or g.live -> 'photos' @> jsonb_build_array(jsonb_build_object('id', p.id::text))));
  insert into lm.page_photos (ministry_id, content_type, bytes, alt, created_by) values (m, p_type, p_bytes, nullif(left(btrim(coalesce(p_alt, '')), 160), ''), auth.uid()) returning id into v_id;
  return v_id;
end $$;

create function lm.page_save(p_name text, p_city text, p_state text, p_slug text, p_draft jsonb, p_submit boolean) returns jsonb
language plpgsql security definer set search_path = lm, app, pg_temp as $$
declare m lm.ministries; g lm.pages; v_clean jsonb; v_slug text := lower(btrim(coalesce(p_slug, ''))); v_state text; v_suggest text;
begin
  select * into m from lm.ministries where id = lm.my_ministry();
  if m.id is null then raise exception 'ministry_required' using hint = 'Add your ministry first. Then you can make a page.'; end if;
  if not lm.is_lead() then raise exception 'lead_required' using hint = 'Only a lead can change the ministry''s page.'; end if;
  v_clean := lm.page_clean(m.id, p_draft);
  -- the public name and the town belong to the ministry: changing either sends it back to be read (0002's rule, unchanged)
  if btrim(p_name) is distinct from m.name or btrim(p_city) is distinct from m.city or upper(btrim(p_state)) is distinct from m.state then
    perform lm.ministry_update(p_name, p_city, p_state, m.about, m.website, m.contact_name, m.contact_email);
  end if;
  select * into g from lm.pages where ministry_id = m.id for update;
  if g.id is null then
    v_suggest := lm.page_slug_for(m.name);
    if v_slug = '' then v_slug := v_suggest; end if;
    if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) not between 3 and 60 then raise exception 'slug_not_readable' using hint = 'The address is 3 to 60 letters, numbers and dashes, with no spaces.'; end if;
    if exists (select 1 from lm.pages where slug = v_slug) then raise exception 'slug_taken' using hint = 'Another ministry already has that address. Choose a different one.'; end if;
    insert into lm.pages (ministry_id, slug, slug_edits, draft, state, submitted_at, created_by)
    values (m.id, v_slug, case when v_slug = v_suggest then 0 else 1 end, v_clean, case when p_submit then 'waiting' else 'draft' end, case when p_submit then now() end, auth.uid())
    returning * into g;
  else
    if v_slug <> '' and v_slug <> g.slug then
      if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) not between 3 and 60 then raise exception 'slug_not_readable' using hint = 'The address is 3 to 60 letters, numbers and dashes, with no spaces.'; end if;
      if exists (select 1 from lm.pages where slug = v_slug) then raise exception 'slug_taken' using hint = 'Another ministry already has that address. Choose a different one.'; end if;
    else v_slug := g.slug; end if;
    v_state := case when g.live is not null and v_clean = g.live then 'approved' when p_submit then 'waiting' else 'draft' end;
    update lm.pages set slug = v_slug, draft = v_clean, state = v_state,
      submitted_at = case when v_state = 'waiting' then now() else submitted_at end,
      review_note = case when v_state in ('waiting', 'approved') then null else review_note end
     where id = g.id returning * into g;
  end if;
  -- a picture no copy names any more is thrown away
  delete from lm.page_photos p where p.ministry_id = m.id
    and not (g.draft -> 'photos' @> jsonb_build_array(jsonb_build_object('id', p.id::text)) or coalesce(g.live, '{}'::jsonb) -> 'photos' @> jsonb_build_array(jsonb_build_object('id', p.id::text)))
    and p.created_at < now() - interval '10 minutes';
  return jsonb_build_object('state', g.state, 'slug', g.slug, 'ministry_status', (select status from lm.ministries where id = m.id));
end $$;

-- ---- the steward's side ---------------------------------------------------------------------------------------------------------------------------
create function lm.page_review(p_ministry uuid, p_approve boolean, p_note text) returns void language plpgsql security definer set search_path = lm, app, pg_temp as $$
declare g lm.pages;
begin
  if not lm.is_steward() then raise exception 'steward_required' using hint = 'Only a steward at Linked Ministries can do that.'; end if;
  select * into g from lm.pages where ministry_id = p_ministry for update;
  if g.id is null then raise exception 'no_such_page'; end if;
  if g.state <> 'waiting' then raise exception 'not_waiting' using hint = 'That page is not waiting to be read.'; end if;
  if p_approve then
    if not lm.ministry_is_public(p_ministry) then raise exception 'ministry_not_public' using hint = 'Read the ministry first. Its page cannot be public until it is.'; end if;
    update lm.pages set live = draft, live_at = now(), live_by = auth.uid(), state = 'approved', review_note = null where id = g.id;
    delete from lm.page_photos p where p.ministry_id = p_ministry
      and not (g.draft -> 'photos' @> jsonb_build_array(jsonb_build_object('id', p.id::text))) and p.created_at < now() - interval '10 minutes';
    perform lm.log(p_ministry, 'page.approved', jsonb_build_object('id', g.id));
  else
    if length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'note_required' using hint = 'Write a short note so the ministry knows what to change.'; end if;
    update lm.pages set state = 'sent_back', review_note = left(btrim(p_note), 1000) where id = g.id;
    perform lm.log(p_ministry, 'page.sent_back', jsonb_build_object('id', g.id));
  end if;
end $$;

-- the steward's queue now holds the waiting pages too (0006's queue, with one more list)
create or replace function lm.steward_queue() returns jsonb
language plpgsql stable security definer set search_path = lm, app, pg_temp
as $$
begin
  if not lm.is_steward() then raise exception 'steward_required' using hint = 'Only a steward at Linked Ministries can do that.'; end if;
  return jsonb_build_object(
    'ministries', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'city', m.city, 'state', m.state, 'about', m.about, 'website', m.website,
                     'contact_name', m.contact_name, 'contact_email', m.contact_email, 'created_at', m.created_at) order by m.created_at), '[]'::jsonb)
                     from lm.ministries m where m.status = 'waiting'),
    'posts', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'category', p.category, 'title', p.title, 'body', p.body, 'city', p.city, 'state', p.state,
                     'open_until', p.open_until, 'submitted_at', p.submitted_at, 'ministry_id', p.ministry_id, 'ministry', m.name, 'ministry_status', m.status) order by p.submitted_at), '[]'::jsonb)
                     from lm.posts p join lm.ministries m on m.id = p.ministry_id where p.status = 'waiting'),
    'pages', (select coalesce(jsonb_agg(jsonb_build_object('ministry_id', g.ministry_id, 'ministry', m.name, 'city', m.city, 'state', m.state, 'ministry_status', m.status,
                     'slug', g.slug, 'draft', g.draft, 'is_change', g.live is not null, 'submitted_at', g.submitted_at) order by g.submitted_at), '[]'::jsonb)
                     from lm.pages g join lm.ministries m on m.id = g.ministry_id where g.state = 'waiting'),
    'reports', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'post_id', p.id, 'post_title', p.title, 'post_body', p.body, 'post_status', p.status, 'ministry', m.name,
                     'reason', r.reason, 'note', r.note, 'email', r.reporter_email, 'created_at', r.created_at) order by r.created_at), '[]'::jsonb)
                     from lm.reports r join lm.posts p on p.id = r.post_id join lm.ministries m on m.id = p.ministry_id where r.status = 'open'),
    'stewards', (select coalesce(jsonb_agg(jsonb_build_object('user_id', s.user_id, 'name', s.full_name, 'email', u.email) order by s.created_at), '[]'::jsonb)
                     from lm.people s join auth.users u on u.id = s.user_id where s.steward));
end $$;

-- ---- the public's side: the live copy of a public page, its address in the sitemap, and its pictures ------------------------------------------------------------
create function lm.page_public(p_slug text) returns jsonb language sql stable security definer set search_path = lm, app, pg_temp as $$
  select jsonb_build_object('slug', g.slug, 'ministry_id', m.id, 'name', m.name, 'city', m.city, 'state', m.state, 'live', g.live, 'live_at', g.live_at)
    from lm.pages g join lm.ministries m on m.id = g.ministry_id
   where g.slug = lower(coalesce(p_slug, '')) and g.live is not null and m.status = 'public'
$$;
create function lm.page_list_public() returns jsonb language sql stable security definer set search_path = lm, app, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', g.slug, 'live_at', g.live_at) order by g.live_at desc), '[]'::jsonb)
    from lm.pages g join lm.ministries m on m.id = g.ministry_id where g.live is not null and m.status = 'public'
$$;
create function lm.page_slug_of(p_ministry uuid) returns text language sql stable security definer set search_path = lm, app, pg_temp as $$
  select g.slug from lm.pages g join lm.ministries m on m.id = g.ministry_id where g.ministry_id = p_ministry and g.live is not null and m.status = 'public'
$$;

-- a picture, for whoever may see it: the public (the live copy of a public page names it), the ministry's own people, or a steward reading a waiting page
create function lm.photo_get(p_id uuid) returns table (content_type text, bytes bytea, is_public boolean) language sql stable security definer set search_path = lm, app, pg_temp as $$
  select p.content_type, p.bytes,
         exists (select 1 from lm.pages g join lm.ministries m on m.id = g.ministry_id where g.ministry_id = p.ministry_id and m.status = 'public' and g.live -> 'photos' @> jsonb_build_array(jsonb_build_object('id', p.id::text)))
    from lm.page_photos p
   where p.id = p_id and (
         exists (select 1 from lm.pages g join lm.ministries m on m.id = g.ministry_id where g.ministry_id = p.ministry_id and m.status = 'public' and g.live -> 'photos' @> jsonb_build_array(jsonb_build_object('id', p.id::text)))
      or (auth.uid() is not null and p.ministry_id = lm.my_ministry())
      or (auth.uid() is not null and lm.is_steward() and exists (select 1 from lm.pages g where g.ministry_id = p.ministry_id and g.state = 'waiting' and g.draft -> 'photos' @> jsonb_build_array(jsonb_build_object('id', p.id::text)))))
$$;

-- ---- who may call what ---------------------------------------------------------------------------------------------------------------------------------------
revoke all on function lm.audit_photo(), lm.pages_guard(), lm.photos_guard(), lm.pages_leave() from public, anon, authenticated;
revoke all on function lm.page_slug_for(text), lm.page_clean(uuid, jsonb), lm.page_mine(), lm.photo_add(text, bytea, text), lm.page_save(text, text, text, text, jsonb, boolean),
  lm.page_review(uuid, boolean, text), lm.page_public(text), lm.page_list_public(), lm.page_slug_of(uuid), lm.photo_get(uuid) from public, anon, authenticated;
grant execute on function lm.page_mine(), lm.photo_add(text, bytea, text), lm.page_save(text, text, text, text, jsonb, boolean), lm.page_review(uuid, boolean, text) to authenticated;
grant execute on function lm.page_public(text), lm.page_list_public(), lm.page_slug_of(uuid), lm.photo_get(uuid) to anon, authenticated;
-- lm.page_slug_for and lm.page_clean are called by the functions above and by nobody else.

-- Down: drop function lm.photo_get(uuid), lm.page_slug_of(uuid), lm.page_list_public(), lm.page_public(text), lm.page_review(uuid, boolean, text),
-- lm.page_save(text, text, text, text, jsonb, boolean), lm.photo_add(text, bytea, text), lm.page_mine(), lm.page_clean(uuid, jsonb), lm.page_slug_for(text);
-- drop trigger pages_leave on lm.ministries; drop function lm.pages_leave(), lm.photos_guard(), lm.pages_guard(), lm.audit_photo();
-- drop table lm.page_photos, lm.pages; put 0006's lm.steward_queue() back.

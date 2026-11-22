-- 0013 — a ministry's profile (who leads it, what it stands for, what it believes) and the ladder to Verified.
--
-- Founder, 2026-11-22: "we are the LinkedIn for Ministry. It should be easy to set up a profile for the ministry: who's the leader and what
-- they stand for, basic information, denomination, what their purpose is ... What their status is, maybe it could go from just started to
-- pending to all the way to verified. Like Instagram without paying."
--
--   * The profile lives in the page's own copy (lm.pages.draft / live), so it goes through the same reading as every other word on the page:
--     a lead fills it in, a person on the team reads it, and only then does the public see it (CLAUDE.md rule 2). lm.page_clean learns the new
--     fields; every one is optional, so a page made before today stays valid word for word.
--       leader_name, leader_role, leader_bio · mission ("what we stand for") · beliefs · denomination · founded (a year) · focus (up to six
--       keys from a fixed list) · serves ("who we serve") · languages
--   * The ladder. lm.ministries.verify_state: 'none' -> 'requested' (the lead says what kind of body the ministry is and gives the number on
--     its papers) -> 'verified' (a person on the team checked the papers against a public record and writes down what they checked). The
--     badge is free. A person decides it, never a machine (rules 2 and 15; the founder's wish for Eden to read the papers is recorded as a
--     question in CLAUDE.md, not built). The registration number is private: the team reads it, the public never does. What the public reads
--     is the word Verified, the day, and the team's one line about what was checked.
--   * A change of the ministry's public name or country takes the badge away (the papers were checked for the old one).
-- New functions get no grant until they need one (CLAUDE.md rule 16).
-- Down: drop the five functions; put back 0007's page_clean and 0012's page_public and directory_public; drop the trigger and the columns.

alter table lm.ministries
  add column verify_state   text not null default 'none' check (verify_state in ('none', 'requested', 'verified')),
  add column verify_form    text check (verify_form is null or verify_form in ('us_501c3', 'us_church', 'us_state_nonprofit', 'ng_incorporated_trustees', 'other_registered', 'other')),
  add column verify_number  text check (verify_number is null or (length(btrim(verify_number)) between 2 and 60 and verify_number !~ '[[:cntrl:]]')),
  add column verify_message text check (verify_message is null or length(verify_message) <= 1000),
  add column verify_note    text check (verify_note is null or length(verify_note) <= 1000),
  add column verify_checked text check (verify_checked is null or (length(btrim(verify_checked)) between 10 and 300 and verify_checked !~ '[[:cntrl:]]')),
  add column verify_asked_at timestamptz,
  add column verified_at    timestamptz,
  add column verified_by    uuid references auth.users (id),
  add constraint verified_has_a_name check (verify_state <> 'verified' or (verified_at is not null and verified_by is not null and verify_checked is not null));

-- the papers were checked for this name in this country: a change of either takes the badge away
create function lm.verify_follows_name() returns trigger language plpgsql security definer set search_path = lm, app, pg_temp as $$
begin
  if new.verify_state = 'verified' and (new.name is distinct from old.name or new.country is distinct from old.country) then
    new.verify_state := 'none'; new.verified_at := null; new.verified_by := null; new.verify_checked := null;
    new.verify_note := 'Your name or country changed, so the badge was taken off. Ask again and a person will check the papers.';
  end if;
  return new;
end $$;
create trigger verify_follows_name before update of name, country on lm.ministries for each row execute function lm.verify_follows_name();

-- ---- the profile, read and cleaned with the rest of the page -----------------------------------------------------------------------------
create or replace function lm.page_clean(p_ministry uuid, d jsonb) returns jsonb language plpgsql stable security definer set search_path = lm, app, pg_temp as $$
declare
  tag text := btrim(coalesce(d ->> 'tagline', '')); about text := btrim(coalesce(d ->> 'about', ''));
  em text := lower(btrim(coalesce(d ->> 'email', ''))); ph text := btrim(coalesce(d ->> 'phone', ''));
  web text := btrim(coalesce(d ->> 'website', '')); give text := btrim(coalesce(d ->> 'give_url', '')); vs text := btrim(coalesce(d ->> 'verse', ''));
  meets jsonb := coalesce(d -> 'meets', '[]'::jsonb); photos jsonb := coalesce(d -> 'photos', '[]'::jsonb);
  out_meets jsonb := '[]'::jsonb; out_photos jsonb := '[]'::jsonb; r jsonb; dy text; tm text; pl text; pid uuid; al text;
  -- the profile (0013)
  ln text := btrim(coalesce(d ->> 'leader_name', '')); lr text := btrim(coalesce(d ->> 'leader_role', '')); lb text := btrim(coalesce(d ->> 'leader_bio', ''));
  mi text := btrim(coalesce(d ->> 'mission', '')); be text := btrim(coalesce(d ->> 'beliefs', '')); dn text := btrim(coalesce(d ->> 'denomination', ''));
  fy text := btrim(coalesce(d ->> 'founded', '')); sv text := btrim(coalesce(d ->> 'serves', '')); lg text := btrim(coalesce(d ->> 'languages', ''));
  focus jsonb := coalesce(d -> 'focus', '[]'::jsonb); out_focus jsonb := '[]'::jsonb; fk text;
  one_line text := '[[:cntrl:]]'; many_lines text := '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]';
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
  -- the profile: every field optional; each one, if given, is checked
  if ln <> '' and (length(ln) < 2 or length(ln) > 120 or ln ~ one_line) then raise exception 'leader_name_not_readable' using hint = 'The leader''s name is 2 to 120 letters, on one line. Or leave it empty.'; end if;
  if lr <> '' and (length(lr) > 60 or lr ~ one_line) then raise exception 'leader_role_not_readable' using hint = 'The leader''s role is at most 60 letters, like Pastor or Director.'; end if;
  if lb <> '' and (length(lb) > 800 or lb ~ many_lines) then raise exception 'leader_bio_not_readable' using hint = 'A few lines about the leader, at most 800 letters.'; end if;
  if (lr <> '' or lb <> '') and ln = '' then raise exception 'leader_name_needed' using hint = 'Add the leader''s name too, or leave the leader part empty.'; end if;
  if mi <> '' and (length(mi) < 10 or length(mi) > 300 or mi ~ many_lines) then raise exception 'mission_not_readable' using hint = 'What you stand for: 10 to 300 letters.'; end if;
  if be <> '' and (length(be) < 10 or length(be) > 2000 or be ~ many_lines) then raise exception 'beliefs_not_readable' using hint = 'What you believe: 10 to 2000 letters.'; end if;
  if dn <> '' and (length(dn) > 80 or dn ~ one_line) then raise exception 'denomination_not_readable' using hint = 'The church family is at most 80 letters, on one line.'; end if;
  if fy <> '' and (fy !~ '^[0-9]{4}$' or fy::int < 1500 or fy::int > extract(year from now())::int) then raise exception 'founded_not_readable' using hint = 'The year you started, like 2015.'; end if;
  if sv <> '' and (length(sv) > 160 or sv ~ one_line) then raise exception 'serves_not_readable' using hint = 'Who you serve, at most 160 letters, on one line.'; end if;
  if lg <> '' and (length(lg) > 160 or lg ~ one_line) then raise exception 'languages_not_readable' using hint = 'The languages you use, at most 160 letters, on one line.'; end if;
  if jsonb_typeof(focus) <> 'array' or jsonb_array_length(focus) > 6 then raise exception 'focus_too_many' using hint = 'Choose up to six things your ministry does.'; end if;
  for fk in select jsonb_array_elements_text(focus) loop
    if fk not in ('church', 'recovery', 'housing', 'food', 'prison', 'youth', 'families', 'women', 'men', 'missions', 'persecuted', 'disaster', 'medical',
                  'education', 'worship', 'teaching', 'prayer', 'outreach', 'refugees', 'orphans') then raise exception 'focus_not_known' using hint = 'Choose from the list of things a ministry does.'; end if;
    if not out_focus ? fk then out_focus := out_focus || to_jsonb(fk); end if;
  end loop;
  return jsonb_strip_nulls(jsonb_build_object('tagline', tag, 'about', about, 'meets', out_meets,
    'email', nullif(em, ''), 'phone', nullif(ph, ''), 'website', nullif(web, ''), 'give_url', nullif(give, ''), 'verse', nullif(vs, ''), 'photos', out_photos,
    'leader_name', nullif(ln, ''), 'leader_role', nullif(lr, ''), 'leader_bio', nullif(lb, ''), 'mission', nullif(mi, ''), 'beliefs', nullif(be, ''),
    'denomination', nullif(dn, ''), 'founded', nullif(fy, ''), 'serves', nullif(sv, ''), 'languages', nullif(lg, ''),
    'focus', case when jsonb_array_length(out_focus) > 0 then out_focus end));
end $$;

-- ---- the ladder -----------------------------------------------------------------------------------------------------------------------------
-- a lead asks: the kind of body the ministry is, the number on its papers, and a short note (where a person can see the papers)
create function lm.verify_request(p_form text, p_number text, p_message text) returns text language plpgsql security definer set search_path = lm, app, pg_temp as $$
declare m lm.ministries;
begin
  select * into m from lm.ministries where id = lm.my_ministry();
  if m.id is null then raise exception 'ministry_required'; end if;
  if not lm.is_lead() then raise exception 'lead_required' using hint = 'Only a lead can ask for the badge.'; end if;
  if m.status <> 'public' then raise exception 'ministry_not_public' using hint = 'A person at Linked Ministries reads your ministry first. Then you can ask for the badge.'; end if;
  if m.verify_state = 'verified' then raise exception 'already_verified' using hint = 'Your ministry already has the badge.'; end if;
  if coalesce(p_form, '') not in ('us_501c3', 'us_church', 'us_state_nonprofit', 'ng_incorporated_trustees', 'other_registered', 'other') then raise exception 'form_needed' using hint = 'Choose what kind of ministry it is on paper.'; end if;
  if p_form <> 'us_church' and p_form <> 'other' and length(btrim(coalesce(p_number, ''))) < 2 then raise exception 'number_needed' using hint = 'Type the number on your papers, like an EIN or a registration number.'; end if;
  update lm.ministries set verify_state = 'requested', verify_form = p_form, verify_number = nullif(btrim(coalesce(p_number, '')), ''),
    verify_message = nullif(left(btrim(coalesce(p_message, '')), 1000), ''), verify_note = null, verify_asked_at = now()
   where id = m.id;
  perform lm.log(m.id, 'verify.requested', jsonb_build_object('id', m.id, 'form', p_form));
  return 'requested';
end $$;

-- a person on the team decides: verified, with what they checked (public), or not yet, with a note the lead reads; they can also take a badge off
create function lm.verify_decide(p_ministry uuid, p_verify boolean, p_checked text, p_note text) returns text language plpgsql security definer set search_path = lm, app, pg_temp as $$
declare m lm.ministries;
begin
  if not lm.is_steward() then raise exception 'steward_required' using hint = 'Only a person at Linked Ministries can do that.'; end if;
  select * into m from lm.ministries where id = p_ministry for update;
  if m.id is null then raise exception 'no_such_ministry'; end if;
  if p_verify then
    if m.verify_state <> 'requested' then raise exception 'not_requested' using hint = 'That ministry has not asked for the badge.'; end if;
    if m.status <> 'public' then raise exception 'ministry_not_public' using hint = 'Read the ministry first.'; end if;
    if m.created_by = auth.uid() or exists (select 1 from lm.people where user_id = auth.uid() and ministry_id = m.id) then
      raise exception 'own_ministry' using hint = 'Another person on the team checks your own ministry.';
    end if;
    if length(btrim(coalesce(p_checked, ''))) < 10 then raise exception 'checked_needed' using hint = 'Write what you checked, like: EIN matches the IRS list of charities.'; end if;
    update lm.ministries set verify_state = 'verified', verify_checked = left(btrim(p_checked), 300), verified_at = now(), verified_by = auth.uid(), verify_note = null where id = m.id;
    perform lm.log(m.id, 'verify.granted', jsonb_build_object('id', m.id));
    return 'verified';
  end if;
  if length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'note_required' using hint = 'Write a short note so the ministry knows what is missing.'; end if;
  update lm.ministries set verify_state = 'none', verify_checked = null, verified_at = null, verified_by = null, verify_note = left(btrim(p_note), 1000) where id = m.id;
  perform lm.log(m.id, case when m.verify_state = 'verified' then 'verify.removed' else 'verify.sent_back' end, jsonb_build_object('id', m.id));
  return 'none';
end $$;

-- the team's list: who asked, and every verified ministry (so a badge can be taken off)
create function lm.verify_queue() returns jsonb language plpgsql stable security definer set search_path = lm, app, pg_temp as $$
begin
  if not lm.is_steward() then raise exception 'steward_required' using hint = 'Only a person at Linked Ministries can do that.'; end if;
  return jsonb_build_object(
    'requested', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'city', m.city, 'state', m.state, 'country', m.country, 'form', m.verify_form,
                    'number', m.verify_number, 'message', m.verify_message, 'website', m.website, 'contact_name', m.contact_name, 'contact_email', m.contact_email,
                    'asked_at', m.verify_asked_at) order by m.verify_asked_at), '[]'::jsonb) from lm.ministries m where m.verify_state = 'requested' and m.status = 'public'),
    'verified', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'country', m.country, 'checked', m.verify_checked, 'verified_at', m.verified_at)
                    order by m.verified_at desc), '[]'::jsonb) from lm.ministries m where m.verify_state = 'verified'));
end $$;

-- the lead's own view of the ladder (the number is theirs; the public never reads it)
create function lm.verify_mine() returns jsonb language sql stable security definer set search_path = lm, app, pg_temp as $$
  select jsonb_build_object('state', m.verify_state, 'status', m.status, 'form', m.verify_form, 'number', m.verify_number, 'message', m.verify_message,
         'note', m.verify_note, 'checked', m.verify_checked, 'asked_at', m.verify_asked_at, 'verified_at', m.verified_at,
         'has_page', exists (select 1 from lm.pages g where g.ministry_id = m.id and g.live is not null))
    from lm.ministries m where m.id = lm.my_ministry()
$$;

-- ---- what the public reads: the word Verified, the day, and what was checked ------------------------------------------------------------------
create or replace function lm.page_public(p_slug text) returns jsonb language sql stable security definer set search_path = lm, app, pg_temp as $$
  select jsonb_build_object('slug', g.slug, 'ministry_id', m.id, 'name', m.name, 'city', m.city, 'state', m.state, 'country', m.country, 'live', g.live, 'live_at', g.live_at,
         'verified', m.verify_state = 'verified', 'verified_at', m.verified_at, 'verify_checked', case when m.verify_state = 'verified' then m.verify_checked end)
    from lm.pages g join lm.ministries m on m.id = g.ministry_id
   where g.slug = lower(coalesce(p_slug, '')) and g.live is not null and m.status = 'public'
$$;

create or replace function lm.directory_public() returns jsonb language sql stable security definer set search_path = lm, app, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'name', m.name, 'city', m.city, 'state', m.state, 'country', m.country, 'website', m.website,
           'slug', g.slug,
           'tagline', g.live ->> 'tagline',
           'give_url', g.live ->> 'give_url',
           'photo', g.live -> 'photos' -> 0 ->> 'id',
           'photo_alt', g.live -> 'photos' -> 0 ->> 'alt',
           'denomination', g.live ->> 'denomination',
           'leader_name', g.live ->> 'leader_name',
           'leader_role', g.live ->> 'leader_role',
           'focus', coalesce(g.live -> 'focus', '[]'::jsonb),
           'verified', m.verify_state = 'verified',
           'asks', lm.asks_public(m.id))
         order by m.country, (m.verify_state = 'verified') desc, m.name), '[]'::jsonb)
    from lm.ministries m
    left join lm.pages g on g.ministry_id = m.id and g.live is not null
   where m.status = 'public'
$$;

revoke all on function lm.verify_follows_name() from public, anon, authenticated;
revoke all on function lm.verify_request(text, text, text), lm.verify_decide(uuid, boolean, text, text), lm.verify_queue(), lm.verify_mine() from public, anon, authenticated;
grant execute on function lm.verify_request(text, text, text), lm.verify_decide(uuid, boolean, text, text), lm.verify_queue(), lm.verify_mine() to authenticated;

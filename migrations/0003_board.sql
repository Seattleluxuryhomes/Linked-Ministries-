-- 0003 — the board: posts (an ask or a give) and the answers to them.
--
--   * A post is a draft, then waiting for a steward, then public; the poster closes it ("met" or "no longer needed"). A steward
--     sends a waiting post back to draft with a note the poster reads. Nobody but a steward makes a post public
--     (lm.post_review), and a public post always carries the steward's name and the time (a CHECK).
--   * The words of a post are frozen once it leaves draft: what a person approved is what the public reads. To change it, close it
--     and post again.
--   * A post is open for at most 90 days from the day it was started (a CHECK and a trigger), and never in the past.
--   * The public sees a post only while it is public, still open, and its ministry is public (the anon policy below). The columns
--     the public may read are named in 0004's grants; the contact is not among them.
--   * An answer is a record: it is written only after the mail provider accepted the email (the server's order, tested), once
--     per ministry per post, and it is never changed or deleted. Its words are in the row; the events row holds ids only.
--   * The categories are the founder's list. There is no money category: the network moves no money.

create table lm.posts (
  id            uuid primary key default gen_random_uuid(),
  ministry_id   uuid not null references lm.ministries (id),
  kind          text not null check (kind in ('ask', 'give')),
  category      text not null check (category in ('housing', 'food', 'clothing', 'transportation', 'volunteers', 'equipment', 'furniture', 'teaching_training', 'prayer', 'other')),
  title         text not null check (length(btrim(title)) between 4 and 120),
  body          text not null check (length(btrim(body)) between 10 and 2000),
  city          text not null check (length(btrim(city)) between 2 and 80),
  state         text not null check (state ~ '^[A-Z]{2}$'),
  open_until    date not null,
  status        text not null default 'draft' check (status in ('draft', 'waiting', 'public', 'closed')),
  review_note   text check (review_note is null or length(review_note) <= 1000),
  submitted_at  timestamptz,
  approved_by   uuid references auth.users (id),
  approved_at   timestamptz,
  closed_reason text check (closed_reason in ('met', 'no_longer_needed')),
  closed_at     timestamptz,
  closed_by     uuid references auth.users (id),
  created_by    uuid not null references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (open_until <= (created_at at time zone 'utc')::date + 90),                    -- at most 90 days out
  check (status <> 'public' or (approved_by is not null and approved_at is not null)),   -- public always has a named reader
  check ((status = 'closed') = (closed_at is not null and closed_reason is not null))
);
create index posts_public on lm.posts (approved_at desc) where status = 'public';
create index posts_by_ministry on lm.posts (ministry_id, created_at desc);
create index posts_waiting on lm.posts (submitted_at) where status = 'waiting';

create table lm.answers (
  id               uuid primary key default gen_random_uuid(),
  post_id          uuid not null references lm.posts (id),
  from_ministry_id uuid not null references lm.ministries (id),
  from_user_id     uuid not null references auth.users (id),
  words            text not null check (length(btrim(words)) between 5 and 1500),
  phone            text check (phone is null or phone ~ '^[0-9 ()+.-]{7,30}$'),
  reply_email      text not null,
  mail_id          text,                          -- the id the mail provider gave back when it took the message
  sent_at          timestamptz not null default now(),
  unique (post_id, from_ministry_id)               -- one answer per ministry per post
);
create index answers_by_post on lm.answers (post_id);
create index answers_by_ministry on lm.answers (from_ministry_id, sent_at desc);

create trigger touch before update on lm.posts for each row execute function lm.touch();
create trigger audit after insert or update or delete on lm.posts for each row execute function lm.audit();
-- an answer's words are never in the events row: the generic audit writes ids and the actor's name only
create trigger audit after insert on lm.answers for each row execute function lm.audit();

-- ---- guards the database keeps whatever calls it ------------------------------------------------------------------------
create function lm.posts_guard() returns trigger language plpgsql security definer set search_path = lm, app, pg_temp as $$
declare v_start date := (case when tg_op = 'INSERT' then now() else new.created_at end at time zone 'utc')::date;
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'waiting') and auth.uid() is not null then raise exception 'steward_required' using hint = 'A new post starts as a draft or waits to be read.'; end if;
  end if;
  -- the date: not in the past, and at most 90 days from the day it was started
  if tg_op = 'INSERT' or new.open_until is distinct from old.open_until then
    if new.open_until < (now() at time zone 'utc')::date then raise exception 'open_until_past' using hint = 'Choose a day that has not passed.'; end if;
    if new.open_until > v_start + 90 then raise exception 'open_until_too_far' using hint = 'A post can stay open for 90 days at most. Choose an earlier day.'; end if;
  end if;
  if tg_op = 'UPDATE' then
    -- what a person approved is what the public reads: the words are frozen once the post leaves draft
    if old.status <> 'draft' and (new.ministry_id, new.kind, new.category, new.title, new.body, new.city, new.state, new.open_until)
         is distinct from (old.ministry_id, old.kind, old.category, old.title, old.body, old.city, old.state, old.open_until) then
      raise exception 'post_frozen' using hint = 'A post cannot be changed once it has been sent to be read. Close it and post again.';
    end if;
    if new.status is distinct from old.status then
      if not ((old.status, new.status) in (('draft', 'waiting'), ('waiting', 'draft'), ('waiting', 'public'), ('draft', 'closed'), ('waiting', 'closed'), ('public', 'closed'))) then
        raise exception 'status_change_not_allowed' using hint = 'That change is not allowed.';
      end if;
      if new.status = 'public' then
        if auth.uid() is not null and (not lm.is_steward() or new.approved_by is distinct from auth.uid()) then raise exception 'steward_required' using hint = 'Only a steward at Linked Ministries can make a post public.'; end if;
        if not lm.ministry_is_public(new.ministry_id) then raise exception 'ministry_not_public' using hint = 'Read the ministry first. Its posts cannot be public until it is.'; end if;
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger posts_guard before insert or update on lm.posts for each row execute function lm.posts_guard();

create function lm.answers_are_records() returns trigger language plpgsql as $$
begin raise exception 'answers_are_records' using hint = 'An answer that was sent is a record. It is never changed or deleted.'; end $$;
create trigger answers_are_records before update or delete on lm.answers for each row execute function lm.answers_are_records();

-- ---- posts: make, change a draft, send it to be read, close, be read by a steward --------------------------------------------
create function lm.post_create(p_kind text, p_category text, p_title text, p_body text, p_city text, p_state text, p_open_until date, p_submit boolean)
returns uuid language plpgsql security definer set search_path = lm, app, pg_temp
as $$
declare v_id uuid; m lm.ministries;
begin
  if lm.my_ministry() is null then raise exception 'ministry_required' using hint = 'Make your ministry''s page first. Then you can post.'; end if;
  select * into m from lm.ministries where id = lm.my_ministry();
  insert into lm.posts (ministry_id, kind, category, title, body, city, state, open_until, status, submitted_at, created_by)
  values (m.id, p_kind, p_category, btrim(p_title), btrim(p_body), coalesce(nullif(btrim(coalesce(p_city, '')), ''), m.city), coalesce(nullif(upper(btrim(coalesce(p_state, ''))), ''), m.state),
          p_open_until, case when p_submit then 'waiting' else 'draft' end, case when p_submit then now() end, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create function lm.post_update(p_post uuid, p_kind text, p_category text, p_title text, p_body text, p_city text, p_state text, p_open_until date)
returns void language plpgsql security definer set search_path = lm, app, pg_temp
as $$
declare m lm.ministries;
begin
  select * into m from lm.ministries where id = lm.my_ministry();
  update lm.posts set kind = p_kind, category = p_category, title = btrim(p_title), body = btrim(p_body),
    city = coalesce(nullif(btrim(coalesce(p_city, '')), ''), m.city), state = coalesce(nullif(upper(btrim(coalesce(p_state, ''))), ''), m.state), open_until = p_open_until
   where id = p_post and ministry_id = lm.my_ministry();
  if not found then raise exception 'no_such_post'; end if;
end $$;

create function lm.post_submit(p_post uuid) returns void
language plpgsql security definer set search_path = lm, app, pg_temp
as $$
declare v lm.posts;
begin
  select * into v from lm.posts where id = p_post and ministry_id = lm.my_ministry();
  if v.id is null then raise exception 'no_such_post'; end if;
  if v.status <> 'draft' then raise exception 'not_a_draft' using hint = 'Only a draft can be sent to be read.'; end if;
  update lm.posts set status = 'waiting', submitted_at = now(), review_note = null where id = p_post;
end $$;

create function lm.post_close(p_post uuid, p_reason text) returns void
language plpgsql security definer set search_path = lm, app, pg_temp
as $$
declare v lm.posts;
begin
  if p_reason not in ('met', 'no_longer_needed') then raise exception 'reason_not_known' using hint = 'Choose "Met" or "No longer needed".'; end if;
  select * into v from lm.posts where id = p_post and ministry_id = lm.my_ministry();
  if v.id is null then raise exception 'no_such_post'; end if;
  if v.status = 'closed' then raise exception 'already_closed' using hint = 'That post is already closed.'; end if;
  update lm.posts set status = 'closed', closed_reason = p_reason, closed_at = now(), closed_by = auth.uid() where id = p_post;
end $$;

create function lm.post_review(p_post uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = lm, app, pg_temp
as $$
declare v lm.posts;
begin
  if not lm.is_steward() then raise exception 'steward_required' using hint = 'Only a steward at Linked Ministries can do that.'; end if;
  select * into v from lm.posts where id = p_post;
  if v.id is null then raise exception 'no_such_post'; end if;
  if v.status <> 'waiting' then raise exception 'not_waiting' using hint = 'That post is not waiting to be read.'; end if;
  if p_approve then
    if v.open_until < (now() at time zone 'utc')::date then raise exception 'open_until_past' using hint = 'The day this post was open until has passed. Send it back so the poster can choose a new day.'; end if;
    update lm.posts set status = 'public', approved_by = auth.uid(), approved_at = now(), review_note = null where id = p_post;
    perform lm.log(v.ministry_id, 'post.approved', jsonb_build_object('id', p_post));
  else
    if length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'note_required' using hint = 'Write a short note so the poster knows what to change.'; end if;
    update lm.posts set status = 'draft', review_note = left(btrim(p_note), 1000) where id = p_post;
    perform lm.log(v.ministry_id, 'post.sent_back', jsonb_build_object('id', p_post));
  end if;
end $$;

-- ---- the steward's queue: what is waiting, with what a steward needs to read it -----------------------------------------------
create function lm.steward_queue() returns jsonb
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
    'stewards', (select coalesce(jsonb_agg(jsonb_build_object('user_id', s.user_id, 'name', s.full_name, 'email', u.email) order by s.created_at), '[]'::jsonb)
                     from lm.people s join auth.users u on u.id = s.user_id where s.steward));
end $$;

-- ---- answering: the check before the email, the record after it ---------------------------------------------------------------
-- The server calls answer_prepare, then sends the email, then calls answer_record only if the mail provider accepted it.
-- Prepare returns what the email needs, including the posting ministry's contact address, which only this function can reach.
create function lm.answer_prepare(p_post uuid) returns jsonb
language plpgsql stable security definer set search_path = lm, app, pg_temp
as $$
declare p lm.posts; t lm.ministries; f lm.ministries; me lm.people; u auth.users;
begin
  select * into me from lm.people where user_id = auth.uid();
  if me.ministry_id is null then raise exception 'ministry_required' using hint = 'Make your ministry''s page first. Then you can answer.'; end if;
  select * into f from lm.ministries where id = me.ministry_id;
  if f.status <> 'public' then raise exception 'ministry_not_public' using hint = 'A person at Linked Ministries has not read your ministry''s page yet. You can answer once they have.'; end if;
  select * into p from lm.posts where id = p_post and status = 'public' and open_until >= (now() at time zone 'utc')::date;
  if p.id is null then raise exception 'post_not_open' using hint = 'That post is not open any more.'; end if;
  select * into t from lm.ministries where id = p.ministry_id;
  if t.status <> 'public' then raise exception 'post_not_open' using hint = 'That post is not open any more.'; end if;
  if t.id = f.id then raise exception 'own_post' using hint = 'That is your own ministry''s post.'; end if;
  if exists (select 1 from lm.answers where post_id = p.id and from_ministry_id = f.id) then raise exception 'already_answered' using hint = 'Your ministry already answered this post.'; end if;
  select * into u from auth.users where id = auth.uid();
  return jsonb_build_object('post_id', p.id, 'kind', p.kind, 'title', p.title,
    'to_ministry_id', t.id, 'to_ministry', t.name, 'to_contact', t.contact_name, 'to_email', t.contact_email,
    'from_ministry_id', f.id, 'from_ministry', f.name, 'from_city', f.city, 'from_state', f.state, 'from_website', f.website,
    'from_name', me.full_name, 'from_email', u.email);
end $$;

create function lm.answer_record(p_post uuid, p_words text, p_phone text, p_mail_id text) returns uuid
language plpgsql security definer set search_path = lm, app, pg_temp
as $$
declare v_id uuid; v jsonb;
begin
  v := lm.answer_prepare(p_post);   -- the same checks, again, at the moment of writing
  insert into lm.answers (post_id, from_ministry_id, from_user_id, words, phone, reply_email, mail_id)
  values (p_post, (v ->> 'from_ministry_id')::uuid, auth.uid(), btrim(p_words), nullif(btrim(coalesce(p_phone, '')), ''), v ->> 'from_email', p_mail_id)
  returning id into v_id;
  return v_id;
end $$;

-- the answers a ministry received and the answers it sent, with the post's title (a closed post is not readable by the answerer,
-- so the title is joined here, inside the function, for the two ministries who are party to the answer)
create function lm.my_answers() returns jsonb
language sql stable security definer set search_path = lm, app, pg_temp
as $$
  select jsonb_build_object(
    'received', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'post_id', a.post_id, 'post_title', p.title, 'kind', p.kind, 'from_ministry', fm.name,
                   'from_city', fm.city, 'from_state', fm.state, 'from_name', pe.full_name, 'words', a.words, 'phone', a.phone, 'email', a.reply_email, 'sent_at', a.sent_at)
                   order by a.sent_at desc), '[]'::jsonb)
                   from lm.answers a join lm.posts p on p.id = a.post_id join lm.ministries fm on fm.id = a.from_ministry_id
                   left join lm.people pe on pe.user_id = a.from_user_id where p.ministry_id = lm.my_ministry()),
    'sent', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'post_id', a.post_id, 'post_title', p.title, 'kind', p.kind, 'to_ministry', tm.name,
                   'to_city', tm.city, 'to_state', tm.state, 'words', a.words, 'sent_at', a.sent_at)
                   order by a.sent_at desc), '[]'::jsonb)
                   from lm.answers a join lm.posts p on p.id = a.post_id join lm.ministries tm on tm.id = p.ministry_id
                   where a.from_ministry_id = lm.my_ministry()));
$$;

-- ---- row-level security ------------------------------------------------------------------------------------------------------
alter table lm.posts enable row level security;
alter table lm.answers enable row level security;

-- a ministry reads all of its own posts; everyone reads a public, open post of a public ministry; a steward reads what has been sent in
create policy posts_read on lm.posts for select to authenticated using (
  ministry_id = lm.my_ministry()
  or (status = 'public' and open_until >= (now() at time zone 'utc')::date and lm.ministry_is_public(ministry_id))
  or (lm.is_steward() and status <> 'draft'));
create policy posts_public on lm.posts for select to anon using (
  status = 'public' and open_until >= (now() at time zone 'utc')::date and lm.ministry_is_public(ministry_id));

-- an answer is read by the ministry that sent it and by the ministry it was sent to; by no one else
create policy answers_read on lm.answers for select to authenticated using (
  from_ministry_id = lm.my_ministry()
  or exists (select 1 from lm.posts p where p.id = post_id and p.ministry_id = lm.my_ministry()));

-- Down: drop function lm.my_answers(), lm.answer_record(uuid, text, text, text), lm.answer_prepare(uuid), lm.steward_queue(), lm.post_review(uuid, boolean, text),
-- lm.post_close(uuid, text), lm.post_submit(uuid), lm.post_update(uuid, text, text, text, text, text, text, date),
-- lm.post_create(text, text, text, text, text, text, date, boolean); drop table lm.answers, lm.posts cascade;
-- drop function lm.answers_are_records(), lm.posts_guard().

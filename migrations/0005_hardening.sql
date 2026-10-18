-- 0005 — hardening, from the 2026-10-18 audit. Every change here closes a gap that was found by trying it; each has a check in
-- tests/db-test.mjs or tests/api-test.mjs.
--
--   * An email address has one strict shape, in the database as well as the server. Before this, "a,victim@bank.example" was
--     accepted: the mail library read it as a list and the code was mailed to the second address.
--   * A name, a city or a title is one line: no control character, so no line break can reach a mail header or a page.
--   * The last steward and the last lead are counted under a lock. Before this, two stewards who removed each other at the same
--     moment could both succeed and leave none (the check read the other row before the other transaction had committed).
--   * The posting ministry's contact address and name are no longer returned by anything a signed-in person can call.
--     lm.answer_prepare used to hand them to the caller; now only lm.answer_contact does, and no role but the operator's
--     service connection can run it.
--   * A ministry's "what it does" and website are read by its own people (through lm.my_ministry_profile) and by stewards
--     (through lm.steward_queue), not by every signed-in person: the page promises "Other ministries do not see it".
--   * A past day cannot be sent to be read (it was caught only when a steward tried to approve it).
--   * Old sessions, old codes and sign-in addresses nobody ever finished are removed by app.reap().
--
-- New functions get no grant: Postgres lets everyone run a new function unless it is revoked, and 0004's blanket revoke only
-- covered the functions that existed then.

-- ---- an email address has one shape -------------------------------------------------------------------------------------
alter table lm.ministries add constraint ministries_contact_email_strict check (contact_email ~ $re$^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$$re$) not valid;
alter table lm.invites add constraint invites_email_strict check (email ~ $re$^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$$re$) not valid;
alter table auth.users add constraint auth_users_email_strict check (email ~ $re$^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$$re$) not valid;

-- ---- one line, no control character --------------------------------------------------------------------------------------
alter table lm.ministries add constraint ministries_one_line check (name !~ '[[:cntrl:]]' and city !~ '[[:cntrl:]]' and contact_name !~ '[[:cntrl:]]') not valid;
alter table lm.people add constraint people_one_line check (full_name !~ '[[:cntrl:]]') not valid;
alter table lm.posts add constraint posts_one_line check (title !~ '[[:cntrl:]]' and city !~ '[[:cntrl:]]') not valid;

-- ---- the last steward and the last lead, counted under a lock ----------------------------------------------------------------
create or replace function lm.people_guard() returns trigger language plpgsql security definer set search_path = lm, app, pg_temp as $$
declare r lm.people := case when tg_op = 'DELETE' then old else new end;
begin
  -- one at a time: the check below reads other rows, so two people changing them at once must queue, not both pass
  if (tg_op = 'UPDATE' and new.steward is distinct from old.steward) or (tg_op = 'DELETE' and old.steward) then
    perform pg_advisory_xact_lock(hashtextextended('lm.stewards', 0));
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.role = 'lead' and old.ministry_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('lm.lead:' || old.ministry_id::text, 0));
  end if;
  if (tg_op = 'INSERT' and new.steward) or (tg_op = 'UPDATE' and new.steward is distinct from old.steward) then
    if auth.uid() is not null and not lm.is_steward() then
      raise exception 'steward_required' using hint = 'Only a steward can make or remove a steward.';
    end if;
  end if;
  if ((tg_op = 'UPDATE' and old.steward and not new.steward) or (tg_op = 'DELETE' and old.steward))
     and not exists (select 1 from lm.people where steward and user_id <> old.user_id) then
    raise exception 'last_steward' using hint = 'Linked Ministries always keeps one steward. Make someone else a steward first.';
  end if;
  if ((tg_op = 'UPDATE' and old.role = 'lead' and old.ministry_id is not null and (new.role is distinct from 'lead' or new.ministry_id is distinct from old.ministry_id))
      or (tg_op = 'DELETE' and old.role = 'lead' and old.ministry_id is not null))
     and not exists (select 1 from lm.people where ministry_id = old.ministry_id and role = 'lead' and user_id <> old.user_id) then
    raise exception 'last_lead' using hint = 'A ministry always keeps one lead. Make someone else a lead first.';
  end if;
  return r;
end $$;
drop trigger people_guard on lm.people;
create trigger people_guard before insert or update or delete on lm.people for each row execute function lm.people_guard();

-- ---- the posting ministry's contact never leaves the database to a signed-in person ---------------------------------------------
create or replace function lm.answer_prepare(p_post uuid) returns jsonb
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
    'to_ministry_id', t.id, 'to_ministry', t.name,
    'from_ministry_id', f.id, 'from_ministry', f.name, 'from_city', f.city, 'from_state', f.state, 'from_website', f.website,
    'from_name', me.full_name, 'from_email', u.email);
end $$;

-- who the email goes to: the operator's service connection only (the server calls it after answer_prepare has said yes)
create function lm.answer_contact(p_post uuid) returns jsonb
language sql stable security definer set search_path = lm, app, pg_temp
as $$
  select jsonb_build_object('to_email', m.contact_email, 'to_contact', m.contact_name)
    from lm.posts p join lm.ministries m on m.id = p.ministry_id where p.id = p_post and p.status = 'public'
$$;
revoke all on function lm.answer_contact(uuid) from public, anon, authenticated;

-- ---- "what it does" and the website: a ministry's own people and the stewards, not every signed-in person -----------------------
revoke select (about, website) on lm.ministries from authenticated;

-- ---- a past day cannot be sent to be read ------------------------------------------------------------------------------------------
create or replace function lm.post_submit(p_post uuid) returns void
language plpgsql security definer set search_path = lm, app, pg_temp
as $$
declare v lm.posts;
begin
  select * into v from lm.posts where id = p_post and ministry_id = lm.my_ministry();
  if v.id is null then raise exception 'no_such_post'; end if;
  if v.status <> 'draft' then raise exception 'not_a_draft' using hint = 'Only a draft can be sent to be read.'; end if;
  if v.open_until < (now() at time zone 'utc')::date then raise exception 'open_until_past' using hint = 'The day this post was open until has passed. Choose a new day first.'; end if;
  update lm.posts set status = 'waiting', submitted_at = now(), review_note = null where id = p_post;
end $$;

-- ---- housekeeping: what is old goes ------------------------------------------------------------------------------------------------
-- A sign-in address that nobody finished (no session ever, no ministry, a day or more old) is removed, with its codes.
create function app.reap() returns void language sql security definer set search_path = app, lm, auth, pg_temp as $$
  delete from app.login_codes where expires_at < now() - interval '1 day';
  delete from app.sessions where expires_at < now() - interval '7 days' or revoked_at < now() - interval '7 days';
  delete from auth.users u where u.created_at < now() - interval '2 days'
    and not exists (select 1 from app.sessions s where s.user_id = u.id)
    and not exists (select 1 from lm.people p where p.user_id = u.id);
$$;
revoke all on function app.reap() from public, anon, authenticated;

-- Down: alter table lm.ministries drop constraint ministries_contact_email_strict, drop constraint ministries_one_line; alter table lm.invites drop constraint invites_email_strict;
-- alter table auth.users drop constraint auth_users_email_strict; alter table lm.people drop constraint people_one_line; alter table lm.posts drop constraint posts_one_line;
-- drop function app.reap(); drop function lm.answer_contact(uuid); grant select (about, website) on lm.ministries to authenticated;
-- then put 0002's people_guard, 0003's answer_prepare and post_submit back, and recreate the trigger people_guard before insert or update.

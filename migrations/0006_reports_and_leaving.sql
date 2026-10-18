-- 0006 — reports and leaving: the two things a public board owes the people on it and the people who read it.
--
--   * A REPORT. Anyone who reads a public post can tell the stewards something is wrong with it. A report is a row and an email
--     to the stewards; it hides nothing. The post stays exactly as it was until a steward acts on it, and a steward's act is
--     one of two, each with a short note and the steward's name: close the post ("removed", which the poster is told), or keep it.
--     A report is made by the server's service connection (a visitor has no sign-in), so lm.report_create has no grant.
--   * LEAVING. A person can delete their own account. The database does the whole of it, in one transaction, and says what it did:
--       - the person's sign-in is erased: sessions, codes, the email address and the name (the row stays, as a tombstone with
--         no personal word in it, so every older record still points at something);
--       - a person on a team with others simply leaves the team (the last lead cannot, as before);
--       - the only person in a ministry takes the ministry out of the network with them: its posts are closed, its page is
--         hidden and its contact name and email are erased, and so are the words, phones and addresses of every answer it
--         sent or received (an answer is otherwise a record that is never changed: see answers_are_records);
--       - the answers the person sent lose their words, phone and reply address;
--       - the person's name is taken off the record of what they did ("A person who left"); one new event says the account
--         was erased, with ids only.
--     The operator can do the same for someone who writes to ask: select lm.account_erase('<their id>').
--   * The last steward cannot leave this way either.

-- ---- a post can be closed by a steward, and a ministry can have left -----------------------------------------------------
alter table lm.posts drop constraint posts_closed_reason_check;
alter table lm.posts add constraint posts_closed_reason_check check (closed_reason in ('met', 'no_longer_needed', 'removed'));
alter table lm.ministries drop constraint ministries_status_check;
alter table lm.ministries add constraint ministries_status_check check (status in ('waiting', 'public', 'sent_back', 'left'));

-- ---- reports ----------------------------------------------------------------------------------------------------------------------
create table lm.reports (
  id             uuid primary key default gen_random_uuid(),
  post_id        uuid not null references lm.posts (id),
  reason         text not null check (reason in ('scam', 'money', 'unsafe', 'copy', 'private', 'other')),
  note           text check (note is null or length(note) <= 1000),
  reporter_email text check (reporter_email is null or (length(reporter_email) <= 254 and reporter_email ~ $re$^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$$re$)),
  status         text not null default 'open' check (status in ('open', 'kept', 'closed')),
  handled_by     uuid references auth.users (id),
  handled_at     timestamptz,
  handled_note   text check (handled_note is null or length(handled_note) <= 1000),
  created_at     timestamptz not null default now(),
  check ((status = 'open') = (handled_by is null and handled_at is null))      -- a handled report always names the steward
);
create index reports_open on lm.reports (created_at) where status = 'open';
create index reports_by_post on lm.reports (post_id);
alter table lm.reports enable row level security;     -- no policy and no grant: only the functions below reach it

create function lm.report_create(p_post uuid, p_reason text, p_note text, p_email text) returns uuid
language plpgsql security definer set search_path = lm, app, pg_temp
as $$
declare v lm.posts; v_id uuid;
begin
  select * into v from lm.posts where id = p_post and status = 'public' and open_until >= (now() at time zone 'utc')::date and lm.ministry_is_public(ministry_id);
  if v.id is null then raise exception 'post_not_open' using hint = 'That post is not on the board any more.'; end if;
  insert into lm.reports (post_id, reason, note, reporter_email)
  values (p_post, p_reason, nullif(left(btrim(coalesce(p_note, '')), 1000), ''), nullif(lower(btrim(coalesce(p_email, ''))), '')) returning id into v_id;
  insert into lm.events (ministry_id, actor_id, actor_label, kind, payload)
  values (v.ministry_id, null, 'A visitor', 'report.created', jsonb_build_object('id', v_id, 'post', p_post, 'reason', p_reason));
  return v_id;
end $$;

-- A steward acts on a report. "close" takes the post off the board (the poster is told it was taken down, with the note); "keep" leaves it.
create function lm.report_resolve(p_report uuid, p_action text, p_note text) returns void
language plpgsql security definer set search_path = lm, app, pg_temp
as $$
declare r lm.reports; p lm.posts;
begin
  if not lm.is_steward() then raise exception 'steward_required' using hint = 'Only a steward at Linked Ministries can do that.'; end if;
  if p_action not in ('close', 'keep') then raise exception 'decision_not_known' using hint = 'Choose close the post or keep it.'; end if;
  if length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'note_required' using hint = 'Write a short note, so there is a record of why.'; end if;
  select * into r from lm.reports where id = p_report;
  if r.id is null then raise exception 'no_such_report'; end if;
  if r.status <> 'open' then raise exception 'not_waiting' using hint = 'That report was already read.'; end if;
  select * into p from lm.posts where id = r.post_id;
  if p_action = 'close' then
    if p.status <> 'closed' then
      update lm.posts set status = 'closed', closed_reason = 'removed', closed_at = now(), closed_by = auth.uid(), review_note = left(btrim(p_note), 1000) where id = p.id;
    end if;
    update lm.reports set status = 'closed', handled_by = auth.uid(), handled_at = now(), handled_note = left(btrim(p_note), 1000) where post_id = p.id and status = 'open';
    perform lm.log(p.ministry_id, 'report.post_closed', jsonb_build_object('id', p_report, 'post', p.id));
  else
    update lm.reports set status = 'kept', handled_by = auth.uid(), handled_at = now(), handled_note = left(btrim(p_note), 1000) where id = p_report;
    perform lm.log(p.ministry_id, 'report.kept', jsonb_build_object('id', p_report, 'post', p.id));
  end if;
end $$;

-- where a report's email goes: the stewards' addresses, for the service connection only
create function lm.steward_emails() returns text[]
language sql stable security definer set search_path = lm, app, pg_temp
as $$ select coalesce(array_agg(u.email order by p.created_at), '{}') from lm.people p join auth.users u on u.id = p.user_id where p.steward $$;

revoke all on function lm.report_create(uuid, text, text, text), lm.steward_emails() from public, anon, authenticated;
revoke all on function lm.report_resolve(uuid, text, text) from public, anon, authenticated;
grant execute on function lm.report_resolve(uuid, text, text) to authenticated;

-- the steward's queue now holds the open reports too
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
    'reports', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'post_id', p.id, 'post_title', p.title, 'post_body', p.body, 'post_status', p.status, 'ministry', m.name,
                     'reason', r.reason, 'note', r.note, 'email', r.reporter_email, 'created_at', r.created_at) order by r.created_at), '[]'::jsonb)
                     from lm.reports r join lm.posts p on p.id = r.post_id join lm.ministries m on m.id = p.ministry_id where r.status = 'open'),
    'stewards', (select coalesce(jsonb_agg(jsonb_build_object('user_id', s.user_id, 'name', s.full_name, 'email', u.email) order by s.created_at), '[]'::jsonb)
                     from lm.people s join auth.users u on u.id = s.user_id where s.steward));
end $$;

-- ---- leaving ------------------------------------------------------------------------------------------------------------------------
-- an answer stays a record, except when its words are erased because the person or the ministry that wrote or got it left
create or replace function lm.answers_are_records() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and current_setting('lm.erasing', true) = 'on'
     and (new.id, new.post_id, new.from_ministry_id, new.from_user_id, new.mail_id, new.sent_at) is not distinct from (old.id, old.post_id, old.from_ministry_id, old.from_user_id, old.mail_id, old.sent_at) then
    return new;     -- only the words, the phone and the reply address can change, and only while a person is being erased
  end if;
  raise exception 'answers_are_records' using hint = 'An answer that was sent is a record. It is never changed or deleted.';
end $$;

-- the last lead may go when the ministry itself has left
create or replace function lm.people_guard() returns trigger language plpgsql security definer set search_path = lm, app, pg_temp as $$
declare r lm.people := case when tg_op = 'DELETE' then old else new end;
begin
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
     and not exists (select 1 from lm.people where ministry_id = old.ministry_id and role = 'lead' and user_id <> old.user_id)
     and not exists (select 1 from lm.ministries m where m.id = old.ministry_id and m.status = 'left') then
    raise exception 'last_lead' using hint = 'A ministry always keeps one lead. Make someone else a lead first.';
  end if;
  return r;
end $$;

create function lm.account_erase(p_user uuid) returns jsonb
language plpgsql security definer set search_path = lm, app, auth, pg_temp
as $$
declare me lm.people; v_ministry uuid; v_left boolean := false;
begin
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'no_such_person'; end if;
  select * into me from lm.people where user_id = p_user;
  v_ministry := me.ministry_id;
  if me.user_id is not null then
    if me.steward and not exists (select 1 from lm.people where steward and user_id <> p_user) then
      raise exception 'last_steward' using hint = 'Linked Ministries always keeps one steward. Make someone else a steward first.';
    end if;
    if v_ministry is not null then
      if exists (select 1 from lm.people where ministry_id = v_ministry and user_id <> p_user) then
        if me.role = 'lead' and not exists (select 1 from lm.people where ministry_id = v_ministry and role = 'lead' and user_id <> p_user) then
          raise exception 'last_lead' using hint = 'You are the only lead. Make someone else a lead first. Then you can delete your account.';
        end if;
      else
        -- the only person in the ministry: the ministry leaves with them
        v_left := true;
        update lm.posts set status = 'closed', closed_reason = 'no_longer_needed', closed_at = now(), closed_by = p_user where ministry_id = v_ministry and status <> 'closed';
        update lm.invites set withdrawn_at = now() where ministry_id = v_ministry and accepted_at is null and withdrawn_at is null;
        perform set_config('lm.erasing', 'on', true);
        update lm.answers set words = '[removed]', phone = null, reply_email = 'removed'
         where from_ministry_id = v_ministry or post_id in (select id from lm.posts where ministry_id = v_ministry);
        perform set_config('lm.erasing', 'off', true);
        update lm.ministries set status = 'left', about = 'This ministry left the network.', website = null, contact_name = 'Removed',
               contact_email = 'removed@removed.invalid', review_note = null where id = v_ministry;
      end if;
      update lm.people set ministry_id = null, role = null where user_id = p_user;
    end if;
    update lm.people set full_name = 'A person who left', steward = false where user_id = p_user;
  end if;
  perform set_config('lm.erasing', 'on', true);
  update lm.answers set words = '[removed]', phone = null, reply_email = 'removed' where from_user_id = p_user and words <> '[removed]';
  perform set_config('lm.erasing', 'off', true);
  delete from app.sessions where user_id = p_user;
  delete from app.login_codes where user_id = p_user;
  update auth.users set email = 'deleted-' || replace(p_user::text, '-', '') || '@removed.invalid', full_name = null where id = p_user;
  update lm.events set actor_label = 'A person who left', actor_id = null where actor_id = p_user;
  insert into lm.events (ministry_id, actor_id, actor_label, kind, payload) values (v_ministry, null, 'A person who left', 'account.erased', jsonb_build_object('id', p_user, 'ministry_left', v_left));
  return jsonb_build_object('ministry_left', v_left);
end $$;

create function lm.account_delete() returns jsonb
language plpgsql security definer set search_path = lm, app, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  return lm.account_erase(auth.uid());
end $$;

revoke all on function lm.account_erase(uuid) from public, anon, authenticated;
revoke all on function lm.account_delete() from public, anon, authenticated;
grant execute on function lm.account_delete() to authenticated;

-- Down: drop function lm.account_delete(), lm.account_erase(uuid), lm.steward_emails(), lm.report_resolve(uuid, text, text), lm.report_create(uuid, text, text, text);
-- drop table lm.reports; put 0005's people_guard, 0003's answers_are_records and 0003's steward_queue back; restore the two CHECKs of 0002 and 0003
-- (ministries.status without 'left', posts.closed_reason without 'removed') once no row uses the new values.

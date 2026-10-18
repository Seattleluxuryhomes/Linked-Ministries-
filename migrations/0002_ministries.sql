-- 0002 — ministries, the people in them, the record of every act, and the stewards.
-- Shaped on Behavioral Health's 0001/0002 (organisations, seats, the append-only events, the last-administrator rule): here the
-- organisation is a ministry, a seat is a person, an administrator is a lead, and a steward is a Linked Ministries staff person
-- who reads what is new before it is public.
--
--   * A person belongs to one ministry (lm.people.user_id is the key). The first person is its lead. The last lead cannot be
--     demoted, removed or leave: a ministry with nobody able to manage it would become the founder's problem (hard rule 10).
--   * A new ministry waits. Only a steward makes it public, by lm.ministry_review, and a public ministry always carries the
--     name of the steward who read it (a CHECK, so even a hand-written UPDATE cannot skip the name).
--   * `steward` is set only by the operator in SQL (lm.make_steward) or by another steward (lm.steward_set). The trigger
--     refuses anyone else, and the last steward cannot be taken off.
--   * Every insert, update and delete on these tables writes an lm.events row with the person's name on it, from a trigger,
--     so forgetting to log is not possible. The row holds ids and field NAMES, never what a person wrote.
--   * Contact email and contact name are never in a column the public or another ministry can select: they are reached only
--     through the functions below.

create schema lm;

create table lm.ministries (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) between 2 and 120),
  city          text not null check (length(btrim(city)) between 2 and 80),
  state         text not null check (state ~ '^[A-Z]{2}$'),
  about         text not null check (length(btrim(about)) between 10 and 1200),
  website       text check (website is null or (website ~* '^https?://[^[:space:]]+$' and length(website) <= 200)),
  contact_name  text not null check (length(btrim(contact_name)) between 2 and 120),
  contact_email text not null check (contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and length(contact_email) <= 254),
  status        text not null default 'waiting' check (status in ('waiting', 'public', 'sent_back')),
  review_note   text check (review_note is null or length(review_note) <= 1000),
  reviewed_by   uuid references auth.users (id),
  reviewed_at   timestamptz,
  created_by    uuid not null references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (status <> 'public' or (reviewed_by is not null and reviewed_at is not null))   -- public always has a named reader
);

create table lm.people (
  user_id      uuid primary key references auth.users (id) on delete cascade,   -- one row per person: one ministry per person
  ministry_id  uuid references lm.ministries (id),
  role         text check (role in ('lead', 'member')),
  full_name    text not null check (length(btrim(full_name)) between 2 and 120),
  steward      boolean not null default false,
  created_at   timestamptz not null default now(),
  check ((ministry_id is null) = (role is null))
);
create index people_by_ministry on lm.people (ministry_id) where ministry_id is not null;

create table lm.invites (
  id           uuid primary key default gen_random_uuid(),
  ministry_id  uuid not null references lm.ministries (id),
  email        text not null check (email = lower(email) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  invited_by   uuid not null references auth.users (id),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '14 days',
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users (id),
  withdrawn_at timestamptz
);
create unique index invites_one_open on lm.invites (ministry_id, email) where accepted_at is null and withdrawn_at is null;

-- the record: append-only, named, written by the database. No foreign key on ministry_id: the history outlives a row.
create table lm.events (
  id           uuid primary key default gen_random_uuid(),
  ministry_id  uuid,
  actor_id     uuid,
  actor_label  text not null check (length(btrim(actor_label)) > 0),   -- a NAME is always required
  kind         text not null,                                          -- dotted: 'posts.insert', 'ministry.approved'
  payload      jsonb not null default '{}'::jsonb,                     -- ids and field NAMES, never what a person wrote
  created_at   timestamptz not null default now()
);
create index events_by_ministry_time on lm.events (ministry_id, created_at desc);
create index events_by_time on lm.events (created_at desc);

-- ---- who is asking ---------------------------------------------------------------------------------------------------
create function lm.my_ministry() returns uuid
language sql stable security definer set search_path = lm, app, pg_temp
as $$ select ministry_id from lm.people where user_id = auth.uid() $$;

create function lm.is_lead() returns boolean
language sql stable security definer set search_path = lm, app, pg_temp
as $$ select coalesce((select role = 'lead' from lm.people where user_id = auth.uid()), false) $$;

create function lm.is_steward() returns boolean
language sql stable security definer set search_path = lm, app, pg_temp
as $$ select coalesce((select steward from lm.people where user_id = auth.uid()), false) $$;

create function lm.ministry_is_public(p_ministry uuid) returns boolean
language sql stable security definer set search_path = lm, app, pg_temp
as $$ select coalesce((select status = 'public' from lm.ministries where id = p_ministry), false) $$;

-- the name on an act: the person's name, else the signed-in person's own name, else their address, else 'system'
create function lm.actor_label() returns text
language sql stable security definer set search_path = lm, app, pg_temp
as $$
  select coalesce(
    (select nullif(btrim(p.full_name), '') from lm.people p where p.user_id = auth.uid()),
    (select nullif(btrim(u.full_name), '') from auth.users u where u.id = auth.uid()),
    (select nullif(btrim(u.email), '') from auth.users u where u.id = auth.uid()),
    'system')
$$;

create function lm.log(p_ministry uuid, p_kind text, p_payload jsonb) returns void
language sql security definer set search_path = lm, app, pg_temp
as $$ insert into lm.events (ministry_id, actor_id, actor_label, kind, payload) values (p_ministry, auth.uid(), lm.actor_label(), p_kind, coalesce(p_payload, '{}'::jsonb)) $$;

-- ---- the record: one trigger for every lm table, ids and field names only ----------------------------------------------
create function lm.audit() returns trigger language plpgsql security definer set search_path = lm, app, pg_temp as $$
declare r record; j jsonb; jo jsonb; changed text[]; mid uuid;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  j := to_jsonb(r);
  jo := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(n.key order by n.key), '{}') into changed
      from jsonb_each(to_jsonb(new)) n join jsonb_each(jo) o on o.key = n.key
     where n.value is distinct from o.value and n.key <> 'updated_at';
    if changed = '{}' then return new; end if;
  end if;
  mid := coalesce(nullif(j ->> 'ministry_id', '')::uuid, nullif(j ->> 'from_ministry_id', '')::uuid,
                  nullif(jo ->> 'ministry_id', '')::uuid, case when tg_table_name = 'ministries' then (j ->> 'id')::uuid end);
  insert into lm.events (ministry_id, actor_id, actor_label, kind, payload)
  values (mid, auth.uid(), lm.actor_label(), tg_table_name || '.' || lower(tg_op),
    jsonb_strip_nulls(jsonb_build_object('id', coalesce(j ->> 'id', j ->> 'user_id'), 'post', j ->> 'post_id', 'fields', case when tg_op = 'UPDATE' then to_jsonb(changed) end)));
  return r;
end $$;
create trigger audit after insert or update or delete on lm.ministries for each row execute function lm.audit();
create trigger audit after insert or update or delete on lm.people for each row execute function lm.audit();
create trigger audit after insert or update on lm.invites for each row execute function lm.audit();

-- ---- guards the database keeps whatever calls it ------------------------------------------------------------------------
create function lm.touch() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger touch before update on lm.ministries for each row execute function lm.touch();

-- steward is set by the operator (no signed-in person: auth.uid() is null) or by another steward, and by nobody else
create function lm.people_guard() returns trigger language plpgsql security definer set search_path = lm, app, pg_temp as $$
begin
  if (tg_op = 'INSERT' and new.steward) or (tg_op = 'UPDATE' and new.steward is distinct from old.steward) then
    if auth.uid() is not null and not lm.is_steward() then
      raise exception 'steward_required' using hint = 'Only a steward can make or remove a steward.';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.steward and not new.steward and not exists (select 1 from lm.people where steward and user_id <> old.user_id) then
    raise exception 'last_steward' using hint = 'Linked Ministries always keeps one steward. Make someone else a steward first.';
  end if;
  -- the last lead: the ministry always keeps one person able to manage it
  if tg_op = 'UPDATE' and old.role = 'lead' and old.ministry_id is not null
     and (new.role is distinct from 'lead' or new.ministry_id is distinct from old.ministry_id)
     and not exists (select 1 from lm.people where ministry_id = old.ministry_id and role = 'lead' and user_id <> old.user_id) then
    raise exception 'last_lead' using hint = 'A ministry always keeps one lead. Make someone else a lead first.';
  end if;
  return new;
end $$;
create trigger people_guard before insert or update on lm.people for each row execute function lm.people_guard();

-- ---- ministries: make, change, be read by a steward ----------------------------------------------------------------------
create function lm.ministry_create(p_name text, p_city text, p_state text, p_about text, p_website text, p_contact_name text, p_contact_email text)
returns uuid language plpgsql security definer set search_path = lm, app, pg_temp
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  if lm.my_ministry() is not null then raise exception 'already_in_ministry' using hint = 'A person belongs to one ministry.'; end if;
  insert into lm.ministries (name, city, state, about, website, contact_name, contact_email, created_by)
  values (btrim(p_name), btrim(p_city), upper(btrim(p_state)), btrim(p_about), nullif(btrim(coalesce(p_website, '')), ''), btrim(p_contact_name), lower(btrim(p_contact_email)), auth.uid())
  returning id into v_id;
  insert into lm.people (user_id, ministry_id, role, full_name) values (auth.uid(), v_id, 'lead', btrim(p_contact_name))
  on conflict (user_id) do update set ministry_id = excluded.ministry_id, role = 'lead', full_name = excluded.full_name;
  return v_id;
end $$;

-- A lead changes the profile. The name and the town are public, so changing either sends the ministry back to be read; the
-- rest is not shown to the public and changes at once. A ministry that was sent back is read again when it is changed.
create function lm.ministry_update(p_name text, p_city text, p_state text, p_about text, p_website text, p_contact_name text, p_contact_email text)
returns text language plpgsql security definer set search_path = lm, app, pg_temp
as $$
declare v lm.ministries; v_status text;
begin
  if lm.my_ministry() is null then raise exception 'ministry_required'; end if;
  if not lm.is_lead() then raise exception 'lead_required' using hint = 'Only a lead can change the ministry''s page.'; end if;
  select * into v from lm.ministries where id = lm.my_ministry();
  v_status := v.status;
  if v.status = 'sent_back' then v_status := 'waiting';
  elsif v.status = 'public' and (v.name is distinct from btrim(p_name) or v.city is distinct from btrim(p_city) or v.state is distinct from upper(btrim(p_state))) then v_status := 'waiting'; end if;
  update lm.ministries set name = btrim(p_name), city = btrim(p_city), state = upper(btrim(p_state)), about = btrim(p_about),
    website = nullif(btrim(coalesce(p_website, '')), ''), contact_name = btrim(p_contact_name), contact_email = lower(btrim(p_contact_email)),
    status = v_status,
    review_note = case when v_status = 'waiting' then null else review_note end,
    reviewed_by = case when v_status = 'waiting' then null else reviewed_by end,
    reviewed_at = case when v_status = 'waiting' then null else reviewed_at end
  where id = v.id;
  return v_status;
end $$;

-- A steward reads a waiting ministry: approve it, or send it back with a note the lead reads.
create function lm.ministry_review(p_ministry uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = lm, app, pg_temp
as $$
declare v lm.ministries;
begin
  if not lm.is_steward() then raise exception 'steward_required' using hint = 'Only a steward at Linked Ministries can do that.'; end if;
  select * into v from lm.ministries where id = p_ministry;
  if v.id is null then raise exception 'no_such_ministry'; end if;
  if v.status <> 'waiting' then raise exception 'not_waiting' using hint = 'That ministry is not waiting to be read.'; end if;
  if p_approve then
    update lm.ministries set status = 'public', reviewed_by = auth.uid(), reviewed_at = now(), review_note = null where id = p_ministry;
    perform lm.log(p_ministry, 'ministry.approved', jsonb_build_object('id', p_ministry));
  else
    if length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'note_required' using hint = 'Write a short note so the ministry knows what to change.'; end if;
    update lm.ministries set status = 'sent_back', reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(btrim(p_note), 1000) where id = p_ministry;
    perform lm.log(p_ministry, 'ministry.sent_back', jsonb_build_object('id', p_ministry));
  end if;
end $$;

-- ---- the team: invite by email, accept, change a role, remove -------------------------------------------------------------
create function lm.team_invite(p_email text) returns uuid
language plpgsql security definer set search_path = lm, app, pg_temp
as $$
declare v_id uuid; v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if lm.my_ministry() is null then raise exception 'ministry_required'; end if;
  if not lm.is_lead() then raise exception 'lead_required' using hint = 'Only a lead can add a person.'; end if;
  if exists (select 1 from lm.people p join auth.users u on u.id = p.user_id where lower(u.email) = v_email and p.ministry_id = lm.my_ministry()) then
    raise exception 'already_on_team' using hint = 'That person is already on your team.';
  end if;
  insert into lm.invites (ministry_id, email, invited_by) values (lm.my_ministry(), v_email, auth.uid()) returning id into v_id;
  return v_id;
end $$;

create function lm.team_withdraw(p_invite uuid) returns void
language plpgsql security definer set search_path = lm, app, pg_temp
as $$
begin
  if not lm.is_lead() then raise exception 'lead_required' using hint = 'Only a lead can take back an invite.'; end if;
  update lm.invites set withdrawn_at = now() where id = p_invite and ministry_id = lm.my_ministry() and accepted_at is null and withdrawn_at is null;
  if not found then raise exception 'no_such_invite'; end if;
end $$;

-- the open invitations addressed to the signed-in person's own email (they proved the address by signing in)
create function lm.my_invites() returns jsonb
language sql stable security definer set search_path = lm, app, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'ministry', m.name, 'city', m.city, 'state', m.state) order by i.created_at), '[]'::jsonb)
    from lm.invites i join lm.ministries m on m.id = i.ministry_id join auth.users u on lower(u.email) = i.email
   where u.id = auth.uid() and i.accepted_at is null and i.withdrawn_at is null and i.expires_at > now()
$$;

create function lm.team_accept(p_invite uuid, p_name text) returns uuid
language plpgsql security definer set search_path = lm, app, pg_temp
as $$
declare v lm.invites;
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  if lm.my_ministry() is not null then raise exception 'already_in_ministry' using hint = 'A person belongs to one ministry.'; end if;
  select i.* into v from lm.invites i join auth.users u on lower(u.email) = i.email
   where i.id = p_invite and u.id = auth.uid() and i.accepted_at is null and i.withdrawn_at is null and i.expires_at > now();
  if v.id is null then raise exception 'no_such_invite' using hint = 'That invitation was not found, or it ran out.'; end if;
  insert into lm.people (user_id, ministry_id, role, full_name) values (auth.uid(), v.ministry_id, 'member', btrim(p_name))
  on conflict (user_id) do update set ministry_id = excluded.ministry_id, role = 'member', full_name = excluded.full_name;
  update lm.invites set accepted_at = now(), accepted_by = auth.uid() where id = v.id;
  return v.ministry_id;
end $$;

create function lm.team_list() returns jsonb
language plpgsql stable security definer set search_path = lm, app, pg_temp
as $$
declare v_m uuid := lm.my_ministry();
begin
  if v_m is null then raise exception 'ministry_required'; end if;
  return jsonb_build_object(
    'people', (select coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'name', p.full_name, 'role', p.role, 'email', u.email) order by p.role, p.created_at), '[]'::jsonb)
                 from lm.people p join auth.users u on u.id = p.user_id where p.ministry_id = v_m),
    'invites', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'expires_at', i.expires_at) order by i.created_at), '[]'::jsonb)
                  from lm.invites i where i.ministry_id = v_m and i.accepted_at is null and i.withdrawn_at is null and i.expires_at > now() and lm.is_lead()));
end $$;

-- the signed-in person's own ministry, in full (the contact name and address are in no column a role can select)
create function lm.my_ministry_profile() returns jsonb
language sql stable security definer set search_path = lm, app, pg_temp
as $$
  select to_jsonb(m) - 'created_by' - 'reviewed_by' from lm.ministries m where m.id = lm.my_ministry()
$$;

create function lm.team_set_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = lm, app, pg_temp
as $$
begin
  if not lm.is_lead() then raise exception 'lead_required' using hint = 'Only a lead can change a role.'; end if;
  if p_role not in ('lead', 'member') then raise exception 'role_not_known'; end if;
  update lm.people set role = p_role where user_id = p_user and ministry_id = lm.my_ministry();
  if not found then raise exception 'no_such_person'; end if;
end $$;

-- remove a person from the ministry (or leave it): they keep their sign-in and may join or make another ministry
create function lm.team_remove(p_user uuid) returns void
language plpgsql security definer set search_path = lm, app, pg_temp
as $$
begin
  if p_user is distinct from auth.uid() and not lm.is_lead() then raise exception 'lead_required' using hint = 'Only a lead can remove a person.'; end if;
  update lm.people set ministry_id = null, role = null where user_id = p_user and ministry_id = lm.my_ministry();
  if not found then raise exception 'no_such_person'; end if;
end $$;

-- ---- stewards ---------------------------------------------------------------------------------------------------------------
-- By another steward, who has the person's email. The person must have signed in once.
create function lm.steward_set(p_email text, p_on boolean) returns void
language plpgsql security definer set search_path = lm, app, pg_temp
as $$
declare v_user uuid;
begin
  if not lm.is_steward() then raise exception 'steward_required' using hint = 'Only a steward at Linked Ministries can do that.'; end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(coalesce(p_email, '')));
  if v_user is null then raise exception 'no_such_person' using hint = 'That person has not signed in yet. Ask them to sign in once, then try again.'; end if;
  insert into lm.people (user_id, full_name, steward) select id, coalesce(nullif(btrim(full_name), ''), email), p_on from auth.users where id = v_user
  on conflict (user_id) do update set steward = excluded.steward;
  perform lm.log(null, case when p_on then 'steward.made' else 'steward.removed' end, jsonb_build_object('id', v_user));
end $$;

-- By the operator, in the database's own SQL box (nobody is signed in there, so the guard lets it through): the first steward.
-- Usage: select lm.make_steward('someone@example.org');   It makes the sign-in person if they have not signed in yet.
create function lm.make_steward(p_email text) returns uuid
language plpgsql security definer set search_path = lm, app, pg_temp
as $$
declare v_user uuid; v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'email_not_readable'; end if;
  insert into auth.users (email) values (v_email) on conflict (lower(email)) do nothing;
  select id into v_user from auth.users where lower(email) = v_email;
  insert into lm.people (user_id, full_name, steward) values (v_user, coalesce((select nullif(btrim(full_name), '') from auth.users where id = v_user), v_email), true)
  on conflict (user_id) do update set steward = true;
  perform lm.log(null, 'steward.made', jsonb_build_object('id', v_user));
  return v_user;
end $$;

-- ---- row-level security ------------------------------------------------------------------------------------------------------
alter table lm.ministries enable row level security;
alter table lm.people enable row level security;
alter table lm.invites enable row level security;     -- no policy: reached only through the functions above
alter table lm.events enable row level security;

create policy ministries_read on lm.ministries for select to authenticated
  using (id = lm.my_ministry() or status = 'public' or lm.is_steward());
create policy ministries_public on lm.ministries for select to anon using (status = 'public');
create policy people_read on lm.people for select to authenticated
  using (user_id = auth.uid() or (ministry_id is not null and ministry_id = lm.my_ministry()));
create policy events_read on lm.events for select to authenticated using (lm.is_steward());

-- Down: drop schema lm cascade.

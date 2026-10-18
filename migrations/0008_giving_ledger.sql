-- 0008 — the giving ledger, built, with the money door closed.
-- Linked Ministries will take gifts and make grants to ministries. The standard is "safe and transparent", proven by the record, not claimed:
--
--   * GIFTS (lm.gifts) are a record that is only ever added to. A gift is a donor's name or "Anonymous", an email only if given, an amount
--     in whole cents, the day it came in, how it came in (card, check, cash, transfer, in kind) and a note. The database gives each one the
--     next receipt number, with no gap: a gift that fails to save does not use a number. A mistake is not edited: a correction is a new row
--     that points at the old one (lm.gift_correct), and a gift's total can never be taken below zero.
--   * GRANTS (lm.grants) go to a ministry on the network or to an outside organisation. A grant is proposed by one treasurer and approved by a
--     DIFFERENT treasurer (a CHECK on the table, so even the operator's SQL cannot make one person do both), only after the board's vote is
--     written down (lm.board_votes: the day, who voted yes, who abstained, who voted no, and the document that holds the vote). A grant
--     cannot be approved for more than the money gifts that have come in and are not already promised. Once approved a grant is never
--     changed except to be marked paid, with a reference. Nothing is deleted.
--   * lm.giving_settings holds the door. `door_open` can become true only when the Washington charitable solicitation registration number
--     and its date are both filled in (a CHECK). It starts closed.
--   * A TREASURER is a steward with one more flag (lm.people.treasurer). It is set by the operator's SQL (lm.make_treasurer) or by another
--     treasurer, and the last treasurer cannot be taken off (the same guard as the last steward).
--   * Every row written writes an lm.events row with a name on it: ids, amounts and field names. Never a donor's name, an email or a note.
--   * Nobody reads these tables directly. The treasurer reads through lm.treasury_view(); the public reads through lm.giving_public(), which
--     returns sums of the rows, never a donor.
-- New functions get no grant until they need one (CLAUDE.md rule 14).

-- ---- treasurers -----------------------------------------------------------------------------------------------------------------------
alter table lm.people add column treasurer boolean not null default false;
alter table lm.people add constraint people_treasurer_is_steward check (not treasurer or steward);
grant select (treasurer) on lm.people to authenticated;

create function lm.is_treasurer() returns boolean
language sql stable security definer set search_path = lm, app, pg_temp
as $$ select coalesce((select treasurer from lm.people where user_id = auth.uid()), false) $$;

create function lm.treasurer_guard() returns trigger language plpgsql security definer set search_path = lm, app, pg_temp as $$
begin
  if (tg_op = 'UPDATE' and old.treasurer) or (tg_op = 'DELETE' and old.treasurer) then
    perform pg_advisory_xact_lock(hashtextextended('lm.treasurers', 0));
  end if;
  if (tg_op = 'INSERT' and new.treasurer) or (tg_op = 'UPDATE' and new.treasurer is distinct from old.treasurer) then
    if auth.uid() is not null and not lm.is_treasurer() then
      raise exception 'treasurer_required' using hint = 'Only a treasurer can make or remove a treasurer.';
    end if;
  end if;
  if ((tg_op = 'UPDATE' and old.treasurer and not new.treasurer) or (tg_op = 'DELETE' and old.treasurer))
     and not exists (select 1 from lm.people where treasurer and user_id <> old.user_id) then
    raise exception 'last_treasurer' using hint = 'Linked Ministries always keeps one treasurer once it has one. Make someone else a treasurer first.';
  end if;
  if tg_op = 'UPDATE' and old.treasurer and new.treasurer and not new.steward then
    raise exception 'treasurer_is_steward' using hint = 'A treasurer is a steward. Take the treasurer role off first, after naming another treasurer.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger treasurer_guard before insert or update or delete on lm.people for each row execute function lm.treasurer_guard();

-- By the operator, in the database's own SQL box (nobody is signed in there): the first treasurer. Usage: select lm.make_treasurer('someone@example.org');
create function lm.make_treasurer(p_email text) returns uuid
language plpgsql security definer set search_path = lm, app, pg_temp
as $$
declare v_user uuid; v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'email_not_readable'; end if;
  insert into auth.users (email) values (v_email) on conflict (lower(email)) do nothing;
  select id into v_user from auth.users where lower(email) = v_email;
  insert into lm.people (user_id, full_name, steward, treasurer) values (v_user, coalesce((select nullif(btrim(full_name), '') from auth.users where id = v_user), v_email), true, true)
  on conflict (user_id) do update set steward = true, treasurer = true;
  perform lm.log(null, 'treasurer.made', jsonb_build_object('id', v_user));
  return v_user;
end $$;

-- By another treasurer, who has the person's email. The person must already be a steward.
create function lm.treasurer_set(p_email text, p_on boolean) returns void
language plpgsql security definer set search_path = lm, app, pg_temp
as $$
declare v_user uuid;
begin
  if not lm.is_treasurer() then raise exception 'treasurer_required' using hint = 'Only a treasurer can do that.'; end if;
  select u.id into v_user from auth.users u join lm.people p on p.user_id = u.id where lower(u.email) = lower(btrim(coalesce(p_email, '')));
  if v_user is null then raise exception 'no_such_person' using hint = 'That person has not signed in yet, or is not a steward. A treasurer is a steward who has signed in.'; end if;
  if p_on and not (select steward from lm.people where user_id = v_user) then raise exception 'steward_first' using hint = 'Make that person a steward first. A treasurer is a steward.'; end if;
  update lm.people set treasurer = p_on where user_id = v_user;
  perform lm.log(null, case when p_on then 'treasurer.made' else 'treasurer.removed' end, jsonb_build_object('id', v_user));
end $$;

-- ---- the receipt counter: one row, locked by each gift, so the numbers have no gap -----------------------------------------------------------------
create table lm.counters (name text primary key, n bigint not null);
insert into lm.counters (name, n) values ('receipt', 0);
alter table lm.counters enable row level security;      -- no policy and no grant

-- ---- gifts -------------------------------------------------------------------------------------------------------------------------------------
create table lm.gifts (
  id                uuid primary key default gen_random_uuid(),
  receipt_no        bigint not null unique,
  corrects_id       uuid references lm.gifts (id),
  donor_name        text not null check (length(btrim(donor_name)) between 2 and 120 and donor_name !~ '[[:cntrl:]]'),
  donor_email       text check (donor_email is null or (length(donor_email) <= 254 and donor_email ~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$')),
  amount_cents      bigint not null check (amount_cents between -1000000000 and 1000000000),
  received_on       date not null,
  method            text not null check (method in ('card', 'check', 'cash', 'transfer', 'in_kind')),
  note              text check (note is null or (length(note) <= 500 and note !~ '[[:cntrl:]]')),
  recorded_by       uuid not null references auth.users (id),
  recorded_by_name  text not null check (length(btrim(recorded_by_name)) > 0),
  created_at        timestamptz not null default now(),
  check ((corrects_id is null and amount_cents > 0) or (corrects_id is not null and (amount_cents <> 0 or note is not null)))
);
create index gifts_by_date on lm.gifts (received_on desc);
create index gifts_by_original on lm.gifts (corrects_id) where corrects_id is not null;

create table lm.gift_receipts (
  id         uuid primary key default gen_random_uuid(),
  gift_id    uuid not null references lm.gifts (id),
  mail_id    text,
  sent_by    uuid not null references auth.users (id),
  sent_at    timestamptz not null default now()
);
create index gift_receipts_by_gift on lm.gift_receipts (gift_id);

-- ---- the board's vote, grants -----------------------------------------------------------------------------------------------------------------------
create table lm.grants (
  id                 uuid primary key default gen_random_uuid(),
  recipient_kind     text not null check (recipient_kind in ('ministry', 'outside')),
  ministry_id        uuid references lm.ministries (id),
  recipient_name     text not null check (length(btrim(recipient_name)) between 2 and 120 and recipient_name !~ '[[:cntrl:]]'),
  amount_cents       bigint not null check (amount_cents > 0 and amount_cents <= 1000000000),
  purpose            text not null check (length(btrim(purpose)) between 10 and 500),
  status             text not null default 'proposed' check (status in ('proposed', 'approved', 'paid', 'declined')),
  proposed_by        uuid not null references auth.users (id),
  proposed_by_name   text not null check (length(btrim(proposed_by_name)) > 0),
  proposed_at        timestamptz not null default now(),
  approved_by        uuid references auth.users (id),
  approved_by_name   text,
  approved_at        timestamptz,
  paid_by            uuid references auth.users (id),
  paid_by_name       text,
  paid_at            timestamptz,
  paid_ref           text check (paid_ref is null or length(btrim(paid_ref)) between 2 and 120),
  declined_by        uuid references auth.users (id),
  declined_by_name   text,
  declined_at        timestamptz,
  decline_note       text check (decline_note is null or length(btrim(decline_note)) between 3 and 500),
  created_at         timestamptz not null default now(),
  check ((recipient_kind = 'ministry') = (ministry_id is not null)),
  constraint grants_two_people check (approved_by is null or approved_by <> proposed_by),     -- the proposer cannot approve
  check ((status in ('approved', 'paid')) = (approved_by is not null and approved_by_name is not null and approved_at is not null)),
  check ((status = 'paid') = (paid_by is not null and paid_by_name is not null and paid_at is not null and paid_ref is not null)),
  check ((status = 'declined') = (declined_by is not null and declined_by_name is not null and declined_at is not null and decline_note is not null))
);
create index grants_by_status on lm.grants (status, proposed_at desc);

create table lm.board_votes (
  id                uuid primary key default gen_random_uuid(),
  grant_id          uuid not null unique references lm.grants (id),
  voted_on          date not null,
  yes_names         text[] not null check (cardinality(yes_names) >= 1),
  abstain_names     text[] not null default '{}',
  no_names          text[] not null default '{}',
  doc_ref           text not null check (length(btrim(doc_ref)) between 3 and 200 and doc_ref !~ '[[:cntrl:]]'),
  recorded_by       uuid not null references auth.users (id),
  recorded_by_name  text not null check (length(btrim(recorded_by_name)) > 0),
  created_at        timestamptz not null default now()
);

-- ---- the door ------------------------------------------------------------------------------------------------------------------------------------------
create table lm.giving_settings (
  id                   boolean primary key default true check (id),            -- exactly one row
  door_open            boolean not null default false,
  registration_number  text check (registration_number is null or length(btrim(registration_number)) between 3 and 60),
  registration_date    date,
  form990_url          text check (form990_url is null or (form990_url ~* '^https://[^[:space:]@]+$' and length(form990_url) <= 300)),
  min_yes_votes        smallint not null default 2 check (min_yes_votes between 1 and 20),
  updated_by           uuid references auth.users (id),
  updated_at           timestamptz not null default now(),
  constraint door_needs_registration check (not door_open or (registration_number is not null and length(btrim(registration_number)) >= 3 and registration_date is not null))
);
insert into lm.giving_settings (id) values (true);

alter table lm.gifts enable row level security;
alter table lm.gift_receipts enable row level security;
alter table lm.grants enable row level security;
alter table lm.board_votes enable row level security;
alter table lm.giving_settings enable row level security;     -- no policy and no grant on any of these: only the functions below reach them

-- ---- the record: ids, amounts and field names, never a name or a word a person wrote --------------------------------------------------------------------
create function lm.audit_money() returns trigger language plpgsql security definer set search_path = lm, app, pg_temp as $$
declare p jsonb; mid uuid; changed text[]; n jsonb := to_jsonb(new); o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(k.key order by k.key), '{}') into changed from jsonb_each(n) k join jsonb_each(o) ov on ov.key = k.key where k.value is distinct from ov.value and k.key <> 'updated_at';
    if changed = '{}' then return new; end if;
  end if;
  if tg_table_name = 'gifts' then p := jsonb_build_object('id', new.id, 'receipt_no', new.receipt_no, 'amount_cents', new.amount_cents, 'method', new.method, 'corrects', new.corrects_id);
  elsif tg_table_name = 'grants' then mid := new.ministry_id; p := jsonb_build_object('id', new.id, 'amount_cents', new.amount_cents, 'status', new.status, 'fields', case when tg_op = 'UPDATE' then to_jsonb(changed) end);
  elsif tg_table_name = 'board_votes' then p := jsonb_build_object('id', new.id, 'grant', new.grant_id, 'yes', cardinality(new.yes_names), 'abstain', cardinality(new.abstain_names), 'no', cardinality(new.no_names));
  elsif tg_table_name = 'gift_receipts' then p := jsonb_build_object('id', new.id, 'gift', new.gift_id);
  elsif tg_table_name = 'giving_settings' then p := jsonb_build_object('door_open', new.door_open, 'fields', to_jsonb(changed));
  end if;
  insert into lm.events (ministry_id, actor_id, actor_label, kind, payload)
  values (mid, auth.uid(), lm.actor_label(), tg_table_name || '.' || lower(tg_op), jsonb_strip_nulls(p));
  return new;
end $$;
create trigger audit after insert on lm.gifts for each row execute function lm.audit_money();
create trigger audit after insert or update on lm.grants for each row execute function lm.audit_money();
create trigger audit after insert on lm.board_votes for each row execute function lm.audit_money();
create trigger audit after insert on lm.gift_receipts for each row execute function lm.audit_money();
create trigger audit after update on lm.giving_settings for each row execute function lm.audit_money();

-- ---- guards the database keeps whatever calls it ------------------------------------------------------------------------------------------------------
create function lm.records_only() returns trigger language plpgsql as $$
begin raise exception 'records_only' using hint = 'A gift, a vote and a receipt are records. They are never changed or deleted. A mistake is fixed by a new row that points at the old one.'; end $$;
create trigger records_only before update or delete on lm.gifts for each row execute function lm.records_only();
create trigger records_only before update or delete on lm.board_votes for each row execute function lm.records_only();
create trigger records_only before update or delete on lm.gift_receipts for each row execute function lm.records_only();
create trigger records_only_truncate before truncate on lm.gifts for each statement execute function lm.records_only();
create trigger records_only_truncate before truncate on lm.board_votes for each statement execute function lm.records_only();
create trigger records_only_truncate before truncate on lm.gift_receipts for each statement execute function lm.records_only();
create trigger records_only_truncate before truncate on lm.grants for each statement execute function lm.records_only();

-- the next receipt number, and the rules of a correction
create function lm.gifts_guard() returns trigger language plpgsql security definer set search_path = lm, app, pg_temp as $$
declare o lm.gifts; v_net bigint;
begin
  update lm.counters set n = n + 1 where name = 'receipt' returning n into new.receipt_no;     -- the row lock queues every gift; a rollback gives the number back
  if new.received_on > (now() at time zone 'utc')::date then raise exception 'date_in_future' using hint = 'A gift cannot be dated after today.'; end if;
  if auth.uid() is not null and new.recorded_by is distinct from auth.uid() then raise exception 'not_you' using hint = 'A gift is recorded under your own name.'; end if;
  if new.corrects_id is not null then
    select * into o from lm.gifts where id = new.corrects_id;
    if o.id is null or o.corrects_id is not null then raise exception 'cannot_correct' using hint = 'A correction points at the first record of a gift, not at another correction.'; end if;
    if (new.donor_name, new.method) is distinct from (o.donor_name, o.method) then raise exception 'cannot_correct' using hint = 'A correction keeps the donor and the way the gift came in.'; end if;
    select o.amount_cents + coalesce(sum(amount_cents), 0) + new.amount_cents into v_net from lm.gifts where corrects_id = o.id;
    if v_net < 0 then raise exception 'below_zero' using hint = 'A correction cannot take a gift below zero.'; end if;
  end if;
  return new;
end $$;
create trigger gifts_guard before insert on lm.gifts for each row execute function lm.gifts_guard();

create function lm.names_ok(p text[]) returns boolean language sql immutable as $$
  select not exists (select 1 from unnest(p) n where length(btrim(n)) not between 2 and 120 or n ~ '[[:cntrl:]]')
     and (select count(*) = count(distinct lower(btrim(n))) from unnest(p) n)
$$;

create function lm.votes_guard() returns trigger language plpgsql security definer set search_path = lm, app, pg_temp as $$
declare g lm.grants; s lm.giving_settings;
begin
  select * into g from lm.grants where id = new.grant_id;
  if g.status <> 'proposed' then raise exception 'not_proposed' using hint = 'The board votes on a grant that has been proposed.'; end if;
  select * into s from lm.giving_settings;
  if not (lm.names_ok(new.yes_names) and lm.names_ok(new.abstain_names) and lm.names_ok(new.no_names)) then raise exception 'names_not_readable' using hint = 'Write each board member''s name once, 2 to 120 letters, one per line.'; end if;
  if exists (select 1 from unnest(new.yes_names) a join unnest(new.abstain_names) b on lower(btrim(a)) = lower(btrim(b)))
     or exists (select 1 from unnest(new.yes_names) a join unnest(new.no_names) b on lower(btrim(a)) = lower(btrim(b)))
     or exists (select 1 from unnest(new.abstain_names) a join unnest(new.no_names) b on lower(btrim(a)) = lower(btrim(b))) then
    raise exception 'names_twice' using hint = 'A board member is in one list only: yes, abstained or no.';
  end if;
  if cardinality(new.yes_names) < s.min_yes_votes then raise exception 'not_enough_yes' using hint = 'The board needs at least ' || s.min_yes_votes || ' yes votes, by name, to approve a grant.'; end if;
  if new.voted_on > (now() at time zone 'utc')::date then raise exception 'date_in_future' using hint = 'The vote cannot be dated after today.'; end if;
  if auth.uid() is not null and new.recorded_by is distinct from auth.uid() then raise exception 'not_you' using hint = 'A vote is recorded under your own name.'; end if;
  return new;
end $$;
create trigger votes_guard before insert on lm.board_votes for each row execute function lm.votes_guard();

-- the money gifts that have come in (net of corrections), and what is already promised to grants
create function lm.ledger_totals() returns jsonb language sql stable security definer set search_path = lm, app, pg_temp as $$
  with orig as (
    select g.id, g.method, g.amount_cents + coalesce((select sum(c.amount_cents) from lm.gifts c where c.corrects_id = g.id), 0) as net
      from lm.gifts g where g.corrects_id is null)
  select jsonb_build_object(
    'money_cents', coalesce((select sum(net) from orig where method <> 'in_kind'), 0),
    'money_count', (select count(*) from orig where method <> 'in_kind' and net > 0),
    'in_kind_cents', coalesce((select sum(net) from orig where method = 'in_kind'), 0),
    'in_kind_count', (select count(*) from orig where method = 'in_kind' and net > 0),
    'granted_cents', coalesce((select sum(amount_cents) from lm.grants where status in ('approved', 'paid')), 0),
    'granted_count', (select count(*) from lm.grants where status in ('approved', 'paid')),
    'paid_cents', coalesce((select sum(amount_cents) from lm.grants where status = 'paid'), 0),
    'available_cents', coalesce((select sum(net) from orig where method <> 'in_kind'), 0) - coalesce((select sum(amount_cents) from lm.grants where status in ('approved', 'paid')), 0))
$$;

create function lm.grants_guard() returns trigger language plpgsql security definer set search_path = lm, app, pg_temp as $$
declare v jsonb; s lm.giving_settings; m lm.ministries; yes int;
begin
  if tg_op = 'DELETE' then raise exception 'records_only' using hint = 'A grant is a record. It is never deleted.'; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'proposed' then raise exception 'not_proposed' using hint = 'A grant starts as a proposal.'; end if;
    if auth.uid() is not null and (new.proposed_by is distinct from auth.uid() or not lm.is_treasurer()) then raise exception 'treasurer_required' using hint = 'Only a treasurer can propose a grant.'; end if;
    if new.recipient_kind = 'ministry' then
      select * into m from lm.ministries where id = new.ministry_id;
      if m.id is null or m.status <> 'public' then raise exception 'ministry_not_public' using hint = 'A ministry gets a grant only after a person at Linked Ministries has read it.'; end if;
    end if;
    return new;
  end if;
  -- an update: the grant itself never changes; only its stage moves, and each stage writes its own columns
  if (new.id, new.recipient_kind, new.ministry_id, new.recipient_name, new.amount_cents, new.purpose, new.proposed_by, new.proposed_by_name, new.proposed_at, new.created_at)
     is distinct from (old.id, old.recipient_kind, old.ministry_id, old.recipient_name, old.amount_cents, old.purpose, old.proposed_by, old.proposed_by_name, old.proposed_at, old.created_at) then
    raise exception 'records_only' using hint = 'A grant cannot be changed. Decline it and propose a new one.';
  end if;
  if new.status = old.status then raise exception 'records_only' using hint = 'A grant cannot be changed. Decline it and propose a new one.'; end if;
  if (old.status, new.status) not in (('proposed', 'approved'), ('proposed', 'declined'), ('approved', 'paid')) then
    raise exception 'status_change_not_allowed' using hint = 'That change is not allowed. A grant moves from proposed to approved, and from approved to paid.';
  end if;
  if new.status = 'approved' then
    if (new.paid_by, new.paid_at, new.paid_ref, new.declined_by, new.declined_at, new.decline_note) is distinct from (null::uuid, null::timestamptz, null::text, null::uuid, null::timestamptz, null::text) then raise exception 'records_only'; end if;
    if auth.uid() is not null and (new.approved_by is distinct from auth.uid() or not lm.is_treasurer()) then raise exception 'treasurer_required' using hint = 'Only a treasurer can approve a grant.'; end if;
    if new.approved_by = new.proposed_by then raise exception 'two_people' using hint = 'The person who proposed a grant cannot approve it. A different treasurer approves.'; end if;
    if not exists (select 1 from lm.people where user_id = new.approved_by and treasurer) then raise exception 'treasurer_required' using hint = 'Only a treasurer can approve a grant.'; end if;
    select * into s from lm.giving_settings;
    select cardinality(yes_names) into yes from lm.board_votes where grant_id = new.id;
    if yes is null then raise exception 'vote_needed' using hint = 'Write down the board''s vote first: the day, who voted yes, and the document that holds it.'; end if;
    if yes < s.min_yes_votes then raise exception 'not_enough_yes' using hint = 'The board needs at least ' || s.min_yes_votes || ' yes votes, by name.'; end if;
    perform pg_advisory_xact_lock(hashtextextended('lm.ledger', 0));
    v := lm.ledger_totals();
    if new.amount_cents > (v ->> 'available_cents')::bigint then raise exception 'not_enough_gifts' using hint = 'Linked Ministries has not received enough gifts, net of what the board already promised, to fund that grant.'; end if;
  elsif new.status = 'paid' then
    if (new.approved_by, new.approved_by_name, new.approved_at) is distinct from (old.approved_by, old.approved_by_name, old.approved_at) then raise exception 'records_only'; end if;
    if auth.uid() is not null and (new.paid_by is distinct from auth.uid() or not lm.is_treasurer()) then raise exception 'treasurer_required' using hint = 'Only a treasurer can mark a grant paid.'; end if;
  elsif new.status = 'declined' then
    if auth.uid() is not null and (new.declined_by is distinct from auth.uid() or not lm.is_treasurer()) then raise exception 'treasurer_required' using hint = 'Only a treasurer can decline a grant.'; end if;
  end if;
  return new;
end $$;
create trigger grants_guard before insert or update or delete on lm.grants for each row execute function lm.grants_guard();

create function lm.settings_guard() returns trigger language plpgsql security definer set search_path = lm, app, pg_temp as $$
begin
  if tg_op = 'DELETE' then raise exception 'records_only' using hint = 'The giving settings are never deleted.'; end if;
  if new.door_open and not (new.registration_number is not null and new.registration_date is not null) then
    raise exception 'registration_needed' using hint = 'The giving door opens only when the Washington registration number and its date are both filled in.';
  end if;
  new.updated_at := now(); new.updated_by := auth.uid();
  return new;
end $$;
create trigger settings_guard before update or delete on lm.giving_settings for each row execute function lm.settings_guard();
create trigger settings_no_truncate before truncate on lm.giving_settings for each statement execute function lm.records_only();

-- ---- the treasurer's side ----------------------------------------------------------------------------------------------------------------------------------
create function lm.gift_record(p_donor_name text, p_donor_email text, p_amount_cents bigint, p_received_on date, p_method text, p_note text) returns jsonb
language plpgsql security definer set search_path = lm, app, pg_temp as $$
declare v lm.gifts;
begin
  if not lm.is_treasurer() then raise exception 'treasurer_required' using hint = 'Only a treasurer can do that.'; end if;
  insert into lm.gifts (receipt_no, donor_name, donor_email, amount_cents, received_on, method, note, recorded_by, recorded_by_name)
  values (0, case when lower(btrim(coalesce(p_donor_name, ''))) in ('', 'anonymous') then 'Anonymous' else btrim(p_donor_name) end, nullif(lower(btrim(coalesce(p_donor_email, ''))), ''), p_amount_cents, p_received_on, p_method,
          nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), lm.actor_label())
  returning * into v;
  return jsonb_build_object('id', v.id, 'receipt_no', v.receipt_no, 'amount_cents', v.amount_cents, 'received_on', v.received_on, 'method', v.method, 'donor_email', v.donor_email, 'donor_name', v.donor_name);
end $$;

-- a correction: a new row that points at the first record. The amount is the change (negative to take away), and a note says why.
create function lm.gift_correct(p_gift uuid, p_change_cents bigint, p_received_on date, p_note text) returns jsonb
language plpgsql security definer set search_path = lm, app, pg_temp as $$
declare o lm.gifts; v lm.gifts;
begin
  if not lm.is_treasurer() then raise exception 'treasurer_required' using hint = 'Only a treasurer can do that.'; end if;
  if length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'note_required' using hint = 'Write a short note that says why the record is corrected.'; end if;
  select * into o from lm.gifts where id = p_gift;
  if o.id is null then raise exception 'no_such_gift'; end if;
  insert into lm.gifts (receipt_no, corrects_id, donor_name, donor_email, amount_cents, received_on, method, note, recorded_by, recorded_by_name)
  values (0, o.id, o.donor_name, o.donor_email, p_change_cents, coalesce(p_received_on, (now() at time zone 'utc')::date), o.method, btrim(p_note), auth.uid(), lm.actor_label())
  returning * into v;
  return jsonb_build_object('id', v.id, 'receipt_no', v.receipt_no, 'amount_cents', v.amount_cents, 'corrects', o.id);
end $$;

-- the receipt email's record: written by the server only after the mail provider took the message
create function lm.gift_receipt_record(p_gift uuid, p_mail_id text) returns uuid
language plpgsql security definer set search_path = lm, app, pg_temp as $$
declare v_id uuid;
begin
  if not lm.is_treasurer() then raise exception 'treasurer_required' using hint = 'Only a treasurer can do that.'; end if;
  insert into lm.gift_receipts (gift_id, mail_id, sent_by) values (p_gift, p_mail_id, auth.uid()) returning id into v_id;
  return v_id;
end $$;

create function lm.grant_propose(p_kind text, p_ministry uuid, p_name text, p_amount_cents bigint, p_purpose text) returns uuid
language plpgsql security definer set search_path = lm, app, pg_temp as $$
declare v_id uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  if not lm.is_treasurer() then raise exception 'treasurer_required' using hint = 'Only a treasurer can do that.'; end if;
  if p_kind = 'ministry' then select name into v_name from lm.ministries where id = p_ministry; if v_name is null then raise exception 'no_such_ministry'; end if; end if;
  insert into lm.grants (recipient_kind, ministry_id, recipient_name, amount_cents, purpose, proposed_by, proposed_by_name)
  values (p_kind, case when p_kind = 'ministry' then p_ministry end, v_name, p_amount_cents, btrim(coalesce(p_purpose, '')), auth.uid(), lm.actor_label()) returning id into v_id;
  return v_id;
end $$;

create function lm.grant_approve(p_grant uuid, p_voted_on date, p_yes text[], p_abstain text[], p_no text[], p_doc_ref text) returns void
language plpgsql security definer set search_path = lm, app, pg_temp as $$
declare g lm.grants;
begin
  if not lm.is_treasurer() then raise exception 'treasurer_required' using hint = 'Only a treasurer can do that.'; end if;
  select * into g from lm.grants where id = p_grant for update;
  if g.id is null then raise exception 'no_such_grant'; end if;
  if g.status <> 'proposed' then raise exception 'not_proposed' using hint = 'Only a proposed grant can be approved.'; end if;
  if g.proposed_by = auth.uid() then raise exception 'two_people' using hint = 'The person who proposed a grant cannot approve it. A different treasurer approves.'; end if;
  insert into lm.board_votes (grant_id, voted_on, yes_names, abstain_names, no_names, doc_ref, recorded_by, recorded_by_name)
  values (p_grant, p_voted_on, coalesce(p_yes, '{}'), coalesce(p_abstain, '{}'), coalesce(p_no, '{}'), btrim(coalesce(p_doc_ref, '')), auth.uid(), lm.actor_label());
  update lm.grants set status = 'approved', approved_by = auth.uid(), approved_by_name = lm.actor_label(), approved_at = now() where id = p_grant;
end $$;

create function lm.grant_decline(p_grant uuid, p_note text) returns void
language plpgsql security definer set search_path = lm, app, pg_temp as $$
begin
  if not lm.is_treasurer() then raise exception 'treasurer_required' using hint = 'Only a treasurer can do that.'; end if;
  if length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'note_required' using hint = 'Write a short note that says why.'; end if;
  update lm.grants set status = 'declined', declined_by = auth.uid(), declined_by_name = lm.actor_label(), declined_at = now(), decline_note = left(btrim(p_note), 500) where id = p_grant;
  if not found then raise exception 'no_such_grant'; end if;
end $$;

create function lm.grant_paid(p_grant uuid, p_ref text) returns void
language plpgsql security definer set search_path = lm, app, pg_temp as $$
begin
  if not lm.is_treasurer() then raise exception 'treasurer_required' using hint = 'Only a treasurer can do that.'; end if;
  if length(btrim(coalesce(p_ref, ''))) < 2 then raise exception 'reference_needed' using hint = 'Write the reference of the payment, such as a check number or a transfer number.'; end if;
  update lm.grants set status = 'paid', paid_by = auth.uid(), paid_by_name = lm.actor_label(), paid_at = now(), paid_ref = btrim(p_ref) where id = p_grant;
  if not found then raise exception 'no_such_grant'; end if;
end $$;

create function lm.giving_settings_set(p_registration_number text, p_registration_date date, p_form990_url text, p_door_open boolean) returns void
language plpgsql security definer set search_path = lm, app, pg_temp as $$
declare n text := nullif(btrim(coalesce(p_registration_number, '')), ''); u text := nullif(btrim(coalesce(p_form990_url, '')), '');
begin
  if not lm.is_treasurer() then raise exception 'treasurer_required' using hint = 'Only a treasurer can do that.'; end if;
  if p_registration_date is not null and p_registration_date > (now() at time zone 'utc')::date then raise exception 'date_in_future' using hint = 'The registration date cannot be after today.'; end if;
  if p_door_open and (n is null or p_registration_date is null) then raise exception 'registration_needed' using hint = 'The giving door opens only when the Washington registration number and its date are both filled in.'; end if;
  if u is not null and (u !~* '^https://[^[:space:]@]+$' or length(u) > 300) then raise exception 'url_not_readable' using hint = 'The link to the Form 990 starts with https://. Or leave it empty.'; end if;
  update lm.giving_settings set registration_number = n, registration_date = p_registration_date, form990_url = u, door_open = coalesce(p_door_open, false);
end $$;

-- everything a treasurer reads, in one answer (the donors' names and emails are here and only here)
create function lm.treasury_view() returns jsonb language plpgsql stable security definer set search_path = lm, app, pg_temp as $$
begin
  if not lm.is_treasurer() then raise exception 'treasurer_required' using hint = 'Only a treasurer can do that.'; end if;
  return jsonb_build_object(
    'settings', (select to_jsonb(s) - 'updated_by' - 'id' from lm.giving_settings s),
    'totals', lm.ledger_totals(),
    'gifts', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'receipt_no', g.receipt_no, 'corrects_id', g.corrects_id, 'donor_name', g.donor_name, 'donor_email', g.donor_email,
                'amount_cents', g.amount_cents, 'received_on', to_char(g.received_on, 'YYYY-MM-DD'), 'method', g.method, 'note', g.note, 'recorded_by_name', g.recorded_by_name, 'created_at', g.created_at,
                'receipt_sent_at', (select max(r.sent_at) from lm.gift_receipts r where r.gift_id = g.id)) order by g.receipt_no desc), '[]'::jsonb) from (select * from lm.gifts order by receipt_no desc limit 1000) g),
    'grants', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'recipient_kind', x.recipient_kind, 'ministry_id', x.ministry_id, 'recipient_name', x.recipient_name, 'amount_cents', x.amount_cents, 'purpose', x.purpose,
                'status', x.status, 'proposed_by', x.proposed_by, 'proposed_by_name', x.proposed_by_name, 'proposed_at', x.proposed_at, 'approved_by_name', x.approved_by_name, 'approved_at', x.approved_at,
                'paid_by_name', x.paid_by_name, 'paid_at', x.paid_at, 'paid_ref', x.paid_ref, 'declined_by_name', x.declined_by_name, 'decline_note', x.decline_note,
                'vote', (select jsonb_build_object('voted_on', to_char(v.voted_on, 'YYYY-MM-DD'), 'yes_names', v.yes_names, 'abstain_names', v.abstain_names, 'no_names', v.no_names, 'doc_ref', v.doc_ref) from lm.board_votes v where v.grant_id = x.id))
                order by x.proposed_at desc), '[]'::jsonb) from lm.grants x),
    'ministries', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'city', m.city, 'state', m.state) order by m.name), '[]'::jsonb) from lm.ministries m where m.status = 'public'),
    'treasurers', (select coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'name', p.full_name, 'email', u.email) order by p.created_at), '[]'::jsonb) from lm.people p join auth.users u on u.id = p.user_id where p.treasurer),
    'me', jsonb_build_object('user_id', auth.uid(), 'name', lm.actor_label()));
end $$;

-- one gift, for the receipt email (a treasurer only)
create function lm.gift_get(p_gift uuid) returns jsonb language plpgsql stable security definer set search_path = lm, app, pg_temp as $$
declare v lm.gifts;
begin
  if not lm.is_treasurer() then raise exception 'treasurer_required' using hint = 'Only a treasurer can do that.'; end if;
  select * into v from lm.gifts where id = p_gift;
  if v.id is null then raise exception 'no_such_gift'; end if;
  return jsonb_build_object('id', v.id, 'receipt_no', v.receipt_no, 'corrects_id', v.corrects_id, 'donor_name', v.donor_name, 'donor_email', v.donor_email, 'amount_cents', v.amount_cents,
    'received_on', to_char(v.received_on, 'YYYY-MM-DD'), 'method', v.method, 'receipt_sent_at', (select max(r.sent_at) from lm.gift_receipts r where r.gift_id = v.id));
end $$;

-- the record that a treasurer exported donors' names (the export is read-only; who took the file is still written down)
create function lm.treasury_export_logged(p_what text) returns void language plpgsql security definer set search_path = lm, app, pg_temp as $$
begin
  if not lm.is_treasurer() then raise exception 'treasurer_required' using hint = 'Only a treasurer can do that.'; end if;
  perform lm.log(null, 'treasury.export', jsonb_build_object('what', case when p_what = 'grants' then 'grants' else 'gifts' end));
end $$;

-- ---- the public's side: sums of the rows, never a donor --------------------------------------------------------------------------------------------------------
create function lm.giving_door_open() returns boolean language sql stable security definer set search_path = lm, app, pg_temp as $$
  select door_open from lm.giving_settings
$$;

create function lm.giving_public() returns jsonb language sql stable security definer set search_path = lm, app, pg_temp as $$
  with t as (select lm.ledger_totals() as v),
  months as (select to_char(d, 'YYYY-MM') as ym, d from generate_series(date_trunc('month', now() at time zone 'utc') - interval '11 months', date_trunc('month', now() at time zone 'utc'), interval '1 month') d)
  select jsonb_build_object(
    'door_open', s.door_open, 'registration_number', s.registration_number, 'registration_date', to_char(s.registration_date, 'YYYY-MM-DD'), 'form990_url', s.form990_url,
    'money_cents', (t.v ->> 'money_cents')::bigint, 'money_count', (t.v ->> 'money_count')::int, 'in_kind_cents', (t.v ->> 'in_kind_cents')::bigint, 'in_kind_count', (t.v ->> 'in_kind_count')::int,
    'granted_cents', (t.v ->> 'granted_cents')::bigint, 'granted_count', (t.v ->> 'granted_count')::int, 'paid_cents', (t.v ->> 'paid_cents')::bigint,
    'grants', (select coalesce(jsonb_agg(jsonb_build_object('recipient_name', g.recipient_name, 'recipient_kind', g.recipient_kind, 'page_slug', lm.page_slug_of(g.ministry_id), 'amount_cents', g.amount_cents, 'purpose', g.purpose,
                  'status', g.status, 'voted_on', to_char(v.voted_on, 'YYYY-MM-DD'), 'paid_on', to_char(g.paid_at at time zone 'utc', 'YYYY-MM-DD'), 'doc_ref', v.doc_ref,
                  'yes', cardinality(v.yes_names), 'abstain', cardinality(v.abstain_names), 'no', cardinality(v.no_names)) order by v.voted_on desc, g.approved_at desc), '[]'::jsonb)
                from lm.grants g join lm.board_votes v on v.grant_id = g.id where g.status in ('approved', 'paid')),
    'months', (select jsonb_agg(jsonb_build_object('month', m.ym,
                  'gifts_cents', coalesce((select sum(x.amount_cents) from lm.gifts x where x.method <> 'in_kind' and to_char(x.received_on, 'YYYY-MM') = m.ym), 0),
                  'grants_cents', coalesce((select sum(g.amount_cents) from lm.grants g join lm.board_votes v on v.grant_id = g.id where g.status in ('approved', 'paid') and to_char(v.voted_on, 'YYYY-MM') = m.ym), 0)) order by m.d) from months m))
  from lm.giving_settings s, t
$$;

-- ---- who may call what ----------------------------------------------------------------------------------------------------------------------------------------
revoke all on function lm.is_treasurer(), lm.treasurer_guard(), lm.make_treasurer(text), lm.treasurer_set(text, boolean), lm.audit_money(), lm.records_only(), lm.gifts_guard(), lm.names_ok(text[]),
  lm.votes_guard(), lm.ledger_totals(), lm.grants_guard(), lm.settings_guard(), lm.gift_record(text, text, bigint, date, text, text), lm.gift_correct(uuid, bigint, date, text),
  lm.gift_receipt_record(uuid, text), lm.grant_propose(text, uuid, text, bigint, text), lm.grant_approve(uuid, date, text[], text[], text[], text), lm.grant_decline(uuid, text),
  lm.grant_paid(uuid, text), lm.giving_settings_set(text, date, text, boolean), lm.treasury_view(), lm.gift_get(uuid), lm.treasury_export_logged(text), lm.giving_door_open(), lm.giving_public() from public, anon, authenticated;
grant execute on function lm.is_treasurer(), lm.treasurer_set(text, boolean), lm.gift_record(text, text, bigint, date, text, text), lm.gift_correct(uuid, bigint, date, text), lm.gift_receipt_record(uuid, text),
  lm.grant_propose(text, uuid, text, bigint, text), lm.grant_approve(uuid, date, text[], text[], text[], text), lm.grant_decline(uuid, text), lm.grant_paid(uuid, text),
  lm.giving_settings_set(text, date, text, boolean), lm.treasury_view(), lm.gift_get(uuid), lm.treasury_export_logged(text) to authenticated;
grant execute on function lm.giving_door_open(), lm.giving_public() to anon, authenticated;
-- lm.make_treasurer is the operator's alone; lm.ledger_totals and the guards are called by the database and by nobody else.

-- Down: drop function lm.giving_public(), lm.giving_door_open(), lm.treasury_export_logged(text), lm.gift_get(uuid), lm.treasury_view(), lm.giving_settings_set(text, date, text, boolean), lm.grant_paid(uuid, text), lm.grant_decline(uuid, text),
-- lm.grant_approve(uuid, date, text[], text[], text[], text), lm.grant_propose(text, uuid, text, bigint, text), lm.gift_receipt_record(uuid, text), lm.gift_correct(uuid, bigint, date, text),
-- lm.gift_record(text, text, bigint, date, text, text), lm.settings_guard(), lm.grants_guard(), lm.ledger_totals(), lm.votes_guard(), lm.names_ok(text[]), lm.gifts_guard(), lm.records_only(),
-- lm.audit_money() cascade; drop table lm.giving_settings, lm.board_votes, lm.grants, lm.gift_receipts, lm.gifts, lm.counters;
-- drop function lm.treasurer_set(text, boolean), lm.make_treasurer(text), lm.treasurer_guard() cascade, lm.is_treasurer(); alter table lm.people drop constraint people_treasurer_is_steward, drop column treasurer.

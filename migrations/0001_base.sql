-- 0001 — the base: the sign-in tables, the sessions, and the rate limits. Shaped on Behavioral Health's 0001, which was shaped
-- on Cross Universal's 0010 sign-in and 0026 rate limits (the origin is recorded in commons.json). What is not here: an
-- organisation, seats and roles of a care team. Ministries and the people in them are 0002.
--
-- Applied migrations are never edited: the next change is the next number. After adding one, run `npm run migrations:freeze`.

create schema if not exists app;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---- the sign-in person (Supabase's auth.users stand-in: the shim creates the table; these are the columns this product reads) ----
alter table auth.users add column if not exists full_name text;
create unique index if not exists auth_users_email_lower on auth.users (lower(email));

-- ---- sign-in: a six-digit code, hashed, ten minutes, one use; sessions hashed, thirty days, revocable ------------------
create table app.login_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  code_hash   bytea not null,
  channel     text not null check (channel in ('email', 'console')),
  sent_to     text not null,
  attempts    smallint not null default 0,
  expires_at  timestamptz not null default now() + interval '10 minutes',
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index login_codes_by_user on app.login_codes (user_id, created_at desc);
alter table app.login_codes enable row level security;   -- no policy: the service connection only

create table app.sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  token_hash  bytea not null unique,
  user_agent  text,
  ip          text,
  via         text not null default 'code' check (via in ('code')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days',
  revoked_at  timestamptz
);
create index sessions_by_user on app.sessions (user_id, created_at desc);
alter table app.sessions enable row level security;      -- no policy: the service connection only

-- ---- rate limits and the code lockout, in Postgres (shaped on 0026) ------------------------------------------------------
create schema rl;
revoke all on schema rl from public, authenticated, anon;
create table rl.events (bucket text not null, key text not null, at timestamptz not null default now());
create index rl_events_lookup on rl.events (bucket, key, at desc);
create table rl.code_failures (identity text not null, ip text, at timestamptz not null default now());
create index rl_code_failures_lookup on rl.code_failures (identity, at desc);
revoke all on rl.events, rl.code_failures from public, authenticated, anon;

create function rl.take(p_bucket text, p_key text, p_limit int, p_window interval) returns boolean
language plpgsql as $$
declare n int;
begin
  if p_limit <= 0 then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_bucket || ':' || p_key, 0));
  delete from rl.events where bucket = p_bucket and key = p_key and at < now() - p_window;
  select count(*) into n from rl.events where bucket = p_bucket and key = p_key;
  if n >= p_limit then return false; end if;
  insert into rl.events (bucket, key) values (p_bucket, p_key);
  return true;
end $$;
create function rl.reap() returns void language sql as $$
  delete from rl.events where at < now() - interval '24 hours';
  delete from rl.code_failures where at < now() - interval '24 hours';
$$;
revoke all on function rl.take(text, text, int, interval) from public, authenticated, anon;
revoke all on function rl.reap() from public, authenticated, anon;

-- Down: drop schema rl cascade; drop table app.sessions, app.login_codes cascade; drop index auth_users_email_lower;
-- alter table auth.users drop column full_name; drop schema app cascade.

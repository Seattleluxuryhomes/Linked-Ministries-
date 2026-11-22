-- 0012 — ministries in any country, and the public list of ministries with what each needs now.
--
-- Founder, 2026-11-22: "we need to have a place where these countries and Ministries can showcase their websites and their need lists."
-- Until now a ministry had to choose a US state, so a ministry in Nigeria or Pakistan could not join.
--
--   * lm.ministries.country: the two-letter country code (ISO 3166-1), 'US' for every ministry that was already here. A US ministry
--     still chooses its state; a ministry anywhere else keeps the state empty ('') and its city says where it is.
--   * lm.posts.state may be empty too (a post of a ministry outside the US). A post's country is its ministry's country.
--   * lm.ministry_create / lm.ministry_update gain an eight-argument form with the country. The seven-argument forms keep working:
--     create means the US; update keeps the ministry's country. Changing the country sends a public ministry back to be read, like
--     its name and its city.
--   * lm.directory_public(): every public ministry, its country, its city, its live page's line, picture and donation link (only
--     from the copy a person on the team read), and its public, still-open asks. The same rows the board and /m/<slug> already show,
--     gathered in one place; nothing that was private becomes public.
-- New functions get no grant until they need one (CLAUDE.md rule 16): each is revoked here and granted by name.
-- Down: every ministry back in the US with a state (a ministry elsewhere has to leave or choose one first); drop the two new functions, the
-- eight-argument forms and the trigger; put back 0007's page_public and 0002's seven-argument ministry_update; drop the column; put back
-- both state checks.

alter table lm.ministries add column country text not null default 'US' check (country ~ '^[A-Z]{2}$');
alter table lm.ministries drop constraint ministries_state_check;
alter table lm.ministries add constraint ministries_state_check check ((country = 'US' and state ~ '^[A-Z]{2}$') or (country <> 'US' and state = ''));
alter table lm.posts drop constraint posts_state_check;
alter table lm.posts add constraint posts_state_check check (state ~ '^[A-Z]{2}$' or state = '');
grant select (country) on lm.ministries to anon, authenticated;

-- a post's state follows its ministry: empty outside the US, a state code inside it
create function lm.posts_place() returns trigger language plpgsql security definer set search_path = lm, app, pg_temp as $$
declare c text;
begin
  select country into c from lm.ministries where id = new.ministry_id;
  if c is distinct from 'US' then new.state := ''; elsif new.state = '' then raise exception 'state_needed' using hint = 'Choose a state.'; end if;
  return new;
end $$;
create trigger posts_place before insert or update of state, ministry_id on lm.posts for each row execute function lm.posts_place();

create function lm.ministry_create(p_name text, p_city text, p_state text, p_about text, p_website text, p_contact_name text, p_contact_email text, p_country text)
returns uuid language plpgsql security definer set search_path = lm, app, pg_temp
as $$
declare v_id uuid; c text := upper(btrim(coalesce(p_country, 'US')));
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  if lm.my_ministry() is not null then raise exception 'already_in_ministry' using hint = 'A person belongs to one ministry.'; end if;
  if c !~ '^[A-Z]{2}$' then raise exception 'country_needed' using hint = 'Choose your country.'; end if;
  insert into lm.ministries (name, city, state, country, about, website, contact_name, contact_email, created_by)
  values (btrim(p_name), btrim(p_city), case when c = 'US' then upper(btrim(coalesce(p_state, ''))) else '' end, c, btrim(p_about),
          nullif(btrim(coalesce(p_website, '')), ''), btrim(p_contact_name), lower(btrim(p_contact_email)), auth.uid())
  returning id into v_id;
  insert into lm.people (user_id, ministry_id, role, full_name) values (auth.uid(), v_id, 'lead', btrim(p_contact_name))
  on conflict (user_id) do update set ministry_id = excluded.ministry_id, role = 'lead', full_name = excluded.full_name;
  return v_id;
end $$;

create function lm.ministry_update(p_name text, p_city text, p_state text, p_about text, p_website text, p_contact_name text, p_contact_email text, p_country text)
returns text language plpgsql security definer set search_path = lm, app, pg_temp
as $$
declare v lm.ministries; v_status text; c text := upper(btrim(coalesce(p_country, 'US'))); s text;
begin
  if lm.my_ministry() is null then raise exception 'ministry_required'; end if;
  if not lm.is_lead() then raise exception 'lead_required' using hint = 'Only a lead can change the ministry''s page.'; end if;
  if c !~ '^[A-Z]{2}$' then raise exception 'country_needed' using hint = 'Choose your country.'; end if;
  s := case when c = 'US' then upper(btrim(coalesce(p_state, ''))) else '' end;
  select * into v from lm.ministries where id = lm.my_ministry();
  v_status := v.status;
  if v.status = 'sent_back' then v_status := 'waiting';
  elsif v.status = 'public' and (v.name is distinct from btrim(p_name) or v.city is distinct from btrim(p_city) or v.state is distinct from s or v.country is distinct from c) then v_status := 'waiting'; end if;
  update lm.ministries set name = btrim(p_name), city = btrim(p_city), country = c, state = s, about = btrim(p_about),
    website = nullif(btrim(coalesce(p_website, '')), ''), contact_name = btrim(p_contact_name), contact_email = lower(btrim(p_contact_email)),
    status = v_status,
    review_note = case when v_status = 'waiting' then null else review_note end,
    reviewed_by = case when v_status = 'waiting' then null else reviewed_by end,
    reviewed_at = case when v_status = 'waiting' then null else reviewed_at end
  where id = v.id;
  -- the drafts of a ministry that moved follow it (a post's state is its ministry's)
  update lm.posts set state = case when c <> 'US' then '' when state = '' then s else state end
   where ministry_id = v.id and status = 'draft' and state is distinct from (case when c <> 'US' then '' when state = '' then s else state end);
  return v_status;
end $$;

-- the seven-argument update (the page form calls it) keeps the ministry's own country
create or replace function lm.ministry_update(p_name text, p_city text, p_state text, p_about text, p_website text, p_contact_name text, p_contact_email text)
returns text language sql security definer set search_path = lm, app, pg_temp
as $$
  select lm.ministry_update(p_name, p_city, p_state, p_about, p_website, p_contact_name, p_contact_email,
                            coalesce((select country from lm.ministries where id = lm.my_ministry()), 'US'))
$$;

-- a public page carries its ministry's country
create or replace function lm.page_public(p_slug text) returns jsonb language sql stable security definer set search_path = lm, app, pg_temp as $$
  select jsonb_build_object('slug', g.slug, 'ministry_id', m.id, 'name', m.name, 'city', m.city, 'state', m.state, 'country', m.country, 'live', g.live, 'live_at', g.live_at)
    from lm.pages g join lm.ministries m on m.id = g.ministry_id
   where g.slug = lower(coalesce(p_slug, '')) and g.live is not null and m.status = 'public'
$$;

-- one ministry's public, still-open asks (its own page lists them under "What we need now")
create function lm.asks_public(p_ministry uuid) returns jsonb language sql stable security definer set search_path = lm, app, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'category', p.category, 'open_until', to_char(p.open_until, 'YYYY-MM-DD'))
                            order by p.approved_at desc), '[]'::jsonb)
    from lm.posts p
   where p.ministry_id = p_ministry and p.kind = 'ask' and p.status = 'public'
     and p.open_until >= (now() at time zone 'utc')::date and lm.ministry_is_public(p.ministry_id)
$$;

-- every public ministry, for /ministries: what the board and the pages already show, in one place
create function lm.directory_public() returns jsonb language sql stable security definer set search_path = lm, app, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'name', m.name, 'city', m.city, 'state', m.state, 'country', m.country, 'website', m.website,
           'slug', g.slug,
           'tagline', g.live ->> 'tagline',
           'give_url', g.live ->> 'give_url',
           'photo', g.live -> 'photos' -> 0 ->> 'id',
           'photo_alt', g.live -> 'photos' -> 0 ->> 'alt',
           'asks', lm.asks_public(m.id))
         order by m.country, m.name), '[]'::jsonb)
    from lm.ministries m
    left join lm.pages g on g.ministry_id = m.id and g.live is not null
   where m.status = 'public'
$$;

revoke all on function lm.posts_place() from public, anon, authenticated;
revoke all on function lm.ministry_create(text, text, text, text, text, text, text, text), lm.ministry_update(text, text, text, text, text, text, text, text),
  lm.asks_public(uuid), lm.directory_public() from public, anon, authenticated;
grant execute on function lm.ministry_create(text, text, text, text, text, text, text, text), lm.ministry_update(text, text, text, text, text, text, text, text) to authenticated;
grant execute on function lm.asks_public(uuid), lm.directory_public() to anon, authenticated;

-- 0012 — a ministry's page wears its own colours, carries a Bible in the language it chooses, and holds a gallery.
-- Founder, 2026-11-12: "a template that we can give to different ministries; the only thing that they would have to change are the
-- pictures and colors ... it'll have the Bible app ... including the language that they choose to use for the Bible." Asked "inside
-- linkedm.org or a separate template?" and "how wide should the colour choice be?", answered: inside linkedm.org, curated themes.
--
--   * theme: one of twelve calm themes (server/themes.mjs draws them). Every theme keeps the pale ground and dark words, and none is
--     red; only the ministry's own page and its Bible wear it. The network's own pages keep the one gold.
--   * bible: at most two translations, in the order the ministry wants them (the first opens first). The database checks the shape;
--     the server checks each against data/bible/translations.json, and a translation the server does not carry shows nothing (the
--     rule a verse key already follows).
--   * photos: a page holds up to twelve pictures (it held two). A ministry may keep twenty-four, so a draft can hold twelve new ones
--     while the live copy still names its twelve.
-- The rest of lm.page_clean is 0007's, unchanged. CREATE OR REPLACE keeps each function's grants as 0007 set them.

create or replace function lm.page_clean(p_ministry uuid, d jsonb) returns jsonb language plpgsql stable security definer set search_path = lm, app, pg_temp as $$
declare
  tag text := btrim(coalesce(d ->> 'tagline', '')); about text := btrim(coalesce(d ->> 'about', ''));
  em text := lower(btrim(coalesce(d ->> 'email', ''))); ph text := btrim(coalesce(d ->> 'phone', ''));
  web text := btrim(coalesce(d ->> 'website', '')); give text := btrim(coalesce(d ->> 'give_url', '')); vs text := btrim(coalesce(d ->> 'verse', ''));
  th text := btrim(coalesce(d ->> 'theme', '')); bible jsonb := coalesce(d -> 'bible', '[]'::jsonb); out_bible jsonb := '[]'::jsonb; tr text;
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
  -- 0012: the theme, one of twelve, and the Bible, at most two translations, each named once
  if th <> '' and th not in ('gold', 'clay', 'rose', 'plum', 'indigo', 'ocean', 'sky', 'teal', 'forest', 'olive', 'earth', 'slate') then
    raise exception 'theme_not_known' using hint = 'Choose one of the colors on the list.';
  end if;
  if jsonb_typeof(bible) <> 'array' or jsonb_array_length(bible) > 2 then raise exception 'bible_too_many' using hint = 'Choose one or two Bible languages.'; end if;
  for r in select * from jsonb_array_elements(bible) loop
    tr := case when jsonb_typeof(r) = 'string' then r #>> '{}' else '' end;
    if tr !~ '^[a-z]{2,3}-[a-z0-9]{2,10}$' then raise exception 'bible_not_known' using hint = 'Choose a Bible language from the list.'; end if;
    if out_bible ? tr then raise exception 'bible_twice' using hint = 'Choose two different Bible languages, or just one.'; end if;
    out_bible := out_bible || jsonb_build_array(tr);
  end loop;
  if jsonb_typeof(photos) <> 'array' or jsonb_array_length(photos) > 12 then raise exception 'too_many_photos' using hint = 'A page holds twelve pictures at most.'; end if;
  for r in select * from jsonb_array_elements(photos) loop
    begin pid := (r ->> 'id')::uuid; exception when others then raise exception 'photo_not_found' using hint = 'That picture was not found. Add it again.'; end;
    if not exists (select 1 from lm.page_photos where id = pid and ministry_id = p_ministry) then raise exception 'photo_not_found' using hint = 'That picture was not found. Add it again.'; end if;
    if out_photos @> jsonb_build_array(jsonb_build_object('id', pid::text)) then raise exception 'photo_twice' using hint = 'That picture is on the page twice. Take one off.'; end if;
    al := left(btrim(coalesce(r ->> 'alt', '')), 160);
    if al ~ '[[:cntrl:]]' then al := ''; end if;
    out_photos := out_photos || jsonb_build_array(jsonb_build_object('id', pid::text, 'alt', al));
  end loop;
  return jsonb_strip_nulls(jsonb_build_object('tagline', tag, 'about', about, 'meets', out_meets,
    'email', nullif(em, ''), 'phone', nullif(ph, ''), 'website', nullif(web, ''), 'give_url', nullif(give, ''), 'verse', nullif(vs, ''),
    'theme', nullif(th, ''), 'bible', case when jsonb_array_length(out_bible) > 0 then out_bible end, 'photos', out_photos));
end $$;

-- a ministry keeps up to twenty-four pictures: twelve the public reads and twelve in a draft
create or replace function lm.photos_guard() returns trigger language plpgsql security definer set search_path = lm, app, pg_temp as $$
begin
  if (select count(*) from lm.page_photos where ministry_id = new.ministry_id) >= 24 then
    raise exception 'too_many_photos' using hint = 'Take a picture off your page first. A page holds twelve pictures.';
  end if;
  return new;
end $$;

-- Down: put 0007's lm.page_clean(uuid, jsonb) and lm.photos_guard() back (two pictures, six kept, no theme and no Bible).

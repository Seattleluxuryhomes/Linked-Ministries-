-- 0014 — four page templates a ministry picks from: church, recovery house, mission abroad, food and mercy.
--
-- Founder, 2026-11-22: "the best website templates for new Ministries." A template is a choice of order and emphasis on the same light page
-- (rule 5: one gold, no new colours): a church leads with when it meets; a recovery house with how to get help today; a mission abroad with
-- what it needs and how to give; a food and mercy ministry with when and where help is handed out. The words stay the ministry's own.
--   * The page's copy holds `template` (one of four, or none = the classic page). It is read with the rest of the page (rule 2).
--   * 0013's page_clean is kept whole under a new name and the new one wraps it, so every rule it held still holds.
-- Down: drop lm.page_clean; rename lm.page_clean_0013 back to lm.page_clean.

alter function lm.page_clean(uuid, jsonb) rename to page_clean_0013;

create function lm.page_clean(p_ministry uuid, d jsonb) returns jsonb language plpgsql stable security definer set search_path = lm, app, pg_temp as $$
declare tp text := btrim(coalesce(d ->> 'template', '')); out jsonb;
begin
  if d is null or jsonb_typeof(d) <> 'object' then raise exception 'page_not_readable'; end if;
  if tp <> '' and tp not in ('church', 'recovery', 'mission', 'mercy') then raise exception 'template_not_known' using hint = 'Choose one of the four page styles, or none.'; end if;
  out := lm.page_clean_0013(p_ministry, d - 'template');
  return case when tp = '' then out else out || jsonb_build_object('template', tp) end;
end $$;

revoke all on function lm.page_clean(uuid, jsonb), lm.page_clean_0013(uuid, jsonb) from public, anon, authenticated;

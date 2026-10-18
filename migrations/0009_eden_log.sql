-- 0009 — the record of Eden's calls. Eden is a writing helper on the signed-in pages (the ask or give form, the ministry page form, the
-- treasury). Every call writes one lm.events row with a name on it: which job, what came of it, and how many tokens went in and out.
-- NEVER the words: not what the person typed, not what Eden wrote. The server calls this after each call (a person, signed in). It holds
-- no text at all, so a note cannot slip into the record. New functions get no grant until they need one (CLAUDE.md rule 15).

create function lm.eden_log(p_job text, p_outcome text, p_in_tokens integer, p_out_tokens integer) returns void
language plpgsql security definer set search_path = lm, app, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  if p_job not in ('ask_give', 'page_words', 'grant_letter', 'thank_you') then raise exception 'not_valid'; end if;
  if p_outcome not in ('drafted', 'crisis', 'not_set_up', 'refused', 'held_back', 'failed', 'too_many') then raise exception 'not_valid'; end if;
  perform lm.log(lm.my_ministry(), 'eden.call', jsonb_build_object('job', p_job, 'outcome', p_outcome,
    'input_tokens', greatest(0, least(coalesce(p_in_tokens, 0), 2000000)), 'output_tokens', greatest(0, least(coalesce(p_out_tokens, 0), 2000000))));
end $$;
revoke all on function lm.eden_log(text, text, integer, integer) from public, anon, authenticated;
grant execute on function lm.eden_log(text, text, integer, integer) to authenticated;

-- Down: drop function lm.eden_log(text, text, integer, integer).

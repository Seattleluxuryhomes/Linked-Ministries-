-- 0010 — Eden's free box. A signed-in person can say what they want in their own words ("an ask for two beds for our men's house"), and the
-- server decides which of Eden's jobs it is. That call is one job in the record, "freeform", and its outcome may now also be "unclear"
-- (Eden could not tell what was wanted, and wrote nothing). Same function, same arguments, same grants (a replace keeps them); still no
-- word of what anyone typed or Eden wrote, only the job, the outcome and the token counts (CLAUDE.md rules 4 and 15).

create or replace function lm.eden_log(p_job text, p_outcome text, p_in_tokens integer, p_out_tokens integer) returns void
language plpgsql security definer set search_path = lm, app, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  if p_job not in ('ask_give', 'page_words', 'grant_letter', 'thank_you', 'freeform') then raise exception 'not_valid'; end if;
  if p_outcome not in ('drafted', 'crisis', 'not_set_up', 'refused', 'held_back', 'failed', 'too_many', 'unclear') then raise exception 'not_valid'; end if;
  perform lm.log(lm.my_ministry(), 'eden.call', jsonb_build_object('job', p_job, 'outcome', p_outcome,
    'input_tokens', greatest(0, least(coalesce(p_in_tokens, 0), 2000000)), 'output_tokens', greatest(0, least(coalesce(p_out_tokens, 0), 2000000))));
end $$;
revoke all on function lm.eden_log(text, text, integer, integer) from public, anon, authenticated;
grant execute on function lm.eden_log(text, text, integer, integer) to authenticated;

-- Down: put back 0009's lists (create or replace lm.eden_log with the four jobs and the seven outcomes it named).

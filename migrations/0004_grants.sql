-- 0004 — grants: what each role may reach, table by table and column by column (shaped on Behavioral Health's 0007).
--
-- Row-level security decides WHICH rows; privileges decide WHETHER a role may touch a table or call a function at all. Least
-- privilege, stated once: no `grant all`, no default privileges.
--   * `anon` (the public pages) reads a handful of columns of public posts and public ministries, and nothing else: not the
--     contact name, not the contact address, not the review note, not who read it.
--   * `authenticated` (a signed-in person) reads the same, plus the rows RLS lets it see, and calls the functions by name.
--     It cannot insert, update or delete anything directly: every change goes through a function that checks who is asking.
--   * The session, code, rate-limit and invite tables, and the functions for the operator, have no grant at all.

grant usage on schema lm to anon, authenticated;
grant usage on schema extensions to authenticated;

-- columns the public may read
grant select (id, name, city, state, status) on lm.ministries to anon;
grant select (id, ministry_id, kind, category, title, body, city, state, open_until, status, approved_at, created_at) on lm.posts to anon;

-- columns a signed-in person may read: the public ones, plus a ministry's own about / website / review note (RLS limits the rows)
grant select (id, name, city, state, about, website, status, review_note, created_at) on lm.ministries to authenticated;
grant select (id, ministry_id, kind, category, title, body, city, state, open_until, status, review_note, submitted_at, approved_at, closed_reason, closed_at, created_at) on lm.posts to authenticated;
grant select (id, post_id, from_ministry_id, words, phone, reply_email, sent_at) on lm.answers to authenticated;
grant select (user_id, ministry_id, role, full_name, steward, created_at) on lm.people to authenticated;
grant select on lm.events to authenticated;

-- functions: nobody by default, then the ones a signed-in person calls
revoke all on all functions in schema lm from public, anon, authenticated;
grant execute on function lm.ministry_is_public(uuid) to anon, authenticated;
grant execute on function lm.my_ministry(), lm.is_lead(), lm.is_steward() to authenticated;
grant execute on function lm.ministry_create(text, text, text, text, text, text, text), lm.ministry_update(text, text, text, text, text, text, text),
  lm.ministry_review(uuid, boolean, text), lm.my_ministry_profile(), lm.team_invite(text), lm.team_withdraw(uuid), lm.my_invites(), lm.team_accept(uuid, text), lm.team_list(),
  lm.team_set_role(uuid, text), lm.team_remove(uuid), lm.steward_set(text, boolean), lm.steward_queue(),
  lm.post_create(text, text, text, text, text, text, date, boolean), lm.post_update(uuid, text, text, text, text, text, text, date),
  lm.post_submit(uuid), lm.post_close(uuid, text), lm.post_review(uuid, boolean, text), lm.answer_prepare(uuid), lm.answer_record(uuid, text, text, text), lm.my_answers()
  to authenticated;
-- lm.make_steward(text), lm.log(...) and the trigger functions are not granted to anyone: the operator's SQL box and the database itself only.

revoke all on all tables in schema app from anon, authenticated;
revoke all on all tables in schema rl from anon, authenticated;

-- Down: revoke the grants above (revoke all on all tables in schema lm from anon, authenticated; revoke usage on schema lm from anon, authenticated).

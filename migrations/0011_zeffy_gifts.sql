-- 0011 — Gifts made online through Zeffy. Founder, 2026-10-18: Linked Ministries takes gifts online through Zeffy, and "the ledger for the
-- public" still holds them. Zeffy emails the donor's receipt, so a gift recorded with the method 'zeffy' gets no second receipt from this
-- site (server/api.mjs); it is written down like any other gift (the next receipt number, only ever added to) so the public totals and
-- grants on /giving still add up from the record. Only the list of ways a gift can come in grows; every rule on lm.gifts stays.

alter table lm.gifts drop constraint gifts_method_check;
alter table lm.gifts add constraint gifts_method_check check (method in ('card', 'check', 'cash', 'transfer', 'in_kind', 'zeffy'));

-- Down: no row may hold 'zeffy' (a gift is never deleted, so this is a one-way change once one is recorded); then put back 0008's list.

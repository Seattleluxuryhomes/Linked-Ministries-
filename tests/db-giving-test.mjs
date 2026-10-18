#!/usr/bin/env node
/* tests/db-giving-test.mjs — the giving ledger, as every person: the operator, a treasurer, a second treasurer, a steward who is not a
   treasurer, a ministry's lead, the public. The rules that make "safe and transparent" something the record proves:
   a gift is a record that is only added to (a mistake is a new row), receipt numbers have no gap, a grant needs two different named
   treasurers and the board's vote by name, a grant cannot be more than the gifts that came in, a record is never deleted, the door
   opens only with the registration filled in, no event holds a donor's name, and the public reads sums of the rows and no donor.
   LEXOS_DB_NAME=linkedm_t_<mine> node tests/db-giving-test.mjs */
import { counter, ownDatabase } from "./helpers.mjs";

const T = counter("db-giving-test"); const { ok } = T;
await ownDatabase("db_giving");
const { pool, asAdmin, asUser, asAnon } = await import("../server/db.mjs");
const q = (uid, sql, p = []) => asUser(uid, async (c) => (await c.query(sql, p)).rows);
const admin = (sql, p = []) => asAdmin(async (c) => (await c.query(sql, p)).rows);
const anon = (sql, p = []) => asAnon(async (c) => (await c.query(sql, p)).rows);
const refused = async (promise, re) => { try { await promise; return { refused: false }; } catch (e) { return { refused: re ? re.test(String(e.message) + " " + String(e.hint || "") + " " + String(e.code || "")) : true, message: e.message, code: e.code }; } };
const user = async (email, name) => (await admin("insert into auth.users (email, full_name) values ($1, $2) returning id", [email, name || null]))[0].id;
const today = (await admin("select to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD') d"))[0].d;
const dayOff = async (n) => (await admin("select to_char((now() at time zone 'utc')::date + $1::int, 'YYYY-MM-DD') d", [n]))[0].d;

const t1 = await admin("select lm.make_treasurer('tess.treasurer@linkedm.example') id").then((r) => r[0].id);
await admin("update auth.users set full_name = 'Tess Treasurer' where id = $1", [t1]); await admin("update lm.people set full_name = 'Tess Treasurer' where user_id = $1", [t1]);
const st = await user("stan.steward@example.org", "Stan Steward"); await admin("insert into lm.people (user_id, full_name, steward) values ($1, 'Stan Steward', true)", [st]);
const lead = await user("lead@example.org", "Lee Lead");
const mid = (await q(lead, "select lm.ministry_create($1,$2,$3,$4,$5,$6,$7) as id", ["Alpha Table Ministry", "Seattle", "WA", "We feed neighbors every week and run a small youth night.", null, "Lee Lead", "lead@example.org"]))[0].id;
const mid2 = (await q(await user("lead2@example.org", "Lou Lead"), "select lm.ministry_create($1,$2,$3,$4,$5,$6,$7) as id", ["Waiting Ministry", "Spokane", "WA", "We have not been read by a steward yet at all.", null, "Lou Lead", "lead2@example.org"]))[0].id;
await q(st, "select lm.ministry_review($1, true, null)", [mid]);
const gift = (uid, name, email, cents, on, method, note) => q(uid, "select lm.gift_record($1,$2,$3,$4::date,$5,$6) as g", [name, email, cents, on, method, note || null]).then((r) => r[0].g);

/* ===== 1. treasurers ===== */
ok((await admin("select treasurer, steward from lm.people where user_id = $1", [t1]))[0].treasurer === true, "the operator's SQL makes the first treasurer, who is also a steward");
ok((await refused(q(st, "select lm.treasurer_set('stan.steward@example.org', true)"), /treasurer_required/)).refused, "a steward who is not a treasurer cannot make one");
ok((await refused(q(lead, "select lm.treasurer_set('lead@example.org', true)"), /treasurer_required/)).refused, "nor a ministry's lead");
ok((await refused(q(st, "update lm.people set treasurer = true where user_id = $1", [st]), /permission denied|42501/)).refused, "nor by writing to the table");
ok((await refused(q(t1, "select lm.treasurer_set('lead@example.org', true)"), /steward_first|not a steward|no_such_person/)).refused, "a treasurer is a steward: a person who is not one cannot be made a treasurer");
ok((await refused(q(t1, "select lm.treasurer_set('nobody@example.org', true)"), /no_such_person/)).refused, "and a person who has not signed in cannot");
ok((await refused(admin("insert into lm.people (user_id, full_name, treasurer) values ($1, 'X Person', true)", [await user("x@example.org", "X")]), /check|23514/)).refused, "a CHECK keeps a treasurer a steward, even for the operator's SQL");
await q(t1, "select lm.treasurer_set('stan.steward@example.org', true)");
const t2 = st;
ok((await admin("select treasurer from lm.people where user_id = $1", [t2]))[0].treasurer === true, "a treasurer makes a second treasurer");
ok((await refused(q(t2, "update lm.people set steward = false where user_id = $1", [t2]), /permission denied|42501/)).refused && (await refused(admin("update lm.people set steward = false where user_id = $1", [t2]), /treasurer_is_steward/)).refused, "a treasurer cannot be taken off as a steward while still a treasurer");
ok((await refused(admin("select lm.account_erase($1)", [t2]), /treasurer_is_steward|Take the treasurer role off/)).refused, "and a treasurer cannot delete their account until the role is off");
await q(t2, "select lm.treasurer_set('tess.treasurer@linkedm.example', false)");
ok((await refused(q(t2, "select lm.treasurer_set('stan.steward@example.org', false)"), /last_treasurer/)).refused, "the last treasurer cannot be taken off");
ok((await refused(admin("update lm.people set treasurer = false where user_id = $1", [t2]), /last_treasurer/)).refused && (await refused(admin("delete from lm.people where user_id = $1", [t2]), /last_treasurer|last_steward/)).refused, "not even by the operator's SQL");
await q(t2, "select lm.treasurer_set('tess.treasurer@linkedm.example', true)");
ok((await admin("select count(*)::int n from lm.events where kind in ('treasurer.made', 'treasurer.removed', 'people.update') and actor_label <> ''"))[0].n >= 4, "making and removing a treasurer wrote events");
ok((await refused(q(t1, "select lm.make_treasurer('x@example.org')"), /permission denied|42501/)).refused, "make_treasurer is the operator's alone");

/* ===== 2. gifts: a record that is only added to ===== */
ok((await refused(gift(lead, "A Donor", null, 1000, today, "cash"), /treasurer_required/)).refused && (await refused(q(await user("plain@example.org", "Plain Person"), "select lm.gift_record('A Donor', null, 1000, $1::date, 'cash', null)", [today]), /treasurer_required/)).refused, "only a treasurer records a gift: not a lead, not a person with no ministry");
ok((await refused(anon("select lm.gift_record('A Donor', null, 1000, now()::date, 'cash', null)"), /permission denied|42501/)).refused, "and the public cannot call it");
const g1 = await gift(t1, "Jordan Donor", "jordan@donor.example", 5000, today, "check", "Check 1042");
ok(g1.receipt_no === 1 && g1.amount_cents === 5000, "the first gift gets receipt number 1", g1);
const g2 = await gift(t1, "", null, 12345, today, "cash");
ok(g2.receipt_no === 2 && g2.donor_name === "Anonymous", "the next gets 2, and a gift with no name is Anonymous");
ok((await gift(t1, "anonymous", null, 100, today, "transfer")).donor_name === "Anonymous", "and 'anonymous' in any case is the same word");
for (const [what, args, re] of [["zero", ["Zed", null, 0, today, "cash"], /check|23514/], ["a negative first gift", ["Zed", null, -5, today, "cash"], /check|23514/], ["a method that is not on the list", ["Zed", null, 100, today, "bitcoin"], /check|23514/],
  ["an email that is a list", ["Zed", "a,b@c.example", 100, today, "cash"], /check|23514/], ["a one-letter name", ["Z", null, 100, today, "cash"], /check|23514/], ["a day after today", ["Zed", null, 100, await dayOff(1), "cash"], /date_in_future/],
  ["more than ten million dollars", ["Zed", null, 1000000001, today, "cash"], /check|23514/]]) ok((await refused(gift(t1, ...args), re)).refused, `a gift of ${what} is refused`);
const nextAfterFailures = await gift(t1, "Gap Check", null, 100, today, "cash");
ok(nextAfterFailures.receipt_no === 4, "failed gifts used no receipt number: the next is 4, with no gap", nextAfterFailures);
{ const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => gift(t1, `Parallel Donor ${i}`, null, 100 + i, today, "card"))); const ns = rs.map((r) => r.receipt_no).sort((a, b) => a - b);
  ok(ns.join() === Array.from({ length: 12 }, (_, i) => i + 5).join(), "twelve gifts recorded at the same moment get twelve different numbers in a row, 5 to 16", ns); }
const forced = (await admin("insert into lm.gifts (receipt_no, donor_name, amount_cents, received_on, method, recorded_by, recorded_by_name) values (999, 'Forced Number', 100, now()::date, 'cash', $1, 'Tess Treasurer') returning receipt_no", [t1]))[0];
ok(Number(forced.receipt_no) === 17, "the database assigns the receipt number: a number typed in is replaced", forced);
ok((await refused(q(t1, "insert into lm.gifts (receipt_no, donor_name, amount_cents, received_on, method, recorded_by, recorded_by_name) values (0, 'Direct', 100, now()::date, 'cash', $1, 'x')", [t1]), /permission denied|42501/)).refused, "a treasurer cannot insert into the table directly: only the function writes");
ok((await refused(admin("update lm.gifts set amount_cents = 1 where receipt_no = 1"), /records_only|never changed/)).refused, "a gift is never changed: not even by the operator's SQL");
ok((await refused(admin("delete from lm.gifts where receipt_no = 1"), /records_only|never changed/)).refused, "nor deleted");
ok((await refused(admin("truncate lm.gifts"), /records_only|truncate/)).refused, "nor all of them at once");
ok((await refused(q(t1, "select 1 from lm.gifts"), /permission denied|42501/)).refused && (await refused(anon("select 1 from lm.gifts"), /permission denied|42501/)).refused, "nobody reads the gifts table: not a treasurer, not the public");
/* corrections */
const c1 = await q(t1, "select lm.gift_correct($1, -2000, null, 'Entered 5000 but the check was for 3000') as c", [g1.id]).then((r) => r[0].c);
ok(c1.receipt_no === 18 && c1.corrects === g1.id, "a correction is a new row with its own receipt number that points at the old one", c1);
ok(Number((await admin("select amount_cents from lm.gifts where id = $1", [g1.id]))[0].amount_cents) === 5000, "and the first record still says 5000");
ok((await refused(q(t1, "select lm.gift_correct($1, -3001, null, 'Too much taken away')", [g1.id]), /below_zero/)).refused, "a correction cannot take a gift below zero");
ok((await refused(q(t1, "select lm.gift_correct($1, 10, null, 'Fix of a fix')", [c1.id]), /cannot_correct/)).refused, "a correction points at the first record, not at another correction");
ok((await refused(q(t1, "select lm.gift_correct($1, 10, null, '')", [g1.id]), /note_required/)).refused, "a correction needs a note that says why");
ok((await refused(q(lead, "select lm.gift_correct($1, 10, null, 'Not allowed')", [g1.id]), /treasurer_required/)).refused, "and a treasurer to write it");
const inKind = await gift(t1, "Pat Pews", null, 80000, today, "in_kind", "Twenty used pews");
let tot = (await admin("select lm.ledger_totals() t"))[0].t;
const sumMoney = (await admin("select sum(amount_cents)::bigint s from lm.gifts where method <> 'in_kind'"))[0].s;
ok(Number(tot.money_cents) === Number(sumMoney) && tot.in_kind_cents === 80000 && tot.in_kind_count === 1, "the totals are sums of the rows, and an in-kind gift is counted apart from money", tot);
const fullReverse = await gift(t1, "Reverse Me", null, 700, today, "cash"); await q(t1, "select lm.gift_correct($1, -700, null, 'Entered twice by mistake')", [fullReverse.id]);
const cnt = (await admin("select lm.ledger_totals() t"))[0].t.money_count;
ok(cnt === 17, "a gift taken back to zero is not counted as a gift: seventeen gifts, not eighteen", cnt);
/* receipts */
const rc = await q(t1, "select lm.gift_receipt_record($1, 'STANDIN1') as id", [g1.id]);
ok(!!rc[0].id && (await admin("select count(*)::int n from lm.gift_receipts where gift_id = $1", [g1.id]))[0].n === 1, "a receipt email's record is written (the server writes it only when the mail provider took the message)");
ok((await refused(admin("update lm.gift_receipts set mail_id = 'x'"), /records_only/)).refused && (await refused(q(lead, "select lm.gift_receipt_record($1, 'x')", [g1.id]), /treasurer_required/)).refused, "a receipt record is never changed, and only a treasurer writes one");

/* ===== 3. the record: ids and amounts, never a donor's name ===== */
const evs = await admin("select kind, actor_label, payload from lm.events where kind like 'gifts.%' or kind like 'gift_receipts.%'");
ok(evs.length >= 20 && evs.every((e) => e.actor_label === "Tess Treasurer" || e.actor_label === "system"), "every gift wrote an event with the treasurer's name (the one the operator's SQL typed says so)", evs.length);
const blob = JSON.stringify(await admin("select kind, payload from lm.events"));
ok(!/Jordan|Donor|donor\.example|Pat Pews|Reverse Me|Check 1042|pews|Gap Check/i.test(blob), "and no event holds a donor's name, an email, or a note");
ok(evs.find((e) => e.kind === "gifts.insert" && e.payload.receipt_no === 1).payload.amount_cents === 5000, "the event holds the receipt number and the amount");

/* ===== 4. grants: two different named people, the board's vote, and only money that came in ===== */
const gp = (uid, kind, mn, name, cents, purpose) => q(uid, "select lm.grant_propose($1,$2,$3,$4,$5) as id", [kind, mn, name, cents, purpose]).then((r) => r[0].id);
ok((await refused(gp(lead, "ministry", mid, null, 1000, "Help with a van for Saturday meals"), /treasurer_required/)).refused, "only a treasurer proposes a grant");
ok((await refused(gp(t1, "ministry", mid2, null, 1000, "Help with a van for Saturday meals"), /ministry_not_public|read it/)).refused, "a ministry nobody has read gets no grant");
ok((await refused(gp(t1, "ministry", mid, null, 0, "Help with a van for Saturday meals"), /check|23514/)).refused && (await refused(gp(t1, "ministry", mid, null, 1000, "Short"), /check|23514/)).refused, "a grant of nothing, or with no reason in words, is refused");
const g_a = await gp(t1, "ministry", mid, null, 1000, "Help with a van for Saturday meals");
const g_b = await gp(t1, "outside", null, "Neighbor Care Clinic", 2000, "Winter coats for the people we serve");
ok((await admin("select status, proposed_by_name, recipient_name from lm.grants where id = $1", [g_a]))[0].recipient_name === "Alpha Table Ministry", "a grant to a ministry on the network carries its name");
const yes2 = ["Ann Board", "Bob Board"], vote = (uid, g, yes = yes2, ab = [], no = [], on = today, doc = "Minutes of the board, item 4") => q(uid, "select lm.grant_approve($1, $2::date, $3, $4, $5, $6)", [g, on, yes, ab, no, doc]);
ok((await refused(vote(t1, g_a), /two_people|cannot approve/)).refused, "the treasurer who proposed a grant cannot approve it");
ok((await refused(admin("update lm.grants set status = 'approved', approved_by = proposed_by, approved_by_name = 'Tess Treasurer', approved_at = now() where id = $1", [g_a]), /grants_two_people|check|23514|two_people/)).refused, "not even by the operator's SQL: a CHECK on the table says the two are different people");
ok((await refused(vote(lead, g_a), /treasurer_required/)).refused, "a lead cannot approve a grant");
ok((await refused(vote(t2, g_a, ["Only One"]), /not_enough_yes|at least 2/)).refused, "the board needs two yes votes, by name (the number is a setting)");
ok((await refused(vote(t2, g_a, ["Ann Board", "ann board"]), /names_not_readable/)).refused, "the same name twice is one vote and is refused");
ok((await refused(vote(t2, g_a, yes2, ["Ann Board"]), /names_twice/)).refused, "a board member is in one list only");
ok((await refused(vote(t2, g_a, yes2, [], [], await dayOff(1)), /date_in_future/)).refused, "the vote cannot be dated in the future");
ok((await refused(vote(t2, g_a, yes2, [], [], today, "  "), /check|23514/)).refused, "the vote must name the document that holds it");
ok((await admin("select count(*)::int n from lm.board_votes"))[0].n === 0, "none of those failed votes left a row");
await vote(t2, g_a, yes2, ["Cy Abstain"], ["Di No"]);
const ga = (await admin("select status, approved_by_name, proposed_by_name from lm.grants where id = $1", [g_a]))[0];
ok(ga.status === "approved" && ga.approved_by_name === "Stan Steward" && ga.proposed_by_name === "Tess Treasurer", "a different treasurer approves, and both names are on the grant");
const bv = (await admin("select * from lm.board_votes where grant_id = $1", [g_a]))[0];
ok(bv.yes_names.join() === "Ann Board,Bob Board" && bv.abstain_names.join() === "Cy Abstain" && bv.no_names.join() === "Di No" && bv.doc_ref === "Minutes of the board, item 4" && bv.recorded_by_name === "Stan Steward", "the vote is recorded: who voted yes, who abstained, who voted no, the document, and who wrote it down");
ok((await refused(admin("update lm.board_votes set voted_on = now()::date - 1"), /records_only/)).refused && (await refused(admin("delete from lm.board_votes"), /records_only/)).refused, "a vote is never changed or deleted");
ok((await refused(admin("update lm.grants set purpose = 'A different reason entirely' where id = $1", [g_a]), /records_only|cannot be changed/)).refused, "an approved grant's words cannot be changed");
ok((await refused(admin("update lm.grants set amount_cents = 1 where id = $1", [g_a]), /records_only|cannot be changed/)).refused, "nor its amount");
ok((await refused(admin("delete from lm.grants where id = $1", [g_a]), /records_only/)).refused && (await refused(admin("truncate lm.grants"), /records_only|truncate/)).refused, "a grant is never deleted");
ok((await refused(q(t1, "select lm.grant_decline($1, 'Changed our minds')", [g_a]), /status_change_not_allowed|not allowed/)).refused, "an approved grant cannot be declined: it is paid, or it stands");
ok((await refused(q(t1, "select lm.grant_paid($1, '')", [g_a]), /reference_needed/)).refused, "marking paid needs a reference");
ok((await refused(q(lead, "select lm.grant_paid($1, 'CHK-1')", [g_a]), /treasurer_required/)).refused, "and a treasurer");
await q(t1, "select lm.grant_paid($1, 'Check 2201')", [g_a]);
const paid = (await admin("select status, paid_ref, paid_by_name from lm.grants where id = $1", [g_a]))[0];
ok(paid.status === "paid" && paid.paid_ref === "Check 2201" && paid.paid_by_name === "Tess Treasurer", "a paid grant carries its reference and the name of who paid it");
ok((await refused(q(t1, "select lm.grant_paid($1, 'Again')", [g_a]), /records_only|cannot be changed|status_change_not_allowed/)).refused, "a grant is paid once");
await q(t1, "select lm.grant_decline($1, 'The clinic closed before we could vote')", [g_b]);
ok((await admin("select status, decline_note from lm.grants where id = $1", [g_b]))[0].status === "declined", "a proposal can be declined, with a note");
ok((await refused(vote(t2, g_b), /not_proposed|proposed/)).refused, "a declined grant cannot be approved");
/* only money that came in */
const avail = Number((await admin("select lm.ledger_totals() t"))[0].t.available_cents);
const g_big = await gp(t1, "outside", null, "Big Ask Fund", avail + 100, "More than the gifts that have come in");
ok((await refused(vote(t2, g_big), /not_enough_gifts|not received enough/)).refused, "a grant bigger than the money gifts not already promised is refused");
ok((await admin("select count(*)::int n from lm.board_votes where grant_id = $1", [g_big]))[0].n === 0, "and the vote was not kept either: it all or nothing");
const g_ok = await gp(t1, "outside", null, "Exactly Enough", avail, "Exactly what is left in the gifts");
await vote(t2, g_ok);
ok(Number((await admin("select lm.ledger_totals() t"))[0].t.available_cents) === 0, "a grant for exactly what is left is approved, and nothing is left");
ok((await refused(vote(t2, await gp(t1, "outside", null, "One More", 1, "One cent more than is left to give")), /not_enough_gifts|not received enough/)).refused, "then one cent more is refused: the in-kind gift is not money and does not count");
const gevs = await admin("select kind, actor_label, payload from lm.events where kind like 'grants.%' or kind like 'board_votes.%'");
ok(gevs.length >= 10 && gevs.every((e) => /Tess Treasurer|Stan Steward/.test(e.actor_label)) && gevs.some((e) => e.kind === "grants.insert" && e.payload.amount_cents === 1000), "every grant and vote wrote an event with a name and an amount");
ok(!/Ann Board|Bob Board|Cy Abstain|Di No|van for Saturday|Neighbor Care|Winter coats|Minutes of/.test(JSON.stringify(await admin("select payload from lm.events"))), "and none holds a board member's name, a reason in words, or a document");

/* ===== 5. the door ===== */
ok((await admin("select door_open from lm.giving_settings"))[0].door_open === false, "the giving door starts closed");
ok((await refused(q(t1, "select lm.giving_settings_set(null, null, null, true)"), /registration_needed/)).refused, "it cannot be opened with no registration");
ok((await refused(q(t1, "select lm.giving_settings_set('WA-123456', null, null, true)"), /registration_needed/)).refused && (await refused(q(t1, "select lm.giving_settings_set(null, $1::date, null, true)", [today]), /registration_needed/)).refused, "nor with only the number, nor with only the date");
ok((await refused(admin("update lm.giving_settings set door_open = true"), /registration_needed|door_needs_registration|check|23514/)).refused, "nor by the operator's SQL: a CHECK says the door opens only when both are filled in");
ok((await refused(admin("update lm.giving_settings set door_open = true, registration_number = 'WA', registration_date = now()::date"), /check|23514/)).refused, "(a number under three letters is no number)");
ok((await refused(admin("insert into lm.giving_settings (id) values (false)"), /check|23514|duplicate/)).refused && (await refused(admin("delete from lm.giving_settings"), /records_only/)).refused, "there is one settings row and it is never deleted");
ok((await refused(q(lead, "select lm.giving_settings_set('WA-123456', $1::date, null, false)", [today]), /treasurer_required/)).refused && (await refused(q(st, "select 1 from lm.giving_settings"), /permission denied|42501/)).refused, "only a treasurer sets it, and nobody reads the table");
ok((await refused(q(t1, "select lm.giving_settings_set('WA-123456', $1::date, 'http://irs.example/990', false)", [today]), /url_not_readable/)).refused, "the link to the Form 990 must be https");
ok((await refused(q(t1, "select lm.giving_settings_set('WA-123456', $1::date, null, false)", [await dayOff(2)]), /date_in_future/)).refused, "the registration date cannot be in the future");
ok((await anon("select lm.giving_door_open() as o"))[0].o === false, "the public can ask if the door is open: it is not");
await q(t1, "select lm.giving_settings_set('WA-123456', $1::date, 'https://example.org/990.pdf', true)", [today]);
ok((await anon("select lm.giving_door_open() as o"))[0].o === true, "with the registration filled in, the door opens");
const se = (await admin("select payload, actor_label from lm.events where kind = 'giving_settings.update' order by created_at desc limit 1"))[0];
ok(se.actor_label === "Tess Treasurer" && se.payload.door_open === true, "opening the door wrote an event with the treasurer's name");
await q(t1, "select lm.giving_settings_set('WA-123456', $1::date, 'https://example.org/990.pdf', false)", [today]);
ok((await anon("select lm.giving_door_open() as o"))[0].o === false, "and it can be closed again");

/* ===== 6. what the public reads: sums of the rows, never a donor ===== */
const pub = (await anon("select lm.giving_public() as p"))[0].p;
const rowsMoney = Number((await admin("select sum(amount_cents)::bigint s from lm.gifts where method <> 'in_kind'"))[0].s);
ok(Number(pub.money_cents) === rowsMoney, "the total on the public page is the sum of the rows", { pub: pub.money_cents, rows: rowsMoney });
ok(pub.money_count === (await admin("select lm.ledger_totals() t"))[0].t.money_count && pub.in_kind_count === 1, "the count is the count of gifts, not of rows: corrections are not gifts");
ok(Number(pub.granted_cents) === Number((await admin("select sum(amount_cents)::bigint s from lm.grants where status in ('approved','paid')"))[0].s) && Number(pub.paid_cents) === 1000, "the grants total is the sum of the approved and paid grants, and the paid total the paid ones");
ok(pub.grants.length === 2 && pub.grants.every((g) => g.status === "approved" || g.status === "paid") && !pub.grants.some((g) => /Neighbor Care|Big Ask/.test(g.recipient_name)), "only approved and paid grants are shown: not a proposal, not a declined one");
const pg = pub.grants.find((g) => g.status === "paid");
ok(pg.recipient_name === "Alpha Table Ministry" && pg.amount_cents === 1000 && pg.voted_on === today && pg.yes === 2 && pg.abstain === 1 && pg.no === 1 && pg.purpose === "Help with a van for Saturday meals", "a grant shows the ministry, the amount, what for, the vote day and the counts");
ok(pub.months.length === 12 && pub.months[11].month === today.slice(0, 7) && Number(pub.months[11].gifts_cents) === rowsMoney && Number(pub.months[11].grants_cents) === Number(pub.granted_cents), "twelve months, the last this one, each a sum of the rows", pub.months.slice(-2));
const pubBlob = JSON.stringify(pub);
ok(!/Jordan|Donor|donor\.example|Pat Pews|Reverse Me|Anonymous|Gap Check|Parallel|Tess|Stan|Ann Board|Bob Board|Cy Abstain|Di No|@/.test(pubBlob), "the public answer holds no donor, no email, no treasurer's name and no board member's name");
ok(pub.registration_number === "WA-123456" && pub.form990_url === "https://example.org/990.pdf" && pub.door_open === false, "it holds the registration, the Form 990 link and the door's state");
for (const fn of ["treasury_view()", "gift_record(text,text,bigint,date,text,text)", "grant_approve(uuid,date,text[],text[],text[],text)", "ledger_totals()", "make_treasurer(text)", "giving_settings_set(text,date,text,boolean)"]) ok((await admin(`select has_function_privilege('anon', 'lm.${fn}', 'execute') as x`))[0].x === false, `the public cannot run lm.${fn}`);
for (const fn of ["ledger_totals()", "make_treasurer(text)", "gifts_guard()", "grants_guard()", "votes_guard()", "settings_guard()", "audit_money()", "treasurer_guard()", "records_only()", "names_ok(text[])"]) ok((await admin(`select has_function_privilege('authenticated', 'lm.${fn}', 'execute') as x`))[0].x === false, `a signed-in person cannot run lm.${fn}`);
ok((await refused(q(lead, "select lm.treasury_view()"), /treasurer_required/)).refused && (await refused(anon("select lm.treasury_view()"), /permission denied|42501/)).refused, "the treasurer's view is for treasurers: not a lead, not the public");
const tv = (await q(t1, "select lm.treasury_view() as v"))[0].v;
ok(tv.gifts.length === 21 && tv.gifts[0].receipt_no === 21 && tv.grants.length === 5 && tv.treasurers.length === 2 && tv.ministries.some((m) => m.id === mid) && !tv.ministries.some((m) => m.id === mid2), "a treasurer reads the ledger, the grants with their votes, the treasurers and the ministries a grant may go to", { gifts: tv.gifts.length, first: tv.gifts[0].receipt_no });
ok(tv.gifts.find((g) => g.receipt_no === 1).donor_name === "Jordan Donor" && tv.gifts.find((g) => g.receipt_no === 1).receipt_sent_at, "and only a treasurer reads a donor's name and whether the receipt went");
ok((await admin("select count(*)::int n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'lm' and c.relkind = 'r' and not c.relrowsecurity"))[0].n === 0, "every table in lm, the new ones too, has row-level security");

await pool.end();
process.exit(T.done());

#!/usr/bin/env node
/* tests/db-test.mjs — the database, as every person. Two ministries and a third, a steward, a person with no ministry, the public:
   each asked the same questions: what can you read, what can you write, what does the database refuse. Row-level security, the
   steward rule, the last lead, the 90-day rule, the frozen words, the named reader, the answers, the record with a name on every
   row. Shaped on Behavioral Health's tests/db-test.mjs.   LEXOS_DB_NAME=linkedm_t_<mine> node tests/db-test.mjs */
import { counter, ownDatabase } from "./helpers.mjs";

const T = counter("db-test");
const { ok } = T;
const db = await ownDatabase("db");
const { pool, asAdmin, asUser, asAnon } = await import("../server/db.mjs");

const q = (uid, sql, p = []) => asUser(uid, async (c) => (await c.query(sql, p)).rows);
const admin = (sql, p = []) => asAdmin(async (c) => (await c.query(sql, p)).rows);
const anon = (sql, p = []) => asAnon(async (c) => (await c.query(sql, p)).rows);
const refused = async (promise, re) => { try { await promise; return { refused: false }; } catch (e) { return { refused: re ? re.test(String(e.message) + " " + String(e.hint || "") + " " + String(e.code || "")) : true, message: e.message, code: e.code }; } };
const user = async (email, name) => (await admin("insert into auth.users (email, full_name) values ($1, $2) returning id", [email, name || null]))[0].id;
const day = async (n) => (await admin("select to_char((now() at time zone 'utc')::date + $1::int, 'YYYY-MM-DD') as d", [n]))[0].d;
const mk = (uid, name, city = "Seattle", state = "WA") => q(uid, "select lm.ministry_create($1,$2,$3,$4,$5,$6,$7) as id", [name, city, state, "We feed neighbors every week and run a small youth night.", null, "Pat Lead", `contact-${name.replace(/\W/g, "").toLowerCase()}@example.org`]).then((r) => r[0].id);
const newPost = (uid, kind, title, until, submit = true, cat = "food") => q(uid, "select lm.post_create($1,$2,$3,$4,$5,$6,$7::date,$8) as id", [kind, cat, title, "We need ten folding tables for the Saturday meal, near the church.", null, null, until, submit]).then((r) => r[0].id);

const a1 = await user("a1@example.org", "Alex Lead"), a2 = await user("a2@example.org", "Avery Member");
const b1 = await user("b1@example.org", "Blake Lead"), c1 = await user("c1@example.org", "Casey Lead");
const st = await user("steward@example.org", "Sam Steward"), nobody = await user("nobody@example.org", "No Ministry");
const in30 = await day(30), in90 = await day(90), in91 = await day(91), yesterday = await day(-1);

/* ===== 1. a ministry waits; one person, one ministry ===== */
const mA = await mk(a1, "Alpha Table Ministry"), mB = await mk(b1, "Bravo House Ministry", "Spokane"), mC = await mk(c1, "Charlie Outreach", "Tacoma");
ok((await admin("select status from lm.ministries where id = $1", [mA]))[0].status === "waiting", "a new ministry waits: it is not public");
ok((await admin("select role from lm.people where user_id = $1", [a1]))[0].role === "lead", "the first person at a ministry is its lead");
ok((await refused(mk(a1, "Second Try"), /already_in_ministry/)).refused, "a person belongs to one ministry: a second one is refused");
ok((await refused(q(nobody, "select lm.ministry_create($1,$2,$3,$4,$5,$6,$7)", ["X", "Seattle", "WA", "We feed neighbors every week and more.", null, "Pat", "pat@example.org"]))).refused, "a one-letter ministry name is refused by the database");
ok((await refused(q(nobody, "select lm.ministry_create($1,$2,$3,$4,$5,$6,$7)", ["Good Name", "Seattle", "Washington", "We feed neighbors every week and more.", null, "Pat", "pat@example.org"]))).refused, "a state that is not two capital letters is refused");
ok((await refused(q(nobody, "select lm.ministry_create($1,$2,$3,$4,$5,$6,$7)", ["Good Name", "Seattle", "WA", "We feed neighbors every week and more.", "javascript:alert(1)", "Pat", "pat@example.org"]))).refused, "a website that is not http or https is refused");

/* ===== 2. a ministry never reads another's rows ===== */
ok((await q(a1, "select count(*)::int n from lm.ministries"))[0].n === 1, "ministry A reads only its own page while the others wait");
ok((await q(a1, "select count(*)::int n from lm.ministries where id = $1", [mB]))[0].n === 0, "and none of B's");
ok((await q(a1, "select count(*)::int n from lm.people where ministry_id = $1", [mB]))[0].n === 0, "B's people are invisible to A");
ok((await q(a1, "select count(*)::int n from lm.people"))[0].n === 1, "A sees its own person row and no one else's");
const noCols = await refused(q(a1, "select contact_email from lm.ministries"), /permission denied|42501/);
ok(noCols.refused, "no role can select the contact email column: it is reached only through the functions", noCols);
ok((await refused(q(a1, "select contact_name from lm.ministries"), /permission denied|42501/)).refused, "nor the contact name");
ok((await q(a1, "select (lm.my_ministry_profile() ->> 'contact_email') e"))[0].e === "contact-alphatableministry@example.org", "a ministry reads its own contact through the function");
ok((await q(b1, "select (lm.my_ministry_profile() ->> 'name') n"))[0].n === "Bravo House Ministry", "and B reads only B's");
ok((await q(nobody, "select lm.my_ministry_profile() p"))[0].p === null, "a person with no ministry reads no profile");

/* ===== 3. drafts and waiting posts ===== */
const draftA = await newPost(a1, "ask", "Ten folding tables, please", in30, false);
const waitA = await newPost(a1, "ask", "A van for Saturday meals", in30, true);
const waitB = await newPost(b1, "give", "Forty folding chairs to give away", in30, true, "furniture");
ok((await admin("select status from lm.posts where id = $1", [draftA]))[0].status === "draft" && (await admin("select status from lm.posts where id = $1", [waitA]))[0].status === "waiting", "a post starts as a draft, or waits to be read");
ok((await q(b1, "select count(*)::int n from lm.posts where id = any($1)", [[draftA, waitA]]))[0].n === 0, "ministry A's drafts and waiting posts are invisible to ministry B");
ok((await q(a1, "select count(*)::int n from lm.posts"))[0].n === 2, "A reads its own two posts");
ok((await q(st, "select count(*)::int n from lm.posts where status = 'draft'"))[0].n === 0, "not even a steward reads a draft");
await admin("insert into lm.people (user_id, full_name, steward) values ($1, 'Sam Steward', true) on conflict (user_id) do update set steward = true", [st]);
ok((await q(st, "select count(*)::int n from lm.posts where status = 'waiting'"))[0].n === 2, "a steward reads what was sent in to be read");
ok((await q(st, "select count(*)::int n from lm.posts where status = 'draft'"))[0].n === 0, "and still no draft");
ok((await anon("select count(*)::int n from lm.posts"))[0].n === 0, "the public reads no post while none is public");
ok((await anon("select count(*)::int n from lm.ministries"))[0].n === 0, "and no ministry while none is public");

/* ===== 4. a non-steward cannot approve ===== */
const noApprove = [
  ["ministry_review by a lead", () => q(a1, "select lm.ministry_review($1, true, null)", [mA])],
  ["post_review by a lead", () => q(a1, "select lm.post_review($1, true, null)", [waitA])],
  ["post_review by another ministry's lead", () => q(b1, "select lm.post_review($1, true, null)", [waitA])],
  ["post_review by a person with no ministry", () => q(nobody, "select lm.post_review($1, true, null)", [waitA])],
];
for (const [what, p] of noApprove) ok((await refused(p(), /steward_required/)).refused, `${what} is refused: only a steward approves`);
const direct = await refused(q(a1, "update lm.posts set status = 'public' where id = $1", [waitA]), /permission denied|42501/);
ok(direct.refused, "a ministry cannot set its own post public by writing to the table: the role has no write at all", direct);
ok((await refused(q(a1, "update lm.ministries set status = 'public' where id = $1", [mA]), /permission denied|42501/)).refused, "nor its own ministry");
ok((await refused(q(a1, "insert into lm.posts (ministry_id, kind, category, title, body, city, state, open_until, status, created_by) values ($1,'ask','food','Sneaky post here','A body that is long enough.','Seattle','WA',$2,'public',$3)", [mA, in30, a1]), /permission denied|42501/)).refused, "nor insert a public post of its own");
ok((await refused(q(a1, "select lm.make_steward('a1@example.org')"), /permission denied|42501/)).refused, "a signed-in person cannot call the operator's make_steward");
ok((await refused(anon("select lm.make_steward('x@example.org')"), /permission denied|42501/)).refused, "nor the public");
ok((await refused(admin("update lm.ministries set status = 'public' where id = $1", [mA]), /check|violat|23514/)).refused, "nor a ministry");
ok((await refused(q(st, "select lm.post_review($1, true, null)", [waitA]), /ministry_not_public|Read the ministry first/)).refused, "a steward cannot make a post public before its ministry has been read");

/* ===== 5. the steward reads ===== */
ok((await refused(q(st, "select lm.ministry_review($1, false, '')", [mA]), /note_required/)).refused, "sending a ministry back needs a note");
await q(st, "select lm.ministry_review($1, true, null)", [mA]);
ok((await admin("select status, reviewed_by from lm.ministries where id = $1", [mA]))[0].reviewed_by === st, "approving names the steward who read it");
const probe = await newPost(a1, "give", "A probe post for the check", in30, true);
ok((await refused(admin("update lm.posts set status = 'public' where id = $1", [probe]), /check|violat|23514/)).refused, "even the operator's SQL cannot make a post public without a named reader (a CHECK)");
await q(a1, "select lm.post_close($1, 'no_longer_needed')", [probe]);
await q(st, "select lm.post_review($1, true, null)", [waitA]);
const pubA = (await admin("select status, approved_by, approved_at from lm.posts where id = $1", [waitA]))[0];
ok(pubA.status === "public" && pubA.approved_by === st && pubA.approved_at, "an approved post is public and carries the steward's name and the time");
ok((await refused(q(st, "select lm.post_review($1, true, null)", [waitA]), /not_waiting/)).refused, "a post that is not waiting cannot be read again");
await q(st, "select lm.ministry_review($1, false, 'Please say where you meet.')", [mB]);
ok((await admin("select status, review_note from lm.ministries where id = $1", [mB]))[0].review_note === "Please say where you meet.", "a ministry sent back carries the note the lead reads");
ok((await q(b1, "select review_note from lm.ministries where id = $1", [mB]))[0].review_note === "Please say where you meet.", "and its lead can read that note");
await q(st, "select lm.post_review($1, false, 'Add the size of the chairs.')", [waitB]).catch(() => null);
ok((await refused(q(st, "select lm.post_review($1, true, null)", [waitB]), /ministry_not_public|not_waiting/)).refused, "B's post cannot be approved while B's ministry has not been read");

/* ===== 6. what the public reads ===== */
const pub = await anon("select id, title, ministry_id from lm.posts");
ok(pub.length === 1 && pub[0].id === waitA, "the public reads exactly the one public post, not A's draft, not B's waiting post");
ok((await anon("select id, name, city, state, status from lm.ministries")).length === 1, "and exactly the one public ministry");
for (const col of ["contact_email", "contact_name", "about", "website", "reviewed_by", "review_note", "created_by"]) ok((await refused(anon(`select ${col} from lm.ministries`), /permission denied|42501/)).refused, `the public cannot read ministries.${col}`);
for (const col of ["review_note", "approved_by", "created_by", "submitted_at", "closed_by"]) ok((await refused(anon(`select ${col} from lm.posts`), /permission denied|42501/)).refused, `the public cannot read posts.${col}`);
ok((await refused(anon("select * from lm.posts"), /permission denied|42501/)).refused, "select * from the posts is refused to the public: only named columns are granted");
for (const t of ["lm.people", "lm.answers", "lm.invites", "lm.events", "app.sessions", "app.login_codes"]) ok((await refused(anon(`select 1 from ${t} limit 1`), /permission denied|42501/)).refused, `the public cannot read ${t}`);
ok((await refused(anon("insert into lm.posts (title) values ('x')"), /permission denied|read-only|42501|25006/)).refused, "the public cannot write");
ok((await q(b1, "select count(*)::int n from lm.posts where id = $1", [waitA]))[0].n === 1, "a signed-in person from another ministry reads the public post");
ok((await q(b1, "select count(*)::int n from lm.posts where id = $1", [draftA]))[0].n === 0, "but not that ministry's draft");
ok((await admin("select count(*)::int n from lm.events where kind = 'post.approved'"))[0].n === 1 && (await admin("select count(*)::int n from lm.events where kind = 'ministry.sent_back'"))[0].n === 1, "approving and sending back each wrote a named event");

/* an expired post and a closed post leave the public board */
const shortA = await newPost(a1, "give", "Used desks, free to a good home", in30, true, "furniture");
await q(st, "select lm.post_review($1, true, null)", [shortA]);
ok((await anon("select count(*)::int n from lm.posts"))[0].n === 2, "two posts are public now");
await admin("alter table lm.posts disable trigger posts_guard"); await admin("update lm.posts set open_until = (now() at time zone 'utc')::date - 1 where id = $1", [shortA]); await admin("alter table lm.posts enable trigger posts_guard");
ok((await anon("select count(*)::int n from lm.posts"))[0].n === 1, "a post past its day leaves the public board by itself");
await q(a1, "select lm.post_close($1, 'met')", [waitA]);
ok((await anon("select count(*)::int n from lm.posts"))[0].n === 0, "a closed post leaves the public board");
ok((await refused(q(a1, "select lm.post_close($1, 'met')", [waitA]), /already_closed/)).refused, "a post is closed once");
ok((await refused(q(a1, "select lm.post_close($1, 'because')", [draftA]), /reason_not_known/)).refused, "a close reason is Met or No longer needed and nothing else");
ok((await refused(q(b1, "select lm.post_close($1, 'met')", [draftA]), /no_such_post/)).refused, "another ministry cannot close a post");

/* ===== 7. the 90-day rule, in the database ===== */
ok((await refused(newPost(a1, "ask", "Ninety-one days out", in91), /open_until_too_far|90 days/)).refused, "a post open for 91 days is refused by the database");
const edge = await newPost(a1, "ask", "Ninety days out exactly", in90, false);
ok(!!edge, "a post open for exactly 90 days is accepted");
ok((await refused(newPost(a1, "ask", "A day that has passed", yesterday), /open_until_past|has not passed/)).refused, "a day that has passed is refused");
ok((await refused(admin("insert into lm.posts (ministry_id, kind, category, title, body, city, state, open_until, created_by) values ($1,'ask','food','Operator over the limit','A body that is long enough.','Seattle','WA',$2,$3)", [mA, in91, a1]), /open_until_too_far|check|23514/)).refused, "the rule holds for the operator's SQL too (a trigger and a CHECK)");
ok((await refused(newPost(a1, "loan", "Not an ask or a give", in30), /check|23514/)).refused, "a post is an ask or a give and nothing else");
ok((await refused(newPost(a1, "ask", "Money is not a category", in30, true, "money"), /check|23514/)).refused, "there is no money category: the database refuses one");
ok((await refused(newPost(nobody, "ask", "No ministry yet", in30), /ministry_required/)).refused, "a person with no ministry cannot post");

/* ===== 8. what was approved cannot be quietly changed ===== */
ok((await refused(q(a1, "select lm.post_update($1,'ask','food','Changed title now','New words that are long enough.',null,null,$2::date)", [shortA, in30]), /post_frozen|cannot be changed/)).refused, "a post that was sent to be read cannot be changed (its words are frozen)");
await q(a1, "select lm.post_update($1,'ask','food','A better title','Better words that are long enough.',null,null,$2::date)", [draftA, in30]);
ok((await admin("select title from lm.posts where id = $1", [draftA]))[0].title === "A better title", "a draft can be changed");
ok((await refused(admin("update lm.posts set status = 'public' where id = (select id from lm.posts where status = 'closed' limit 1)"), /status_change_not_allowed|not allowed|check/)).refused, "a closed post cannot be opened again");
await q(a1, "select lm.post_submit($1)", [draftA]);
ok((await refused(q(a1, "select lm.post_submit($1)", [draftA]), /not_a_draft/)).refused, "a post that is waiting cannot be sent twice");
await q(st, "select lm.post_review($1, false, 'Say how many tables you can use.')", [draftA]);
const back = (await admin("select status, review_note from lm.posts where id = $1", [draftA]))[0];
ok(back.status === "draft" && back.review_note === "Say how many tables you can use.", "a post sent back becomes a draft again with the note the poster reads");
ok((await q(a1, "select review_note from lm.posts where id = $1", [draftA]))[0].review_note === "Say how many tables you can use.", "and the poster can read that note");

/* ===== 9. the profile: the public parts send a ministry back to be read ===== */
await q(a1, "select lm.ministry_update($1,$2,$3,$4,$5,$6,$7)", ["Alpha Table Ministry", "Seattle", "WA", "We feed neighbors every week and run a youth night.", "https://alpha.example.org", "Pat Lead", "new-contact@example.org"]);
ok((await admin("select status from lm.ministries where id = $1", [mA]))[0].status === "public", "changing what the public does not see leaves the ministry public");
await q(a1, "select lm.ministry_update($1,$2,$3,$4,$5,$6,$7)", ["Alpha Table Church", "Seattle", "WA", "We feed neighbors every week and run a youth night.", "https://alpha.example.org", "Pat Lead", "new-contact@example.org"]);
ok((await admin("select status, reviewed_by from lm.ministries where id = $1", [mA]))[0].status === "waiting", "changing the public name sends the ministry back to be read");
ok((await refused(q(a2, "select lm.ministry_update($1,$2,$3,$4,$5,$6,$7)", ["x", "y", "WA", "z", null, "p", "p@example.org"]), /ministry_required/)).refused, "a person with no ministry cannot change one");
await q(st, "select lm.ministry_review($1, true, null)", [mA]);

/* ===== 10. the team, and the last lead ===== */
ok((await refused(q(a1, "select lm.team_remove($1)", [a1]), /last_lead|keeps one lead/)).refused, "the last lead cannot leave");
ok((await refused(q(a1, "select lm.team_set_role($1, 'member')", [a1]), /last_lead|keeps one lead/)).refused, "the last lead cannot be made a member");
ok((await refused(admin("update lm.people set role = 'member' where user_id = $1", [a1]), /last_lead|keeps one lead/)).refused, "the rule holds for the operator's SQL too (a trigger)");
ok((await refused(admin("update lm.people set ministry_id = null, role = null where user_id = $1", [a1]), /last_lead|keeps one lead/)).refused, "and for moving the last lead out of the ministry");
ok((await refused(q(a2, "select lm.team_invite('a2@example.org')"), /ministry_required/)).refused, "a person with no ministry cannot invite");
const inv = (await q(a1, "select lm.team_invite('A2@Example.org') as id"))[0].id;
ok((await q(a2, "select jsonb_array_length(lm.my_invites()) n"))[0].n === 1, "the invited person sees the invitation when signed in with that address");
ok((await q(b1, "select jsonb_array_length(lm.my_invites()) n"))[0].n === 0, "and another person does not");
ok((await refused(q(b1, "select lm.team_accept($1, 'Blake')", [inv]), /already_in_ministry|no_such_invite/)).refused, "another person cannot accept it");
ok((await refused(q(nobody, "select lm.team_accept($1, 'No Ministry')", [inv]), /no_such_invite/)).refused, "nor can a person who is signed in with a different address");
await q(a2, "select lm.team_accept($1, 'Avery Member')", [inv]);
ok((await admin("select role, ministry_id from lm.people where user_id = $1", [a2]))[0].role === "member", "an invited person joins as a member");
ok((await refused(q(a2, "select lm.team_invite('x@example.org')"), /lead_required/)).refused, "a member cannot invite");
ok((await refused(q(a2, "select lm.team_set_role($1, 'lead')", [a2]), /lead_required/)).refused, "a member cannot make themselves a lead");
ok((await refused(q(a2, "select lm.team_remove($1)", [a1]), /lead_required/)).refused, "a member cannot remove the lead");
ok((await refused(q(a2, "select lm.ministry_update($1,$2,$3,$4,$5,$6,$7)", ["Alpha Table Church", "Seattle", "WA", "We feed neighbors every week and run a youth night.", null, "Pat Lead", "x@example.org"]), /lead_required/)).refused, "a member cannot change the ministry's page");
ok((await q(a2, "select count(*)::int n from lm.posts where ministry_id = $1", [mA]))[0].n >= 3, "a member reads the ministry's posts");
ok((await q(a2, "select jsonb_array_length(lm.team_list() -> 'people') n"))[0].n === 2, "and sees the team");
ok((await refused(q(a2, "select lm.team_accept($1, 'Again')", [inv]), /already_in_ministry/)).refused, "an invitation is used once");
await q(a1, "select lm.team_set_role($1, 'lead')", [a2]);
await q(a1, "select lm.team_remove($1)", [a1]);
ok((await admin("select ministry_id, role from lm.people where user_id = $1", [a1]))[0].ministry_id === null, "with another lead in place the first lead can leave");
ok((await refused(q(a2, "select lm.team_remove($1)", [a2]), /last_lead/)).refused, "and now the other is the last lead");
ok((await q(a1, "select count(*)::int n from lm.posts where ministry_id = $1 and status <> 'public'", [mA]))[0].n === 0, "a person who left reads none of the ministry's drafts or waiting posts");
await q(a1, "select lm.ministry_create('Alex New Work', 'Olympia', 'WA', 'A new small ministry started after leaving.', null, 'Alex Lead', 'alex-new@example.org')");
ok((await admin("select name from lm.ministries m join lm.people p on p.ministry_id = m.id where p.user_id = $1", [a1]))[0].name === "Alex New Work", "a person who left can make a ministry of their own");
const inv2 = (await q(a2, "select lm.team_invite('late@example.org') as id"))[0].id;
await q(a2, "select lm.team_withdraw($1)", [inv2]);
const late = await user("late@example.org", "Late Person");
ok((await refused(q(late, "select lm.team_accept($1, 'Late Person')", [inv2]), /no_such_invite/)).refused, "an invitation that was taken back cannot be accepted");
const inv3 = (await q(a2, "select lm.team_invite('late@example.org') as id"))[0].id;
await admin("update lm.invites set expires_at = now() - interval '1 minute' where id = $1", [inv3]);
ok((await refused(q(late, "select lm.team_accept($1, 'Late Person')", [inv3]), /no_such_invite/)).refused, "nor one that ran out");

/* ===== 11. stewards ===== */
ok((await refused(q(a2, "select lm.steward_set('a2@example.org', true)"), /steward_required/)).refused, "a lead cannot make themselves a steward");
ok((await refused(q(a2, "update lm.people set steward = true where user_id = $1", [a2]), /permission denied|42501/)).refused, "nor by writing to the table");
await admin("update lm.people set steward = true where user_id = $1", [a2]);
ok((await admin("select steward from lm.people where user_id = $1", [a2]))[0].steward === true, "the operator's SQL can make a steward (nobody is signed in there)");
await admin("update lm.people set steward = false where user_id = $1", [a2]);
ok((await refused(q(st, "select lm.steward_set('steward@example.org', false)"), /last_steward|keeps one steward/)).refused, "the last steward cannot be taken off");
ok((await refused(admin("update lm.people set steward = false where user_id = $1", [st]), /last_steward|keeps one steward/)).refused, "not even by the operator's SQL");
ok((await refused(q(st, "select lm.steward_set('ghost@example.org', true)"), /no_such_person|signed in/)).refused, "a steward can only make a steward of a person who has signed in once");
await q(st, "select lm.steward_set('b1@example.org', true)");
ok((await admin("select steward from lm.people where user_id = $1", [b1]))[0].steward === true, "a steward can make another steward");
await q(b1, "select lm.steward_set('steward@example.org', false)");
ok((await admin("select steward from lm.people where user_id = $1", [st]))[0].steward === false, "and the new steward can take the first one off");
await q(b1, "select lm.steward_set('steward@example.org', true)");
const ops = (await admin("select lm.make_steward('First.Steward@Example.org') as id"))[0].id;
ok((await admin("select u.email, p.steward from auth.users u join lm.people p on p.user_id = u.id where u.id = $1", [ops]))[0].steward === true, "the operator's one line makes a steward, and a sign-in person if there was none");
ok((await admin("select count(*)::int n from auth.users where lower(email) = 'first.steward@example.org'"))[0].n === 1, "(once, whatever the capital letters)");
ok((await refused(admin("select lm.make_steward('not an email')"), /email_not_readable/)).refused, "an address that is not one is refused");

/* ===== 12. answers ===== */
const open = await newPost(a2, "ask", "Ten folding tables, please", in30, true);
await q(st, "select lm.post_review($1, true, null)", [open]);
await q(st, "select lm.ministry_review($1, true, null)", [mC]);
ok((await refused(q(a2, "select lm.answer_prepare($1)", [open]), /own_post|own ministry/)).refused, "a ministry cannot answer its own post");
ok((await refused(q(nobody, "select lm.answer_prepare($1)", [open]), /ministry_required/)).refused, "a person with no ministry cannot answer");
ok((await q(b1, "select status from lm.ministries where id = $1", [mB]))[0].status === "sent_back" && (await refused(q(b1, "select lm.answer_prepare($1)", [open]), /ministry_not_public|has not read/)).refused, "a ministry that has not been read cannot answer");
const prep = (await q(c1, "select lm.answer_prepare($1) as v", [open]))[0].v;
ok(prep.to_ministry === "Alpha Table Church" && prep.from_ministry === "Charlie Outreach" && /@/.test(prep.to_email) && prep.from_email === "c1@example.org", "preparing an answer returns the two ministries and the addresses the email needs");
ok((await admin("select count(*)::int n from lm.answers"))[0].n === 0, "preparing saves nothing");
const ans = (await q(c1, "select lm.answer_record($1, 'We have eleven tables and a truck.', '206-555-0100', 'mail-1') as id", [open]))[0].id;
ok(!!ans && (await admin("select count(*)::int n from lm.answers"))[0].n === 1, "recording an answer writes one row");
ok((await refused(q(c1, "select lm.answer_record($1, 'Again, with more words.', null, 'mail-2')", [open]), /already_answered|already answered/)).refused, "a ministry answers a post once");
ok((await refused(q(c1, "select lm.answer_record($1, 'abc', null, null)", [await newPost(a2, "give", "Some more chairs to give", in30, false)]), /post_not_open|not open/)).refused, "a draft cannot be answered");
ok((await refused(q(c1, "select lm.answer_record($1, 'abc', null, null)", [open]), /already_answered|check|23514/)).refused, "words under five letters are refused (and the repeat too)");
ok((await refused(admin("insert into lm.answers (post_id, from_ministry_id, from_user_id, words, phone, reply_email) values ($1,$2,$3,'Fine words here.','call me',$4)", [open, mB, b1, "b1@example.org"]), /check|23514/)).refused, "a phone number with letters in it is refused");
const read = (u) => q(u, "select count(*)::int n from lm.answers");
ok((await read(c1))[0].n === 1 && (await read(a2))[0].n === 1, "the ministry that answered and the ministry that was answered each read the answer");
ok((await read(b1))[0].n === 0 && (await read(nobody))[0].n === 0 && (await read(st))[0].n === 0, "no one else reads it, a steward included");
ok((await anon("select count(*)::int n from lm.posts where id = $1", [open]))[0].n === 1 && (await refused(anon("select count(*)::int n from lm.answers"), /permission denied|42501/)).refused, "the public reads the post and never the answer");
const mine = (await q(a2, "select lm.my_answers() a"))[0].a;
ok(mine.received.length === 1 && mine.received[0].words === "We have eleven tables and a truck." && mine.received[0].email === "c1@example.org" && mine.sent.length === 0, "the poster's page lists the answer it received, with the words and the reply address");
const theirs = (await q(c1, "select lm.my_answers() a"))[0].a;
ok(theirs.sent.length === 1 && theirs.sent[0].to_ministry === "Alpha Table Church" && theirs.received.length === 0, "and the answerer's page lists the answer it sent");
ok((await refused(admin("update lm.answers set words = 'Changed after sending.' where id = $1", [ans]), /answers_are_records|record/)).refused, "an answer is a record: it is never changed");
ok((await refused(admin("delete from lm.answers where id = $1", [ans]), /answers_are_records|record/)).refused, "nor deleted");
ok((await refused(q(c1, "update lm.answers set words = 'Sneaky edit of mine.' where id = $1", [ans]), /permission denied|42501/)).refused, "nor by the ministry that sent it");

/* ===== 13. the record: a name on every row, ids and field names only ===== */
const ev = await admin("select kind, actor_label, payload, ministry_id from lm.events order by created_at");
ok(ev.length > 20, `the record holds ${ev.length} events`);
ok(ev.every((e) => e.actor_label && e.actor_label.trim().length > 0), "every event carries a name");
ok(ev.some((e) => e.actor_label === "Sam Steward" && e.kind === "post.approved"), "the steward's name is on the approval");
ok(ev.some((e) => e.actor_label === "system" && e.kind === "steward.made"), "the operator's act is named 'system'");
ok(ev.some((e) => e.kind === "posts.insert") && ev.some((e) => e.kind === "ministries.insert") && ev.some((e) => e.kind === "people.update") && ev.some((e) => e.kind === "answers.insert") && ev.some((e) => e.kind === "invites.insert"), "a post, a ministry, a person, an invitation and an answer each wrote an event");
const ansEv = ev.find((e) => e.kind === "answers.insert");
ok(Object.keys(ansEv.payload).sort().join() === "id,post" && !JSON.stringify(ev).includes("eleven tables") && !JSON.stringify(ev).includes("206-555"), "an answer's event holds ids only: never the words, never the phone");
const upd = ev.filter((e) => e.kind === "posts.update");
ok(upd.length > 0 && upd.every((e) => Array.isArray(e.payload.fields)) && !JSON.stringify(upd).includes("folding"), "a change to a post records the field names that changed, not what they were changed to");
ok((await q(a1, "select count(*)::int n from lm.events").catch(() => [{ n: -1 }]))[0].n === 0, "a ministry reads none of the record (only a steward does)");
ok((await q(st, "select count(*)::int n from lm.events"))[0].n > 20, "a steward reads the record");
ok((await refused(q(st, "insert into lm.events (actor_label, kind) values ('Sam', 'forged')"), /permission denied|42501/)).refused, "no one writes the record by hand");
ok((await refused(q(st, "delete from lm.events"), /permission denied|42501/)).refused, "no one deletes from it");

/* ===== 14. grants: nothing the roles do not need ===== */
for (const t of ["app.sessions", "app.login_codes", "rl.events", "lm.invites"]) ok((await refused(q(a1, `select 1 from ${t} limit 1`), /permission denied|42501/)).refused, `a signed-in role cannot read ${t}`);
ok((await refused(q(a1, "select rl.take('x','y',1,'1 minute')"), /permission denied|42501/)).refused, "nor call the rate-limit functions");
const fnRows = await admin(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'lm' and p.prosecdef
   and has_function_privilege('anon', p.oid, 'execute') order by 1`);
ok(fnRows.map((r) => r.proname).join() === "ministry_is_public", "the public can call exactly one function (is this ministry public), and it returns a yes or no", fnRows);
const authFns = await admin(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'lm' and has_function_privilege('authenticated', p.oid, 'execute') and p.proname in ('make_steward','log','audit','posts_guard','people_guard')`);
ok(authFns.length === 0, "a signed-in person cannot call make_steward, log or a trigger function directly", authFns);

/* ===== 15. the migrations are recorded and applied ===== */
const applied = await admin("select name from public.lm_migrations order by name");
ok(applied.map((a) => a.name).join() === "0001_base.sql,0002_ministries.sql,0003_board.sql,0004_grants.sql,local-supabase-shim.sql", "the four migrations and the stand-in are recorded as applied", applied);
ok((await admin("select count(*)::int n from pg_policies where schemaname = 'lm'"))[0].n >= 7, "row-level security policies are in place");
ok((await admin("select count(*)::int n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'lm' and c.relkind = 'r' and not c.relrowsecurity"))[0].n === 0, "every table in lm has row-level security on");

await pool.end();
process.exit(T.done());

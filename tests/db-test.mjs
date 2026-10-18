#!/usr/bin/env node
/* tests/db-test.mjs — the database, as every person. Two ministries and a third, a steward, a person with no ministry, the public:
   each asked the same questions: what can you read, what can you write, what does the database refuse. Row-level security, the
   steward rule, the last lead, the 90-day rule, the frozen words, the named reader, the answers, the record with a name on every
   row. Shaped on Behavioral Health's tests/db-test.mjs.   LEXOS_DB_NAME=linkedm_t_<mine> node tests/db-test.mjs */
import { counter, ownDatabase, sleep } from "./helpers.mjs";

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
ok(prep.to_ministry === "Alpha Table Church" && prep.from_ministry === "Charlie Outreach" && prep.from_email === "c1@example.org", "preparing an answer returns the two ministries and the answerer's own address");
ok(!("to_email" in prep) && !("to_contact" in prep) && !JSON.stringify(prep).includes("new-contact"), "and not the posting ministry's contact name or address: a signed-in person's call never returns it");
ok((await refused(q(c1, "select lm.answer_contact($1)", [open]), /permission denied|42501/)).refused, "nobody signed in can call answer_contact");
ok((await admin("select lm.answer_contact($1) as v", [open]))[0].v.to_email === "new-contact@example.org", "the service connection can, and gets the address the email goes to");
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
ok(fnRows.map((r) => r.proname).join() === "giving_door_open,giving_public,ministry_is_public,page_list_public,page_public,page_slug_of,photo_get", "the public can call seven functions and no more: is this ministry public, the four that answer only for a public page and its pictures, and the two that answer for the giving record (sums of the rows, no donor)", fnRows);
const authFns = await admin(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'lm' and has_function_privilege('authenticated', p.oid, 'execute') and p.proname in ('make_steward','log','audit','posts_guard','people_guard')`);
ok(authFns.length === 0, "a signed-in person cannot call make_steward, log or a trigger function directly", authFns);

/* ===== 14. the hardening of 0005: found by the audit, each one tried before it was closed ===== */
{
  const mkWith = (uid, over = {}) => { const v = { name: "Good Name Ministry", city: "Seattle", state: "WA", about: "We feed neighbors every week and more.", website: null, contact_name: "Pat Lead", contact_email: "pat@example.org", ...over };
    return q(uid, "select lm.ministry_create($1,$2,$3,$4,$5,$6,$7)", [v.name, v.city, v.state, v.about, v.website, v.contact_name, v.contact_email]); };
  /* an address has one shape: a list, a name in quotes, a missing dot, a line break and a space are all refused, by the database itself */
  for (const bad of ["a,victim@bank.example", '"x"<y>@z.example', "a@b", "a@-b.example", "a@b..example", "a b@c.example", "a@b.example\n", "<a@b.example>", "a;b@c.example", "a(b)@c.example"]) {
    const u = await user(`shape-${Math.random().toString(36).slice(2)}@example.org`);
    ok((await refused(mkWith(u, { contact_email: bad }))).refused, `a contact address of ${JSON.stringify(bad)} is refused by the database`);
  }
  { const u = await user("shape-ok@example.org"); ok((await mkWith(u, { contact_email: "first.last+board@sub.example.org" })).length === 1, "and a plain address with a dot and a plus is accepted"); }
  ok((await refused(q(a1, "select lm.team_invite($1)", ["a,b@c.example"]))).refused, "an invitation to a list of addresses is refused too");
  ok((await refused(admin("insert into auth.users (email) values ('x,y@z.example')"), /check|23514/)).refused, "and a sign-in address that is a list cannot be made, even by the operator's SQL");
  /* one line: no break in a name, a city or a title */
  { const u = await user("oneline@example.org"); ok((await refused(mkWith(u, { name: "Good\nName" }))).refused && (await refused(mkWith(u, { contact_name: "Pat\r\nBcc: x@y.example" }))).refused, "a ministry name or contact name with a line break is refused");
    ok((await refused(newPost(a1, "ask", "A title\nwith a break", in30, false))).refused, "and so is a post title with one"); }
  /* the last steward and the last lead are counted under a lock: two at once cannot both go */
  const s1 = await user("race-s1@example.org", "Race One"), s2 = await user("race-s2@example.org", "Race Two");
  await admin("select lm.make_steward('race-s1@example.org')"); await admin("select lm.make_steward('race-s2@example.org')");
  const others = (await admin("select user_id from lm.people where steward and user_id not in ($1, $2)", [s1, s2])).map((r) => r.user_id);
  for (const uid of others) await admin("update lm.people set steward = false where user_id = $1", [uid]);
  const conn = async (uid) => { const c = await pool.connect(); await c.query("begin"); await c.query("set local role authenticated"); await c.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]); return c; };
  const race = async (a, aSql, aP, b, bSql, bP) => {
    const ca = await conn(a), cb = await conn(b);
    await ca.query(aSql, aP);                                   /* the first change is made and not yet committed */
    const second = cb.query(bSql, bP).then(() => ({ ok: true }), (e) => ({ ok: false, e }));
    await sleep(500);                                           /* the second has to wait for the first: it is queued behind the lock */
    await ca.query("commit"); const r = await second;
    try { await cb.query(r.ok ? "commit" : "rollback"); } catch (e) { /* done */ }
    ca.release(); cb.release(); return r;
  };
  { const r = await race(s1, "select lm.steward_set('race-s2@example.org', false)", [], s2, "select lm.steward_set('race-s1@example.org', false)", []);
    const left = (await admin("select count(*)::int n from lm.people where steward"))[0].n;
    ok(!r.ok && /last_steward|steward_required/.test(r.e.message) && left === 1, "two stewards who take each other off at the same moment: one goes, and the other is refused, so one steward is always left", { ok: r.ok, left, e: r.e && r.e.message }); }
  for (const uid of [s2, ...others]) await admin("update lm.people set steward = true where user_id = $1", [uid]);
  const l1 = await user("race-l1@example.org", "Lead One"), l2 = await user("race-l2@example.org", "Lead Two");
  const mR = await mk(l1, "Race Ministry"); await q(l1, "select lm.team_invite('race-l2@example.org')");
  const inv = (await admin("select id from lm.invites where ministry_id = $1", [mR]))[0].id; await q(l2, "select lm.team_accept($1, 'Lead Two')", [inv]); await q(l1, "select lm.team_set_role($1, 'lead')", [l2]);
  { const r = await race(l1, "select lm.team_set_role($1, 'member')", [l2], l2, "select lm.team_set_role($1, 'member')", [l1]);
    const leads = (await admin("select count(*)::int n from lm.people where ministry_id = $1 and role = 'lead'", [mR]))[0].n;
    ok(!r.ok && /last_lead|lead_required/.test(r.e.message) && leads === 1, "two leads who demote each other at the same moment: one goes, and the other is refused, so one lead is always left", { ok: r.ok, leads, e: r.e && r.e.message }); }
  /* deleting the last steward's row, or the last lead's, is refused too, not only changing it */
  await admin("update lm.people set steward = false where user_id in ($1, $2, $3)", [s1, s2, st]).catch(() => {});
  const stewardsNow = (await admin("select user_id from lm.people where steward")).map((r) => r.user_id);
  for (const uid of stewardsNow.slice(1)) await admin("update lm.people set steward = false where user_id = $1", [uid]);
  ok((await admin("select count(*)::int n from lm.people where steward"))[0].n === 1, "(one steward is left)");
  ok((await refused(admin("delete from lm.people where user_id = $1", [stewardsNow[0]]), /last_steward|keeps one steward/)).refused, "the operator's SQL cannot delete the last steward's row");
  const onlyLead = (await admin("select user_id from lm.people where ministry_id = $1 and role = 'lead'", [mR]))[0].user_id;
  ok((await refused(admin("delete from lm.people where user_id = $1", [onlyLead]), /last_lead|keeps one lead/)).refused, "or the last lead's row");
  await admin("update lm.people set steward = true where user_id in ($1, $2)", [s1, st]);

  /* what a ministry says about itself is not read by every signed-in person */
  for (const col of ["about", "website"]) ok((await refused(q(b1, `select ${col} from lm.ministries`), /permission denied|42501/)).refused, `a signed-in person cannot select ministries.${col}`);
  ok((await q(a1, "select lm.my_ministry_profile() as m"))[0].m.about.length > 10, "a ministry's own people still read it, through the function that answers for them");
  ok((await q(st, "select lm.steward_queue() as q"))[0].q.ministries.every((m) => "about" in m), "and a steward reads it in the queue");

  /* a past day cannot be sent to be read */
  { const d = await newPost(a1, "ask", "A draft that will go stale", in30, false);
    await admin("alter table lm.posts disable trigger posts_guard"); await admin("update lm.posts set open_until = (now() at time zone 'utc')::date - 2 where id = $1", [d]); await admin("alter table lm.posts enable trigger posts_guard");
    ok((await refused(q(a1, "select lm.post_submit($1)", [d]), /open_until_past|has passed/)).refused, "a draft whose day has gone cannot be sent to be read"); }

  /* nobody signed in can run what is only the operator's */
  const priv = await admin(`select p.proname, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.proname in ('answer_contact','reap') and n.nspname in ('lm','app')
    and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute') or has_function_privilege(0, p.oid, 'execute'))`);
  ok(priv.length === 0, "answer_contact and app.reap are not granted to the public, to anon or to a signed-in person", priv);

  /* old things are swept: an address nobody finished goes; a person with a ministry, a session or a young row stays */
  const ghost = await user("ghost@example.org"), young = await user("young@example.org"), live = await user("live@example.org");
  await admin("update auth.users set created_at = now() - interval '5 days' where id = $1 or id = $2", [ghost, live]);
  await admin("insert into app.sessions (user_id, token_hash) values ($1, decode(md5('t'), 'hex'))", [live]);
  await admin("insert into app.login_codes (user_id, code_hash, channel, sent_to, expires_at) values ($1, decode(md5('c'), 'hex'), 'email', 'ghost@example.org', now() - interval '3 days')", [ghost]);
  await admin("insert into app.sessions (user_id, token_hash, expires_at) values ($1, decode(md5('old'), 'hex'), now() - interval '9 days')", [live]);
  await admin("select app.reap()");
  const left = (await admin("select email from auth.users where id in ($1,$2,$3) order by email", [ghost, young, live])).map((r) => r.email);
  ok(left.join() === "live@example.org,young@example.org", "an address nobody finished is swept; a young one and one with a session stay", left);
  ok((await admin("select count(*)::int n from app.sessions where user_id = $1", [live]))[0].n === 1 && (await admin("select count(*)::int n from app.login_codes where user_id = $1", [ghost]))[0].n === 0, "an old session and an old code are swept; the live session stays");
  ok((await admin("select count(*)::int n from lm.people where user_id = $1", [a1]))[0].n === 1 && (await admin("select count(*)::int n from auth.users where id = $1", [a1]))[0].n === 1, "and nobody with a ministry is touched");
}

/* ===== 16. reports: anyone can tell the stewards; nothing is hidden until a steward acts ===== */
{
  const rp = await newPost(a2, "ask", "A post that gets reported", in30, true); await q(st, "select lm.post_review($1, true, null)", [rp]);
  const draftP = await newPost(a2, "ask", "A draft nobody can report", in30, false);
  ok((await refused(q(a1, "select lm.report_create($1,'scam',null,null)", [rp]), /permission denied|42501/)).refused && (await refused(q(st, "select lm.report_create($1,'scam',null,null)", [rp]), /permission denied|42501/)).refused, "no signed-in person, not even a steward, can call report_create: the service connection makes a report for a visitor");
  ok((await refused(admin("select lm.report_create($1,'scam',null,null)", [draftP]), /post_not_open|not on the board/)).refused && (await refused(admin("select lm.report_create($1,'scam',null,null)", ["00000000-0000-4000-8000-000000000000"]), /post_not_open/)).refused, "a draft and a post that does not exist cannot be reported");
  ok((await refused(admin("select lm.report_create($1,'spam',null,null)", [rp]))).refused && (await refused(admin("select lm.report_create($1,'scam',null,'a,b@c.example')", [rp]))).refused, "a reason that is not on the list, and an address that is a list, are each refused");
  const r1 = (await admin("select lm.report_create($1,'scam','This looks wrong to me.','reporter@example.org') as id", [rp]))[0].id;
  ok((await admin("select status from lm.posts where id = $1", [rp]))[0].status === "public", "a report hides nothing: the post is still public");
  const ev = (await admin("select actor_label, kind, payload, ministry_id from lm.events where kind = 'report.created' and (payload ->> 'id') = $1", [r1]))[0];
  ok(ev && ev.actor_label === "A visitor" && ev.ministry_id === mA && !JSON.stringify(ev.payload).match(/wrong|reporter@/), "the report writes an event with a name on it ('A visitor') and ids only, never the words or the address");
  ok((await refused(q(a2, "select 1 from lm.reports"), /permission denied|42501/)).refused && (await refused(anon("select 1 from lm.reports"), /permission denied|42501/)).refused, "no one but the functions can read the reports table");
  ok((await refused(q(a2, "select lm.steward_emails()"), /permission denied|42501/)).refused && (await admin("select lm.steward_emails() as v"))[0].v.includes("steward@example.org"), "the stewards' addresses are the service connection's alone");
  const queue = (await q(st, "select lm.steward_queue() as q"))[0].q;
  ok(queue.reports.length === 1 && queue.reports[0].id === r1 && queue.reports[0].reason === "scam" && queue.reports[0].post_title === "A post that gets reported" && queue.reports[0].email === "reporter@example.org", "the steward's queue holds the open report with the post, the reason, the note and the address");
  ok((await refused(q(a2, "select lm.report_resolve($1,'keep','Reading it now')", [r1]), /steward_required/)).refused, "a person who is not a steward cannot act on a report");
  ok((await refused(q(st, "select lm.report_resolve($1,'keep','')", [r1]), /note_required|short note/)).refused && (await refused(q(st, "select lm.report_resolve($1,'delete','A note here')", [r1]), /decision_not_known/)).refused, "a steward must write a note, and choose close or keep");
  await q(st, "select lm.report_resolve($1,'keep','It is fine: a real ministry.')", [r1]);
  const kept = (await admin("select status, handled_by, handled_note from lm.reports where id = $1", [r1]))[0];
  ok(kept.status === "kept" && kept.handled_by === st && (await admin("select status from lm.posts where id = $1", [rp]))[0].status === "public" && (await admin("select actor_label from lm.events where kind = 'report.kept'"))[0].actor_label === "Sam Steward", "keeping a report leaves the post public, and the record names the steward");
  ok((await refused(q(st, "select lm.report_resolve($1,'close','Closing it')", [r1]), /not_waiting|already read/)).refused, "a report that was read cannot be acted on twice");
  const r2 = (await admin("select lm.report_create($1,'copy','This is my photograph.',null) as id", [rp]))[0].id, r3 = (await admin("select lm.report_create($1,'money',null,null) as id", [rp]))[0].id;
  await q(st, "select lm.report_resolve($1,'close','Taken down: the photograph is not theirs.')", [r2]);
  const closed = (await q(a2, "select status, closed_reason, review_note from lm.posts where id = $1", [rp]))[0];
  ok(closed.status === "closed" && closed.closed_reason === "removed" && closed.review_note === "Taken down: the photograph is not theirs.", "closing a report takes the post down, and its poster reads the reason and the steward's note");
  ok((await admin("select count(*)::int n from lm.reports where post_id = $1 and status = 'open'", [rp]))[0].n === 0 && (await anon("select count(*)::int n from lm.posts where id = $1", [rp]))[0].n === 0, "the other open reports on that post are closed with it, and the public no longer reads it");
  ok((await admin("select actor_label from lm.events where kind = 'report.post_closed'"))[0].actor_label === "Sam Steward", "and that act has the steward's name on it");
  ok((await refused(admin("insert into lm.reports (post_id, reason, status) values ($1, 'scam', 'kept')", [rp]), /check|23514/)).refused, "a report cannot be marked handled without the steward's name");
  ok((await q(a2, "select closed_reason from lm.posts where id = $1", [rp]))[0].closed_reason === "removed" && (await refused(q(a2, "select lm.post_close($1, 'removed')", [rp]), /reason_not_known|already_closed/)).refused, "a poster cannot choose 'removed' as a reason of their own");
}

/* ===== 17. leaving: one transaction, the whole of it, with a name taken off the record ===== */
{
  const lead = await user("leave-lead@example.org", "Lee Lead"), mem = await user("leave-mem@example.org", "Maria Member");
  const mX = await mk(lead, "Leaving Ministry", "Everett"); await q(lead, "select lm.team_invite('leave-mem@example.org')");
  await q(mem, "select lm.team_accept($1, 'Maria Member')", [(await admin("select id from lm.invites where ministry_id = $1", [mX]))[0].id]);
  await q(st, "select lm.ministry_review($1, true, null)", [mX]);
  const pX = await newPost(lead, "give", "Chairs for anyone who needs them", in30, true); await q(st, "select lm.post_review($1, true, null)", [pX]);
  const target = await newPost(a2, "ask", "Chairs wanted for a Friday night", in30, true); await q(st, "select lm.post_review($1, true, null)", [target]);
  await q(mem, "select lm.answer_record($1, 'We can bring twelve chairs.', '206-555-0199', 'mail-x')", [target]);
  const received = await q(c1, "select lm.answer_record($1, 'We would love the chairs, please.', null, 'mail-y') as id", [pX]);
  await admin("insert into app.sessions (user_id, token_hash) values ($1, decode(md5('mem-session'), 'hex'))", [mem]);
  await admin("insert into app.login_codes (user_id, code_hash, channel, sent_to) values ($1, decode(md5('mem-code'), 'hex'), 'email', 'leave-mem@example.org')", [mem]);
  ok((await refused(q(lead, "select lm.account_delete()"), /last_lead|only lead/)).refused, "the only lead cannot delete their account while others are on the team");
  ok((await refused(q(a1, "select lm.account_erase($1)", [mem]), /permission denied|42501/)).refused && (await refused(anon("select lm.account_delete()"), /permission denied|42501/)).refused, "no one can erase another person, and a stranger cannot erase anyone");
  const r = (await q(mem, "select lm.account_delete() as r"))[0].r;
  const pe = (await admin("select * from lm.people where user_id = $1", [mem]))[0], us = (await admin("select email, full_name from auth.users where id = $1", [mem]))[0];
  ok(r.ministry_left === false && pe.ministry_id === null && pe.role === null && pe.full_name === "A person who left" && pe.steward === false, "a member who deletes their account only leaves the team, and the person row has no name");
  ok(/^deleted-[0-9a-f]{32}@removed\.invalid$/.test(us.email) && us.full_name === null, "their email and name are gone from the sign-in row (a tombstone is left so older records still point at something)", us);
  ok((await admin("select count(*)::int n from app.sessions where user_id = $1", [mem]))[0].n === 0 && (await admin("select count(*)::int n from app.login_codes where user_id = $1", [mem]))[0].n === 0, "their sessions and sign-in codes are erased");
  const sent = (await admin("select words, phone, reply_email, from_user_id from lm.answers where post_id = $1", [target]))[0];
  ok(sent.words === "[removed]" && sent.phone === null && sent.reply_email === "removed" && sent.from_user_id === mem, "the answer they sent keeps its place as a record and loses its words, its phone and its address");
  ok((await admin("select count(*)::int n from lm.events where actor_id = $1 or actor_label = 'Maria Member'", [mem]))[0].n === 0, "no event carries their name or id any more");
  const gone = (await admin("select actor_label, actor_id, payload, ministry_id from lm.events where kind = 'account.erased' and (payload ->> 'id') = $1", [mem]))[0];
  ok(gone && gone.actor_label === "A person who left" && gone.actor_id === null && gone.ministry_id === mX && !JSON.stringify(gone.payload).includes("@") && gone.payload.ministry_left === false, "one new event says the account was erased: a name on it ('A person who left'), ids only");
  ok((await admin("select status from lm.ministries where id = $1", [mX]))[0].status === "public" && (await admin("select count(*)::int n from lm.people where ministry_id = $1 and role = 'lead'", [mX]))[0].n === 1, "the ministry stays public and keeps its lead");
  ok((await admin("insert into auth.users (email) values ('leave-mem@example.org') returning id")).length === 1, "and the same email address can sign up again, as a new person");
  const r2 = (await q(lead, "select lm.account_delete() as r"))[0].r;
  const mm = (await admin("select status, about, website, contact_name, contact_email, review_note from lm.ministries where id = $1", [mX]))[0];
  ok(r2.ministry_left === true && mm.status === "left" && mm.website === null && mm.contact_name === "Removed" && mm.contact_email === "removed@removed.invalid" && mm.about === "This ministry left the network.", "the only person in a ministry takes the ministry out with them: hidden, and its contact name and email erased");
  ok((await admin("select count(*)::int n from lm.posts where ministry_id = $1 and status <> 'closed'", [mX]))[0].n === 0 && (await anon("select count(*)::int n from lm.posts where ministry_id = $1", [mX]))[0].n === 0 && (await anon("select count(*)::int n from lm.ministries where id = $1", [mX]))[0].n === 0, "its posts are closed and the public reads none of it");
  ok((await admin("select words, reply_email from lm.answers where id = $1", [received[0].id]))[0].words === "[removed]", "the words of an answer it had received are erased with it");
  ok((await admin("select actor_label from lm.events where kind = 'account.erased' and (payload ->> 'id') = $1", [lead]))[0].actor_label === "A person who left" && (await admin("select count(*)::int n from lm.events where actor_label = 'Lee Lead'"))[0].n === 0, "and the lead's name is off the record too");
  /* the last steward cannot leave; an answer is still a record for everyone else */
  await admin("update lm.people set steward = false where steward and user_id <> $1", [st]);
  ok((await refused(admin("select lm.account_erase($1)", [st]), /last_steward|keeps one steward/)).refused, "the last steward cannot delete their account until another steward is named");
  ok((await refused(admin("update lm.answers set words = 'changed words here' where post_id = $1", [target]), /answers_are_records|record/)).refused, "outside a deletion, an answer is still a record that nobody changes, not even the operator's SQL");
  { const c = await pool.connect(); try { await c.query("begin"); await c.query("select set_config('lm.erasing', 'on', true)"); let e = null; try { await c.query("update lm.answers set sent_at = now() - interval '1 day' where post_id = $1", [target]); } catch (x) { e = x; } ok(e && /answers_are_records|record/.test(e.message), "and even while a deletion is under way, only the words, phone and address of an answer can change, never its date"); } finally { await c.query("rollback"); c.release(); } }
  const lone = await user("no-ministry-ever@example.org", "Nia Nobody");
  ok((await admin("select lm.account_erase($1) as r", [lone]))[0].r.ministry_left === false && /^deleted-/.test((await admin("select email from auth.users where id = $1", [lone]))[0].email), "the operator can erase a person who never made a ministry, by one line of SQL");
}

/* ===== 15. the migrations are recorded and applied ===== */
const applied = await admin("select name from public.lm_migrations order by name");
ok(applied.map((a) => a.name).join() === "0001_base.sql,0002_ministries.sql,0003_board.sql,0004_grants.sql,0005_hardening.sql,0006_reports_and_leaving.sql,0007_ministry_pages.sql,0008_giving_ledger.sql,0009_eden_log.sql,0010_eden_freeform.sql,local-supabase-shim.sql", "every migration and the stand-in are recorded as applied", applied);
ok((await admin("select count(*)::int n from pg_policies where schemaname = 'lm'"))[0].n >= 7, "row-level security policies are in place");
ok((await admin("select count(*)::int n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'lm' and c.relkind = 'r' and not c.relrowsecurity"))[0].n === 0, "every table in lm has row-level security on");

await pool.end();
process.exit(T.done());

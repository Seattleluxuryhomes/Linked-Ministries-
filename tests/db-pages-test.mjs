#!/usr/bin/env node
/* tests/db-pages-test.mjs — a ministry's public page, as every person: the lead who makes it, a member who cannot, another ministry,
   a steward, the public. What the public may read (only the copy a steward read, only while the ministry is public), the address
   (unique, lowercase, one edit before it is public, then final), the rules the form shows held by the database, the pictures
   (the bytes must be what the label says; served only when the live copy names them), the record with a name on every act, and a
   ministry that leaves taking its page with it.   LEXOS_DB_NAME=linkedm_t_<mine> node tests/db-pages-test.mjs */
import { counter, ownDatabase } from "./helpers.mjs";

const T = counter("db-pages-test"); const { ok } = T;
await ownDatabase("db_pages");
const { pool, asAdmin, asUser, asAnon } = await import("../server/db.mjs");
const q = (uid, sql, p = []) => asUser(uid, async (c) => (await c.query(sql, p)).rows);
const admin = (sql, p = []) => asAdmin(async (c) => (await c.query(sql, p)).rows);
const anon = (sql, p = []) => asAnon(async (c) => (await c.query(sql, p)).rows);
const refused = async (promise, re) => { try { await promise; return { refused: false }; } catch (e) { return { refused: re ? re.test(String(e.message) + " " + String(e.hint || "") + " " + String(e.code || "")) : true, message: e.message, code: e.code }; } };
const user = async (email, name) => (await admin("insert into auth.users (email, full_name) values ($1, $2) returning id", [email, name || null]))[0].id;
const mk = (uid, name, city = "Seattle") => q(uid, "select lm.ministry_create($1,$2,$3,$4,$5,$6,$7) as id", [name, city, "WA", "We feed neighbors every week and run a small youth night.", null, "Pat Lead", `c-${name.replace(/\W/g, "").toLowerCase()}@example.org`]).then((r) => r[0].id);
const draft = (o = {}) => ({ tagline: "A Saturday meal for our neighbors", about: "We serve a hot meal every Saturday at noon. Everyone is welcome. We also run a youth night on Thursdays.", meets: [{ day: "Saturdays", time: "12:00 pm", place: "Grace Hall, 12 Main St" }], email: "hello@alpha.example", phone: "206-555-0100", website: "https://alpha.example.org", give_url: "https://pay.alpha.example/give", photos: [], ...o });
const save = (uid, name, city, state, slug, d, submit = false) => q(uid, "select lm.page_save($1,$2,$3,$4,$5::jsonb,$6) as r", [name, city, state, slug, JSON.stringify(d), submit]).then((r) => r[0].r);
const JPEG = Buffer.concat([Buffer.from("ffd8ffe000104a46494600", "hex"), Buffer.alloc(300, 7), Buffer.from("ffd9", "hex")]);
const PNG = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(300, 9)]);
const photoAdd = (uid, type, bytes, alt) => q(uid, "select lm.photo_add($1,$2,$3) as id", [type, bytes, alt || null]).then((r) => r[0].id);

const a1 = await user("a1@example.org", "Alex Lead"), a2 = await user("a2@example.org", "Avery Member"), b1 = await user("b1@example.org", "Blake Lead");
const st = await user("steward@example.org", "Sam Steward"), nobody = await user("nobody@example.org", "No Ministry");
await admin("insert into lm.people (user_id, full_name, steward) values ($1, 'Sam Steward', true)", [st]);
const mA = await mk(a1, "Alpha Table Ministry"), mB = await mk(b1, "Alpha Table Ministry", "Spokane");
await admin("insert into lm.people (user_id, ministry_id, role, full_name) values ($1, $2, 'member', 'Avery Member')", [a2, mA]);

/* ===== 1. who may make a page ===== */
const mine0 = (await q(a1, "select lm.page_mine() as p"))[0].p;
ok(mine0.exists === false && mine0.suggested_slug === "alpha-table-ministry", "before a page exists, the lead is offered an address chosen from the ministry's name, in lower case with dashes", mine0);
ok((await q(nobody, "select lm.page_mine() as p"))[0].p === null, "a person with no ministry has no page to read");
ok((await refused(save(a2, "Alpha Table Ministry", "Seattle", "WA", "", draft()), /lead_required/)).refused, "a member who is not a lead cannot make the page");
ok((await refused(save(nobody, "X Ministry", "Seattle", "WA", "", draft()), /ministry_required/)).refused, "a person with no ministry cannot make a page");
ok((await refused(q(a1, "insert into lm.pages (ministry_id, slug, draft, created_by) values ($1,'sneaky-page','{}',$2)", [mA, a1]), /permission denied|42501/)).refused, "nobody writes to the pages table directly: the role has no write at all");
ok((await refused(q(a1, "select * from lm.pages"), /permission denied|42501/)).refused && (await refused(anon("select 1 from lm.pages"), /permission denied|42501/)).refused && (await refused(anon("select 1 from lm.page_photos"), /permission denied|42501/)).refused, "and no one reads the tables: only the functions answer");

/* ===== 2. save, send, and what the public sees ===== */
const r1 = await save(a1, "Alpha Table Ministry", "Seattle", "WA", "", draft());
ok(r1.state === "draft" && r1.slug === "alpha-table-ministry", "a saved page is a draft at the address chosen from the name", r1);
ok((await anon("select lm.page_public('alpha-table-ministry') as p"))[0].p === null, "the public reads nothing of a draft");
const mine1 = (await q(a1, "select lm.page_mine() as p"))[0].p;
ok(mine1.exists && mine1.state === "draft" && mine1.draft.tagline === "A Saturday meal for our neighbors" && mine1.public === false && mine1.slug_edits === 0, "the lead reads the draft back");
ok((await q(b1, "select lm.page_mine() as p"))[0].p.exists === false, "another ministry never reads it");
const ev1 = (await admin("select actor_label, kind, payload from lm.events where kind = 'pages.insert'"))[0];
ok(ev1 && ev1.actor_label === "Pat Lead" && !JSON.stringify(ev1.payload).includes("Saturday"), "making the page wrote an event with the lead's name and none of the words");
const r2 = await save(a1, "Alpha Table Ministry", "Seattle", "WA", "", draft(), true);
ok(r2.state === "waiting", "sent to be read, the page waits");
ok((await anon("select lm.page_public('alpha-table-ministry') as p"))[0].p === null, "and the public still reads nothing");
ok((await admin("select count(*)::int n from lm.events where kind = 'pages.update' and actor_label = 'Pat Lead'"))[0].n >= 1, "every change names the lead");

/* ===== 3. a steward reads ===== */
ok((await refused(q(a1, "select lm.page_review($1, true, null)", [mA]), /steward_required/)).refused, "a lead cannot approve their own page");
ok((await refused(q(nobody, "select lm.page_review($1, true, null)", [mA]), /steward_required/)).refused, "nor a person with no ministry");
ok((await refused(q(st, "select lm.page_review($1, true, null)", [mA]), /ministry_not_public|Read the ministry first/)).refused, "a steward cannot make a page public before its ministry has been read");
await q(st, "select lm.ministry_review($1, true, null)", [mA]);
ok((await refused(q(st, "select lm.page_review($1, false, '')", [mA]), /note_required/)).refused, "sending a page back needs a note");
await q(st, "select lm.page_review($1, false, 'Please say who the meal is for.')", [mA]);
ok((await q(a1, "select lm.page_mine() as p"))[0].p.review_note === "Please say who the meal is for." && (await q(a1, "select lm.page_mine() as p"))[0].p.state === "sent_back", "a page sent back carries the note the lead reads");
await save(a1, "Alpha Table Ministry", "Seattle", "WA", "", draft({ about: "We serve a hot meal every Saturday at noon, for anyone who is hungry. Everyone is welcome." }), true);
ok((await refused(q(st, "select lm.page_review($1, true, null)", [mB]), /no_such_page/)).refused, "a ministry with no page has nothing to read");
await q(st, "select lm.page_review($1, true, null)", [mA]);
const pub = (await anon("select lm.page_public('alpha-table-ministry') as p"))[0].p;
ok(pub && pub.name === "Alpha Table Ministry" && pub.live.tagline === "A Saturday meal for our neighbors" && pub.live.give_url === "https://pay.alpha.example/give", "an approved page is public: the name, the words, the link for gifts", pub);
ok(!JSON.stringify(pub).includes("c-alphatableministry"), "and the ministry's private contact email is nowhere in it");
const row = (await admin("select live_by, live_at, state from lm.pages where ministry_id = $1", [mA]))[0];
ok(row.live_by === st && row.live_at && row.state === "approved", "a public page carries the steward's name and the time");
ok((await refused(admin("update lm.pages set live = '{\"tagline\":\"x\"}' where ministry_id = $1 and false", [mA]), /x/)).refused === false, "(a no-op update is harmless)");
ok((await refused(admin("insert into lm.pages (ministry_id, slug, draft, live, created_by) values ($1,'another-live-page','{}','{}',$2)", [mB, b1]), /check|violat|23514/)).refused, "a live copy with no named reader is refused by a CHECK, even for the operator's SQL");
ok((await refused(q(a1, "select lm.page_review($1, true, null)", [mA]), /steward_required/)).refused, "approved once, still only a steward approves");
ok((await anon("select count(*)::int n from jsonb_array_elements(lm.page_list_public())"))[0].n === 1 && (await anon("select lm.page_slug_of($1) as s", [mA]))[0].s === "alpha-table-ministry", "the sitemap list and the board's link know the one public page");
ok((await admin("select count(*)::int n from lm.events where kind = 'page.approved' and actor_label = 'Sam Steward'"))[0].n === 1, "approving wrote an event with the steward's name");

/* ===== 4. an edit does not reach the public until a steward reads it ===== */
const r3 = await save(a1, "Alpha Table Ministry", "Seattle", "WA", "", draft({ tagline: "A new line the steward has not read" }), true);
ok(r3.state === "waiting", "a change to a public page waits");
ok((await anon("select lm.page_public('alpha-table-ministry') as p"))[0].p.live.tagline === "A Saturday meal for our neighbors", "and the public still reads the copy a steward read");
const mine3 = (await q(a1, "select lm.page_mine() as p"))[0].p;
ok(mine3.has_live === true && mine3.state === "waiting" && mine3.public === true, "the lead sees that the page is public and a change is waiting");
const r3b = await save(a1, "Alpha Table Ministry", "Seattle", "WA", "", draft({ about: "We serve a hot meal every Saturday at noon, for anyone who is hungry. Everyone is welcome." }), true);
ok(r3b.state === "approved", "saving the same words that are public changes nothing, and the page says so");
await save(a1, "Alpha Table Ministry", "Seattle", "WA", "", draft({ tagline: "A new line the steward has read", about: "We serve a hot meal every Saturday at noon, for anyone who is hungry. Everyone is welcome." }), true);
await q(st, "select lm.page_review($1, true, null)", [mA]);
ok((await anon("select lm.page_public('alpha-table-ministry') as p"))[0].p.live.tagline === "A new line the steward has read", "once a steward approves the change, the public reads it");

/* ===== 5. the ministry's public name and town ===== */
await save(a1, "Alpha Table Church", "Seattle", "WA", "", draft({ about: "We serve a hot meal every Saturday at noon, for anyone who is hungry. Everyone is welcome." }));
ok((await admin("select status from lm.ministries where id = $1", [mA]))[0].status === "waiting", "changing the public name in the page form sends the ministry back to be read (0002's rule)");
ok((await anon("select lm.page_public('alpha-table-ministry') as p"))[0].p === null && (await anon("select lm.page_slug_of($1) as s", [mA]))[0].s === null, "and the page goes dark with it");
await q(st, "select lm.ministry_review($1, true, null)", [mA]);
ok((await anon("select lm.page_public('alpha-table-ministry') as p"))[0].p.name === "Alpha Table Church", "when a steward reads the ministry again, the page returns under the new name");
ok((await refused(save(a1, "A", "Seattle", "WA", "", draft()), /check|23514|ministries_name/)).refused, "a one-letter name is refused by the database");

/* ===== 6. the address ===== */
const rb = await save(b1, "Alpha Table Ministry", "Spokane", "WA", "", draft());
ok(rb.slug === "alpha-table-ministry-2", "a second ministry with the same name gets a different address", rb);
ok((await refused(save(b1, "Alpha Table Ministry", "Spokane", "WA", "alpha-table-ministry", draft()), /slug_taken|already has that address/)).refused, "an address another ministry has is refused");
ok((await refused(save(b1, "Alpha Table Ministry", "Spokane", "WA", "Has Spaces", draft()), /slug_not_readable|3 to 60/)).refused, "an address with spaces is refused");
ok((await refused(save(b1, "Alpha Table Ministry", "Spokane", "WA", "ab", draft()), /slug_not_readable|3 to 60/)).refused, "and one under three letters");
ok((await refused(save(b1, "Alpha Table Ministry", "Spokane", "WA", "-bad-start", draft()), /slug_not_readable|3 to 60/)).refused, "and one that starts with a dash");
const rb2 = await save(b1, "Alpha Table Ministry", "Spokane", "WA", "Bravo-Meals", draft());
ok(rb2.slug === "bravo-meals", "an address typed in capitals is kept in lower case");
ok((await refused(save(b1, "Alpha Table Ministry", "Spokane", "WA", "bravo-two", draft()), /slug_edited_once|used/)).refused, "the address can be changed once before the page is public, and not again");
ok((await refused(admin("insert into lm.pages (ministry_id, slug, draft, created_by) values ($1,'Upper-Case','{}',$2)", [mA, a1]), /check|23514/)).refused, "a CHECK keeps every address lower case");
ok((await refused(save(a1, "Alpha Table Church", "Seattle", "WA", "other-address", draft()), /slug_locked|cannot change once/)).refused, "once a page has been public its address is final");

/* ===== 7. the rules the form shows, held by the database ===== */
const bad = async (patch, re, what) => ok((await refused(save(a1, "Alpha Table Church", "Seattle", "WA", "", draft(patch)), re)).refused, what);
await bad({ tagline: "Hi" }, /tagline_needed/, "a one-line description under 5 letters is refused");
await bad({ tagline: "x".repeat(141) }, /tagline_needed/, "and one over 140");
await bad({ tagline: "Two\nlines" }, /tagline_needed/, "and one with a line break");
await bad({ about: "Too short." }, /about_page_needed/, "words under 20 letters are refused");
await bad({ about: "x".repeat(3001) }, /about_page_needed/, "and over 3000");
await bad({ meets: Array.from({ length: 9 }, () => ({ day: "Sundays", time: "9 am", place: "The hall" })) }, /meets_too_many/, "nine meeting rows are refused");
await bad({ meets: [{ day: "Sundays", time: "", place: "The hall" }] }, /meets_not_complete/, "a row with a day and a place but no time is refused");
await bad({ email: "a,b@c.example" }, /email_not_readable/, "an email that is a list is refused");
await bad({ phone: "call me" }, /phone_not_readable/, "a phone with letters is refused");
await bad({ website: "javascript:alert(1)" }, /website_not_readable/, "a website that is not http or https is refused");
await bad({ give_url: "http://pay.example/give" }, /give_url_not_readable/, "a link for gifts must be https");
await bad({ give_url: "https://user:pw@pay.example/give" }, /give_url_not_readable/, "and cannot carry a password");
await bad({ verse: "Not A Key!" }, /verse_not_readable/, "a verse is a key from the list, never typed words");
await bad({ photos: [{ id: "00000000-0000-4000-8000-000000000000" }] }, /photo_not_found/, "a picture that is not this ministry's is refused");
await bad({ photos: [{ id: "x" }, { id: "y" }, { id: "z" }] }, /too_many_photos/, "three pictures are refused");
const blank = await save(a1, "Alpha Table Church", "Seattle", "WA", "", draft({ meets: [{ day: "", time: "", place: "" }], email: "", phone: "", website: "", give_url: "" }));
ok(blank.state === "draft" && (await q(a1, "select lm.page_mine() as p"))[0].p.draft.meets.length === 0, "empty rows are dropped, and each contact is optional");

/* ===== 8. pictures ===== */
const p1 = await photoAdd(a1, "image/jpeg", JPEG, "The hall set for supper");
ok(!!p1, "the lead adds a picture");
ok((await refused(photoAdd(a1, "image/png", JPEG), /check|23514/)).refused, "bytes that are not what the label says are refused");
ok((await refused(photoAdd(a1, "image/gif", JPEG), /check|23514/)).refused, "a GIF is refused");
ok((await refused(photoAdd(a1, "image/jpeg", Buffer.alloc(1572865, 1)), /check|23514/)).refused, "a picture over 1.5 MB is refused");
ok((await refused(photoAdd(a2, "image/jpeg", JPEG), /lead_required/)).refused, "a member who is not a lead cannot add a picture");
ok((await refused(photoAdd(nobody, "image/jpeg", JPEG), /ministry_required/)).refused, "nor a person with no ministry");
ok((await refused(q(a1, "select bytes from lm.page_photos"), /permission denied|42501/)).refused, "no role reads the pictures table");
const get = (uid, id) => (uid ? q(uid, "select content_type, is_public from lm.photo_get($1)", [id]) : anon("select content_type, is_public from lm.photo_get($1)", [id]));
ok((await get(null, p1)).length === 0 && (await get(b1, p1)).length === 0 && (await get(a1, p1)).length === 1 && (await get(a2, p1)).length === 1, "a picture no page names is seen by its own ministry only, not the public and not another ministry");
await save(a1, "Alpha Table Church", "Seattle", "WA", "", draft({ photos: [{ id: p1, alt: "The hall set for supper" }] }), true);
ok((await get(st, p1)).length === 1 && (await get(null, p1)).length === 0, "a steward reading the waiting page sees its picture; the public does not");
await q(st, "select lm.page_review($1, true, null)", [mA]);
const g1 = await get(null, p1);
ok(g1.length === 1 && g1[0].is_public === true && g1[0].content_type === "image/jpeg", "once the page a steward read names it, the public is served the picture");
ok((await get(b1, p1)).length === 1, "(and so is every signed-in person, as it is public)");
ok((await refused(save(b1, "Alpha Table Ministry", "Spokane", "WA", "", draft({ photos: [{ id: p1 }] })), /photo_not_found/)).refused, "another ministry cannot put this picture on its own page");
const p2 = await photoAdd(a1, "image/png", PNG, "A cook");
await save(a1, "Alpha Table Church", "Seattle", "WA", "", draft({ photos: [{ id: p1, alt: "x" }, { id: p2, alt: "y" }] }), true);
ok((await get(null, p2)).length === 0, "a new picture on a change that waits is not public yet");
await admin("update lm.page_photos set created_at = now() - interval '2 hours'");
await q(st, "select lm.page_review($1, true, null)", [mA]);
ok((await get(null, p2)).length === 1, "it is public when the change is approved");
await save(a1, "Alpha Table Church", "Seattle", "WA", "", draft({ photos: [{ id: p1, alt: "x" }] }), true);
await q(st, "select lm.page_review($1, true, null)", [mA]);
ok((await admin("select count(*)::int n from lm.page_photos where id = $1", [p2]))[0].n === 0, "a picture taken off the page, once the change is approved, is thrown away");
const spare = []; for (let i = 0; i < 5; i++) spare.push(await photoAdd(a1, "image/jpeg", JPEG));
ok((await refused(photoAdd(a1, "image/jpeg", JPEG), /too_many_photos|two pictures/)).refused, "a ministry cannot pile up pictures it does not use");
ok((await admin("select count(*)::int n from lm.events where kind = 'page_photos.insert' and actor_label = 'Pat Lead'"))[0].n >= 6 && !(await admin("select payload from lm.events where kind = 'page_photos.insert' limit 1"))[0].payload.bytes, "each picture wrote an event with the lead's name, and the event does not hold the picture");

/* ===== 9. the steward's queue and the grants ===== */
await save(a1, "Alpha Table Church", "Seattle", "WA", "", draft({ tagline: "Waiting in the queue" }), true);
const queue = (await q(st, "select lm.steward_queue() as q"))[0].q;
ok(Array.isArray(queue.pages) && queue.pages.length === 1 && queue.pages[0].draft.tagline === "Waiting in the queue" && queue.pages[0].is_change === true && queue.pages[0].ministry === "Alpha Table Church", "a waiting page is in the steward's queue, marked as a change to a public page");
ok(Array.isArray(queue.ministries) && Array.isArray(queue.posts) && Array.isArray(queue.reports) && Array.isArray(queue.stewards), "and the queue still holds ministries, posts, reports and stewards");
ok((await refused(q(a1, "select lm.steward_queue()"), /steward_required/)).refused, "a lead cannot read the queue");
for (const fn of ["page_mine()", "page_save(text,text,text,text,jsonb,boolean)", "page_review(uuid,boolean,text)", "photo_add(text,bytea,text)", "page_slug_for(text)", "page_clean(uuid,jsonb)"]) ok((await admin(`select has_function_privilege('anon', 'lm.${fn}', 'execute') as x`))[0].x === false, `the public cannot run lm.${fn}`);
for (const fn of ["page_public(text)", "page_list_public()", "page_slug_of(uuid)", "photo_get(uuid)"]) ok((await admin(`select has_function_privilege('anon', 'lm.${fn}', 'execute') as x`))[0].x === true, `the public can run lm.${fn}, which answers only for what is public`);
for (const fn of ["page_slug_for(text)", "page_clean(uuid,jsonb)", "pages_guard()", "photos_guard()", "pages_leave()", "audit_photo()"]) ok((await admin(`select has_function_privilege('authenticated', 'lm.${fn}', 'execute') as x`))[0].x === false, `a signed-in person cannot run lm.${fn}`);

/* ===== 10. a ministry that leaves takes its page and pictures with it ===== */
const lone = await user("lone@example.org", "Lena Lone"); const mL = await mk(lone, "Lone Light Ministry", "Tacoma");
const pl = await photoAdd(lone, "image/png", PNG); await save(lone, "Lone Light Ministry", "Tacoma", "WA", "", draft({ photos: [{ id: pl }] }), true);
await q(lone, "select lm.account_delete()");
ok((await admin("select count(*)::int n from lm.pages where ministry_id = $1", [mL]))[0].n === 0 && (await admin("select count(*)::int n from lm.page_photos where ministry_id = $1", [mL]))[0].n === 0, "when the only person leaves, the ministry's page and its pictures are erased with it");

await pool.end();
process.exit(T.done());

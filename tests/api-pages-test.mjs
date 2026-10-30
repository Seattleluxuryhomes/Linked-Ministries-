#!/usr/bin/env node
/* tests/api-pages-test.mjs — the ministry page builder over HTTP, with the real server: a lead fills in the form and uploads a picture,
   a steward reads it, the public opens /m/<slug> signed out. A picture is checked on the server (the label is not trusted, where it was
   taken is taken out, too big and too wide are refused). The public sees only what a steward read; the lead sees a preview of the draft;
   a stranger sees nothing; the sitemap and the board follow.   LEXOS_DB_NAME=linkedm_t_<mine> node tests/api-pages-test.mjs */
import { counter, ownDatabase, startServer, client, signIn, sleep } from "./helpers.mjs";
import { checkPage } from "./banned.mjs";
import { makeJpeg, makePng, SECRET } from "./fixtures.mjs";
import { cleanPhoto } from "../lib/photo.mjs";

const T = counter("api-pages-test"); const { ok } = T;
const db = await ownDatabase("api_pages");
const { pool } = await import("../server/db.mjs");
const sql = async (s, p = []) => (await pool.query(s, p)).rows;
const s = await startServer({ url: db.url });
ok(s.up, "the server is up", s.logText().slice(-300));
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/* ---- the picture reader, alone ---- */
{ const j = cleanPhoto(makeJpeg()); ok(j.ok && j.type === "image/jpeg" && j.width === 800 && j.height === 600 && !j.bytes.includes(SECRET) && !j.bytes.includes("a comment") && j.bytes.includes("JFIF"), "a JPEG keeps its picture and loses the note about where it was taken and its comment");
  const p = cleanPhoto(makePng()); ok(p.ok && p.type === "image/png" && p.width === 640 && !p.bytes.includes(SECRET) && p.bytes.includes("IEND"), "a PNG loses its text chunk");
  ok(!cleanPhoto(Buffer.from("not a picture at all, just words ".repeat(10))).ok && cleanPhoto(Buffer.alloc(10)).code === "not_a_picture", "words are not a picture");
  ok(cleanPhoto(Buffer.alloc(1572865, 0xff)).code === "photo_too_big", "a picture over 1.5 MB is refused");
  ok(cleanPhoto(makeJpeg({ w: 9000, h: 100 })).code === "photo_too_wide" && cleanPhoto(makePng({ w: 100, h: 20000 })).code === "photo_too_wide", "and one over 8000 pixels on a side");
  const cut = makeJpeg().subarray(0, 60); ok(!cleanPhoto(Buffer.concat([cut, Buffer.alloc(80)])).ok, "a cut-off JPEG is refused"); }

const anon = client(s.base);
const alex = client(s.base), blake = client(s.base), sam = client(s.base), pat = client(s.base);
for (const [c, em] of [[alex, "alex@alpha.example"], [blake, "blake@bravo.example"], [sam, "sam@linkedm.example"], [pat, "pat@alpha.example"]]) await signIn(c, s, em);
await sql("select lm.make_steward('sam@linkedm.example')");
const base0 = { name: "Alpha Table Ministry", city: "Seattle", state: "WA", about: "We feed neighbors every week and run a small youth night.", contact_name: "Alex Rivera", contact_email: "alex@alpha.example", website: "" };
ok((await alex.post("/api/ministry", base0)).status === 201 && (await blake.post("/api/ministry", { ...base0, name: "Bravo House Ministry", city: "Spokane", contact_email: "blake@bravo.example" })).status === 201, "two ministries join");
const mid = (await alex.get("/api/me")).json.ministry.id;
const form = { name: "Alpha Table Ministry", city: "Seattle", state: "WA", slug: "", tagline: "A hot meal every Saturday for our neighbors", about: "We serve a hot meal at noon every Saturday.\nEveryone is welcome. <script>alert(1)</script> We also run a youth night.",
  meets: [{ day: "Saturdays", time: "12:00 pm", place: "Grace Hall, 12 Main St" }, { day: "Thursdays", time: "6:30 pm", place: "The church basement" }], email: "hello@alpha.example", phone: "206-555-0100", website: "https://alpha.example.org", give_url: "https://pay.alpha.example/give", verse: "isa_58_7", photos: [] };

/* ---- before anything: signed out is signed out ---- */
ok((await anon.get("/api/page")).status === 401 && (await anon.post("/api/page", form)).status === 401, "the page builder needs a sign-in");
{ const r = await fetch(s.base + "/api/page/photos", { method: "POST", headers: { "content-type": "image/jpeg" }, body: makeJpeg() }); ok(r.status === 401, "and so does uploading a picture"); }
const g0 = await alex.get("/api/page");
ok(g0.status === 200 && g0.json.exists === false && g0.json.suggested_slug === "alpha-table-ministry" && g0.json.verses.length >= 5 && g0.json.verses.every((v) => v.key && v.ref && v.text), "a lead is offered an address chosen from the name, and the verses to pick from", g0.json);
ok((await anon.get("/m/alpha-table-ministry")).status === 404, "no page at the address yet");

/* ---- the form's own refusals, in words ---- */
for (const [patch, status, re, what] of [[{ tagline: "Hi" }, 422, /one line/, "a one-letter tagline"], [{ about: "short" }, 422, /20 letters/, "words that are too short"], [{ email: "a,b@c.example" }, 422, /email/i, "an email that is a list"],
  [{ verse: "my_own_verse" }, 422, /verse/i, "a verse that is not in the list"], [{ give_url: "http://pay.example" }, 422, /https/, "an http link for gifts"], [{ state: "ZZ" }, 422, /state/i, "an unknown state"], [{ website: "javascript:alert(1)" }, 422, /website|http/i, "a website that is not http"]]) {
  const r = await alex.post("/api/page", { ...form, ...patch }); ok(r.status === status && re.test(r.json.words || ""), `${what} is refused, in plain words`, r.json); }
ok((await pat.post("/api/page", form)).status === 409, "a person with no ministry cannot make a page");

/* ---- a picture ---- */
const upload = async (c, body, type = "image/jpeg", q = "") => { const r = await fetch(s.base + "/api/page/photos" + q, { method: "POST", headers: { "content-type": type, cookie: c.jar() }, body }); let j = null; try { j = await r.json(); } catch (e) { /* none */ } return { status: r.status, json: j }; };
const bad1 = await upload(alex, Buffer.from("this is just text ".repeat(20)));
ok(bad1.status === 422 && /JPEG or a PNG/.test(bad1.json.words), "text labelled as a JPEG is refused: the bytes are checked, not the label", bad1.json);
ok((await upload(alex, Buffer.alloc(1700000, 0xff))).status === 413, "a picture over 1.5 MB is refused with 413");
ok((await upload(alex, makeJpeg({ w: 9000, h: 10 }))).status === 422, "a picture over 8000 pixels is refused");
ok((await upload(alex, "plain", "text/plain")).status === 415, "a file that is not a picture type is refused with 415");
{ const r = await fetch(s.base + "/api/page/photos", { method: "POST", headers: { "content-type": "image/jpeg", cookie: alex.jar(), origin: "https://evil.example" }, body: makeJpeg() }); ok(r.status === 403, "a picture sent from another website is refused (same-origin lock)"); }
ok((await upload(pat, makeJpeg())).status === 409, "a person with no ministry cannot add a picture");
const up = await upload(alex, makeJpeg(), "image/jpeg", "?alt=" + encodeURIComponent("The hall set for supper"));
ok(up.status === 201 && /^[0-9a-f-]{36}$/.test(up.json.id), "a good picture is kept", up.json);
const up2 = await upload(alex, makePng(), "image/png");
ok(up2.status === 201, "a PNG too");
const own = await fetch(s.base + "/photos/" + up.json.id, { headers: { cookie: alex.jar() } }); const ownBytes = Buffer.from(await own.arrayBuffer());
ok(own.status === 200 && own.headers.get("content-type") === "image/jpeg" && /private/.test(own.headers.get("cache-control")) && !ownBytes.includes(SECRET) && ownBytes[0] === 0xff, "the lead gets the picture back, cleaned of where it was taken, and not cached by anyone else");
ok((await fetch(s.base + "/photos/" + up.json.id)).status === 404 && (await fetch(s.base + "/photos/" + up.json.id, { headers: { cookie: blake.jar() } })).status === 404 && (await fetch(s.base + "/photos/not-an-id")).status === 404, "the public and another ministry are told there is no such picture while no page names it");

/* ---- save a draft, preview it, nobody else sees it ---- */
const sv = await alex.post("/api/page", { ...form, photos: [{ id: up.json.id, alt: "The hall set for supper" }, { id: up2.json.id, alt: "" }] });
ok(sv.status === 200 && sv.json.state === "draft" && sv.json.slug === "alpha-table-ministry", "the form saves a draft at the address chosen from the name", sv.json);
const prev = await alex.get("/m/alpha-table-ministry");
ok(prev.status === 200 && /Only your ministry can see this/.test(prev.text) && /noindex/.test(prev.text) && /private/.test(prev.headers.get("cache-control")) && /A hot meal every Saturday/.test(prev.text), "the lead can open a preview of the draft, marked private and never indexed");
ok((await anon.get("/m/alpha-table-ministry")).status === 404 && (await blake.get("/m/alpha-table-ministry")).status === 404, "the public and another ministry get 404 for a draft");
ok(!(await anon.get("/sitemap.xml")).text.includes("/m/"), "a draft is not in the sitemap");
const sub = await alex.post("/api/page", { ...form, photos: [{ id: up.json.id, alt: "The hall set for supper" }, { id: up2.json.id, alt: "" }], submit: true });
ok(sub.json.state === "waiting", "sent to be read, it waits");
const gw = await alex.get("/api/page");
ok(gw.json.state === "waiting" && gw.json.public === false && gw.json.draft.photos.length === 2, "the lead reads: waiting, not public");

/* ---- the steward ---- */
const q1 = await sam.get("/api/steward/queue");
ok(q1.status === 200 && q1.json.pages.length === 1 && q1.json.pages[0].draft.tagline === form.tagline && q1.json.pages[0].ministry_status === "waiting", "the steward's queue holds the page, and says its ministry has not been read yet");
ok((await alex.get("/api/steward/queue")).status === 403 && (await alex.post(`/api/steward/pages/${mid}/review`, { decision: "approve" })).status === 403, "a lead cannot read the queue or approve their own page");
const early = await sam.post(`/api/steward/pages/${mid}/review`, { decision: "approve" });
ok(early.status === 409 && /Read the ministry first/.test(early.json.words), "the steward cannot make the page public before reading the ministry", early.json);
ok((await sam.post(`/api/steward/ministries/${mid}/review`, { decision: "approve" })).status === 200, "the steward reads the ministry");
ok((await fetch(s.base + "/photos/" + up.json.id, { headers: { cookie: sam.jar() } })).status === 200 && (await fetch(s.base + "/photos/" + up.json.id)).status === 404, "a steward can see the waiting page's picture; the public cannot");
ok((await sam.post(`/api/steward/pages/${mid}/review`, { decision: "send_back" })).status === 422, "sending back needs a note");
ok((await sam.post(`/api/steward/pages/${mid}/review`, { decision: "send_back", note: "Please add the church's street." })).status === 200, "the steward sends it back with a note");
ok((await alex.get("/api/page")).json.review_note === "Please add the church's street.", "the lead reads the note");
await alex.post("/api/page", { ...form, photos: [{ id: up.json.id, alt: "The hall set for supper" }, { id: up2.json.id, alt: "" }], submit: true });
ok((await sam.post(`/api/steward/pages/${mid}/review`, { decision: "approve" })).status === 200, "the steward approves");

/* ---- the public, signed out ---- */
const pub = await anon.get("/m/alpha-table-ministry");
ok(pub.status === 200, "the public page answers 200 signed out");
const bad = checkPage(pub.text); ok(bad.length === 0, "the page carries nothing banned: no inline script, no style attribute, no other host", bad);
ok(/<h1>Alpha Table Ministry<\/h1>/.test(pub.text) && /A hot meal every Saturday for our neighbors/.test(pub.text) && /Seattle, WA/.test(pub.text), "it shows the name, the one line and the town");
ok(/Saturdays/.test(pub.text) && /12:00 pm/.test(pub.text) && /Grace Hall, 12 Main St/.test(pub.text) && /Thursdays/.test(pub.text), "it lists where and when the ministry meets");
ok(/mailto:hello@alpha\.example/.test(pub.text) && /href="tel:2065550100"/.test(pub.text) && /alpha\.example\.org/.test(pub.text), "it shows the email, the phone and the website the ministry chose to show");
ok(!/alex@alpha\.example|Alex Rivera/.test(pub.text), "and not the private contact name or email");
ok(!/<script>alert/.test(pub.text) && /&lt;script&gt;alert\(1\)&lt;\/script&gt;/.test(pub.text), "words a person typed are text, never markup");
ok(/<img src="\/photos\/[0-9a-f-]{36}" alt="The hall set for supper"/.test(pub.text) && /alt="A picture from Alpha Table Ministry"/.test(pub.text), "the pictures are there, with the words that describe them (or a plain default)");
ok(/Isaiah 58:7/.test(pub.text) && /class="scripture"/.test(pub.text), "the verse the ministry chose is shown with its chapter and verse");
ok(!/Make a donation to Alpha/.test(pub.text) && !/pay\.alpha\.example/.test(pub.text), "there is no Give button while the giving door is closed, and the ministry's link is not on the page");
ok(/<title>Alpha Table Ministry · Linked Ministries<\/title>/.test(pub.text) && /<meta name="description" content="A hot meal every Saturday for our neighbors Seattle, WA\.">/.test(pub.text), "it has its own title and description");
ok(/og:title" content="Alpha Table Ministry · Seattle, WA"/.test(pub.text) && /og:image" content="[^"]*\/photos\/[0-9a-f-]{36}"/.test(pub.text) && /og:type" content="profile"/.test(pub.text) && !/noindex/.test(pub.text), "it has its own share card, with the ministry's first picture, and may be indexed");
ok(/A person at Linked Ministries read this page on/.test(pub.text) && /does not check or vouch/.test(pub.text) && /911/.test(pub.text), "it says a person read it, that Linked Ministries does not vouch, and the emergency line");
ok(/public/.test((await anon.get("/photos/" + up.json.id)).headers.get("cache-control") || "") && (await anon.get("/photos/" + up.json.id)).status === 200, "the picture is now served to the public, and may be cached");
ok((await anon.get("/m/ALPHA-TABLE-MINISTRY")).status === 200 && (await anon.get("/m/no-such-page")).status === 404 && (await anon.get("/m/bad%20slug")).status === 404 && (await anon.get("/m/" + "a".repeat(80))).status === 404, "the address is read in lower case; an unknown or malformed one is a 404");
const sm = (await anon.get("/sitemap.xml")).text;
ok(sm.includes("/m/alpha-table-ministry</loc>") && !sm.includes("bravo"), "the sitemap lists the public page and no one else's");
ok(/Disallow: \/me/.test((await anon.get("/robots.txt")).text) && !/Disallow: \/m\b/.test((await anon.get("/robots.txt")).text), "robots keeps the private pages out and lets /m in");

/* ---- the board follows ---- */
const pid = (await alex.post("/api/posts", { kind: "ask", category: "furniture", title: "Ten folding tables, please", body: "We need ten tables for the Saturday meal near the church.", open_until: day(30), submit: true })).json.id;
await sam.post(`/api/steward/posts/${pid}/review`, { decision: "approve" });
const board = await anon.get("/board");
ok(/<a href="\/m\/alpha-table-ministry">Alpha Table Ministry<\/a>/.test(board.text), "on the board, a ministry with a public page links its name to it");
ok((await anon.get("/api/board")).json.posts[0].page_slug === "alpha-table-ministry", "and the board's data names the page");

/* ---- an edit waits; the public keeps the copy that was read ---- */
const ed = await alex.post("/api/page", { ...form, tagline: "A different line nobody has read", photos: [{ id: up.json.id, alt: "The hall set for supper" }], submit: true });
ok(ed.json.state === "waiting", "an edit to a public page waits");
ok(/A hot meal every Saturday for our neighbors/.test((await anon.get("/m/alpha-table-ministry")).text) && !/nobody has read/.test((await anon.get("/m/alpha-table-ministry")).text), "and the public still reads the copy a steward read");
ok(/nobody has read/.test((await alex.get("/m/alpha-table-ministry")).text) === false, "(the public page is the same for its lead; the preview is for a page that is not public yet)");
const gm = await alex.get("/api/page"); ok(gm.json.public === true && gm.json.state === "waiting" && gm.json.has_live === true, "the lead is told the page is public and a change is waiting");
ok((await alex.post("/api/page", { ...form, slug: "new-address", tagline: "x".repeat(10) })).status === 409, "the address is final once the page has been public");

/* ---- the ministry's public name sends it back ---- */
await sam.post(`/api/steward/pages/${mid}/review`, { decision: "approve" });
const rn = await alex.post("/api/page", { ...form, name: "Alpha Table Church", photos: [{ id: up.json.id, alt: "x" }], tagline: "A different line nobody has read" });
ok(rn.status === 200 && (await alex.get("/api/me")).json.ministry.status === "waiting", "changing the public name in the page form sends the ministry back to be read");
ok((await anon.get("/m/alpha-table-ministry")).status === 404 && !(await anon.get("/sitemap.xml")).text.includes("/m/alpha"), "and the page is gone from the public and the sitemap until it is read again");
await sam.post(`/api/steward/ministries/${mid}/review`, { decision: "approve" });
ok((await anon.get("/m/alpha-table-ministry")).status === 200 && /Alpha Table Church/.test((await anon.get("/m/alpha-table-ministry")).text), "it returns under the new name when a steward has read the ministry");

/* ---- the record ---- */
const evs = await sql("select kind, actor_label, payload from lm.events where kind in ('pages.insert','pages.update','page.approved','page.sent_back','page_photos.insert')");
ok(evs.length >= 6 && evs.every((e) => e.actor_label && e.actor_label !== "system") && !JSON.stringify(evs).includes("folding") && !JSON.stringify(evs).includes("hot meal") && !JSON.stringify(evs).includes(SECRET), "every act on the page wrote an event with a name on it, and none holds the words or a picture");

await pool.end(); await s.stop();
process.exit(T.done());

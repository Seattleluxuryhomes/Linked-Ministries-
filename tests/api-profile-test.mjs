#!/usr/bin/env node
/* tests/api-profile-test.mjs — a ministry's profile and the ladder to Verified (migration 0013, founder 2026-11-22: "the LinkedIn for Ministry
   ... from just started to pending to all the way to verified. Like Instagram without paying"). The profile goes through the same reading as the
   rest of the page; the badge is decided by a person on the team who writes what they checked, never by the ministry and never by a machine; the
   number on the papers is never public; a change of name takes the badge off. /start is the plain step-by-step guide.
   LEXOS_DB_NAME=linkedm_t_<mine> node tests/api-profile-test.mjs */
import { counter, ownDatabase, startServer, client, signIn } from "./helpers.mjs";
import { checkPage } from "./banned.mjs";

const T = counter("api-profile-test"); const { ok } = T;
const db = await ownDatabase("api_profile");
const { pool } = await import("../server/db.mjs");
const sql = async (s, p = []) => (await pool.query(s, p)).rows;
const s = await startServer({ url: db.url });
ok(s.up, "the server is up", s.logText().slice(-300));

const anon = client(s.base), ada = client(s.base), sam = client(s.base), kim = client(s.base);
for (const [c, em] of [[ada, "ada@lagos.example"], [sam, "sam@linkedm.example"], [kim, "kim@linkedm.example"]]) await signIn(c, s, em);
await sql("select lm.make_steward('sam@linkedm.example')");
ok((await ada.post("/api/ministry", { name: "Lagos Hope Fellowship", city: "Lagos", country: "NG", about: "We care for families who lost their homes, and we pray together every week.", contact_name: "Ada Okafor", contact_email: "ada@lagos.example", website: "" })).status === 201, "a ministry joins");
const mid = (await ada.get("/api/me")).json.ministry.id;

/* the ladder before anyone has read the ministry */
{ const v = await ada.get("/api/verify"); ok(v.status === 200 && v.json.state === "none" && v.json.status === "waiting", "the ladder starts at Joined, waiting to be read", v.json); }
{ const r = await ada.post("/api/verify", { form: "ng_incorporated_trustees", number: "IT-123456" }); ok(r.status >= 400 && /reads your ministry first/.test(r.json.words), "the badge cannot be asked for before a person reads the ministry", r.json); }
await sam.post(`/api/steward/ministries/${mid}/review`, { decision: "approve" });

/* the profile, with the page */
const page = { name: "Lagos Hope Fellowship", city: "Lagos", state: "", slug: "", tagline: "Homes and prayer for families who lost everything", about: "We help families rebuild after attacks on their village. We meet every Sunday to pray.",
  meets: [], email: "", phone: "", website: "", give_url: "", verse: "", photos: [],
  leader_name: "Ada Okafor", leader_role: "Pastor", leader_bio: "Ada has led the fellowship since it began, after her own village was attacked.", mission: "We stand with families who lost their homes for their faith, until they are home again.",
  beliefs: "We believe Jesus Christ is Lord, that the Bible is God's word, and that the church cares for the hurting.", denomination: "Pentecostal", founded: "2016",
  serves: "Families who lost their homes", languages: "Hausa, English", focus: ["persecuted", "housing", "prayer", "not-a-focus"] };
for (const [patch, re, what] of [[{ founded: "1066" }, /year/i, "a year before 1500"], [{ founded: "2999" }, /year/i, "a year still to come"], [{ leader_name: "", leader_role: "Pastor" }, /leader/i, "a role with no leader's name"],
  [{ mission: "short" }, /stand for/i, "a mission of five letters"]]) {
  const r = await ada.post("/api/page", { ...page, ...patch, submit: false }); ok(r.status === 422 && re.test(r.json.words || ""), `${what} is refused in plain words`, r.json);
}
{ const r = await ada.post("/api/page", { ...page, submit: true }); ok(r.status === 200 && r.json.state === "waiting", "the page and its profile are sent to be read", r.json); }
ok(!/Ada Okafor/.test((await anon.get("/ministries")).text), "the profile is not public before a person reads it");
await sam.post(`/api/steward/pages/${mid}/review`, { decision: "approve" });
{ const p = await anon.get("/m/lagos-hope-fellowship");
  ok(/Who leads us/.test(p.text) && /Ada Okafor/.test(p.text) && /Pastor/.test(p.text) && /What we stand for/.test(p.text) && /until they are home again/.test(p.text) && /What we believe/.test(p.text), "the page shows who leads it, what it stands for and what it believes");
  ok(/Church family/.test(p.text) && /Pentecostal/.test(p.text) && /Started/.test(p.text) && /2016/.test(p.text) && /Persecuted church/.test(p.text) && /Hausa, English/.test(p.text), "and the basics: church family, year, languages, and what it does");
  ok(!/not-a-focus/.test(p.text), "a focus that is not on the list is dropped");
  ok(!/vbadge/.test(p.text) && /does not check or vouch/.test(p.text), "no badge yet, and the page says Linked Ministries has not checked it");
  const v = checkPage(p.text); ok(!v.length, "the page passes the page rules", v); }
{ const d = await anon.get("/ministries"); ok(/Pentecostal/.test(d.text) && /Led by Ada Okafor, Pastor/.test(d.text) && /Persecuted church/.test(d.text), "the list of ministries shows the church family, the leader and what it does"); }

/* the ladder: ask, then a person decides */
{ const r = await ada.post("/api/verify", { form: "us_501c3", number: "" }); ok(r.status === 422 && /number/i.test(r.json.words), "a 501(c)(3) needs the number on its papers", r.json); }
{ const r = await ada.post("/api/verify", { form: "ng_incorporated_trustees", number: "IT-123456", message: "Our CAC certificate is on our wall; call the pastor." }); ok(r.status === 200 && r.json.state === "requested", "the lead asks for the badge", r.json); }
ok((await ada.get("/api/verify")).json.state === "requested", "the ladder says Papers sent");
ok((await ada.get("/api/steward/verify")).status === 403, "a lead cannot read the team's list");
const q = (await sam.get("/api/steward/verify")).json;
ok(q.requested.length === 1 && q.requested[0].number === "IT-123456" && q.requested[0].form === "ng_incorporated_trustees", "the team sees the request, with the number on the papers");
ok(!/IT-123456/.test((await anon.get("/m/lagos-hope-fellowship")).text) && !/IT-123456/.test((await anon.get("/ministries")).text), "the number is never public");
{ const r = await sam.post(`/api/steward/verify/${mid}`, { decision: "verify", checked: "ok" }); ok(r.status === 422 && /what you checked/i.test(r.json.words), "the badge needs a line saying what was checked", r.json); }
{ const r = await sam.post(`/api/steward/verify/${mid}`, { decision: "not_yet", note: "" }); ok(r.status >= 400 && /note/i.test(r.json.words), "not yet needs a note", r.json); }
{ const r = await sam.post(`/api/steward/verify/${mid}`, { decision: "verify", checked: "CAC public search shows Lagos Hope Fellowship, IT-123456, active." }); ok(r.status === 200 && r.json.state === "verified", "a person on the team gives the badge", r.json); }
{ const p = await anon.get("/m/lagos-hope-fellowship");
  ok(/vbadge/.test(p.text) && /Verified/.test(p.text) && /checked this ministry's papers on/.test(p.text) && /CAC public search shows/.test(p.text) && /does not mean Linked Ministries vouches/.test(p.text), "the page shows the badge, the day, what was checked, and what it does not mean"); }
ok(/vbadge/.test((await anon.get("/ministries")).text), "the list shows the badge");
ok((await ada.get("/api/verify")).json.state === "verified", "the ladder says Verified");
const ev = await sql("select kind, actor_label from lm.events where kind like 'verify.%' order by created_at");
ok(ev.map((x) => x.kind).join() === "verify.requested,verify.granted" && ev.every((x) => x.actor_label && x.actor_label !== "system"), "each step wrote an event with a name on it", ev);
ok(!JSON.stringify(await sql("select payload from lm.events")).includes("IT-123456"), "no event holds the number");

/* a person cannot verify their own ministry */
await sql("select lm.make_steward('ada@lagos.example')");
await sql("update lm.ministries set verify_state = 'requested', verify_checked = null, verified_at = null, verified_by = null where id = $1", [mid]);
{ const r = await ada.post(`/api/steward/verify/${mid}`, { decision: "verify", checked: "I checked my own papers myself." }); ok(r.status >= 400 && /your own ministry/i.test(r.json.words), "a team member cannot give their own ministry the badge", r.json); }
await sam.post(`/api/steward/verify/${mid}`, { decision: "verify", checked: "CAC public search shows Lagos Hope Fellowship, IT-123456, active." });

/* a new name takes the badge off */
await ada.post("/api/ministry/update", { name: "Lagos Hope Church", city: "Lagos", country: "NG", about: "We care for families who lost their homes, and we pray together every week.", contact_name: "Ada Okafor", contact_email: "ada@lagos.example", website: "" });
{ const v = (await ada.get("/api/verify")).json; ok(v.state === "none" && /name or country changed/.test(v.note || ""), "changing the name takes the badge off, and says why", v); }

/* the guide */
{ const g = await anon.get("/start"); ok(g.status === 200 && /Set up your ministry, step by step/.test(g.text) && /Form 1023-EZ/.test(g.text) && /\$275/.test(g.text) && /Get an EIN/.test(g.text) && /Incorporated Trustees/.test(g.text) && /not legal or tax advice/.test(g.text), "/start is the plain guide: the US steps, Nigeria's, and that it is not legal advice");
  const v = checkPage(g.text, { money: true }); ok(!v.length, "the guide passes the page rules", v); }

await pool.end(); await s.stop();
process.exit(T.done());

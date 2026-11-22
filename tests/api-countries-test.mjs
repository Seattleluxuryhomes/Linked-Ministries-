#!/usr/bin/env node
/* tests/api-countries-test.mjs — a ministry in any country (migration 0012, founder 2026-11-22: "these countries and Ministries can
   showcase their websites and their need lists"). A ministry in Nigeria joins with a country and no state, a person on the team reads it,
   it makes its page and posts an ask; /ministries lists it under Nigeria with its page and its need; its page says "What we need now";
   the board filters by country. A US ministry still needs a state. Nothing waiting or private reaches the public list.
   LEXOS_DB_NAME=linkedm_t_<mine> node tests/api-countries-test.mjs */
import { counter, ownDatabase, startServer, client, signIn } from "./helpers.mjs";
import { checkPage } from "./banned.mjs";
import { placeWords, countryName, COUNTRY_CODES } from "../public/js/pure.js";

const T = counter("api-countries-test"); const { ok } = T;
const db = await ownDatabase("api_countries");
const { pool } = await import("../server/db.mjs");
const sql = async (s, p = []) => (await pool.query(s, p)).rows;
const s = await startServer({ url: db.url });
ok(s.up, "the server is up", s.logText().slice(-300));
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/* ---- the words, alone ---- */
ok(placeWords("Seattle", "WA", "US") === "Seattle, WA" && placeWords("Lagos", "", "NG") === "Lagos, Nigeria" && placeWords("Lahore", "", "PK") === "Lahore, Pakistan" && placeWords("Lagos", "") === "Lagos", "a place reads 'Seattle, WA' in the US and 'Lagos, Nigeria' elsewhere");
ok(COUNTRY_CODES.length > 200 && countryName("NG") === "Nigeria" && countryName("PK") === "Pakistan" && COUNTRY_CODES.includes("US"), "the country list has every country, Nigeria and Pakistan by name");

const anon = client(s.base), ada = client(s.base), alex = client(s.base), sam = client(s.base);
for (const [c, em] of [[ada, "ada@lagos.example"], [alex, "alex@alpha.example"], [sam, "sam@linkedm.example"]]) await signIn(c, s, em);
await sql("select lm.make_steward('sam@linkedm.example')");

const lagos = { name: "Lagos Hope Fellowship", city: "Lagos", country: "NG", state: "", about: "We care for families who lost their homes to violence, and we meet to pray every week.", contact_name: "Ada Okafor", contact_email: "ada@lagos.example", website: "" };
{ const r = await alex.post("/api/ministry", { ...lagos, name: "Alpha Table Ministry", city: "Seattle", country: "US", state: "", contact_email: "alex@alpha.example" }); ok(r.status === 422 && /state/i.test(r.json.words), "a US ministry still has to choose its state", r.json); }
{ const r = await alex.post("/api/ministry", { ...lagos, country: "ZZ" }); ok(r.status === 422 && /country/i.test(r.json.words), "a country that is not on the list is refused", r.json); }
ok((await alex.post("/api/ministry", { name: "Alpha Table Ministry", city: "Seattle", state: "WA", about: "We feed neighbors every week and run a small youth night.", contact_name: "Alex Rivera", contact_email: "alex@alpha.example", website: "" })).status === 201, "a US ministry joins the old way, with no country sent (it is the US)");
ok((await ada.post("/api/ministry", { ...lagos, state: "WA" })).status === 201, "a ministry in Nigeria joins with its country (a state sent by mistake is dropped)");
const me = (await ada.get("/api/me")).json.ministry;
ok(me.country === "NG" && me.state === "" && me.city === "Lagos", "it is held as Lagos, Nigeria, with no state", me);
const alexMe = (await alex.get("/api/me")).json.ministry;
ok(alexMe.country === "US" && alexMe.state === "WA", "the US ministry is held as before");

/* waiting: nothing public yet */
ok(!/Lagos Hope/.test((await anon.get("/ministries")).text), "a ministry nobody has read is not on the Ministries page");
for (const m of [me.id, alexMe.id]) ok((await sam.post(`/api/steward/ministries/${m}/review`, { decision: "approve" })).status === 200, "a person on the team reads a ministry");

/* its page and its ask */
const page = { name: lagos.name, city: "Lagos", state: "", slug: "", tagline: "Homes and prayer for families who lost everything", about: "We help families rebuild after attacks on their village. We meet every Sunday to pray together.", meets: [], email: "", phone: "", website: "", give_url: "https://give.lagos.example/now", verse: "", photos: [], submit: true };
{ const r = await ada.post("/api/page", page); ok(r.status === 200 && r.json.state === "waiting", "the Nigerian ministry sends its page to be read (no state needed)", r.json); }
ok((await sam.post(`/api/steward/pages/${me.id}/review`, { decision: "approve" })).status === 200, "a person on the team reads the page");
{ const r = await alex.post("/api/page", { ...page, name: "Alpha Table Ministry", city: "Seattle", state: "", tagline: "A hot meal every Saturday for our neighbors", give_url: "" }); ok(r.status === 200, "a US ministry's page form with no state keeps the ministry's own state", r.json);
  ok((await sql("select state, country, status from lm.ministries where id = $1", [alexMe.id]))[0].state === "WA", "and the state is still WA"); }
const ask = (await ada.post("/api/posts", { kind: "ask", category: "housing", title: "Roofing sheets for three homes", body: "Three families need new roofs before the rains. Sheets and nails would let us rebuild.", open_until: day(30), submit: true })).json;
ok(ask && ask.id, "the Nigerian ministry posts an ask", ask);
await sam.post(`/api/steward/posts/${ask.id}/review`, { decision: "approve" });
ok((await sql("select state from lm.posts where id = $1", [ask.id]))[0].state === "", "its post has no state");

/* the public list, by country */
const dir = await anon.get("/ministries");
ok(dir.status === 200 && /Nigeria/.test(dir.text) && /Lagos Hope Fellowship/.test(dir.text) && /Lagos, Nigeria/.test(dir.text) && /Roofing sheets for three homes/.test(dir.text) && /href="\/m\/lagos-hope-fellowship"/.test(dir.text), "/ministries lists it under Nigeria, with its place, its page and what it needs now");
ok(/United States/.test(dir.text) && /Alpha Table Ministry/.test(dir.text), "and the US ministry under the United States");
ok(!/give\.lagos\.example/.test(dir.text), "a ministry's donation link is not shown while the giving door is closed");
{ const v = checkPage(dir.text); ok(!v.length, "/ministries passes the page rules (no banned words, the two lines, light only)", v); }
{ const only = await anon.get("/ministries?country=NG"); ok(/Lagos Hope/.test(only.text) && !/Alpha Table Ministry<\/a><\/h3>/.test(only.text), "the list can show one country"); }
{ const none = await anon.get("/ministries?country=PK"); ok(/No ministries in Pakistan yet/.test(none.text) && /Join the network/.test(none.text), "a country with none says so and offers the way in"); }
{ const mp = await anon.get("/m/lagos-hope-fellowship"); ok(/What we need now/.test(mp.text) && /Roofing sheets for three homes/.test(mp.text) && /Lagos, Nigeria/.test(mp.text), "the ministry's own page lists what it needs now, and says Lagos, Nigeria"); const v = checkPage(mp.text); ok(!v.length, "the page passes the page rules", v); }
{ const b = await anon.get("/board?country=NG"); ok(/Roofing sheets/.test(b.text) && !/Alpha Table/.test(b.text) && /Lagos, Nigeria/.test(b.text), "the board filters by country"); }
ok(/<a href="\/ministries"/.test((await anon.get("/")).text), "every page links to Ministries");
ok(/\/ministries</.test((await anon.get("/sitemap.xml")).text), "the sitemap lists /ministries");

/* the giving door opens: the ministry's own link shows on the list */
await sql("update lm.giving_settings set registration_number = '604000000', registration_date = current_date - 1, door_open = true");
ok(/href="https:\/\/give\.lagos\.example\/now"/.test((await anon.get("/ministries")).text), "with the giving door open, the ministry's own donation link is on the list");

/* moving country sends a public ministry back to be read */
{ const r = await ada.post("/api/ministry/update", { ...lagos, country: "GH", city: "Accra" }); ok(r.status === 200 && r.json.status === "waiting", "moving to another country sends the ministry back to be read", r.json);
  ok(!/Lagos Hope/.test((await anon.get("/ministries")).text), "and it leaves the public list until a person reads it again"); }

await pool.end(); await s.stop();
process.exit(T.done());

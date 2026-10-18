#!/usr/bin/env node
/* tests/browser-eden-free-test.mjs — Eden's free box in a real Chromium, a phone at 390 and a desk at 1440, with a stand-in for the model on
   this machine (so nothing spends money or reaches the internet).
   Signed in, with no form open, a tap on the orb shows a box labelled "Say what to draft", a Draft button, and the 911 and 988 line. A
   person types what they want; the page sends exactly one request to /api/eden, and it holds { job: "freeform", fields: { words } } and
   nothing else. The server picks the kind. The panel shows the draft with the mark, the kind in words, and one button: "Use this in a new
   ask", "Use this in a new give" or "Copy letter". The button opens the form on /me with the title and words in it; nothing is saved
   until the form's own Save. From any other page the same button travels to /me. Danger-to-life words show 911 and 988 and call no model.
   Inside a form the box is above the form's own writing. No panel, in any state, ever holds the word "null" or "undefined".
   LM_SHOTS=<dir> writes the screenshots.   LEXOS_DB_NAME=linkedm_t_<mine> node tests/browser-eden-free-test.mjs */
import { counter, ownDatabase, startServer, client, signIn, modelStandIn } from "./helpers.mjs";
import { launch, open, noSideways, lightCheck, SHOTS, shots } from "./browser-lib.mjs";

const T = counter("browser-eden-free-test"); const { ok } = T;
const db = await ownDatabase("browser_eden_free"); const model = await modelStandIn();
const KEY = "sk-test-not-a-real-key-0123456789";
const s = await startServer({ url: db.url, env: { ANTHROPIC_API_KEY: KEY, ANTHROPIC_BASE_URL: model.url, EDEN_LIMIT_HOUR: "1000", EDEN_LIMIT_DAY: "1000" } });
const s0 = await startServer({ url: db.url, env: { ANTHROPIC_API_KEY: "", ANTHROPIC_BASE_URL: model.url } });
ok(s.up && s0.up, "the servers are up");
const { pool } = await import("../server/db.mjs");
const browser = await launch(); const snap = shots(SHOTS);
const asCookie = (c, base) => { const kv = c.jar().split("=", 2); return { name: kv[0], value: c.jar().slice(kv[0].length + 1), url: base }; };
const lead = client(s.base), tess = client(s.base), pat = client(s.base), lead0 = client(s0.base);
await signIn(lead, s, "lead@free.example"); await signIn(tess, s, "tess@linkedm.example"); await signIn(pat, s, "pat@free.example"); await signIn(lead0, s0, "lead@free.example");
for (const [c, em] of [[lead, "lead@free.example"], [lead0, "lead@free.example"]]) await c.post("/api/ministry", { name: "Free Box Ministry", city: "Seattle", state: "WA", about: "We feed neighbors every week and run a small youth night.", contact_name: "Lee Lead", contact_email: em, website: "" });
await pool.query("select lm.make_treasurer('tess@linkedm.example')");
const myPosts = async () => (await lead.get("/api/my/posts")).json.posts.length;
const STRAY = /\bnull\b|\bundefined\b|\[object/i;
const stray = async (page, label) => { const t = await page.locator("[data-eden-panel]").innerText(); ok(!STRAY.test(t), `${label}: the panel holds no "null" or "undefined"`, t.slice(-160)); };
const panelOn = async (page) => page.locator("[data-eden-panel]").evaluate((e) => { const b = e.getBoundingClientRect(); return b.left >= -1 && b.top >= -1 && b.right <= document.documentElement.clientWidth + 1 && b.bottom <= window.innerHeight + 1; });
const edenRequests = (page) => { const calls = []; page.on("request", (r) => { if (r.url().includes("/api/eden") && r.method() === "POST") calls.push(r.postData()); }); return calls; };
const light = async (page, label) => { const bad = await lightCheck(page); ok(bad.length === 0, `${label}: light, no dark panel and no red`, bad.slice(0, 3)); };
const tall = async (page, sel, label) => { const small = await page.evaluate((q) => [...document.querySelectorAll(q)].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 43.5; }).map((el) => (el.textContent || el.name || el.tagName).slice(0, 30)), sel); ok(small.length === 0, `${label}: every button and field in the box is at least 44 pixels tall`, small); };

for (const kind of ["phone", "desk"]) {
  const px = kind === "phone" ? 390 : 1440;
  /* ---- a visitor: the panel is unchanged, and holds no stray word ---- */
  { const V = await open(browser, s.base, kind); const calls = edenRequests(V.page);
    await V.page.goto("/"); await V.page.waitForSelector("[data-eden-float]:not([hidden])"); await V.page.click("[data-eden-orb-button]"); await V.page.waitForSelector("[data-act=eden-join]");
    ok((await V.page.locator("[data-eden-panel] textarea").count()) === 0 && calls.length === 0, `${kind}: a visitor still sees words only: no box, and no request to Eden`);
    await stray(V.page, `${kind}: the public panel`); ok(V.errors.length === 0, `${kind}: zero page errors for a visitor`, V.errors); await V.close(); }

  /* ---- signed in, no form open: the free box ---- */
  const L = await open(browser, s.base, kind); await L.ctx.addCookies([asCookie(lead, s.base)]);
  const calls = edenRequests(L.page); const had = await myPosts();
  await L.page.goto("/me"); await L.page.waitForSelector("button:has-text('Post an ask')"); await L.page.click("[data-eden-orb-button]"); await L.page.waitForSelector("[data-eden-free] textarea[name=words]");
  const panelText = await L.page.locator("[data-eden-panel]").innerText();
  ok(/Say what to draft/.test(panelText) && (await L.page.locator("[data-eden-free] label").innerText()) === "Say what to draft" && (await L.page.locator("[data-act=eden-free-draft]").innerText()) === "Draft" && /call 911/.test(panelText) && /call or text 988/.test(panelText), `${kind}: the panel has "Say what to draft", a Draft button, and the 911 and 988 line`);
  ok(/an ask for two beds for our men's house/.test(await L.page.locator("[data-eden-free] textarea").getAttribute("placeholder")), `${kind}: the box shows an example in its placeholder`);
  await stray(L.page, `${kind}: the free box`); ok(await panelOn(L.page), `${kind}: the panel is wholly on the screen`);
  await calm(L.page, kind); await tall(L.page, "[data-eden-panel] button, [data-eden-panel] textarea", kind);
  await light(L.page, `${kind}: the free box`); await snap(L.page, `eden-free-box-${px}`);
  ok(calls.length === 0, `${kind}: opening the panel makes no call to Eden`);

  const seen0 = model.seen.length;
  await L.page.fill("[data-eden-free] textarea[name=words]", "an ask for two beds for our men's house");
  await L.page.click("[data-act=eden-free-draft]"); await L.page.waitForSelector("[data-eden-free-draft]");
  const body = JSON.parse(calls[0] || "{}");
  ok(calls.length === 1 && Object.keys(body).sort().join() === "fields,job" && body.job === "freeform" && Object.keys(body.fields).join() === "words" && body.fields.words === "an ask for two beds for our men's house", `${kind}: exactly one request to /api/eden, and it holds only the job name and the words`, calls);
  ok(model.seen.length === seen0 + 2, `${kind}: the server made the two model calls itself (one to choose the kind, one to write)`, model.seen.length - seen0);
  const card = await L.page.locator("[data-eden-free-draft]").innerText();
  ok(/Eden wrote this as an ask/.test(card) && /Eden wrote this; read it before you use it\./i.test(card) && /Ten folding tables for our meal/.test(card), `${kind}: the draft is shown with its kind in words and the mark`, card);
  const btns = await L.page.locator("[data-eden-free-draft] button").allInnerTexts();
  ok((await L.page.locator("[data-eden-free-draft] [data-act=eden-free-use]").innerText()) === "Use this in a new ask" && btns.filter((b) => !/Clear/.test(b)).length === 1, `${kind}: one button to use it: "Use this in a new ask" (the only other is Clear)`, btns);
  await stray(L.page, `${kind}: the draft`); ok(await panelOn(L.page), `${kind}: the panel with the draft is wholly on the screen`); await tall(L.page, "[data-eden-panel] button, [data-eden-panel] textarea", `${kind}: draft`);
  ok((await myPosts()) === had && (await L.page.locator("input[name=title]").count()) === 0, `${kind}: Eden saved nothing, and no form is open yet`);
  ok(await L.page.locator("[data-act=eden-free-use]").evaluate((b) => { const r = b.getBoundingClientRect(), p = document.querySelector("[data-eden-panel]").getBoundingClientRect(); return r.top >= p.top && r.bottom <= p.bottom + 1; }), `${kind}: the Use button is in view inside the panel, without scrolling`);
  await light(L.page, `${kind}: the draft`); await snap(L.page, `eden-free-draft-${px}`);
  await L.page.click("[data-act=eden-free-use]"); await L.page.waitForSelector("form.formcard input[name=title]");
  ok((await L.page.inputValue("input[name=title]")) === "Ten folding tables for our meal" && /ten folding tables/.test(await L.page.inputValue("textarea[name=body]")) && (await L.page.locator("form.formcard input[name=kind]").getAttribute("value")) === "ask" && /Post an ask|ask/i.test(await L.page.locator("form.formcard h3").innerText()), `${kind}: "Use this in a new ask" opens the ask form with the title and the words in it`);
  ok(/not saved/.test(await L.page.locator("form.formcard .out").innerText()) && (await myPosts()) === had && await L.page.locator("[data-eden-panel]").isHidden(), `${kind}: the form says they are not saved, nothing is saved, and the panel is shut`);
  ok(calls.length === 1, `${kind}: the whole trip was one request to /api/eden`, calls.length);
  await light(L.page, `${kind}: the prefilled form`); await snap(L.page, `eden-free-form-${px}`);
  await L.page.selectOption("select[name=category]", "furniture"); await L.page.click("button:has-text('Save as a draft')"); await L.page.waitForSelector("text=Saved as a draft", { timeout: 8000 });
  ok((await myPosts()) === had + 1, `${kind}: only the form's own Save keeps the post`);

  /* ---- a give ---- */
  await L.page.reload(); await L.page.waitForSelector("button:has-text('Post an ask')"); await L.page.click("[data-eden-orb-button]"); await L.page.waitForSelector("[data-eden-free] textarea[name=words]");
  await L.page.fill("[data-eden-free] textarea[name=words]", "we have a van and two drivers to give on Saturdays"); await L.page.click("[data-act=eden-free-draft]"); await L.page.waitForSelector("[data-eden-free-draft]");
  ok(/Eden wrote this as a give/.test(await L.page.locator("[data-eden-free-draft]").innerText()) && (await L.page.locator("[data-act=eden-free-use]").innerText()) === "Use this in a new give", `${kind}: a give is named as a give, with "Use this in a new give"`);
  await L.page.click("[data-act=eden-free-use]"); await L.page.waitForSelector("form.formcard");
  ok((await L.page.locator("form.formcard input[name=kind]").getAttribute("value")) === "give" && (await L.page.inputValue("input[name=title]")) !== "", `${kind}: and it opens the give form, prefilled`);

  /* ---- a form with a person's own words is never overwritten ---- */
  await L.page.fill("input[name=title]", "My own title"); await L.page.click("[data-eden-orb-button]"); await L.page.waitForSelector("[data-eden-free] textarea[name=words]");
  await L.page.fill("[data-eden-free] textarea[name=words]", "an ask for two beds for our men's house"); await L.page.click("[data-act=eden-free-draft]"); await L.page.waitForSelector("[data-eden-free-draft]");
  await L.page.click("[data-act=eden-free-use]");
  ok((await L.page.inputValue("input[name=title]")) === "My own title" && /already has your words/.test(await L.page.locator("[data-eden-panel]").innerText()), `${kind}: a form that holds the person's own words is not replaced: Eden says so`);
  /* ---- the box above the form's own writing ---- */
  const y1 = await L.page.locator("[data-eden-free] textarea").evaluate((e) => e.getBoundingClientRect().top), y2 = await L.page.locator("textarea[name=notes]").evaluate((e) => e.getBoundingClientRect().top);
  ok(y1 < y2 && (await L.page.locator("[data-eden-free]").count()) === 1 && (await L.page.locator("[data-eden=ask_give] [data-act=eden-write]").count()) === 1, `${kind}: inside a form the free box is above the form's own writing, which is as it was`);
  await stray(L.page, `${kind}: inside a form`); ok(await panelOn(L.page), `${kind}: the panel inside a form is wholly on the screen`); await snap(L.page, `eden-free-in-form-${px}`);

  /* ---- danger to life ---- */
  const before = model.seen.length, cn = calls.length;
  await L.page.fill("[data-eden-free] textarea[name=words]", "an ask for a bed, I don't want to live anymore"); await L.page.click("[data-act=eden-free-draft]"); await L.page.waitForSelector("[data-eden-crisis]");
  const ct = await L.page.locator("[data-eden-crisis]").innerText();
  ok(/call 911/.test(ct) && /call or text 988/.test(ct) && model.seen.length === before && calls.length === cn + 1 && (await L.page.locator("[data-eden-free-draft]").count()) === 0, `${kind}: danger-to-life words show 911 and 988, no draft, and no model is called`);
  await light(L.page, `${kind}: the crisis line`); await snap(L.page, `eden-free-crisis-${px}`);
  ok(L.errors.length === 0, `${kind}: zero page errors for the lead`, L.errors); await L.close();

  /* ---- from another page: the draft travels to /me ---- */
  const B = await open(browser, s.base, kind); await B.ctx.addCookies([asCookie(lead, s.base)]); const bc = edenRequests(B.page);
  await B.page.goto("/board"); await B.page.waitForSelector("[data-eden-float]:not([hidden])"); await B.page.click("[data-eden-orb-button]"); await B.page.waitForSelector("[data-eden-free] textarea[name=words]");
  await stray(B.page, `${kind}: the board page`);
  await B.page.fill("[data-eden-free] textarea[name=words]", "we need ten folding tables"); await B.page.click("[data-act=eden-free-draft]"); await B.page.waitForSelector("[data-eden-free-draft]");
  await B.page.click("[data-act=eden-free-use]"); await B.page.waitForSelector("form.formcard input[name=title]");
  ok(new URL(B.page.url()).pathname === "/me" && new URL(B.page.url()).hash === "" && (await B.page.inputValue("input[name=title]")) === "Ten folding tables for our meal" && bc.length === 1, `${kind}: from the board, "Use this in a new ask" lands on /me with the form prefilled, the # cleared, and one request in all`, B.page.url());
  ok((await myPosts()) === had + 1, `${kind}: and nothing more is saved`); ok(B.errors.length === 0, `${kind}: zero page errors on the way`, B.errors); await B.close();

  /* ---- a person on the money team: a letter, copied ---- */
  const A = await open(browser, s.base, kind); await A.ctx.addCookies([asCookie(tess, s.base)]); await A.ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {}); const ac = edenRequests(A.page);
  await A.page.goto("/money"); await A.page.waitForSelector("[data-eden-float]:not([hidden])"); await A.page.click("[data-eden-orb-button]"); await A.page.waitForSelector("[data-eden-free] textarea[name=words]");
  ok(/thank-you letter to Grace Church for the coats/.test(await A.page.locator("[data-eden-free]").innerText()), `${kind}: the money team's box shows the thank-you example`);
  await A.page.fill("[data-eden-free] textarea[name=words]", "a thank-you letter to Grace Church for the coats"); await A.page.click("[data-act=eden-free-draft]"); await A.page.waitForSelector("[data-eden-free-draft]");
  const lt = await A.page.locator("[data-eden-free-draft]").innerText();
  ok(/Eden wrote this as a thank-you letter/.test(lt) && /Eden wrote this; read it before you use it\./i.test(lt) && (await A.page.locator("[data-act=eden-free-use]").innerText()) === "Copy letter" && ac.length === 1, `${kind}: a thank-you is named, marked, and has one button: Copy letter`, lt);
  await A.page.click("[data-act=eden-free-use]"); await A.page.waitForSelector("text=Copied. Nothing was saved or sent.");
  await stray(A.page, `${kind}: a letter`); await snap(A.page, `eden-free-letter-${px}`);
  ok(A.errors.length === 0, `${kind}: zero page errors for the money team`, A.errors); await A.close();

  /* ---- no ministry: nothing to write for yet, said plainly ---- */
  const P = await open(browser, s.base, kind); await P.ctx.addCookies([asCookie(pat, s.base)]); const pc = edenRequests(P.page);
  await P.page.goto("/join"); await P.page.waitForSelector("[data-eden-float]:not([hidden])"); await P.page.click("[data-eden-orb-button]"); await P.page.waitForSelector("text=Start your ministry first");
  ok((await P.page.locator("[data-eden-panel] textarea").count()) === 0 && pc.length === 0 && /call 911/.test(await P.page.locator("[data-eden-panel]").innerText()), `${kind}: signed in with no ministry, the panel says to start one, has no box, and calls nothing`);
  await stray(P.page, `${kind}: no ministry`); await P.close();

  /* ---- no key on the server ---- */
  const N = await open(browser, s0.base, kind); await N.ctx.addCookies([asCookie(lead0, s0.base)]);
  await N.page.goto("/me"); await N.page.waitForSelector("button:has-text('Post an ask')"); await N.page.waitForSelector("[data-eden-float][data-state=off]"); await N.page.click("[data-eden-orb-button]"); await N.page.waitForSelector("text=Eden is not set up on this server yet");
  ok((await N.page.locator("[data-eden-panel] textarea").count()) === 0 && (await N.page.locator("[data-act=eden-free-draft]").count()) === 0, `${kind}: with no key the panel offers no box and no Draft button`);
  await stray(N.page, `${kind}: not set up`); ok(N.errors.length === 0, `${kind}: zero page errors with no key`, N.errors); await N.close();
}
await browser.close(); await pool.end(); await s.stop(); await s0.stop(); await model.stop();
process.exit(T.done());

async function calm(page, label) { ok(await noSideways(page), `${label}: nothing scrolls sideways`); }

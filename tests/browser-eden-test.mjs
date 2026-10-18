#!/usr/bin/env node
/* tests/browser-eden-test.mjs — Eden in a real Chromium, a phone at 390 and a desk at 1440, with a stand-in for the model on this machine.
   The orange orb is on the signed-in pages (the ask form, the page form, the treasury) and moves (and holds still for a person who asks
   for less motion). Eden writes a draft marked "Eden wrote this; read it before you use it"; the words go into the form only when the
   person presses "Use these words"; and nothing is saved until the form's own Save is pressed. Danger-to-life words show 911 and 988 and no
   draft. With no key on the server Eden says so and offers nothing. Zero page errors, nothing sideways, buttons 44 pixels or taller.
   LM_SHOTS=<dir> writes the screenshots.   LEXOS_DB_NAME=linkedm_t_<mine> node tests/browser-eden-test.mjs */
import { counter, ownDatabase, startServer, client, signIn, modelStandIn, sleep } from "./helpers.mjs";
import { launch, open, noSideways, SHOTS, shots } from "./browser-lib.mjs";

const T = counter("browser-eden-test"); const { ok } = T;
const db = await ownDatabase("browser_eden"); const model = await modelStandIn();
const KEY = "sk-test-not-a-real-key-0123456789";
const s = await startServer({ url: db.url, env: { ANTHROPIC_API_KEY: KEY, ANTHROPIC_BASE_URL: model.url, EDEN_LIMIT_HOUR: "1000", EDEN_LIMIT_DAY: "1000" } });
const s0 = await startServer({ url: db.url, env: { ANTHROPIC_API_KEY: "", ANTHROPIC_BASE_URL: model.url } });
ok(s.up && s0.up, "the servers are up");
const { pool } = await import("../server/db.mjs");
const browser = await launch(); const snap = shots(SHOTS);
const big = async (page, label) => {
  const small = await page.evaluate(() => [...document.querySelectorAll("main a.btn, main button, main input:not([type=hidden]):not([type=checkbox]):not([type=file]), main select, main textarea")].filter((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && r.height < 43.5; }).map((el) => (el.textContent || el.name || el.tagName).trim().slice(0, 30) + " " + Math.round(el.getBoundingClientRect().height)));
  ok(small.length === 0, `${label}: every button and field is at least 44 pixels tall`, small.slice(0, 5));
};
const calm = async (page, label) => ok(await noSideways(page), `${label}: nothing scrolls sideways`);
const asCookie = (c, base) => { const kv = c.jar().split("=", 2); return { name: kv[0], value: c.jar().slice(kv[0].length + 1), url: base }; };
const lead = client(s.base), tess = client(s.base), lead0 = client(s0.base);
await signIn(lead, s, "lead@eden-b.example"); await signIn(tess, s, "tess@linkedm.example"); await signIn(lead0, s0, "lead@eden-b.example");
await lead.post("/api/ministry", { name: "Eden Browser Ministry", city: "Seattle", state: "WA", about: "We feed neighbors every week and run a small youth night.", contact_name: "Lee Lead", contact_email: "lead@eden-b.example", website: "" });
await pool.query("select lm.make_treasurer('tess@linkedm.example')");
const myPosts = async () => (await lead.get("/api/my/posts")).json.posts.length;

for (const kind of ["phone", "desk"]) {
  const px = kind === "phone" ? 390 : 1440;
  const L = await open(browser, s.base, kind); await L.ctx.addCookies([asCookie(lead, s.base)]);
  const had = await myPosts();
  /* ---- the ask form ---- */
  await L.page.goto("/me"); await L.page.waitForSelector("button:has-text('Post an ask')"); await L.page.click("button:has-text('Post an ask')");
  await L.page.waitForSelector("[data-eden=ask_give] [data-eden-orb-canvas]");
  const f1 = Number(await L.page.locator("[data-eden=ask_give] canvas").getAttribute("data-frames")); await sleep(500);
  const f2 = Number(await L.page.locator("[data-eden=ask_give] canvas").getAttribute("data-frames"));
  ok(kind === "phone" ? f2 >= f1 : f2 > f1, `${kind}: the orange orb is on the ask form and moves (${f1} to ${f2} frames)`);
  ok((await L.page.locator("[data-eden=ask_give] canvas").evaluate((c) => { const x = c.getContext("2d"); const d = x.getImageData(c.width / 2, c.height / 2, 1, 1).data; return d[3] > 0 && d[0] > 150; })), `${kind}: and it is orange at its heart`);
  ok(/Nothing is saved or sent until you press Save or Send/.test(await L.page.locator("[data-eden=ask_give]").innerText()), `${kind}: it says nothing is saved or sent until Save or Send`);
  await L.page.click("[data-eden=ask_give] [data-act=eden-open]"); await L.page.waitForSelector("[data-eden=ask_give] textarea[name=notes]");
  await calm(L.page, `${kind}: the ask form with Eden open`); await big(L.page, `${kind}: the ask form with Eden open`);
  await L.page.fill("[data-eden=ask_give] textarea[name=notes]", "We need ten folding tables for our Saturday meal. We feed about eighty neighbors.");
  const before = model.seen.length;
  await L.page.click("[data-eden=ask_give] [data-act=eden-write]"); await L.page.waitForSelector("[data-eden-draft]");
  ok(!/\bnull\b/.test(await L.page.locator("[data-eden=ask_give]").innerText()), `${kind}: no stray word in Eden's panel`);
  const card = await L.page.locator("[data-eden-draft]").innerText();
  ok(/Eden wrote this; read it before you use it\./i.test(card) && /Ten folding tables for our meal/.test(card) && model.seen.length === before + 1, `${kind}: Eden's draft is shown, marked "Eden wrote this; read it before you use it."`);
  ok((await L.page.inputValue("input[name=title]")) === "" && (await myPosts()) === had, `${kind}: the form's fields are still empty and nothing is saved`);
  await snap(L.page, `eden-ask-${px}`);
  await L.page.click("[data-act=eden-use]");
  ok((await L.page.inputValue("input[name=title]")) === "Ten folding tables for our meal" && /ten folding tables/.test(await L.page.inputValue("textarea[name=body]")) && /not saved/.test(await L.page.locator("[data-eden=ask_give]").innerText()), `${kind}: "Use these words" puts them in the form, and says they are not saved`);
  ok((await myPosts()) === had, `${kind}: still nothing is saved`);
  /* danger to life */
  await L.page.fill("[data-eden=ask_give] textarea[name=notes]", "I do not want to live anymore"); const b2 = model.seen.length;
  await L.page.fill("[data-eden=ask_give] textarea[name=notes]", "I don't want to live anymore");
  await L.page.click("[data-eden=ask_give] [data-act=eden-write]"); await L.page.waitForSelector("[data-eden-crisis]");
  ok(/call 911/.test(await L.page.locator("[data-eden-crisis]").innerText()) && /call or text 988/.test(await L.page.locator("[data-eden-crisis]").innerText()) && (await L.page.locator("[data-eden-draft]").count()) === 0 && model.seen.length === b2, `${kind}: danger-to-life words show the 911 and 988 line, no draft, and no model is called`);
  await snap(L.page, `eden-crisis-${px}`);
  /* only the form's own Save keeps it */
  await L.page.selectOption("select[name=category]", "furniture");
  await L.page.click("button:has-text('Save as a draft')"); await L.page.waitForSelector("text=Saved as a draft", { timeout: 8000 }).catch(async () => { console.log("DEBUG", (await L.page.locator("main").innerText()).slice(0, 1500)); throw new Error("not saved"); });
  ok((await myPosts()) === had + 1, `${kind}: pressing the form's own Save is what keeps the post`);
  /* ---- the page form ---- */
  await L.page.goto("/me"); await L.page.waitForSelector("[data-act=page-start]"); await L.page.click("[data-act=page-start]"); await L.page.waitForSelector("[data-eden=page_words]");
  model.state.verse = "isa_58_7";
  await L.page.click("[data-eden=page_words] [data-act=eden-open]"); await L.page.waitForSelector("[data-eden=page_words] textarea[name=notes]");
  await L.page.fill("[data-eden=page_words] textarea[name=notes]", "We serve a hot meal every Saturday and a youth night on Thursdays."); await L.page.check("[data-eden=page_words] input[name=include_verse]");
  await L.page.click("[data-eden=page_words] [data-act=eden-write]"); await L.page.waitForSelector("[data-eden=page_words] [data-eden-draft]");
  const pc = await L.page.locator("[data-eden=page_words] [data-eden-draft]").innerText(); if (!/Isaiah/.test(pc)) console.log("DEBUG", pc);
  ok(/Eden wrote this/i.test(pc) && /A hot meal every Saturday for our neighbors/.test(pc) && /Isaiah 58:7 \(KJV\)/i.test(pc) && /Is it not to deal thy bread to the hungry/i.test(pc), `${kind}: for the page, Eden's draft carries a verse, in the file's own words with its chapter and verse`);
  await snap(L.page, `eden-page-${px}`);
  await L.page.click("[data-eden=page_words] [data-act=eden-use]");
  ok((await L.page.inputValue("input[name=tagline]")) === "A hot meal every Saturday for our neighbors" && (await L.page.inputValue("select[name=verse]")) === "isa_58_7" && (await L.page.evaluate(async () => (await (await fetch("/api/page")).json()).exists)) === false, `${kind}: the words and the verse are in the form, and no page exists yet`);
  ok(L.errors.length === 0, `${kind}: zero page errors for the lead`, L.errors); await L.close();
  model.state.verse = "none";

  /* ---- no key on the server ---- */
  const N = await open(browser, s0.base, kind); await N.ctx.addCookies([asCookie(lead0, s0.base)]);
  await N.page.goto("/me"); await N.page.waitForSelector("button:has-text('Post an ask')"); await N.page.click("button:has-text('Post an ask')"); await N.page.waitForSelector("[data-eden=ask_give]");
  await N.page.click("[data-eden=ask_give] [data-act=eden-open]"); await N.page.waitForSelector("text=Eden is not set up on this server yet");
  ok((await N.page.locator("[data-eden=ask_give] textarea").count()) === 0 && (await N.page.locator("[data-eden=ask_give] [data-act=eden-write]").count()) === 0 && (await N.page.locator("[data-eden=ask_give] [data-act=eden-open]").isHidden()), `${kind}: with no key Eden says it is not set up, and offers no box and no button`);
  await calm(N.page, `${kind}: Eden with no key`); await snap(N.page, `eden-not-set-up-${px}`);
  ok(N.errors.length === 0, `${kind}: zero page errors with no key`, N.errors); await N.close();

  /* ---- the treasury ---- */
  const A = await open(browser, s.base, kind); await A.ctx.addCookies([asCookie(tess, s.base)]);
  await A.page.goto("/money"); await A.page.waitForSelector("[data-eden-letters]");
  await A.page.fill("[data-eden-letters] input[name=eden_who]", "Jordan Donor");
  await A.page.click("[data-eden-letters] [data-act=eden-open]"); await A.page.waitForSelector("[data-eden-letters] textarea[name=notes]");
  await A.page.fill("[data-eden-letters] textarea[name=notes]", "Jordan gave a gift for our Saturday meals.");
  await A.page.click("[data-eden-letters] [data-act=eden-write]"); await A.page.waitForSelector("[data-eden-letters] [data-eden-draft]");
  ok(/Eden wrote this; read it before you use it\./i.test(await A.page.locator("[data-eden-letters] [data-eden-draft]").innerText()) && (await A.page.locator("[data-eden-letters] [data-act=eden-use]").count()) === 0 && (await A.page.locator("[data-eden-letters] [data-act=eden-copy]").count()) === 1, `${kind}: in the treasury Eden's thank-you is marked, and there is only a way to copy it: nothing is saved or sent from here`);
  await calm(A.page, `${kind}: the treasury with Eden`); await big(A.page, `${kind}: the treasury with Eden`);
  await snap(A.page, `eden-treasury-${px}`);
  ok(A.errors.length === 0, `${kind}: zero page errors for the treasurer`, A.errors); await A.close();
}
/* ---- a person who asks for less motion gets a still orb ---- */
{ const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", baseURL: s.base }); await ctx.addCookies([asCookie(lead, s.base)]);
  const p = await ctx.newPage(); await p.goto("/me"); await p.waitForSelector("button:has-text('Post an ask')"); await p.click("button:has-text('Post an ask')"); await p.waitForSelector("[data-eden=ask_give] canvas");
  const a = await p.locator("[data-eden=ask_give] canvas").getAttribute("data-frames"); await sleep(400); const b = await p.locator("[data-eden=ask_give] canvas").getAttribute("data-frames");
  ok((await p.locator("[data-eden=ask_give] canvas").getAttribute("data-motion")) === "still" && a === b && Number(a) <= 4, `with reduced motion the orb is drawn still and stops (${a} frames, then ${b})`); await ctx.close(); }
await browser.close(); await pool.end(); await s.stop(); await s0.stop(); await model.stop();
process.exit(T.done());

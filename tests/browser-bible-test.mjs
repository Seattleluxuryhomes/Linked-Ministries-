#!/usr/bin/env node
/* tests/browser-bible-test.mjs — a ministry's own colours, its Bible and its gallery (migration 0012), in a real Chromium at 390 and 1440.
   A lead chooses a colour and two Bible languages in the page form and adds pictures; a person on the team approves; a signed-out
   visitor opens the page in its colour, opens the Bible in the first language, reads a chapter, switches to the second language and
   stays on the same chapter, and steps to the next chapter. A right-to-left Bible reads right to left. A chapter whose verses a source
   numbers differently shows no numbers and says why. Every one of the twelve colours is painted on the page and on a chapter and read
   by the light check (pale ground, no dark panel, no red). Zero page errors, nothing sideways, buttons 44 pixels or taller.
   LM_SHOTS=<dir> also writes the screenshots.   node tests/browser-bible-test.mjs */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { counter, ownDatabase, startServer, client, signIn, sleep } from "./helpers.mjs";
import { launch, open, noSideways, SHOTS, shots, drawPhoto, lightCheck } from "./browser-lib.mjs";
import { THEME_LIST } from "../server/themes.mjs";

const T = counter("browser-bible-test"); const { ok } = T;
const db = await ownDatabase("browser_bible");
const s = await startServer({ url: db.url });
ok(s.up, "the server is up", s.logText().slice(-300));
const { pool } = await import("../server/db.mjs");
const browser = await launch(); const snap = shots(SHOTS);
const big = async (page, label) => {
  const small = await page.evaluate(() => [...document.querySelectorAll("main a.btn, main button, main input:not([type=hidden]):not([type=file]):not([type=radio]), main select, main textarea, main .bible-books a, main .bible-chapters a, main .bible-langs a, header a.btn")].filter((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && r.height < 43.5; }).map((el) => (el.textContent || el.name || el.tagName).trim().slice(0, 30) + " " + Math.round(el.getBoundingClientRect().height)));
  ok(small.length === 0, `${label}: every button, link to tap and field is at least 44 pixels tall`, small.slice(0, 5));
};
const calm = async (page, label) => ok(await noSideways(page), `${label}: nothing scrolls sideways`);
const light = async (page, label) => { const bad = await lightCheck(page); ok(bad.length === 0, `${label}: light, and no red`, bad.slice(0, 3)); };
const photoFile = path.join(os.tmpdir(), `lm-bible-photo-${process.pid}.jpg`); fs.writeFileSync(photoFile, await drawPhoto(browser));
const asCookie = (c) => { const kv = c.jar().split("=", 2); return { name: kv[0], value: c.jar().slice(kv[0].length + 1), url: s.base }; };

const stew = client(s.base); await signIn(stew, s, "steward.bible@linkedm.example"); await pool.query("select lm.make_steward('steward.bible@linkedm.example')");

for (const kind of ["phone", "desk"]) {
  const tag = kind === "phone" ? "p" : "d", px = kind === "phone" ? 390 : 1440;
  const NAME = `Hope ${tag.toUpperCase()} Kitchen`, SLUG = `hope-${tag}-kitchen`;
  const lead = client(s.base); await signIn(lead, s, `lead.${tag}@hope.example`);
  await lead.post("/api/ministry", { name: NAME, city: "Tacoma", state: "WA", about: "We cook a hot supper every Tuesday for anyone who comes.", contact_name: "Ana Hope", contact_email: `lead.${tag}@hope.example`, website: "" });
  const mid = (await lead.get("/api/me")).json.ministry.id;
  ok((await stew.post(`/api/steward/ministries/${mid}/review`, { decision: "approve" })).status === 200, `${kind}: the ministry is read and approved`);

  /* ---- the lead chooses a colour, two Bible languages and three pictures ---- */
  const L = await open(browser, s.base, kind); await L.ctx.addCookies([asCookie(lead)]);
  await L.page.goto("/me"); await L.page.click("[data-act=page-start]"); await L.page.waitForSelector("[data-page-form]");
  ok((await L.page.locator("[data-themes] input[type=radio]").count()) === 12, `${kind}: the form offers twelve colours`);
  ok((await L.page.locator("[data-themes] input[value=gold]").isChecked()), `${kind}: gold is chosen until the lead chooses`);
  await L.page.click(".theme-pick.theme-forest");
  ok(await L.page.locator("[data-themes] input[value=forest]").isChecked(), `${kind}: tapping a colour chooses it`);
  ok((await L.page.locator("select[name=bible_first] option").count()) >= 6, `${kind}: the form offers the Bible in six languages or more`);
  await L.page.selectOption("select[name=bible_first]", "hi-irv"); await L.page.selectOption("select[name=bible_second]", "en-kjv");
  await L.page.fill("input[name=tagline]", "A hot supper every Tuesday for anyone who comes");
  await L.page.fill("textarea[name=about]", "We cook a hot supper every Tuesday at six. Everyone is welcome, and no one is asked who they are.");
  for (let i = 0; i < 3; i++) { await L.page.setInputFiles("#page-photo-file", photoFile); await L.page.waitForFunction((n) => document.querySelectorAll("[data-photos] img").length === n, i + 1); }
  ok((await L.page.locator("[data-photos] img").count()) === 3, `${kind}: three pictures were added (a page now holds more than two)`);
  await calm(L.page, `${kind}: the form with colours and the Bible`); await big(L.page, `${kind}: the form with colours and the Bible`); await light(L.page, `${kind}: the form with colours and the Bible`);
  await snap(L.page, `bible-form-${px}`);
  await L.page.click("[data-act=page-send]");
  await L.page.waitForSelector("text=Sent. It is waiting for a person at Linked Ministries to read it.");
  const back = (await lead.get("/api/page")).json.draft;
  ok(back.theme === "forest" && JSON.stringify(back.bible) === '["hi-irv","en-kjv"]' && back.photos.length === 3, `${kind}: the server kept the colour, the two languages in order, and the three pictures`, back);
  /* the preview: the ministry's own people see the Bible in the draft's language before it is public */
  await L.page.goto(`/m/${SLUG}/bible`); ok(/This is how your Bible will look/.test(await L.page.locator("main").innerText()) && (await L.page.locator(".bible-books[lang=hi]").count()) === 2, `${kind}: the lead sees a private preview of the Bible, in Hindi`);
  await L.close();
  ok((await client(s.base).get(`/m/${SLUG}/bible`)).status === 404, `${kind}: before a person reads the page, the public cannot open its Bible`);
  ok((await stew.post(`/api/steward/pages/${mid}/review`, { decision: "approve" })).status === 200, `${kind}: a person on the team approves the page`);

  /* ---- a signed-out visitor ---- */
  const V = await open(browser, s.base, kind);
  await V.page.goto(`/m/${SLUG}`);
  ok(await V.page.evaluate(() => document.body.classList.contains("themed") && document.body.classList.contains("theme-forest")), `${kind}: the page wears the colour the ministry chose`);
  ok((await V.page.locator(".mgallery .mphoto").count()) === 1 && (await V.page.locator(".mphotos .mphoto").count()) === 2, `${kind}: two pictures lead the page and the third is in the gallery`);
  ok(/हिन्दी and English/.test(await V.page.locator("#m-bible").locator("..").innerText()), `${kind}: the Bible card names both languages`);
  await calm(V.page, `${kind}: the themed page`); await big(V.page, `${kind}: the themed page`); await light(V.page, `${kind}: the themed page`);
  await snap(V.page, `bible-page-forest-${px}`);
  await V.page.click("#m-bible ~ p a.btn");
  await V.page.waitForURL(`**/m/${SLUG}/bible`);
  ok((await V.page.locator(".bible-books a").first().innerText()).trim() === "उत्पत्ति" && (await V.page.locator(".bible-books a").count()) === 66, `${kind}: the Bible opens in Hindi, all 66 books, Genesis first`);
  await calm(V.page, `${kind}: the books`); await big(V.page, `${kind}: the books`); await light(V.page, `${kind}: the books`);
  await snap(V.page, `bible-books-${px}`);
  await V.page.click(".bible-books a >> nth=42"); await V.page.waitForURL(`**/bible/john`);
  ok((await V.page.locator(".bible-chapters a").count()) === 21, `${kind}: John has 21 chapters to choose from`);
  await V.page.click(".bible-chapters a >> text=3"); await V.page.waitForURL(`**/bible/john/3`);
  const hi = await V.page.locator(".bible-text").innerText();
  ok(/परमेश्‍?वर ने जगत से ऐसा प्रेम रखा/.test(hi) && (await V.page.locator(".bible-text sup").count()) === 36, `${kind}: John 3 in Hindi, 36 numbered verses, 3:16 among them`);
  ok(/Creative Commons/.test(await V.page.locator(".bible-licence").innerText()), `${kind}: the chapter names its translation and licence`);
  await calm(V.page, `${kind}: a chapter`); await light(V.page, `${kind}: a chapter`);
  await snap(V.page, `bible-chapter-hi-${px}`);
  await V.page.click(".bible-langs a[lang=en]"); await V.page.waitForURL(`**/bible/john/3?t=en-kjv`);
  ok(/For God so loved the world, that he gave his only begotten Son/.test(await V.page.locator(".bible-text").innerText()), `${kind}: switching to English keeps the place: John 3:16 in the King James Version`);
  await V.page.click(".bible-steps .next"); await V.page.waitForURL(`**/bible/john/4?t=en-kjv`);
  ok(/^John 4$/.test((await V.page.locator("main h1").innerText()).trim()), `${kind}: Next goes to John 4 and stays in English`);
  ok(V.errors.length === 0, `${kind}: zero page errors for the visitor`, V.errors.slice(0, 3));
  await V.close();
}

/* ---- a right-to-left Bible, and a chapter shown without numbers ---- */
{
  const lead = client(s.base); await signIn(lead, s, "lead.ar@hope.example");
  await lead.post("/api/ministry", { name: "Nour Fellowship", city: "Seattle", state: "WA", about: "We read the Bible together on Sunday afternoons.", contact_name: "Sami Nour", contact_email: "lead.ar@hope.example", website: "" });
  const mid = (await lead.get("/api/me")).json.ministry.id; await stew.post(`/api/steward/ministries/${mid}/review`, { decision: "approve" });
  const r = await lead.post("/api/page", { name: "Nour Fellowship", city: "Seattle", state: "WA", slug: "nour-fellowship", tagline: "We read the Bible together on Sundays", about: "We read the Bible together on Sunday afternoons, in Arabic and in English.", theme: "indigo", bible: ["ar-nav", "en-kjv"], photos: [], meets: [], submit: true });
  ok(r.status === 200, "an Arabic page is sent", r.text);
  await stew.post(`/api/steward/pages/${mid}/review`, { decision: "approve" });
  const V = await open(browser, s.base, "phone");
  await V.page.goto("/m/nour-fellowship/bible/john/1");
  ok((await V.page.locator(".bible-text").getAttribute("dir")) === "rtl" && (await V.page.locator(".bible-text").getAttribute("lang")) === "ar", "an Arabic chapter is marked right to left and Arabic");
  await light(V.page, "the Arabic chapter"); await calm(V.page, "the Arabic chapter"); await snap(V.page, "bible-chapter-ar-390");
  await V.page.goto("/m/nour-fellowship/bible/acts/15");
  ok((await V.page.locator(".bible-text sup").count()) === 0 && /numbers the verses in this chapter in its own way/.test(await V.page.locator("main").innerText()), "a chapter the source numbers differently shows no verse numbers, and says why");
  ok((await client(s.base).get("/m/nour-fellowship/bible/nope/1")).status === 404 && (await client(s.base).get("/m/nour-fellowship/bible/john/22")).status === 404, "a book or a chapter that does not exist is not found");
  ok(V.errors.length === 0, "zero page errors on the Arabic Bible", V.errors.slice(0, 3));

  /* ---- every colour, painted and read ---- */
  for (const [key] of THEME_LIST) {
    const u = await lead.post("/api/page", { name: "Nour Fellowship", city: "Seattle", state: "WA", tagline: "We read the Bible together on Sundays", about: "We read the Bible together on Sunday afternoons, in Arabic and in English.", theme: key, bible: ["ar-nav", "en-kjv"], photos: [], meets: [], submit: true });
    await stew.post(`/api/steward/pages/${mid}/review`, { decision: "approve" });
    for (const route of ["/m/nour-fellowship", "/m/nour-fellowship/bible/psalms/23?t=en-kjv"]) {
      await V.page.goto(route); ok(await V.page.evaluate((k) => document.body.classList.contains("theme-" + k), key), `${key}: ${route} wears it`, u.text);
      await light(V.page, `${key}: ${route}`);
    }
    if (key === "rose" || key === "teal" || key === "slate") await snap(V.page, `bible-theme-${key}-390`);
  }
  await V.close();
}

await browser.close(); await s.stop(); await pool.end();
process.exit(T.done());

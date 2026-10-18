#!/usr/bin/env node
/* tests/browser-page-test.mjs — the ministry page builder in a real Chromium, a phone at 390 and a desk at 1440: a lead makes the page
   from the form (typing, choosing, adding rows, adding a picture), sends it to be read; the page says it is waiting and never "public";
   a steward reads the ministry and the page in the browser and approves; a signed-out visitor opens linkedm.org/m/<slug>, and the page is
   printed to a PDF. Zero page errors, nothing sideways, buttons 44 pixels or taller.
   LM_SHOTS=<dir> also writes the screenshots and the PDF.   LEXOS_DB_NAME=linkedm_t_<mine> node tests/browser-page-test.mjs */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { counter, ownDatabase, startServer, client, signIn, sleep } from "./helpers.mjs";
import { launch, open, noSideways, SHOTS, shots } from "./browser-lib.mjs";
import { makeJpeg } from "./fixtures.mjs";

const T = counter("browser-page-test"); const { ok } = T;
const db = await ownDatabase("browser_page");
const s = await startServer({ url: db.url });
ok(s.up, "the server is up", s.logText().slice(-300));
const { pool } = await import("../server/db.mjs");
const browser = await launch(); const snap = shots(SHOTS);
const until = async (fn, what) => { for (let i = 0; i < 80; i++) { if (await fn()) return true; await sleep(100); } ok(false, "waited for " + what); return false; };
const big = async (page, label) => {
  const small = await page.evaluate(() => [...document.querySelectorAll("main a.btn, main button, main input:not([type=hidden]):not([type=file]), main select, main textarea, header a.btn, footer a")].filter((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && r.height < 43.5; }).map((el) => (el.textContent || el.name || el.tagName).trim().slice(0, 30) + " " + Math.round(el.getBoundingClientRect().height)));
  ok(small.length === 0, `${label}: every button and field is at least 44 pixels tall`, small.slice(0, 5));
};
const calm = async (page, label) => ok(await noSideways(page), `${label}: nothing scrolls sideways`);
/* a real picture, drawn by the browser itself (a JPEG with a JFIF header, as a camera's would be), so the page shows a picture and not a blank */
const photoFile = path.join(os.tmpdir(), `lm-photo-${process.pid}.jpg`);
{ const t = await browser.newPage({ viewport: { width: 900, height: 600 } });
  await t.setContent(`<body style="margin:0;width:900px;height:600px;background:linear-gradient(160deg,#f6d9a8,#e9a23b 55%,#b86a12)"><div style="position:absolute;left:120px;top:300px;width:660px;height:34px;background:#fff7e8;border-radius:6px"></div><div style="position:absolute;left:170px;top:334px;width:20px;height:150px;background:#7a4a14"></div><div style="position:absolute;left:710px;top:334px;width:20px;height:150px;background:#7a4a14"></div>${[200, 330, 460, 590].map((x) => `<div style="position:absolute;left:${x}px;top:250px;width:70px;height:50px;border-radius:50%;background:#fff3dc"></div>`).join("")}</body>`);
  fs.writeFileSync(photoFile, await t.screenshot({ type: "jpeg", quality: 82 })); await t.close(); }
const asCookie = (c) => { const kv = c.jar().split("=", 2); return { name: kv[0], value: c.jar().slice(kv[0].length + 1), url: s.base }; };

for (const kind of ["phone", "desk"]) {
  const tag = kind === "phone" ? "p" : "d", px = kind === "phone" ? 390 : 1440;
  const NAME = `Journey ${tag.toUpperCase()} Table Ministry`, SLUG = `journey-${tag}-table-ministry`;
  const lead = client(s.base), stew = client(s.base);
  await signIn(lead, s, `lead.${tag}@journey.example`); await signIn(stew, s, `steward.${tag}@linkedm.example`);
  await pool.query("select lm.make_steward($1)", [`steward.${tag}@linkedm.example`]);
  await lead.post("/api/ministry", { name: NAME, city: "Seattle", state: "WA", about: "We serve a hot meal every Saturday and run a youth night.", contact_name: "Jo Journey", contact_email: `lead.${tag}@journey.example`, website: "" });

  /* ---- the lead opens the form ---- */
  const L = await open(browser, s.base, kind); await L.ctx.addCookies([asCookie(lead)]);
  await L.page.goto("/me");
  await L.page.waitForSelector("[data-page-card] [data-act=page-start]");
  ok(/A page of your own at linkedm\.org/.test(await L.page.locator("[data-page-card]").innerText()), `${kind}: /me offers the page, in plain words`);
  await calm(L.page, `${kind}: /me before the page`); await big(L.page, `${kind}: /me before the page`);
  await L.page.click("[data-act=page-start]");
  await L.page.waitForSelector("[data-page-form]");
  ok((await L.page.inputValue("input[name=slug]")) === SLUG, `${kind}: the address is chosen from the name: linkedm.org/m/${SLUG}`);
  await snap(L.page, `page-form-empty-${px}`);
  await L.page.fill("input[name=tagline]", "A hot meal every Saturday for our neighbors");
  await L.page.fill("textarea[name=about]", "We serve a hot meal at noon every Saturday. Everyone is welcome, and no one is asked who they are.\nOn Thursdays we run a youth night.");
  await L.page.click("[data-act=meet-add]"); await L.page.click("[data-act=meet-add]");
  const rows = L.page.locator("[data-meet]");
  ok((await rows.count()) === 2, `${kind}: two rows for when and where we meet`);
  await rows.nth(0).locator("select").selectOption("Saturdays"); await rows.nth(0).locator("input").nth(0).fill("12:00 pm"); await rows.nth(0).locator("input").nth(1).fill("Grace Hall, 12 Main Street");
  await rows.nth(1).locator("select").selectOption("Thursdays"); await rows.nth(1).locator("input").nth(0).fill("6:30 pm"); await rows.nth(1).locator("input").nth(1).fill("The church basement");
  await L.page.fill("input[name=email]", "hello@journey.example"); await L.page.fill("input[name=phone]", "206-555-0100"); await L.page.fill("input[name=website]", "https://journey.example.org"); await L.page.fill("input[name=give_url]", "https://pay.journey.example/give");
  await L.page.selectOption("select[name=verse]", "isa_58_7");
  await L.page.setInputFiles("#page-photo-file", photoFile);
  await L.page.waitForSelector("[data-photos] img");
  ok((await L.page.locator("[data-photos] img").count()) === 1, `${kind}: the picture was added and is shown`);
  await L.page.locator("[data-photos] input[type=text]").first().fill("The hall set for supper");
  await calm(L.page, `${kind}: the filled form`); await big(L.page, `${kind}: the filled form`);
  await snap(L.page, `page-form-filled-${px}`);
  await L.page.click("[data-act=page-save]");
  await L.page.waitForSelector("text=Saved as a draft. Only your ministry can see it.");
  ok(/A draft/.test(await L.page.locator("[data-page-card]").innerText()), `${kind}: saved as a draft: the page says so`);
  await L.page.click("[data-act=page-edit]"); await L.page.waitForSelector("[data-page-form]");
  ok((await L.page.inputValue("input[name=tagline]")) === "A hot meal every Saturday for our neighbors" && (await L.page.locator("[data-meet]").count()) === 2 && (await L.page.locator("[data-photos] img").count()) === 1, `${kind}: the draft comes back into the form as it was left`);
  ok(!(await L.page.locator("input[name=slug]").isDisabled()), `${kind}: the address can still be changed once, because the page is not public`);
  await L.page.click("[data-act=page-send]");
  await L.page.waitForSelector("text=Sent. It is waiting for a person at Linked Ministries to read it.");
  const cardText = await L.page.locator("[data-page-card]").innerText();
  ok(/Waiting for a person at Linked Ministries to read it/.test(cardText) && !/Anyone can see|public page/i.test(cardText.replace("Open your public page", "")), `${kind}: it says "Waiting for a person at Linked Ministries to read it" and nothing says it is public`);
  await calm(L.page, `${kind}: /me after sending`);
  await snap(L.page, `page-waiting-${px}`);
  const prevPage = await L.ctx.newPage(); await prevPage.goto(`/m/${SLUG}`);
  ok(/Only your ministry can see this/.test(await prevPage.locator("main").innerText()), `${kind}: "See how it looks" shows a private preview`); await prevPage.close();
  const A = await open(browser, s.base, kind);
  ok((await A.page.goto(`/m/${SLUG}`)).status() === 404, `${kind}: signed out, the page is not there yet`);

  /* ---- a steward reads the ministry, then the page, in the browser ---- */
  const S = await open(browser, s.base, kind); await S.ctx.addCookies([asCookie(stew)]);
  await S.page.goto("/steward"); await S.page.waitForSelector(`[data-page]`);
  const pageCard = S.page.locator("[data-page]").first();
  ok(/A new page/.test(await pageCard.innerText()) && /Read the ministry first/.test(await pageCard.innerText()) && /A hot meal every Saturday/.test(await pageCard.innerText()), `${kind}: the steward sees the new page, every word of it, and is told to read the ministry first`);
  ok((await pageCard.locator("img.thumb").count()) === 1 && await pageCard.locator("img.thumb").evaluate((im) => im.complete && im.naturalWidth > 0), `${kind}: and the picture`);
  await calm(S.page, `${kind}: the steward's queue`); await snap(S.page, `steward-page-${px}`);
  await S.page.locator("[data-ministry]").first().locator("button:has-text('Approve')").click();
  await S.page.waitForSelector("text=Approved."); await S.page.waitForSelector("[data-page]");
  await S.page.locator("[data-page]").first().locator("button:has-text('Approve')").click();
  await until(async () => (await S.page.locator("[data-page]").count()) === 0, "the page to leave the queue");

  /* ---- the visitor opens it signed out ---- */
  const resp = await A.page.goto(`/m/${SLUG}`);
  ok(resp.status() === 200, `${kind}: signed out, linkedm.org/m/${SLUG} opens`);
  await A.page.waitForSelector(".mphoto img");
  await A.page.evaluate(() => Promise.all([...document.images].map((im) => im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
  const body = await A.page.locator("main").innerText();
  ok(new RegExp(NAME).test(await A.page.locator("h1").innerText()) && /A hot meal every Saturday for our neighbors/.test(body) && /Seattle, WA/.test(body), `${kind}: the name, the one line and the town`);
  ok(/Saturdays/.test(body) && /Grace Hall, 12 Main Street/.test(body) && /Thursdays/.test(body) && /6:30 pm/.test(body), `${kind}: when and where they meet`);
  ok(/hello@journey\.example/.test(body) && /206-555-0100/.test(body) && /journey\.example\.org/.test(body), `${kind}: how to reach them`);
  ok(/Isaiah 58:7/.test(body) && /A person at Linked Ministries read this page on/.test(body), `${kind}: the verse with its reference, and that a person read the page`);
  ok(!(await A.page.locator("a:has-text('Give to')").count()), `${kind}: no Give button while the giving door is closed`);
  ok(await A.page.locator(".mphoto img").evaluate((im) => im.naturalWidth > 0), `${kind}: the picture loaded`);
  ok((await A.page.title()) === `${NAME} · Linked Ministries`, `${kind}: its own title`);
  await calm(A.page, `${kind}: the public page`); await big(A.page, `${kind}: the public page`);
  await snap(A.page, `ministry-page-${px}`);
  const pdf = await A.page.pdf({ format: "A4", printBackground: true });
  ok(pdf.subarray(0, 5).toString() === "%PDF-" && pdf.length > 8000 && (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length >= 1, `${kind}: the page prints to a PDF (${pdf.length} bytes, ${(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length} page)`);
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, `ministry-page-${px}.pdf`), pdf);

  for (const [who, h] of [["lead", L], ["steward", S], ["visitor", A]]) { ok(h.errors.length === 0, `${kind}: zero page errors for the ${who}`, h.errors); await h.close(); }
}
fs.rmSync(photoFile, { force: true });
await browser.close(); await pool.end(); await s.stop();
process.exit(T.done());

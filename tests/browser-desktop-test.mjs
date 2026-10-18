#!/usr/bin/env node
/* tests/browser-desktop-test.mjs: the site on a computer, 1440 by 900, in a real Chromium: every public page and every signed-in page
   (the poster's page and forms, the join form, the steward's queue, the treasury). Nothing scrolls sideways; no line of reading
   copy runs past about 80 characters; content sits in a centred column that is never wider than 1120 pixels; the top of the page puts
   the ways around beside the name and the Join button at the right edge of the column; Scripture is a quiet quotation with its own
   gold line, not a browser's indented block; the first thing on a page starts a steady distance below the top line; and a phone at 390
   is as it was (the same nav, no sideways scroll, every button 44 pixels or taller).
   LM_SHOTS=<dir> writes a screenshot of each page.   LEXOS_DB_NAME=linkedm_t_<mine> node tests/browser-desktop-test.mjs */
import { counter, ownDatabase, startServer, smtpStandIn, client, signIn } from "./helpers.mjs";
import { launch, open, noSideways, SHOTS, shots } from "./browser-lib.mjs";
import { seedWorld, seedAlexExtras, seedAlexPage } from "./seed.mjs";

const T = counter("browser-desktop-test"); const { ok } = T;
const db = await ownDatabase("browser_desktop"); const smtp = await smtpStandIn();
const s = await startServer({ url: db.url, env: { LEXOS_SMTP_URL: smtp.url, LEXOS_MAIL_FROM: "board@linkedm.test", LEXOS_NOTICE_EMAIL: "hello@linkedm.test" } });
ok(s.up, "the server is up", s.logText().slice(-300));
const { pool } = await import("../server/db.mjs");
const world = await seedWorld({ base: s.base, smtp, sql: (q) => pool.query(q) });
await seedAlexExtras({ world, smtp });
const pg = await seedAlexPage({ world });
await pool.query("select lm.make_treasurer('sam@linkedm.example')");
const newcomer = client(s.base); await signIn(newcomer, null, "newcomer@church.example", { smtp });
const browser = await launch(); const snap = shots(SHOTS);
const alex = world.c["alex@alpha.example"];
const post = Object.values(world.ids)[0];
const cookie = (c) => ({ name: "lm_session", value: c.jar().split("=").slice(1).join("="), url: s.base });

const PAGES = [
  ["front", "/"], ["board", "/board"], ["post", "/board/" + post], ["ministry", "/m/" + pg.slug], ["giving", "/giving"], ["give", "/give"], ["terms", "/terms"], ["privacy", "/privacy"], ["join", "/join"], ["notfound", "/nothing-here"],
  ["me", "/me", alex, "[data-group=public]"],
  ["me-postform", "/me", alex, "[data-group=public]", async (p) => { await p.click("button:has-text('Post an ask')"); await p.waitForSelector("form select[name=category]"); }],
  ["me-pageform", "/me", alex, "[data-act=page-edit], [data-act=page-start]", async (p) => { await p.click("[data-act=page-edit], [data-act=page-start]"); await p.waitForSelector("[data-page-form]"); }],
  ["join-signedin", "/join", newcomer, "input[name=name]"],
  ["steward", "/steward", world.sam, "[data-ministry]"],
  ["treasury", "/treasury", world.sam, "[data-summary]"],
];

/** the most characters on one rendered line, for reading copy: paragraphs, list items and quotations in the page's main part
    (not a table, a button, a field or a form's help text, which are not reading) */
const measure = (page) => page.evaluate(() => {
  const worst = { n: 0, text: "" };
  for (const el of document.querySelectorAll("main p, main li, main blockquote p, main dd")) {
    if (el.closest("form, table, .eden, [data-page-form], .chartcard")) continue;
    for (const node of [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim().length > 20)) {
      const lines = new Map(); const r = document.createRange();
      for (let i = 0; i < node.textContent.length; i++) { if (/\s/.test(node.textContent[i])) continue; r.setStart(node, i); r.setEnd(node, i + 1); const b = r.getBoundingClientRect(); if (!b.width) continue; const k = Math.round(b.top / 4); lines.set(k, (lines.get(k) || 0) + 1); }
      for (const [, n] of lines) if (n > worst.n) { worst.n = n; worst.text = node.textContent.trim().slice(0, 50); }
    }
  }
  return worst;
});
const box = (page, sel) => page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; }, sel);

for (const [name, url, who, wait, act] of PAGES) {
  const v = await open(browser, s.base, "desk"); if (who) await v.ctx.addCookies([cookie(who)]);
  await v.page.goto(url); if (wait) await v.page.waitForSelector(wait);
  if (act) await act(v.page);
  await v.page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo({ top: y, behavior: "instant" }); await new Promise((r) => setTimeout(r, 40)); } scrollTo({ top: 0, behavior: "instant" }); await document.fonts.ready; });
  await snap(v.page, `${name}-1440`);
  ok(await noSideways(v.page), `${name}: nothing scrolls sideways at 1440`);
  const m = await measure(v.page);
  ok(m.n <= 80, `${name}: no line of reading copy runs past 80 characters (the longest is ${m.n}: "${m.text}")`);
  const cols = await v.page.evaluate(() => [...document.querySelectorAll(".wrap")].map((w) => Math.round(w.getBoundingClientRect().width)));
  ok(cols.length > 0 && Math.max(...cols) <= 1120 && (await v.page.evaluate(() => document.querySelector("main .wrap, main article .wrap").getBoundingClientRect().left)) >= 150, `${name}: content sits in a centred column no wider than 1120 pixels`, cols);
  /* the top of the page */
  const lock = await box(v.page, ".top .lock"), links = await v.page.evaluate(() => [...document.querySelectorAll(".top .nav a:not(.btn)")].map((a) => { const r = a.getBoundingClientRect(); return { x: r.x, r: r.right }; })), join = await box(v.page, ".top .nav a.btn"), wrap = await box(v.page, ".top .wrap");
  ok(links.length === 3 && links[0].x - lock.r <= 60 && links[0].x > lock.r, `${name}: the ways around (Board, Giving, My ministry) sit beside the name, not across the page from it`, { gap: links[0].x - lock.r });
  ok(Math.abs(join.r - (wrap.r - 16)) <= 2 && join.x > links[2].r + 100, `${name}: the Join button sits at the right edge of the column, apart from the links and not floating`, { joinRight: join.r, edge: wrap.r - 16 });
  ok(Math.abs(lock.h - join.h) < 30 && Math.abs((lock.y + lock.h / 2) - (join.y + join.h / 2)) <= 3, `${name}: the name and the Join button are centred on one line`);
  /* the first thing on the page starts a steady distance below the top line */
  const gap = await v.page.evaluate(() => { const top = document.querySelector(".top").getBoundingClientRect().bottom; const first = [...document.querySelectorAll("main h1, main .eyebrow, main .draft, main .back, main .note, main .card, main .empty")].filter((e) => e.getBoundingClientRect().height > 0).map((e) => e.getBoundingClientRect().top).sort((a, b) => a - b)[0]; return Math.round(first - top); });
  ok(gap >= 24 && gap <= 130, `${name}: the first thing on the page starts ${gap} pixels under the top line (between 24 and 130)`);
  /* a quotation is a quotation */
  const q = await v.page.evaluate(() => [...document.querySelectorAll("blockquote.scripture")].map((b) => { const cs = getComputedStyle(b); return { bl: cs.borderLeftWidth, bc: cs.borderLeftColor, ml: cs.marginLeft, w: Math.round(b.getBoundingClientRect().width), cite: !!b.querySelector("cite") }; }));
  if (q.length) ok(q.every((x) => x.bl === "4px" || x.bl === "3px") && q.every((x) => x.bc === "rgb(217, 119, 6)") && q.every((x) => x.ml === "0px" && x.w <= 645 && x.cite), `${name}: ${q.length} quotation(s) of Scripture have the gold line, no browser indent, a short measure and their reference`, q[0]);
  if (name === "ministry") { const hero = await box(v.page, ".mhero"), top = await box(v.page, ".top"); ok(Math.abs(hero.y - top.b) <= 1, "ministry: the white hero meets the top line with no strip of ground between"); }
  ok(v.errors.length === 0, `${name}: zero page errors`, v.errors.slice(0, 3));
  await v.close();
}

/* the signed-in columns are a little wider than a phone's, so rows and forms do not squeeze */
{ const v = await open(browser, s.base, "desk"); await v.ctx.addCookies([cookie(world.sam)]);
  await v.page.goto("/treasury"); await v.page.waitForSelector("[data-summary]");
  const cards = await v.page.evaluate(() => [...document.querySelectorAll("[data-summary] > *")].map((c) => { const r = c.getBoundingClientRect(); return { y: Math.round(r.top), h: Math.round(r.height) }; }));
  ok(cards.length === 4 && new Set(cards.map((c) => c.y)).size === 1, "the treasury's four totals sit on one row", cards);
  const wrapW = (await box(v.page, "main .wrap")).w; ok(wrapW === 880, "the steward's and the treasurer's pages use an 880-pixel column", wrapW);
  await v.close(); }
{ const v = await open(browser, s.base, "desk"); await v.ctx.addCookies([cookie(alex)]);
  await v.page.goto("/me"); await v.page.waitForSelector("[data-act=page-edit], [data-act=page-start]"); ok((await box(v.page, "main .wrap")).w === 720, "the poster's page uses a 720-pixel column"); await v.page.click("[data-act=page-edit], [data-act=page-start]"); await v.page.waitForSelector("[data-page-form]");
  const places = await v.page.evaluate(() => [...document.querySelectorAll(".meetrow input[name=place], .meetrow input")].filter((i) => i.name === "place" || /place/i.test(i.name || "")).map((i) => Math.round(i.getBoundingClientRect().width)));
  ok(places.length >= 1 && places.every((w) => w >= 200), "in the page form, the 'place' box of a meeting is wide enough to read an address", places); await v.close(); }

/* the phone is as it was: the nav is a row of its own under the name, the Join button is at its right, nothing scrolls sideways, every button is 44 pixels tall */
for (const [name, url, who, wait] of PAGES.filter((p) => ["front", "board", "ministry", "giving", "terms", "join", "me", "steward", "treasury"].includes(p[0]))) {
  const v = await open(browser, s.base, "phone"); if (who) await v.ctx.addCookies([cookie(who)]);
  await v.page.goto(url); if (wait) await v.page.waitForSelector(wait);
  await v.page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo({ top: y, behavior: "instant" }); await new Promise((r) => setTimeout(r, 40)); } scrollTo({ top: 0, behavior: "instant" }); await document.fonts.ready; });
  await snap(v.page, `${name}-390`);
  ok(await noSideways(v.page), `${name}: nothing scrolls sideways at 390`);
  const lock = await box(v.page, ".top .lock"), nav = await box(v.page, ".top .nav"), join = await box(v.page, ".top .nav a.btn");
  ok(nav.y >= lock.b - 2 && nav.w >= 340 && join.r >= 390 - 20, `${name}: on a phone the ways around are a row under the name, with Join at its right`, { navTop: nav.y, lockBottom: lock.b });
  const small = await v.page.evaluate(() => [...document.querySelectorAll("main a.btn, main button, header a.btn")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 43.5; }).map((el) => (el.textContent || "").trim().slice(0, 20)));
  ok(small.length === 0, `${name}: every button is 44 pixels or taller at 390`, small);
  ok(v.errors.length === 0, `${name}: zero page errors at 390`, v.errors.slice(0, 3));
  await v.close();
}
await browser.close(); await s.stop(); await smtp.stop(); await pool.end();
process.exit(T.done());

#!/usr/bin/env node
/* tests/browser-pwa-test.mjs: the installable app in a real Chromium. The manifest comes with the right content type and every icon
   it names loads; the worker registers at the root, activates and takes over; an /api answer is never served from the device (the
   second read sees a change the first did not); nothing but the shell is kept; with the network cut, a page and a signed-in page
   both show the plain offline page, styled in the site's own light look, and an /api call fails instead of answering from a cache.
   The install card: a synthetic beforeinstallprompt shows it, the button calls prompt(), and "Added" appears only after a
   synthetic appinstalled; "Not now" and an install keep it away for 30 days; it never shows on a computer, in the app window, or on
   the public pages; an iPhone sees the two real steps with the Share icon; it works with no localStorage.
   LEXOS_DB_NAME=linkedm_t_<mine> node tests/browser-pwa-test.mjs */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { counter, ownDatabase, startServer, smtpStandIn, client, signIn, sleep } from "./helpers.mjs";
import { launch, open, noSideways, PHONE, SHOTS, shots, ROOT } from "./browser-lib.mjs";
import { seedWorld, seedAlexPage } from "./seed.mjs";

const T = counter("browser-pwa-test"); const { ok } = T;
const db = await ownDatabase("browser_pwa"); const smtp = await smtpStandIn();
const s = await startServer({ url: db.url, env: { LEXOS_SMTP_URL: smtp.url, LEXOS_MAIL_FROM: "board@linkedm.test" } });
ok(s.up, "the server is up", s.logText().slice(-300));
const { pool } = await import("../server/db.mjs");
const world = await seedWorld({ base: s.base, smtp, sql: (q) => pool.query(q) });
const pg = await seedAlexPage({ world });
const browser = await launch(); const snap = shots(SHOTS);
const alex = world.c["alex@alpha.example"];
const cookie = (c) => ({ name: "lm_session", value: c.jar().split("=").slice(1).join("="), url: s.base });
const DAY = 86400000;

/* ---- the manifest and its icons, over the wire ---- */
{ const r = await fetch(s.base + "/manifest.webmanifest"); const m = await r.json();
  ok(r.status === 200 && /^application\/manifest\+json/.test(r.headers.get("content-type")), "the manifest is served as application/manifest+json", r.headers.get("content-type"));
  ok(m.name === "Linked Ministries" && m.start_url === "/" && m.display === "standalone", "and says the name, the start and the window");
  for (const i of m.icons) { const x = await fetch(s.base + i.src); ok(x.status === 200 && /^image\/(png|svg\+xml)/.test(x.headers.get("content-type")), `the icon ${i.src} loads (${x.headers.get("content-type")})`); }
  const w = await fetch(s.base + "/sw.js");
  ok(w.status === 200 && /javascript/.test(w.headers.get("content-type")) && /no-cache/.test(w.headers.get("cache-control")), "the worker is served from the root as JavaScript, and a browser always asks again for it", [w.headers.get("content-type"), w.headers.get("cache-control")]);
  const csp = w.headers.get("content-security-policy") || ""; ok(/worker-src 'self'(;|$)/.test(csp) && /script-src 'self';/.test(csp) && !/unsafe/.test(csp), "the policy lets the worker run from this site, and nothing is loosened", csp);
  const off = await fetch(s.base + "/offline.html"); ok(off.status === 200 && /You are offline\./.test(await off.text()), "the offline page is served"); }

/* ---- every page carries the head ---- */
{ const post = Object.values(world.ids)[0];
  for (const p of ["/", "/board", "/board/" + post, "/giving", "/give", "/terms", "/privacy", "/join", "/me", "/review", "/money", "/steward", "/treasury", "/m/" + pg.slug, "/nothing-here"]) {
    const r = await fetch(s.base + p), t = await r.text(), head = t.slice(0, t.indexOf("</head>"));
    ok(/<link rel="manifest" href="\/manifest\.webmanifest">/.test(head) && /name="theme-color" content="#fbf8f3"/.test(head) && /apple-mobile-web-app-capable/.test(head) && /apple-touch-icon/.test(head) && t.includes('<script type="module" src="/js/pwa.js">'), `${p} (${r.status}): manifest link, theme colour, Apple tags and the registration script`); } }

/* ---- the worker registers, activates, and keeps only the shell ---- */
const v = await open(browser, s.base, "desk");
await v.page.goto("/");
const reg = await v.page.evaluate(async () => { const r = await Promise.race([navigator.serviceWorker.ready, new Promise((x) => setTimeout(() => x(null), 8000))]); if (!r) return null; for (let i = 0; i < 50 && r.active && r.active.state !== "activated"; i++) await new Promise((x) => setTimeout(x, 100)); return { scope: r.scope, state: r.active && r.active.state, script: r.active && r.active.scriptURL }; });
ok(reg && reg.scope === s.base + "/" && reg.script === s.base + "/sw.js" && reg.state === "activated", "the worker registers at the root scope and activates", reg);
const linked = await v.page.evaluate(async () => { const l = document.querySelector("link[rel=manifest]"); const r = await fetch(l.href); return { href: l.href, type: r.headers.get("content-type"), name: (await r.json()).name }; });
ok(linked.href === s.base + "/manifest.webmanifest" && /manifest\+json/.test(linked.type) && linked.name === "Linked Ministries", "the page's own manifest link fetches the manifest", linked);
await v.page.reload();
await until(async () => v.page.evaluate(() => !!navigator.serviceWorker.controller), "the worker to control the page");
async function until(fn, what) { for (let i = 0; i < 60; i++) { if (await fn()) return true; await sleep(100); } ok(false, "waited for " + what); return false; }
ok(await v.page.evaluate(() => !!navigator.serviceWorker.controller), "the worker controls the page after a reload");
const kept = await v.page.evaluate(async () => { const out = {}; for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname); return out; });
const keptAll = Object.values(kept).flat();
ok(Object.keys(kept).join() === "lm-shell-v1" && keptAll.includes("/offline.html") && keptAll.includes("/css/lm.css") && keptAll.filter((p) => p.startsWith("/fonts/")).length === 6, "the device holds one cache with the offline page, the stylesheet and the faces", kept);
ok(!keptAll.some((p) => /^\/(api|me|review|money|steward|treasury|join|photos|board|giving|m)(\/|$)/.test(p) || p === "/" || /\.js$/.test(p)), "and not one page, script, picture or /api answer", keptAll);

/* ---- an /api request is never answered from the device ---- */
const board = async () => v.page.evaluate(async () => { const r = await fetch("/api/board"); const j = await r.json(); return { total: j.total, fromWorker: performance.getEntriesByName(r.url).slice(-1)[0] && performance.getEntriesByName(r.url).slice(-1)[0].workerStart > 0 }; });
const first = await board();
const toClose = world.ids["Surplus canned goods, forty cases"];
const closed = await alex.post(`/api/posts/${toClose}/close`, { reason: "met" });
ok(closed.status === 200, "(a post is closed behind the page's back)", closed.text);
const second = await board();
ok(first.total - second.total === 1, `the second read of /api/board sees the change the first did not: ${first.total} then ${second.total}, so it was not served from a cache`);
const keptAfter = await v.page.evaluate(async () => { const out = []; for (const k of await caches.keys()) out.push(...(await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname)); return out; });
ok(!keptAfter.some((p) => p.startsWith("/api")), "and no /api address is in any cache after reading it twice", keptAfter);
const before = (await fetch(s.base + "/api/board")).status;
ok(before === 200, "(the API is up)");

/* ---- the install card ---- */
const phone = async ({ who = alex, ua, script, extra = {} } = {}) => {
  const ctx = await browser.newContext({ ...PHONE, ...(ua ? { userAgent: ua } : {}), ...extra, timezoneId: "America/Los_Angeles", locale: "en-US", baseURL: s.base });
  const errors = []; ctx.on("page", (p) => { p.on("pageerror", (e) => errors.push("pageerror: " + e.message)); p.on("console", (m) => { if (m.type() === "error" && !/status of 4\d\d/.test(m.text())) errors.push("console: " + m.text().slice(0, 160)); }); });
  if (who) await ctx.addCookies([cookie(who)]);
  if (script) await ctx.addInitScript(script);
  const page = await ctx.newPage(); return { ctx, page, errors };
};
const fire = (page, name = "beforeinstallprompt", outcome = "accepted") => page.evaluate(([name, outcome]) => {
  const ev = new Event(name, { cancelable: true });
  if (name === "beforeinstallprompt") { window.__prompts = window.__prompts || 0; ev.prompt = async () => { window.__prompts++; }; ev.userChoice = Promise.resolve({ outcome, platform: "web" }); }
  window.dispatchEvent(ev); return ev.defaultPrevented;
}, [name, outcome]);
const card = (page) => page.locator("section.install:not([hidden])");
const CARD_WORDS = { title: "Put Linked Ministries on your phone", why: "It opens like an app, with one tap to the board." };
const stored = (page) => page.evaluate(() => { try { return Number(localStorage.getItem("lm_install_until")) || 0; } catch (e) { return -1; } });

{ /* Chrome on Android: the card waits for the browser's event */
  const A = await phone();
  await A.page.goto("/me"); await A.page.waitForSelector("[data-group=public]");
  ok((await card(A.page).count()) === 0, "Android: before the browser says the site can be installed, there is no card and no promise");
  const prevented = await fire(A.page);
  await card(A.page).waitFor({ timeout: 3000 });
  const ct = await card(A.page).innerText();
  ok(prevented === true && ct.includes(CARD_WORDS.title) && ct.includes(CARD_WORDS.why) && (await card(A.page).locator("button:has-text('Add to my phone')").count()) === 1 && (await card(A.page).locator("img.install-mark[src='/img/icon.svg']").count()) === 1, "Android: a beforeinstallprompt event is held (the browser's own bar is kept back) and the card shows the mark, the title, the reason and the button", ct);
  ok(!/Added/.test(ct) && (await A.page.evaluate(() => window.__prompts || 0)) === 0, "Android: it says nothing is added, and has called nothing yet");
  await snap(A.page, "install-android-390");
  ok(await noSideways(A.page), "Android: the card makes nothing scroll sideways");
  const hs = await card(A.page).locator("button").evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().height)));
  ok(hs.length === 2 && hs.every((h) => h >= 44), "Android: both buttons are at least 44 pixels tall", hs);
  await card(A.page).locator("button:has-text('Add to my phone')").click();
  await A.page.waitForSelector("[data-state=waiting]");
  ok((await A.page.evaluate(() => window.__prompts)) === 1, "Android: pressing the button calls prompt() once");
  const waiting = await card(A.page).innerText();
  ok(!/Added\./.test(waiting) && /Your phone is asking you now/.test(waiting) && (await card(A.page).locator("[data-state=added]").count()) === 0, "Android: after the person says yes, the card still does not say Added (the install has not happened yet)", waiting);
  ok((await stored(A.page)) === 0, "Android: and it has not yet been put to rest for 30 days");
  await fire(A.page, "appinstalled");
  await A.page.waitForSelector("[data-state=added]");
  const added = await card(A.page).innerText();
  ok(/Added\. Open Linked Ministries from your home screen\./.test(added), "Android: only when the appinstalled event fires does the card say 'Added. Open Linked Ministries from your home screen.'", added);
  const until30 = await stored(A.page);
  ok(until30 > Date.now() + 29 * DAY && until30 < Date.now() + 31 * DAY, "Android: and the card is put to rest for 30 days", (until30 - Date.now()) / DAY);
  await A.page.reload(); await A.page.waitForSelector("[data-group=public]"); await fire(A.page);
  await sleep(300);
  ok((await card(A.page).count()) === 0, "Android: after the install, a new visit (even with the event again) shows no card");
  ok(A.errors.length === 0, "Android: zero page errors", A.errors.slice(0, 3));
  await A.ctx.close(); }

{ /* "Not now" keeps it away for 30 days */
  const A = await phone();
  await A.page.goto("/me"); await A.page.waitForSelector("[data-group=public]"); await fire(A.page); await card(A.page).waitFor();
  await card(A.page).locator("button:has-text('Not now')").click();
  ok((await card(A.page).count()) === 0, "Not now: the card goes away at once");
  const u = await stored(A.page); ok(u > Date.now() + 29 * DAY && u < Date.now() + 31 * DAY, "Not now: and stays away for 30 days", (u - Date.now()) / DAY);
  await A.page.reload(); await A.page.waitForSelector("[data-group=public]"); await fire(A.page); await sleep(300);
  ok((await card(A.page).count()) === 0, "Not now: a new visit shows no card");
  await A.page.evaluate(() => localStorage.setItem("lm_install_until", String(Date.now() - 1000)));
  await A.page.reload(); await A.page.waitForSelector("[data-group=public]"); await fire(A.page); await card(A.page).waitFor({ timeout: 3000 });
  ok((await card(A.page).count()) === 1, "Not now: once the 30 days are over, it may show again (never sooner)");
  await A.ctx.close(); }

{ /* the browser's own prompt, turned down: no "Added", and it rests */
  const A = await phone();
  await A.page.goto("/me"); await A.page.waitForSelector("[data-group=public]"); await fire(A.page, "beforeinstallprompt", "dismissed"); await card(A.page).waitFor();
  await card(A.page).locator("button:has-text('Add to my phone')").click(); await sleep(400);
  ok((await card(A.page).count()) === 0 && !/Added/.test(await A.page.locator("main").innerText()) && (await stored(A.page)) > Date.now() + 29 * DAY, "dismissed: if the person turns the phone's own question down, the card goes, nothing says Added, and it rests 30 days");
  await A.ctx.close(); }

{ /* an iPhone: no prompt exists, so the two real steps */
  const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
  const I = await phone({ ua: IPHONE_UA });
  await I.page.goto("/me"); await I.page.waitForSelector("[data-group=public]"); await card(I.page).waitFor({ timeout: 3000 });
  const ct = await card(I.page).innerText();
  ok(/Put Linked Ministries on your phone/.test(ct) && /Tap the Share button\./.test(ct) && /Then tap Add to Home Screen\./.test(ct) && !/Added/.test(ct) && (await card(I.page).locator("button:has-text('Add to my phone')").count()) === 0, "iPhone: the card shows the two steps, 'Tap the Share button.' then 'Then tap Add to Home Screen.', and no button that could not work", ct);
  ok((await card(I.page).locator("li svg.share-ico[viewBox='0 0 24 24'] path").count()) === 3 && (await card(I.page).locator("ol li").count()) === 2, "iPhone: the Share icon is drawn as an SVG inside step one");
  await snap(I.page, "install-iphone-390");
  ok(await noSideways(I.page), "iPhone: nothing scrolls sideways");
  await card(I.page).locator("button:has-text('Not now')").click();
  await I.page.reload(); await I.page.waitForSelector("[data-group=public]"); await sleep(300);
  ok((await card(I.page).count()) === 0, "iPhone: after Not now, a new visit shows no card");
  ok(I.errors.length === 0, "iPhone: zero page errors", I.errors.slice(0, 3));
  await I.ctx.close(); }

{ /* places and states where it must not show */
  const D = await open(browser, s.base, "desk"); await D.ctx.addCookies([cookie(alex)]);
  await D.page.goto("/me"); await D.page.waitForSelector("[data-group=public]"); await fire(D.page); await sleep(300);
  ok((await D.page.locator("section.install").count()) === 0, "a computer: no card (the words say 'your phone')");
  await D.close();
  const S = await phone({ script: "Object.defineProperty(navigator, 'standalone', { get: () => true })" });
  await S.page.goto("/me"); await S.page.waitForSelector("[data-group=public]"); await fire(S.page); await sleep(300);
  ok((await S.page.locator("section.install").count()) === 0, "already open as an app (standalone): no card");
  await S.ctx.close();
  const P = await phone({ who: null });
  for (const p of ["/", "/board", "/giving"]) { await P.page.goto(p); await fire(P.page); await sleep(200); ok((await P.page.locator("section.install").count()) === 0, `the public page ${p}: never a card`); }
  await P.ctx.close();
  const N = await phone({ script: "Object.defineProperty(window, 'localStorage', { get() { throw new Error('no storage'); } })" });
  await N.page.goto("/me"); await N.page.waitForSelector("[data-group=public]"); await fire(N.page); await card(N.page).waitFor({ timeout: 3000 });
  await card(N.page).locator("button:has-text('Not now')").click();
  ok((await N.page.locator("section.install").count()) === 0 && N.errors.length === 0, "with no localStorage at all: the card still works, and nothing throws", N.errors.slice(0, 2));
  await N.ctx.close(); }

{ /* /join, once signed in with no ministry yet */
  const fresh = client(s.base); await signIn(fresh, s, "newcomer@church.example", { smtp });
  const J = await phone({ who: fresh });
  await J.page.goto("/join"); await J.page.waitForSelector("input[name=name]"); await fire(J.page); await card(J.page).waitFor({ timeout: 3000 });
  ok(/Put Linked Ministries on your phone/.test(await card(J.page).innerText()) && (await J.page.locator("input[name=name]").count()) === 1, "/join once signed in: the same card sits between the lead and the form");
  await snap(J.page, "install-join-390");
  await J.ctx.close();
  const out = await phone({ who: null }); await out.page.goto("/join"); await out.page.waitForSelector("input[type=email]"); await fire(out.page); await sleep(200);
  ok((await out.page.locator("section.install").count()) === 0, "/join signed out: no card (it asks only after a person is in)"); await out.ctx.close(); }

/* ---- offline: the plain page, in the site's own look, and nothing answered from the device ---- */
/* the network is really cut: the server is stopped, so the browser and the worker both find nothing to reach (Playwright's own offline switch does not reach a worker) */
await s.stop(); await sleep(300);
await v.page.goto("/board").catch(() => {});
await v.page.waitForSelector("h1");
let t = await v.page.locator("main").innerText();
ok(/You are offline\./.test(t) && /Nothing was sent and nothing was saved/.test(t) && !/Ministries helping|Prayer partners/.test(await v.page.locator("body").innerText()), "with the network cut, a page says plainly that it is offline and that nothing was sent, and shows no board", t.slice(0, 160));
const look = await v.page.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, h1: getComputedStyle(document.querySelector("h1")).fontFamily, btn: getComputedStyle(document.querySelector("a.btn")).backgroundColor, sideways: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 }));
ok(look.bg === "rgb(251, 248, 243)" && /Fraunces/.test(look.h1) && look.btn === "rgb(27, 36, 48)" && look.sideways, "and it is dressed in the site's own light look (the pale ground, the serif title, the ink button), from the device's copy of the stylesheet", look);
await snap(v.page, "offline-1440");
await v.page.goto("/me").catch(() => {}); await v.page.waitForSelector("h1");
ok(/You are offline\./.test(await v.page.locator("main").innerText()), "a signed-in page (/me) offline shows the offline page, never a kept copy of itself");
const apiOffline = await v.page.evaluate(async () => { try { const r = await fetch("/api/board"); return "answered " + r.status; } catch (e) { return "failed"; } });
ok(apiOffline === "failed", "an /api call offline fails; it is not answered from a cache", apiOffline);
const postOffline = await v.page.evaluate(async () => { try { const r = await fetch("/api/auth/start", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); return "answered " + r.status; } catch (e) { return "failed"; } });
ok(postOffline === "failed", "a POST offline fails too, so nothing is shown as sent");
const again = spawn(process.execPath, [path.join(ROOT, "server", "index.mjs")], { env: { ...process.env, PORT: String(s.port), DATABASE_URL: db.url, LEXOS_ENV: "test", LEXOS_PUBLIC_URL: s.base, LEXOS_DEV_CODES: "1", LEXOS_SMTP_URL: smtp.url, LEXOS_MAIL_FROM: "board@linkedm.test" }, stdio: "ignore" });
await until(async () => { try { return (await fetch(s.base + "/api/health")).status === 200; } catch (e) { return false; } }, "the server to come back");
await v.page.goto("/board"); await v.page.waitForSelector("article.post");
ok((await v.page.locator("article.post").count()) >= 1 && !/You are offline/.test(await v.page.locator("main").innerText()), "back online, the board loads from the network again");
ok(v.errors.filter((e) => !/ERR_CONNECTION_REFUSED|ERR_INTERNET_DISCONNECTED|Failed to fetch|requestfailed: \S+\/api\/(board|auth\/start)$/.test(e)).length === 0, "no page error on the way (the two calls made on purpose with the network cut are not errors)", v.errors.slice(0, 3));
await v.close(); again.kill();

await browser.close(); await smtp.stop(); await pool.end();
process.exit(T.done());

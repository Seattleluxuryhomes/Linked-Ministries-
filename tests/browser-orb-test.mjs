#!/usr/bin/env node
/* tests/browser-orb-test.mjs — Eden's floating orb in a real Chromium: a desk at 1440 (a mouse) and a phone at 390 (a finger, sent as
   real touch events through the browser's own protocol).
   It rests bottom-right, a little bolder than a corner widget (72 pixels on a phone, 84 on a desk), above the content, with a gold
   glow. It wanders slowly on its own when nobody is using the page, and holds still when a person is: panel open, a pointer near, a
   dialog open, or after the person moved it. A drag takes it anywhere, never outside the screen, and on release it slides to the
   nearest of the four edges and can rest anywhere along it. A tap (6 pixels or less) opens the panel beside the orb, wholly on the
   screen. The arrow keys move it 24 pixels, Enter opens it, Escape closes it. With less motion asked for it does not wander, breathe or
   animate its slide, and is still dragged. With no key on the server it is grey and says so. Zero page errors.
   The wander is BidVoice's (9 seconds quiet, one move in 24, a 2.4 second glide); the browser's clock is moved forward so the test
   need not wait for it.   LM_SHOTS=<dir> writes the screenshots.   LEXOS_DB_NAME=linkedm_t_<mine> node tests/browser-orb-test.mjs */
import path from "node:path";
import fs from "node:fs";
import { counter, ownDatabase, startServer, client, signIn, modelStandIn, sleep } from "./helpers.mjs";
import { launch, open, SHOTS, PHONE, DESK } from "./browser-lib.mjs";
import { snapToEdge, roamAnchors, GAP, NUDGE } from "../public/js/eden-place.js";

const T = counter("browser-orb-test"); const { ok } = T;
const db = await ownDatabase("browser_orb"); const model = await modelStandIn();
const s = await startServer({ url: db.url, env: { ANTHROPIC_API_KEY: "sk-test-not-a-real-key-0123456789", ANTHROPIC_BASE_URL: model.url, EDEN_LIMIT_HOUR: "1000", EDEN_LIMIT_DAY: "1000" } });
const s0 = await startServer({ url: db.url, env: { ANTHROPIC_API_KEY: "", ANTHROPIC_BASE_URL: model.url } });
ok(s.up && s0.up, "the servers are up");
const { pool } = await import("../server/db.mjs");
const browser = await launch();
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const shot = (page, name) => SHOTS ? page.screenshot({ path: path.join(SHOTS, name + ".png") }) : null;   /* the screen as it is: the orb is fixed to it */
const asCookie = (c, base) => { const kv = c.jar().split("=", 2); return { name: kv[0], value: c.jar().slice(kv[0].length + 1), url: base }; };
const lead = client(s.base), lead0 = client(s0.base);
await signIn(lead, s, "lead@orb.example"); await signIn(lead0, s0, "lead@orb.example");
await lead.post("/api/ministry", { name: "Orb Browser Ministry", city: "Seattle", state: "WA", about: "We feed neighbors every week and run a small youth night.", contact_name: "Lee Lead", contact_email: "lead@orb.example", website: "" });
await lead0.post("/api/ministry", { name: "Orb Browser Ministry", city: "Seattle", state: "WA", about: "We feed neighbors every week and run a small youth night.", contact_name: "Lee Lead", contact_email: "lead@orb.example", website: "" });

/** a page with the browser's clock under our hand, signed in, on the ask form */
async function scene(kind, { base = s.base, cl = lead, reduced = false, clock = true } = {}) {
  const C = await open(browser, base, kind);
  if (reduced) { await C.ctx.close(); const ctx = await browser.newContext({ ...(kind === "phone" ? PHONE : DESK), reducedMotion: "reduce", timezoneId: "America/Los_Angeles", locale: "en-US", baseURL: base }); const errors = []; const page = await ctx.newPage(); page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200))); page.on("console", (m) => { if (m.type() === "error" && !/^Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)); }); Object.assign(C, { ctx, page, errors, close: () => ctx.close() }); }
  await C.ctx.addCookies([asCookie(cl, base)]);
  if (clock) await C.page.clock.install();
  await C.page.goto("/me"); await C.page.waitForSelector("button:has-text('Post an ask')"); await C.page.click("button:has-text('Post an ask')");
  await C.page.waitForSelector("[data-eden-float]:not([hidden]) [data-eden-orb-button]");
  C.vp = await C.page.evaluate(() => ({ w: document.documentElement.clientWidth, h: window.innerHeight }));
  C.rect = () => C.page.locator("[data-eden-float]").evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  C.panelRect = () => C.page.locator("[data-eden-panel]").evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, hidden: e.hidden }; });
  C.cdp = kind === "phone" ? await C.ctx.newCDPSession(C.page) : null;
  C.kind = kind;
  /* one pointer, whichever the kind: a mouse on a desk, a finger on a phone */
  C.down = async (x, y) => { if (C.cdp) await C.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] }); else { await C.page.mouse.move(x, y); await C.page.mouse.down(); } };
  C.move = async (x, y) => { if (C.cdp) await C.cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] }); else await C.page.mouse.move(x, y); };
  C.up = async () => { if (C.cdp) await C.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); else await C.page.mouse.up(); };
  C.drag = async (from, to, { hold = false } = {}) => { await C.down(from.x, from.y); const n = 8; for (let i = 1; i <= n; i++) { await C.move(from.x + (to.x - from.x) * i / n, from.y + (to.y - from.y) * i / n); await sleep(16); } if (!hold) await C.up(); };
  C.tap = async (x, y) => { if (C.cdp) { await C.down(x, y); await sleep(40); await C.up(); } else await C.page.mouse.click(x, y); };
  C.centre = async () => { const r = await C.rect(); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; };
  /* jump the browser's clock forward, then wait out the 2.4 second glide, which the stylesheet runs in real time */
  C.later = async (ms) => { await C.page.clock.fastForward(ms); await sleep(2900); };
  return C;
}
const inside = (r, vp) => r.x >= -0.6 && r.y >= -0.6 && r.x + r.w <= vp.w + 0.6 && r.y + r.h <= vp.h + 0.6;
const onEdge = (r, vp, gap = GAP) => [r.x, r.y, vp.w - r.w - r.x, vp.h - r.h - r.y].some((d) => Math.abs(d - gap) <= 1.5);
const same = (a, b) => Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
const moved = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) > 40;
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

for (const kind of ["desk", "phone"]) {
  const px = kind === "phone" ? 390 : 1440, size = kind === "phone" ? 72 : 84, L = `${kind}`;
  /* ---- at rest ---- */
  const C = await scene(kind); const vp = C.vp, page = C.page;
  ok(vp.w === px, `${L}: the screen is ${px} wide`, vp);
  const r0 = await C.rect();
  ok(Math.round(r0.w) === size && Math.round(r0.h) === size, `${L}: the orb is ${size} pixels, a little bolder than a corner widget`, r0);
  ok(Math.abs(vp.w - r0.w - r0.x - GAP) <= 1.5 && Math.abs(vp.h - r0.h - r0.y - GAP) <= 1.5, `${L}: it rests bottom-right, ${GAP} pixels from both edges`, r0);
  const above = await page.evaluate(() => { const f = document.querySelector("[data-eden-float]"), r = f.getBoundingClientRect(), top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { z: Number(getComputedStyle(f).zIndex), btn: !!(top && top.closest("[data-eden-orb-button]")), fixed: getComputedStyle(f).position === "fixed", footer: !!document.querySelector("footer") }; });
  ok(above.fixed && above.z >= 90 && above.btn, `${L}: it is fixed to the screen, above the content and the footer (layer ${above.z}), and it takes the touch at its centre`, above);
  await page.waitForFunction(() => Number(document.querySelector("[data-eden-float] canvas").dataset.frames) > 3);
  const look = await page.evaluate(() => { const g = document.querySelector(".eden-orb-glow"), c = document.querySelector("[data-eden-float] canvas"); const x = c.getContext("2d"); const d = x.getImageData(c.width / 2, c.height / 2, 1, 1).data; return { glow: getComputedStyle(g).backgroundImage, op: Number(getComputedStyle(g).opacity), heart: [d[0], d[1], d[2], d[3]], state: document.querySelector("[data-eden-float]").dataset.state, label: document.querySelector("[data-eden-orb-button]").getAttribute("aria-label"), tag: document.querySelector("[data-eden-orb-button]").tagName }; });
  ok(/217, 119, 6/.test(look.glow) && look.op > 0.4, `${L}: it has a soft glow in the site's gold`, look);
  ok(look.heart[3] > 0 && look.heart[0] > 150, `${L}: the orb is amber at its heart`, look.heart);
  ok(look.state === "ready" && look.tag === "BUTTON" && /Press Enter/.test(look.label), `${L}: it is at rest, and it is a button with a plain name`, look);
  const fr1 = Number(await page.locator("[data-eden-float] canvas").getAttribute("data-frames")); await sleep(500); const fr2 = Number(await page.locator("[data-eden-float] canvas").getAttribute("data-frames"));
  ok(fr2 > fr1, `${L}: the glow and the mesh are alive (${fr1} to ${fr2} frames)`);
  await shot(page, `orb-rest-${px}`);
  /* the glow breathes: its size changes over a moment */
  const g1 = await page.locator(".eden-orb-glow").evaluate((e) => e.style.transform); await sleep(900); const g2 = await page.locator(".eden-orb-glow").evaluate((e) => e.style.transform);
  ok(g1 !== g2 && /scale/.test(g1), `${L}: the glow breathes (${g1} then ${g2})`);

  /* ---- it wanders on its own at rest ---- */
  await C.later(30000);
  let r1 = await C.rect(); for (let n = 0; n < 2 && !moved(r0, r1); n++) { await C.later(30000); r1 = await C.rect(); }   /* the clock jumps once per due timer */
  ok(moved(r0, r1) && inside(r1, vp), `${L}: left alone, it moved by itself, slowly, and stayed on the screen (${Math.round(r0.x)},${Math.round(r0.y)} to ${Math.round(r1.x)},${Math.round(r1.y)})`);
  ok(onEdge(r1, vp), `${L}: and it stayed on an edge`, r1);

  /* ---- a drag, then the nearest edge ---- */
  const c1 = await C.centre(), mid = { x: px / 2 + (kind === "desk" ? 260 : 0), y: kind === "desk" ? 300 : 330 };
  await C.drag(c1, mid, { hold: true });
  const dragging = await page.evaluate(() => document.querySelector("[data-eden-float]").classList.contains("dragging")); const rm = await C.rect();
  ok(dragging && Math.abs(rm.x + rm.w / 2 - mid.x) <= 2 && Math.abs(rm.y + rm.h / 2 - mid.y) <= 2 && inside(rm, vp), `${L}: held, the orb follows the ${kind === "phone" ? "finger" : "mouse"} and stays on the screen`, rm);
  ok((await C.panelRect()).hidden, `${L}: a drag does not open the panel`);
  await shot(page, `orb-drag-${px}`);
  await C.up(); await sleep(700);
  const rd = await C.rect(), want = snapToEdge({ x: mid.x - size / 2, y: mid.y - size / 2 }, size, vp.w, vp.h);
  ok(Math.abs(rd.x - want.x) <= 1.5 && Math.abs(rd.y - want.y) <= 1.5 && onEdge(rd, vp), `${L}: let go, it slid to the nearest edge (${want.edge}), at ${Math.round(rd.x)},${Math.round(rd.y)}`, { rd, want });
  ok((await C.panelRect()).hidden, `${L}: letting go after a drag does not open the panel`);
  /* anywhere along the whole edge: drop it near the top, then near the left, then past every side */
  await C.drag(await C.centre(), { x: vp.w * 0.3, y: 70 }); await sleep(700);
  let rt = await C.rect();
  ok(Math.abs(rt.y - GAP) <= 1.5 && Math.abs(rt.x + rt.w / 2 - vp.w * 0.3) <= 2, `${L}: dropped near the top edge, it slides to the top and rests where it was dropped along it`, rt);
  await C.drag(await C.centre(), { x: 60, y: vp.h * 0.6 }); await sleep(700);
  rt = await C.rect();
  ok(Math.abs(rt.x - GAP) <= 1.5 && Math.abs(rt.y + rt.h / 2 - vp.h * 0.6) <= 2, `${L}: dropped near the left edge, it rests on the left at that height`, rt);
  await C.drag(await C.centre(), { x: vp.w * 0.45, y: vp.h - 30 }); await sleep(700);
  rt = await C.rect();
  ok(Math.abs(vp.h - rt.h - rt.y - GAP) <= 1.5 && Math.abs(rt.x + rt.w / 2 - vp.w * 0.45) <= 2, `${L}: dropped near the bottom edge, it rests on the bottom`, rt);
  await C.drag(await C.centre(), { x: vp.w + 400, y: -300 }); await sleep(700);
  rt = await C.rect();
  ok(inside(rt, vp) && onEdge(rt, vp), `${L}: dragged far past the corner of the screen, it still comes to rest inside it`, rt);
  /* it stays where the person put it */
  const placed = await C.rect(); await C.later(60000);
  ok(same(placed, await C.rect()), `${L}: after a drag it stays where the person put it; it does not wander away`);

  /* ---- a tap opens the panel beside the orb ---- */
  const pc = await C.centre(); await C.tap(pc.x, pc.y);
  await page.waitForSelector("[data-eden-panel]:not([hidden]) textarea[name=notes]");
  let pr = await C.panelRect(), ro = await C.rect();
  const side = await page.locator("[data-eden-panel]").getAttribute("data-placement");
  ok(inside(pr, vp) && !hit(pr, ro), `${L}: a tap opens Eden's panel, wholly on the screen and not on the orb (${side})`, { pr, ro, vp });
  ok(((ro.x + ro.w / 2 > vp.w / 2) ? pr.x + pr.w <= ro.x + 0.5 : pr.x >= ro.x + ro.w - 0.5) || side === "above" || side === "below", `${L}: it opens beside the orb, on the side the orb sits`, { side, pr, ro });
  ok(/Nothing is saved or sent until you press Save or Send/.test(await page.locator("[data-eden-panel]").innerText()) && (await page.locator("[data-eden-orb-button]").getAttribute("aria-expanded")) === "true", `${L}: the panel says nothing is saved or sent until Save or Send`);
  await shot(page, `orb-panel-${px}`);
  await page.keyboard.press("Escape"); await sleep(100);
  ok((await C.panelRect()).hidden && (await page.evaluate(() => document.activeElement.hasAttribute("data-eden-orb-button"))), `${L}: Escape closes it and the focus goes back to the orb`);
  /* a press that moves 4 pixels is still a tap */
  if (!C.cdp) { const q = await C.centre(); await page.mouse.move(q.x, q.y); await page.mouse.down(); await page.mouse.move(q.x + 3, q.y + 3); await page.mouse.up(); await page.waitForSelector("[data-eden-panel]:not([hidden])"); ok(same(ro, await C.rect()), `${L}: a press that moves 4 pixels is a tap: the panel opens and the orb has not moved`); await page.keyboard.press("Escape"); }
  /* parked in the middle of the top edge, where there is no room beside it on a phone: it opens below, still on the screen */
  await C.drag(await C.centre(), { x: vp.w / 2, y: 30 }); await sleep(700);
  const q2 = await C.centre(); await C.tap(q2.x, q2.y); await page.waitForSelector("[data-eden-panel]:not([hidden])");
  pr = await C.panelRect(); ro = await C.rect();
  ok(inside(pr, vp) && !hit(pr, ro), `${L}: parked at the top middle, the panel (${await page.locator("[data-eden-panel]").getAttribute("data-placement")}) is still wholly on the screen and clear of the orb`, { pr, ro });
  await page.keyboard.press("Escape");
  ok(C.errors.length === 0, `${L}: zero page errors`, C.errors); await C.close();

  /* ---- the keyboard ---- */
  const K = await scene(kind); const kr0 = await K.rect();
  await K.page.locator("[data-eden-orb-button]").focus();
  await K.page.keyboard.press("ArrowLeft"); let k1 = await K.rect();
  await K.page.keyboard.press("ArrowUp"); let k2 = await K.rect();
  ok(Math.abs(k1.x - (kr0.x - NUDGE)) <= 1 && Math.abs(k1.y - kr0.y) <= 1 && Math.abs(k2.y - (k1.y - NUDGE)) <= 1 && Math.abs(k2.x - k1.x) <= 1, `${L}: the arrow keys move the orb ${NUDGE} pixels`, { kr0, k1, k2 });
  for (let i = 0; i < 60; i++) await K.page.keyboard.press("ArrowRight");
  ok(inside(await K.rect(), K.vp), `${L}: held against the edge it stays on the screen`);
  await K.later(60000);
  const kHeld = await K.rect(); ok(Math.abs(kHeld.x - (K.vp.w - kHeld.w)) <= 1.5 || kHeld.x > K.vp.w - kHeld.w - 3, `${L}: after the keys it stays where the person put it`);
  await K.page.keyboard.press("Enter"); await K.page.waitForSelector("[data-eden-panel]:not([hidden])");
  ok(true, `${L}: Enter opens the panel`);
  ok(K.errors.length === 0, `${L}: zero page errors on the keyboard`, K.errors); await K.close();

  /* ---- it holds still when a person is using the page ---- */
  { const P = await scene(kind); const a = await P.rect();
    const c = await P.centre(); await P.tap(c.x, c.y); await P.page.waitForSelector("[data-eden-panel]:not([hidden])");
    await P.later(60000); ok(same(a, await P.rect()), `${L}: with the panel open it does not wander`);
    await P.close(); }
  if (kind === "desk") { const P = await scene(kind); const a = await P.rect(); await P.page.mouse.move(a.x - 60, a.y - 20);
    await P.later(60000); ok(same(a, await P.rect()), `${L}: with the pointer near it does not wander`);
    await P.page.mouse.move(30, 30); await P.later(30000); let after = await P.rect(); for (let n = 0; n < 2 && !moved(a, after); n++) { await P.later(30000); after = await P.rect(); }
    ok(moved(a, after), `${L}: and once the pointer has gone away it wanders again`, { a, after }); await P.close(); }
  { const P = await scene(kind); const a = await P.rect();
    await P.page.evaluate(() => { const d = document.createElement("dialog"); d.setAttribute("open", ""); d.textContent = "A question for you."; document.body.append(d); });
    await P.later(60000); ok(same(a, await P.rect()), `${L}: with a dialog open it does not wander`); await P.close(); }
  { const P = await scene(kind); const a = await P.rect(), list = roamAnchors(a.w, P.vp.w, P.vp.h), next = list[1];
    await P.page.evaluate((n) => { const i = document.createElement("input"); i.setAttribute("aria-label", "A field in the way"); i.className = "way"; i.style.position = "fixed"; i.style.left = (n.x - 20) + "px"; i.style.top = (n.y + 10) + "px"; i.style.width = "140px"; i.style.height = "44px"; i.style.zIndex = "5"; document.body.append(i); i.focus(); }, next);
    const way = await P.page.locator("input.way").evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await P.later(30000); const b = await P.rect();
    ok(moved(a, b) && !hit(b, way) && !same(b, next), `${L}: it will not land on a field the person is typing in; it goes on to the next place`, { b, way, next });
    await P.close(); }
}

/* ---- every page has the orb; before sign-in it is only words, and no call to Eden is made ---- */
for (const kind of ["desk", "phone"]) {
  const px = kind === "phone" ? 390 : 1440;
  const P = await open(browser, s.base, kind); const calls = [];
  P.page.on("request", (r) => { if (/\/api\/eden/.test(r.url())) calls.push(r.method() + " " + r.url()); });
  for (const route of ["/", "/board", "/giving", "/terms", "/privacy", "/join"]) {
    await P.page.goto(route); await P.page.waitForSelector("[data-eden-float]:not([hidden]) [data-eden-orb-button]");
    const label = await P.page.locator("[data-eden-orb-button]").getAttribute("aria-label");
    const r = await P.page.locator("[data-eden-float]").evaluate((e) => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, z: Number(getComputedStyle(e).zIndex) }; });
    ok(r.z >= 90 && Math.round(r.w) === (kind === "phone" ? 72 : 84) && /read about Eden/.test(label), `${kind}: ${route} has the orb, above the page, named for a visitor`, { r, label });
    if (route === "/" || route === "/board") {
      await (kind === "phone" ? P.page.locator("[data-eden-orb-button]").tap() : P.page.locator("[data-eden-orb-button]").click());
      await P.page.waitForSelector("[data-eden-panel]:not([hidden]) [data-act=eden-join]");
      const t = await P.page.locator("[data-eden-panel]").innerText(), href = await P.page.locator("[data-act=eden-join]").getAttribute("href");
      ok(href === "/join" && /Join the network/.test(t) && /Eden wrote this; read it before you use it\./.test(t) && /never gives advice on law, taxes or medicine/.test(t) && /call 911/.test(t) && /call or text 988/.test(t) && (await P.page.locator("[data-eden-panel] textarea").count()) === 0, `${kind}: ${route}: a tap shows the public panel: who Eden is, what Eden never does, 911 and 988, and a Join the network button to /join`, t.slice(0, 300));
      const pr = await P.page.locator("[data-eden-panel]").evaluate((e) => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }), vpn = await P.page.evaluate(() => ({ w: document.documentElement.clientWidth, h: window.innerHeight }));
      ok(inside(pr, vpn), `${kind}: ${route}: the public panel is wholly on the screen`, { pr, vpn });
      if (route === "/") await shot(P.page, `orb-public-panel-${px}`);
      await P.page.keyboard.press("Escape");
    }
  }
  ok(calls.length === 0, `${kind}: a visitor who has not signed in made ${calls.length} requests to /api/eden (none, even after tapping the orb)`, calls);
  ok(P.errors.length === 0, `${kind}: zero page errors for a visitor`, P.errors); await P.close();
  /* signed in, with no form open: Eden says it writes inside a form, and a form brings the writing helper back */
  const M = await open(browser, s.base, kind); await M.ctx.addCookies([asCookie(lead, s.base)]);
  await M.page.goto("/me"); await M.page.waitForSelector("[data-eden-float]:not([hidden])"); await M.page.locator("[data-eden-orb-button]").click();
  await M.page.waitForSelector("text=Eden helps inside a form");
  ok((await M.page.locator("[data-eden-panel] [data-act=eden-join]").count()) === 0, `${kind}: signed in, the panel has no Join button`);
  ok(M.errors.length === 0, `${kind}: zero page errors signed in`, M.errors); await M.close();
}

/* ---- less motion ---- */
for (const kind of ["desk", "phone"]) {
  const R = await scene(kind, { reduced: true }); const a = await R.rect(), vp = R.vp;
  const st = await R.page.evaluate(() => { const c = document.querySelector("[data-eden-float] canvas"), f = document.querySelector("[data-eden-float]"); return { motion: c.dataset.motion, anim: getComputedStyle(c).animationName, trans: getComputedStyle(f).transitionDuration, frames: Number(c.dataset.frames) }; });
  await sleep(400); const fr = Number(await R.page.locator("[data-eden-float] canvas").getAttribute("data-frames"));
  ok(st.motion === "still" && st.anim === "none" && st.frames === fr && fr <= 4, `${kind}, less motion: the orb is drawn still and does not breathe or drift (${st.frames} frames, then ${fr})`, st);
  await R.later(60000); ok(same(a, await R.rect()), `${kind}, less motion: it does not wander`);
  await R.drag(await R.centre(), { x: vp.w * 0.25, y: vp.h * 0.4 }); await sleep(120);
  const rr = await R.rect(), anim = await R.page.evaluate(() => document.querySelector("[data-eden-float]").classList.contains("snapping"));
  ok(!anim && onEdge(rr, vp) && moved(rr, a), `${kind}, less motion: it is still dragged, and it arrives at the edge with no slide`, { rr, anim });
  await sleep(500);   /* a second touch within a third of a second of the first is a double tap to the phone, not a tap */
  const c = await R.centre(); await R.tap(c.x, c.y); await R.page.waitForSelector("[data-eden-panel]:not([hidden])");
  ok(inside(await R.panelRect(), vp), `${kind}, less motion: a tap still opens the panel`);
  ok(R.errors.length === 0, `${kind}, less motion: zero page errors`, R.errors); await R.close();
}

/* ---- no key on the server: the grey orb ---- */
for (const kind of ["desk", "phone"]) {
  const px = kind === "phone" ? 390 : 1440;
  const N = await scene(kind, { base: s0.base, cl: lead0 });
  await N.page.waitForSelector("[data-eden-float][data-state=off]");
  const g = await N.page.evaluate(() => ({ filter: getComputedStyle(document.querySelector("[data-eden-float] canvas")).filter, glow: getComputedStyle(document.querySelector(".eden-orb-glow")).backgroundImage, label: document.querySelector("[data-eden-orb-button]").getAttribute("aria-label") }));
  ok(/grayscale/.test(g.filter) && !/217, 119, 6/.test(g.glow) && /not set up/.test(g.label), `${kind}: with no key the orb is grey and its name says Eden is not set up`, g);
  await shot(N.page, `orb-not-set-up-${px}`);
  const c = await N.centre(); await N.tap(c.x, c.y); await N.page.waitForSelector("text=Eden is not set up on this server yet");
  ok((await N.page.locator("[data-eden-panel] textarea").count()) === 0 && (await N.page.locator("[data-eden-panel] [data-act=eden-write]").count()) === 0, `${kind}: and the panel says so in the site's words, with no box and no button`);
  ok(N.errors.length === 0, `${kind}: zero page errors with no key`, N.errors); await N.close();
}
await browser.close(); await pool.end(); await s.stop(); await s0.stop(); await model.stop();
process.exit(T.done());

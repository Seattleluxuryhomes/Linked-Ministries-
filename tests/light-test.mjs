#!/usr/bin/env node
/* tests/light-test.mjs — founder: the product is light. Every surface is a pale ground, white cards, dark words and one gold.
   This test fails on any dark background token, any dark fill outside a button, any dark class name, any dark-theme switch, and
   — in a real Chromium at 390 and at 1440 — on any element of any page whose painted background is dark. It also fails on red.
   It proves it can fail: a dark panel put on the page from script is caught.   LEXOS_DB_NAME=linkedm_t_<mine> node tests/light-test.mjs
   (Shaped on Behavioral Health's light test.) */
import fs from "node:fs";
import path from "node:path";
import { counter, ownDatabase, startServer, client, ROOT } from "./helpers.mjs";
import { launch, open, SHOTS, shots } from "./browser-lib.mjs";
import { smtpStandIn } from "./helpers.mjs";
import { seedWorld, seedAlexExtras } from "./seed.mjs";

const T = counter("light-test"); const { ok } = T;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const walk = (d, out = []) => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p, out) : out.push(p); } return out; };

/* ---- the stylesheet ---- */
const css = read("public/css/lm.css"); const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
ok(!/prefers-color-scheme\s*:\s*dark/i.test(bare) && !/\[data-theme|data-theme=/i.test(bare) && /color-scheme:\s*light/.test(bare), "the stylesheet has no dark theme, no theme switch, and says it is light");
const tokens = Object.fromEntries([...bare.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
for (const t of ["ground", "card", "soft", "line", "gold-soft", "note", "ok"]) ok(tokens[t] && lum(tokens[t]) > 0.6, `the ${t} surface token is light`, tokens[t]);
for (const t of ["ink", "muted", "quiet", "gold-ink", "note-ink", "ok-ink"]) ok(tokens[t] && lum(tokens[t]) < 0.25, `the ${t} text token is dark, for words on a light page`, tokens[t]);
ok(lum(tokens.ground) >= 0.9 && lum(tokens.card) >= 0.99, "the ground is pale and the card is white");
ok(tokens.gold.toLowerCase() === "#d97706", "the one gold is #D97706");
ok(contrast(tokens["gold-ink"], tokens.card) >= 4.5 && contrast(tokens["gold-ink"], tokens["gold-soft"]) >= 4.5, "a small gold label is set in a deeper shade of the gold, which reads at 4.5 to 1 or better on white and on the soft gold");
ok(contrast(tokens.ink, tokens.ground) >= 7 && contrast(tokens.muted, tokens.card) >= 7 && contrast(tokens.quiet, tokens.card) >= 5, "ink and muted words read at 7 to 1 or better; the quiet ones at 5 to 1");
ok(contrast("#ffffff", tokens.ink) >= 7, "white words on the dark button read at 7 to 1");
for (const [sel, body] of [...bare.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]])) {
  for (const d of body.matchAll(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/g)) {
    const v = d[1].trim(); const m = /var\(--([a-z-]+)\)/.exec(v); const hex = m ? tokens[m[1]] : (/^#[0-9a-f]{6}$/i.test(v) ? v : null);
    if (hex && lum(hex) < 0.5) ok(/^\.btn(:hover)?$/.test(sel) || (hex.toLowerCase() === tokens.gold.toLowerCase() && /^\.eyebrow::before$/.test(sel)), `a dark fill (${v}) appears only on a button (or the gold bar of 4 pixels over a label), never on "${sel}"`);
  }
}
ok(!/#(?:f00|ff0000|dc2626|ef4444|b91c1c|991b1b|e11d48|c00)\b|\bred\b|crimson|firebrick|tomato/i.test(bare), "the stylesheet names no red");
for (const p of walk("public").filter((x) => /\.(js|css|svg)$/.test(x))) {
  const t = read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  ok(!/\b(dark|night|obsidian|midnight|charcoal|black-theme|dim)\b/i.test(t), `${p}: no dark class, token or name`);
  ok(!/background(-color)?\s*[:=]\s*["']?\s*(#0|#1[0-9a-f]{5}\b|black|rgb\(\s*[0-9]{1,2}\s*,)/i.test(t) || /lm\.css/.test(p), `${p}: no dark background set in script or markup`);
}

/* ---- every page, painted, at 390 and at 1440 ---- */
const db = await ownDatabase("light"); const smtp = await smtpStandIn();
const s = await startServer({ url: db.url, env: { LEXOS_SMTP_URL: smtp.url, LEXOS_MAIL_FROM: "board@linkedm.test" } });
ok(s.up, "the server is up");
const { pool } = await import("../server/db.mjs");
const world = await seedWorld({ base: s.base, smtp, sql: (q) => pool.query(q) });
const extras = await seedAlexExtras({ world, smtp });
const browser = await launch(); const snap = shots(SHOTS);
const lightCheck = (page) => page.evaluate(() => {
  const lum = (r, g, b) => { const c = [r, g, b].map((v) => v / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const parse = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const bad = [];
  for (const el of [document.documentElement, document.body, ...document.querySelectorAll("body *")]) {
    const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden") continue;
    const c = parse(cs.backgroundColor);
    if (c && c.a >= 0.3 && lum(c.r, c.g, c.b) < 0.5 && !el.closest("button, .btn")) bad.push(`${el.tagName.toLowerCase()}.${String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).slice(0, 30)} ${cs.backgroundColor}`);
    for (const prop of ["color", "borderTopColor", "borderBottomColor", "borderLeftColor"]) { const f = parse(cs[prop]); if (f && f.a > 0.3 && f.r > 150 && f.g < 90 && f.b < 90) bad.push(`${el.tagName.toLowerCase()} is red in ${prop}: ${cs[prop]}`); }
  }
  const body = parse(getComputedStyle(document.body).backgroundColor), html = parse(getComputedStyle(document.documentElement).backgroundColor);
  if (!body || lum(body.r, body.g, body.b) < 0.85) bad.push("body is not pale: " + getComputedStyle(document.body).backgroundColor);
  if (!html || lum(html.r, html.g, html.b) < 0.85) bad.push("html is not pale: " + getComputedStyle(document.documentElement).backgroundColor);
  return bad;
});
const cookieOf = (cl) => cl.jar().split("=").slice(1).join("=");
const firstPost = world.ids["Ten folding tables for our Saturday meal"];
const anyId = (extras.erin, firstPost);
const PUBLIC = ["/", "/board", "/board?kind=ask&state=WA", "/board?q=zebra", "/board/" + firstPost, "/join", "/me", "/steward", "/nope", "/board/00000000-0000-4000-8000-000000000000"];
let pages = 0;
for (const kind of ["phone", "desk"]) {
  const pub = await open(browser, s.base, kind);
  for (const r of PUBLIC) { await pub.page.goto(r); await pub.page.waitForSelector("body"); await pub.page.waitForTimeout(200); const bad = await lightCheck(pub.page); pages++; ok(bad.length === 0, `${kind}: ${r} is light`, bad.slice(0, 3)); }
  await pub.page.goto("/board"); await pub.page.click("a[data-answer] >> nth=0"); await pub.page.waitForTimeout(300); { const bad = await lightCheck(pub.page); pages++; ok(bad.length === 0, `${kind}: the board with the 'sign in to answer' note is light`, bad.slice(0, 3)); }
  ok(pub.errors.length === 0, `${kind}: the public pages: zero page errors`, pub.errors.slice(0, 3));
  /* it can fail: a dark panel painted from script is caught, and so is red */
  await pub.page.goto("/"); await pub.page.evaluate(() => { const d = document.createElement("div"); d.className = "card"; d.textContent = "x"; d.style.background = "#0a0f1f"; document.querySelector("main").append(d); });
  const caught = await lightCheck(pub.page); ok(caught.length >= 1 && /card/.test(caught[0]), "a dark card put on the page is caught", caught);
  await pub.page.goto("/"); await pub.page.evaluate(() => { document.body.style.background = "#111111"; });
  ok((await lightCheck(pub.page)).some((x) => /body/.test(x)), "a dark body is caught");
  await pub.page.goto("/"); await pub.page.evaluate(() => { const p = document.createElement("p"); p.textContent = "alarm"; p.style.color = "#dc2626"; document.querySelector("main").append(p); });
  ok((await lightCheck(pub.page)).some((x) => /red/.test(x)), "red words put on the page are caught");
  await pub.close();

  /* a signed-in person at each stage */
  const who = async (cl, routes, label) => {
    const c = await open(browser, s.base, kind); await c.ctx.addCookies([{ name: "lm_session", value: cookieOf(cl), url: s.base }]);
    for (const r of routes) { await c.page.goto(r); await c.page.waitForSelector("main h1, main .card", { timeout: 15000 }); await c.page.waitForTimeout(350); const bad = await lightCheck(c.page); pages++; ok(bad.length === 0, `${kind}: ${label} ${r} is light`, bad.slice(0, 3)); }
    ok(c.errors.length === 0, `${kind}: ${label}: zero page errors`, c.errors.slice(0, 3)); return c;
  };
  const alex = world.c["alex@alpha.example"];
  const c1 = await who(alex, ["/me", "/join", "/steward"], "a lead's");
  await c1.page.goto("/me"); await c1.page.waitForSelector("button:has-text('Post an ask')"); await c1.page.click("button:has-text('Post an ask')"); await c1.page.waitForSelector("form select[name=category]"); { const bad = await lightCheck(c1.page); pages++; ok(bad.length === 0, `${kind}: the form to post an ask is light`, bad.slice(0, 3)); }
  await c1.page.click("button:has-text('Change this page')").catch(() => {}); { const bad = await lightCheck(c1.page); pages++; ok(bad.length === 0, `${kind}: the form to change the page is light`, bad.slice(0, 3)); }
  await c1.close();
  const fresh = client(s.base); { const { signIn } = await import("./helpers.mjs"); await signIn(fresh, null, "newcomer@example.org", { smtp }); }
  const c2 = await who(fresh, ["/join", "/me"], "a person with no ministry yet"); await c2.close();
  const c3 = await who(world.sam, ["/steward", "/me"], "a steward's"); await c3.close();
  const c4 = await who(world.c["blake@bravo.example"], [`/board/${firstPost}`], "an answering ministry's");
  await c4.page.click("a[data-answer]"); await c4.page.waitForSelector("form textarea[name=words]"); { const bad = await lightCheck(c4.page); pages++; ok(bad.length === 0, `${kind}: the answer form is light`, bad.slice(0, 3)); } await c4.close();
}
ok(pages >= 40, `${pages} pages and states were painted and read`);
await browser.close(); await s.stop(); await smtp.stop(); await pool.end();
process.exit(T.done());

#!/usr/bin/env node
/* tests/pwa-unit-test.mjs: the installable app, with no server and no browser. The manifest's shape and its icons (their real pixel
   sizes), the head every page carries, the policy line that lets the worker run and nothing else, the install card's sentences, and
   the service worker's rules run in a sandbox: it keeps only the shell, and never an /api answer, a signed-in page, a picture, a
   form or anything that is not a plain GET. It proves it can fail: a worker that kept an /api answer is caught.
   (Copied in method from Cross Universal's tests/pwa-test.mjs, D-290.) */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { counter, ROOT } from "./helpers.mjs";
import { verdict } from "../lib/plainwords.mjs";
import { WORDS } from "../public/js/pure.js";
import { POLICY } from "../server/headers.mjs";
import { frontPage, boardPage, postPage, missingPostPage, shellPage, notFoundPage, termsPage, privacyPage, givePage } from "../server/pages.mjs";

const T = counter("pwa-unit-test"); const { ok } = T;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const css = read("public/css/lm.css");
const token = (n) => (new RegExp("--" + n + ":\\s*(#[0-9a-fA-F]{6})").exec(css) || [])[1];
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
/** width, height and colour type of a PNG, read from its own header */
const png = (p) => { const b = fs.readFileSync(path.join(ROOT, "public", p)); return b.slice(1, 4).toString() === "PNG" ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] } : null; };

/* ---- the manifest ---- */
const m = JSON.parse(read("public/manifest.webmanifest"));
ok(m.name === "Linked Ministries" && m.short_name.length <= 12 && /^Linked/.test(m.short_name), "the manifest names the site, with a short name that fits under an icon", [m.name, m.short_name]);
ok(m.start_url === "/" && m.scope === "/" && m.id === "/" && m.display === "standalone", "it starts at the front page, in its own window, with the whole site in scope");
ok(m.background_color === token("ground") && m.theme_color === token("ground") && lum(m.background_color) > 0.9 && lum(m.theme_color) > 0.9, "its colours are the site's own pale ground, not a dark one", [m.background_color, m.theme_color]);
ok(/<meta name="theme-color" content="#fbf8f3">/.test(frontPage({ latest: [] })) && m.theme_color === "#fbf8f3", "and match the theme colour every page already sends");
ok(m.lang === "en" && /free board/i.test(m.description) && verdict(m.description, { ceiling: 8 }).ok, "it has a plain description (grade 8 or under)");
ok(m.prefer_related_applications === false, "it does not point people to a store app");
const need = [["icon-192.png", 192, "any"], ["icon-512.png", 512, "any"], ["icon-maskable-512.png", 512, "maskable"]];
for (const [f, px, purpose] of need) {
  const i = m.icons.find((x) => x.src === "/" + f), real = png(f);
  ok(i && i.sizes === `${px}x${px}` && i.type === "image/png" && i.purpose === purpose, `the manifest lists ${f} at ${px} pixels, purpose ${purpose}`);
  ok(real && real.w === px && real.h === px, `${f} really is ${px} by ${px} pixels`, real);
}
ok(m.icons.some((i) => i.src === "/img/icon.svg" && i.sizes === "any") && fs.existsSync(path.join(ROOT, "public/img/icon.svg")), "the mark's own SVG is listed too, and it exists");
ok(m.icons.every((i) => i.src.startsWith("/") && fs.existsSync(path.join(ROOT, "public", i.src))) && (m.shortcuts || []).every((s) => s.url.startsWith("/") && s.icons.every((i) => fs.existsSync(path.join(ROOT, "public", i.src)))), "every icon the manifest names is a file here, on this site's own address");
const touch = png("img/apple-touch-icon.png");
ok(touch && touch.w === 180 && touch.h === 180 && touch.colorType === 2, "the home-screen icon is 180 pixels and has no see-through part (iOS would paint it black)", touch);
ok(png("icon-maskable-512.png").colorType === 2, "the maskable icon is a square to the edge, with nothing see-through");

/* ---- every page's head ---- */
const sample = {
  front: frontPage({ latest: [] }), board: boardPage({ result: { posts: [], total: 0, page: 1, pages: 1, filters: {} } }), missing: missingPostPage(), notFound: notFoundPage(),
  shellMe: shellPage({ title: "Your ministry", script: "/js/me.js", nav: "me" }), shellJoin: shellPage({ title: "Join the network", script: "/js/join.js", nav: "join" }),
  terms: termsPage({}), privacy: privacyPage({}), give: givePage({ open: false }),
};
for (const [name, html] of Object.entries(sample)) {
  const head = html.slice(0, html.indexOf("</head>"));
  ok(/<link rel="manifest" href="\/manifest\.webmanifest">/.test(head) && /<meta name="theme-color" content="#fbf8f3">/.test(head) && /<meta name="apple-mobile-web-app-capable" content="yes">/.test(head) && /<meta name="apple-mobile-web-app-title" content="Linked M">/.test(head) && /<meta name="apple-mobile-web-app-status-bar-style" content="default">/.test(head) && /<link rel="apple-touch-icon" href="\/img\/apple-touch-icon\.png">/.test(head), `${name}: the head links the manifest and carries the theme colour and the Apple app tags`);
  ok(/<script type="module" src="\/js\/pwa\.js"><\/script>/.test(html) && !/<script(?![^>]*\ssrc=)[^>]*>/.test(html) && !/\sstyle=/.test(html), `${name}: the worker is registered by an external file, with no inline script and no style attribute`);
}
ok(/serviceWorker\.register\("\/sw\.js", \{ scope: "\/" \}\)/.test(read("public/js/pwa.js")) && !/<script|innerHTML/.test(read("public/js/pwa.js")), "pwa.js registers /sw.js at the root scope, and nothing else");

/* ---- the policy: one line for the worker, nothing loosened ---- */
const dir = (n) => (POLICY.find((d) => d.startsWith(n + " ")) || "");
ok(dir("worker-src") === "worker-src 'self'", "the policy lets the worker run from this site's own address and from nowhere else");
ok(dir("script-src") === "script-src 'self'" && dir("default-src") === "default-src 'none'" && dir("connect-src") === "connect-src 'self'" && dir("manifest-src") === "manifest-src 'self'" && !POLICY.some((d) => /unsafe-|blob:|\*/.test(d) || (/data:/.test(d) && !d.startsWith("img-src"))), "and nothing else is looser: no inline, no eval, no blob, no star; data: only for pictures");

/* ---- the install card's words ---- */
const IW = Object.entries(WORDS).filter(([k]) => /^install/.test(k));
ok(IW.length === 9 && IW.every(([, v]) => typeof v === "string" && v), "the card's nine sentences are in the shared word list, where the plain-words test reads them", IW.map(([k]) => k));
ok(WORDS.installTitle === "Put Linked Ministries on your phone" && /one tap to the board/.test(WORDS.installWhy) && /^Added\./.test(WORDS.installAdded) && /Add to Home Screen/.test(WORDS.installIosTwo) && /Share/.test(WORDS.installIosOne), "it says what the founder asked, and 'Added' is the first word only of the sentence for after the install");
ok(!IW.some(([k, v]) => k !== "installAdded" && /\bAdded\b/.test(v.replace("This card says Added when your phone has done it.", ""))) , "no other sentence on the card says Added");
ok(!IW.some(([, v]) => /miss|come back|don't forget|do not forget|streak|last chance|hurry|only \d|free trial/i.test(v)), "no sentence nags, hurries or tries to win a person back");
const inst = read("public/js/install.js");
ok(!/localStorage|sessionStorage|indexedDB|document\.cookie|lm_install_until|DAYS|\bstore\b/.test(inst), "the card keeps nothing in the browser: no storage, no cookie, no remembered day (founder, 2026-10-18: it asks until the site is installed)");
ok(/display-mode: standalone/.test(inst) && /navigator\.standalone/.test(inst) && /standalone\(\)\) return/.test(inst), "the card checks the app window (display-mode standalone and navigator.standalone) and does not mount there");
ok(/beforeinstallprompt/.test(inst) && /appinstalled/.test(inst), "and it listens for both browser events");
ok(!/<script|innerHTML|eval\(|style\.|setAttribute\("style"/.test(inst), "the card's script builds nothing from strings and sets no style");

/* ---- the worker, in a sandbox ---- */
function loadWorker(src = read("public/sw.js")) {
  const listeners = {}, log = { adds: [], puts: [], fetched: [], deleted: [], matched: [] };
  const state = { offline: false };
  const self = { location: { origin: "https://linkedm.test" }, addEventListener: (t, f) => { listeners[t] = f; }, skipWaiting() { log.skipped = true; }, clients: { claim() { log.claimed = true; } } };
  const cache = { add: async (u) => { log.adds.push(u); }, put: async (k, v) => { log.puts.push(typeof k === "string" ? k : k.url); } };
  const caches = { open: async () => cache, keys: async () => ["old-cache", "lm-shell-v1"], delete: async (k) => { log.deleted.push(k); }, match: async (k) => { const key = typeof k === "string" ? k : new URL(k.url).pathname; log.matched.push(key); return { fromCache: key }; } };
  const fetchFn = async (req) => { log.fetched.push(req.url); if (state.offline) throw new TypeError("offline"); return { ok: true, fromNetwork: req.url, clone() { return { copy: true }; } }; };
  vm.runInNewContext(src, { self, caches, fetch: fetchFn, URL, Promise, console });
  const run = async (method, p, mode = "no-cors", origin = "https://linkedm.test") => {
    let answer; const e = { request: { method, url: origin + p, mode }, respondWith: (x) => { answer = x; } };
    listeners.fetch(e); await new Promise((r) => setTimeout(r, 5));
    return { handled: answer !== undefined, value: answer === undefined ? undefined : await answer };
  };
  return { listeners, log, state, run, caches, cache };
}
const W = loadWorker();
{ let waited; await W.listeners.install({ waitUntil: (p) => { waited = p; } }); await waited;
  const shell = W.log.adds;
  ok(shell.length >= 9 && shell.includes("/offline.html") && shell.includes("/css/lm.css") && shell.includes("/img/icon.svg") && shell.filter((u) => u.startsWith("/fonts/")).length === 6, "at install it keeps the offline page, the stylesheet, the mark and the six faces", shell);
  ok(shell.every((u) => fs.existsSync(path.join(ROOT, "public", u))), "and every one of them is a real file in public/");
  ok(!shell.some((u) => /^\/(api|me|review|money|steward|treasury|join|photos|board|giving|m)(\/|$)/.test(u) || /\.js$/.test(u)), "none of them is an API answer, a page, a picture or a script");
  ok(W.log.skipped === true, "a new worker takes over at once");
  let w2; await W.listeners.activate({ waitUntil: (p) => { w2 = p; } }); await w2;
  ok(W.log.deleted.join() === "old-cache" && W.log.claimed === true, "when it takes over it lets go of every cache that is not its own, and claims the open pages"); }

for (const [method, p, why] of [["POST", "/api/answers", "a POST"], ["PUT", "/css/lm.css", "a PUT, even of a shell file"], ["DELETE", "/api/me", "a DELETE"], ["POST", "/me", "a form to a signed-in page"]]) {
  const r = await W.run(method, p); ok(!r.handled, `it never touches ${why} (${method} ${p})`);
}
for (const p of ["/api/board", "/api/me", "/api/health", "/api/giving", "/api/answers", "/api/page", "/api/product", "/api/me/export", "/api/board/11111111-1111-4111-8111-111111111111"]) {
  const r = await W.run("GET", p, "cors"); ok(!r.handled, `it never answers GET ${p} from the device (the request goes straight to the network)`);
  const n = await W.run("GET", p, "navigate"); ok(!n.handled, `and not even a page load of ${p}`);
}
for (const p of ["/photos/11111111-1111-4111-8111-111111111111", "/js/me.js", "/js/common.js", "/js/pure.js", "/img/share.png", "/img/front-ministry.png", "/favicon.ico", "/sitemap.xml", "/robots.txt", "/manifest.webmanifest", "/sw.js", "/offline.html.map", "/css/other.css"]) {
  const r = await W.run("GET", p); ok(!r.handled, `it leaves ${p} alone: only the shell is the worker's`);
}
{ const r = await W.run("GET", "/api/board", "cors", "https://elsewhere.example"); ok(!r.handled, "it never touches another site's address");
  const f = await W.run("GET", "/css/lm.css", "no-cors", "https://elsewhere.example"); ok(!f.handled, "not even a file of the same name on another site"); }
for (const p of ["/me", "/review", "/money", "/steward", "/treasury", "/join", "/me/anything", "/join?next=%2Fme"]) {
  W.log.puts.length = 0; W.state.offline = false;
  const online = await W.run("GET", p, "navigate");
  ok(online.handled && online.value.fromNetwork && W.log.puts.length === 0, `a signed-in page (${p}) is always the network's, and nothing of it is kept`);
  W.state.offline = true; const off = await W.run("GET", p, "navigate"); W.state.offline = false;
  ok(off.handled && off.value.fromCache === "/offline.html" && W.log.puts.length === 0, `offline, ${p} gets the offline page and nothing of its own`);
}
for (const p of ["/", "/board", "/board/11111111-1111-4111-8111-111111111111", "/giving", "/m/alpha-table-ministry", "/terms", "/nothing-here"]) {
  W.log.puts.length = 0; W.state.offline = false;
  const online = await W.run("GET", p, "navigate");
  ok(online.handled && online.value.fromNetwork && W.log.puts.length === 0, `a page (${p}) is always the network's and is never stored`);
  W.state.offline = true; const off = await W.run("GET", p, "navigate"); W.state.offline = false;
  ok(off.handled && off.value.fromCache === "/offline.html", `offline, ${p} gets the one plain offline page`);
}
{ W.log.puts.length = 0; W.log.fetched.length = 0;
  const css = await W.run("GET", "/css/lm.css?v=2", "no-cors"); await new Promise((r) => setTimeout(r, 5));
  ok(css.handled && css.value.fromNetwork && W.log.puts.join() === "/css/lm.css", "the stylesheet comes from the network first and a copy is kept under its plain path, so a new release shows at once");
  W.state.offline = true; const off = await W.run("GET", "/css/lm.css", "no-cors"); W.state.offline = false;
  ok(off.value.fromCache === "/css/lm.css", "and offline the kept copy is used");
  W.log.fetched.length = 0; W.log.puts.length = 0; const font = await W.run("GET", "/fonts/fraunces-latin-600-normal.woff2", "cors");
  ok(font.handled && font.value.fromCache === "/fonts/fraunces-latin-600-normal.woff2" && W.log.fetched.length === 0, "a face comes from the device first, since a face never changes under its name");
  W.log.puts.length = 0;
  for (const p of ["/api/board", "/me", "/photos/x", "/js/me.js", "/board", "/review", "/money", "/steward", "/treasury", "/join"]) { await W.run("GET", p, "navigate"); await W.run("GET", p, "cors"); }
  ok(W.log.puts.length === 0, "after every kind of request, the worker has written nothing to the device that is not a shell file", W.log.puts); }

/* it can fail: a worker that keeps an /api answer, or a signed-in page, is caught by the same checks */
{ const bad = read("public/sw.js").replace('const NEVER = ["/api", "/me", "/review", "/money", "/steward", "/treasury", "/join", "/photos"];', 'const NEVER = ["/steward"];').replace('if (!SHELL.includes(url.pathname)) return;', 'if (false) return;');
  ok(bad !== read("public/sw.js"), "(the broken worker is really different)");
  const B = loadWorker(bad); const api = await B.run("GET", "/api/board", "cors");
  ok(api.handled, "a worker with the never-list cut out answers /api: the checks above would fail it (they can fail)");
  const me = await B.run("GET", "/js/me.js", "cors"); await new Promise((r) => setTimeout(r, 5));
  ok(me.handled && B.log.puts.some((u) => u === "/js/me.js"), "and one that drops the shell list stores a script: also caught"); }
process.exit(T.done());

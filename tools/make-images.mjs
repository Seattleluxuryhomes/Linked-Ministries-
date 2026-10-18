#!/usr/bin/env node
/* tools/make-images.mjs — draws the pictures that cannot be inline SVG in a page: the icon file, the home-screen icon, the old-style
   favicon and the share card (1200 by 630), from the same mark and picture the pages draw (server/pages.mjs). Run it after the mark
   changes:  node tools/make-images.mjs   (needs a Chromium: CHROMIUM_PATH, or the one the tests use).
   The share card is a static PNG under 150 KB, in the light look: an ivory ground, a gold line, the mark, the name, one line. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MARK, ART } from "../server/pages.mjs";
import { launch } from "../tests/browser-lib.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = (...p) => path.join(ROOT, "public", ...p);
/* the faces go into the page as data, because a page set from a string may not read a file */
const font = (f) => "data:font/woff2;base64," + fs.readFileSync(path.join(ROOT, "public", "fonts", f)).toString("base64");
const markSvg = MARK.replace('class="mark" ', 'xmlns="http://www.w3.org/2000/svg" ').replace(' aria-hidden="true"', "");
fs.writeFileSync(out("img", "icon.svg"), markSvg + "\n");

const css = `@font-face{font-family:F;font-weight:600;src:url(${font("fraunces-latin-600-normal.woff2")})}
@font-face{font-family:P;font-weight:500;src:url(${font("plus-jakarta-sans-latin-500-normal.woff2")})}
@font-face{font-family:P;font-weight:700;src:url(${font("plus-jakarta-sans-latin-700-normal.woff2")})}
*{box-sizing:border-box}html,body{margin:0}`;
const share = `<style>${css}
body{width:1200px;height:630px;background:#fbf8f3;color:#1b2430;font-family:P;position:relative;overflow:hidden}
.bar{position:absolute;left:0;right:0;top:0;height:14px;background:#d97706}
.mark{position:absolute;left:72px;top:72px;width:96px;height:96px;border-radius:24px}
.name{position:absolute;left:190px;top:84px;font:600 40px F;line-height:1.1}
.name small{display:block;font:500 24px P;color:#464f5c;margin-top:6px}
h1{position:absolute;left:72px;top:236px;margin:0;width:590px;font:600 62px/1.1 F;letter-spacing:-.01em}
p{position:absolute;left:72px;top:402px;width:540px;margin:0;font:500 30px/1.4 P;color:#464f5c}
.art{position:absolute;right:56px;top:96px;width:480px;height:400px;background:#fff;border:2px solid #e4dccd;border-radius:28px;padding:20px}
.art svg{width:100%;height:100%}
.url{position:absolute;right:56px;bottom:40px;font:700 26px P;color:#8a4b00;letter-spacing:.04em}
</style><body><div class="bar"></div>${MARK}<div class="name">Linked Ministries<small>linkedm.org</small></div>
<h1>Ministries helping ministries.</h1><p>A free board where one ministry asks and another answers.</p>
<div class="art">${ART.replace('class="art" ', "")}</div><div class="url"></div></body>`;
const tile = (px) => `<style>html,body{margin:0;background:transparent}svg{display:block;width:${px}px;height:${px}px}</style>${markSvg}`;

const browser = await launch();
async function shot(html, w, h, file, { transparent = false, scale = 1 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  const page = await ctx.newPage(); await page.setContent(html, { waitUntil: "load" }); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(150);
  const buf = await page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } }); await ctx.close();
  if (file) fs.writeFileSync(out(...file), buf); return buf;
}
const share_ = await shot(share, 1200, 630, ["img", "share.png"]);
await shot(tile(180), 180, 180, ["img", "apple-touch-icon.png"], { transparent: true });
const png48 = await shot(tile(48), 48, 48, null, { transparent: true });
/* an .ico file that holds one 48-pixel PNG: every current browser reads it */
const head = Buffer.alloc(22); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4); head[6] = 48; head[7] = 48; head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(png48.length, 14); head.writeUInt32LE(22, 18);
fs.writeFileSync(out("favicon.ico"), Buffer.concat([head, png48]));
await browser.close();
for (const f of ["img/icon.svg", "img/share.png", "img/apple-touch-icon.png", "favicon.ico"]) console.log(f.padEnd(28), fs.statSync(out(...f.split("/"))).size, "bytes");
console.log("the mark alone:", Buffer.byteLength(markSvg), "bytes");

#!/usr/bin/env node
/* tools/make-pwa.mjs: writes the installable app's icons and its manifest (copied in shape from Cross Universal's lexos/pwa/make.mjs,
   D-290; origin in commons.json). The icons are Linked Ministries' own mark (MARK in server/pages.mjs, the two gold rings on ink),
   never a second mark. The original renders with a package this repository does not carry; here the browser the tests already use
   draws them, as tools/make-images.mjs does, so no new package comes in.
     node tools/make-pwa.mjs     (needs a Chromium: CHROMIUM_PATH, or the one the tests use)
   Writes public/icon-192.png, public/icon-512.png, public/icon-maskable-512.png, public/img/apple-touch-icon.png and
   public/manifest.webmanifest. The worker (public/sw.js) and the offline page (public/offline.html) are written by hand. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MARK } from "../server/pages.mjs";
import { launch } from "../tests/browser-lib.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = (...p) => path.join(ROOT, "public", ...p);
const INK = "#1b2430", GROUND = "#fbf8f3";

/* the mark's rings, without its rounded tile: the icon draws its own ground */
const rings = MARK.replace(/^<svg[^>]*>/, "").replace(/<rect [^>]*\/>/, "").replace(/<\/svg>$/, "");
/* a square ground of ink and the rings in the middle, `scale` of the full size (the maskable safe zone is the inner 80 percent circle) */
const square = (scale, radius) => { const w = 48 * scale, o = (48 - w) / 2; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none"><rect width="48" height="48" rx="${radius}" fill="${INK}"/><svg x="${o}" y="${o}" width="${w}" height="${w}" viewBox="0 0 48 48">${rings}</svg></svg>`; };

const browser = await launch();
async function draw(svg, px, file) {
  const ctx = await browser.newContext({ viewport: { width: px, height: px }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(`<style>html,body{margin:0;background:transparent}body>svg{display:block;width:${px}px;height:${px}px}</style>${svg}`, { waitUntil: "load" });
  fs.writeFileSync(out(...file), await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } }));
  await ctx.close();
}
/* "any": the mark as the site draws it, a rounded ink tile with the rings at their size */
await draw(square(1, 11), 192, ["icon-192.png"]);
await draw(square(1, 11), 512, ["icon-512.png"]);
/* "maskable": a square to the edge, so the phone can cut it to any shape, with the rings inside the safe zone */
await draw(square(0.62, 0), 512, ["icon-maskable-512.png"]);
/* the iPhone home screen: a square to the edge (iOS rounds it, and paints black behind anything see-through) */
await draw(square(0.8, 0), 180, ["img", "apple-touch-icon.png"]);
await browser.close();

const manifest = {
  id: "/",
  name: "Linked Ministries",
  short_name: "Linked M",
  description: "A free board where a ministry posts what it needs or what it can give, and another ministry answers.",
  lang: "en",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: GROUND,
  theme_color: GROUND,
  categories: ["social", "lifestyle"],
  prefer_related_applications: false,
  icons: [
    { src: "/img/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
  shortcuts: [
    { name: "The board", url: "/board", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }] },
    { name: "My ministry", url: "/me", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }] },
  ],
};
fs.writeFileSync(out("manifest.webmanifest"), JSON.stringify(manifest, null, 2) + "\n");
for (const f of ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "img/apple-touch-icon.png", "manifest.webmanifest"]) console.log(f.padEnd(28), fs.statSync(out(...f.split("/"))).size, "bytes");

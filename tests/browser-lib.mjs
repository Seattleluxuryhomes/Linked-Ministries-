/* tests/browser-lib.mjs — a real Chromium, a phone and a desk, with every page error collected. Memory is tight on a small
   machine: one browser, contexts closed as soon as they are done, and a crashed Chromium is started once more. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "./helpers.mjs";

const require = createRequire(import.meta.url);
export const CHROMIUM = [process.env.CHROMIUM_PATH, "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium/chrome-linux/chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].filter(Boolean).find((p) => fs.existsSync(p));

export async function launch() {
  if (!CHROMIUM) { console.error("no Chromium found: set CHROMIUM_PATH (CI installs one with: npx playwright-core install chromium)"); process.exit(2); }
  const pw = require("playwright-core");
  const opts = { executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] };
  try { return await pw.chromium.launch(opts); } catch (e) { return await pw.chromium.launch(opts); }
}

export const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36" };
export const DESK = { viewport: { width: 1440, height: 900 } };

/** a context that remembers every page error, console error and failed request to our own origin */
export async function open(browser, base, kind) {
  const ctx = await browser.newContext({ ...(kind === "phone" ? PHONE : DESK), timezoneId: "America/Los_Angeles", locale: "en-US", baseURL: base });
  const errors = [];
  const watch = (page) => {
    page.on("pageerror", (e) => errors.push("pageerror: " + String(e && e.message || e).slice(0, 200)));
    /* the browser logs "Failed to load resource" for every 4xx answer; the pages ask for things a signed-out or refused person is
       told no about, and say so in words, so those are not page errors. A script error, a refused script, a failed request and any other console error are. */
    page.on("console", (m) => { if (m.type() === "error" && !/^Failed to load resource: the server responded with a status of 4\d\d/.test(m.text())) errors.push("console: " + m.text().slice(0, 200)); });
    page.on("requestfailed", (r) => { if (r.url().startsWith(base) && !/ERR_ABORTED/.test((r.failure() || {}).errorText || "")) errors.push("requestfailed: " + r.url().slice(0, 120)); });
  };
  ctx.on("page", watch);
  const page = await ctx.newPage();
  return { ctx, page, errors, close: () => ctx.close() };
}

export function shots(dir) {
  if (dir) fs.mkdirSync(dir, { recursive: true });
  return async (page, name) => { if (dir) await page.screenshot({ path: path.join(dir, name + ".png"), fullPage: true }); };
}

/** a page has no sideways scroll */
export const noSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
export const SHOTS = process.env.LM_SHOTS || "";
export { ROOT };

/** a real picture, drawn by the browser itself and kept as a JPEG with a JFIF header, as a camera's would be: tables set for a meal.
    Used where a test needs a picture that shows (the page builder test, the front page's screenshots). Not a stock photograph. */
export async function drawPhoto(browser) {
  const t = await browser.newPage({ viewport: { width: 900, height: 600 } });
  await t.setContent(`<body style="margin:0;width:900px;height:600px;background:linear-gradient(160deg,#f6d9a8,#e9a23b 55%,#b86a12)"><div style="position:absolute;left:120px;top:300px;width:660px;height:34px;background:#fff7e8;border-radius:6px"></div><div style="position:absolute;left:170px;top:334px;width:20px;height:150px;background:#7a4a14"></div><div style="position:absolute;left:710px;top:334px;width:20px;height:150px;background:#7a4a14"></div>${[200, 330, 460, 590].map((x) => `<div style="position:absolute;left:${x}px;top:250px;width:70px;height:50px;border-radius:50%;background:#fff3dc"></div>`).join("")}</body>`);
  const jpg = await t.screenshot({ type: "jpeg", quality: 82 }); await t.close(); return jpg;
}

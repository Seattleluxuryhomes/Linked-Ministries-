#!/usr/bin/env node
/* tests/orb-unit-test.mjs — the pure pieces of Eden's floating orb (public/js/eden-place.js): keeping the orb on the screen, which of the
   four edges it slides to, a tap versus a drag, the arrow keys, where the panel opens, the places it wanders to and which are blocked.
   And what the files promise: no stored place in the browser, no style attribute, nothing loaded from anywhere, the glow in the site's gold,
   less motion respected in the style sheet, the copied drawing intact.   node tests/orb-unit-test.mjs */
import fs from "node:fs";
import path from "node:path";
import { counter, ROOT } from "./helpers.mjs";
import { TAP_LIMIT, NUDGE, GAP, IDLE_MS, ROAM_MS, GLIDE_MS, orbSize, clampToViewport, snapToEdge, isTap, nudge, edgeOf, placePanel, roamAnchors, nextAnchor, overlaps } from "../public/js/eden-place.js";

const T = counter("orb-unit-test"); const { ok } = T;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/* ---- size ---- */
ok(orbSize(390) === 72 && orbSize(699) === 72 && orbSize(700) === 84 && orbSize(1440) === 84, "the orb is 72 pixels on a phone and 84 on a desk");

/* ---- clamp to the viewport ---- */
{ const c = (x, y, g = 0) => clampToViewport({ x, y }, 72, 390, 844, g);
  ok(JSON.stringify(c(100, 200)) === JSON.stringify({ x: 100, y: 200 }), "a place inside the screen is kept");
  ok(JSON.stringify(c(-50, -9)) === JSON.stringify({ x: 0, y: 0 }), "past the top-left it comes back to the corner");
  ok(JSON.stringify(c(999, 5000)) === JSON.stringify({ x: 390 - 72, y: 844 - 72 }), "past the bottom-right it comes back so the whole orb shows");
  ok(JSON.stringify(c(0, 0, 16)) === JSON.stringify({ x: 16, y: 16 }) && JSON.stringify(c(999, 999, 16)) === JSON.stringify({ x: 390 - 72 - 16, y: 844 - 72 - 16 }), "with a gap it keeps that far from every edge");
  const tiny = clampToViewport({ x: 50, y: 50 }, 72, 60, 60, 0);
  ok(tiny.x === 0 && tiny.y === 0, "a screen smaller than the orb does not make a negative place"); }

/* ---- the nearest of the four edges, and the place along it ---- */
{ const S = (x, y, w = 1440, h = 900, g = GAP) => snapToEdge({ x, y }, 84, w, h, g);
  let r = S(600, 300); ok(r.edge === "top" && r.y === GAP && r.x === 600, "dropped near the top it goes to the top edge and keeps its place along it", r);
  r = S(600, 780); ok(r.edge === "bottom" && r.y === 900 - 84 - GAP && r.x === 600, "dropped near the bottom it goes to the bottom edge", r);
  r = S(40, 400); ok(r.edge === "left" && r.x === GAP && r.y === 400, "dropped near the left it goes to the left edge and keeps its height", r);
  r = S(1300, 400); ok(r.edge === "right" && r.x === 1440 - 84 - GAP && r.y === 400, "dropped near the right it goes to the right edge", r);
  r = S(-500, -500); ok(r.x === GAP && r.y === GAP, "dropped past a corner it rests in the corner, inside the screen", r);
  r = S(5000, 5000); ok(r.x === 1440 - 84 - GAP && r.y === 900 - 84 - GAP, "and the other corner", r);
  r = S(0, 450 - 42, 1440, 900); ok(r.edge === "left", "left against the edge it is the left edge");
  r = snapToEdge({ x: (390 - 72) / 2, y: (844 - 72) / 2 }, 72, 390, 844); ok(r.edge === "right", "an exact tie goes to the right, so the answer is always the same", r);
  r = S(1 + 0, 5); ok(r.edge === "left" || r.edge === "top", "a corner drop is one of its two edges");
  for (const [x, y] of [[10, 10], [700, 450], [1400, 800], [300, 880], [-20, 300], [99999, 12]]) { const q = snapToEdge({ x, y }, 84, 1440, 900); ok(q.x >= GAP && q.y >= GAP && q.x <= 1440 - 84 - GAP && q.y <= 900 - 84 - GAP && [q.x === GAP, q.y === GAP, q.x === 1440 - 84 - GAP, q.y === 900 - 84 - GAP].some(Boolean), `(${x}, ${y}) comes to rest inside the screen, on an edge`, q); }
  ok(edgeOf({ x: 600, y: 10 }, 84, 1440, 900) === "top" && edgeOf({ x: 1356, y: 400 }, 84, 1440, 900) === "right", "edgeOf names the edge nearest an orb that is anywhere"); }

/* ---- a tap and a drag ---- */
ok(TAP_LIMIT === 6 && isTap(0, 0) && isTap(6, 0) && isTap(3, 5) === true && isTap(4, 4) === true, "a press that moves 6 pixels or less is a tap (3 across and 5 down, or 4 and 4, are inside)");
ok(!isTap(7, 0) && !isTap(5, 5) && !isTap(0, -6.01) && !isTap(30, 30), "a press that moves farther than 6 pixels is a drag");
ok(isTap(10, 0, 12) && !isTap(13, 0, 12), "the limit can be given");

/* ---- the arrow keys ---- */
{ const n = (k, p = { x: 100, y: 100 }) => nudge(p, k, 72, 390, 844);
  ok(NUDGE === 24 && JSON.stringify(n("ArrowLeft")) === JSON.stringify({ x: 76, y: 100 }) && JSON.stringify(n("ArrowRight")) === JSON.stringify({ x: 124, y: 100 }) && JSON.stringify(n("ArrowUp")) === JSON.stringify({ x: 100, y: 76 }) && JSON.stringify(n("ArrowDown")) === JSON.stringify({ x: 100, y: 124 }), "each arrow key moves the orb 24 pixels");
  ok(n("Enter") === null && n("a") === null && n("Tab") === null, "any other key does nothing here");
  ok(JSON.stringify(n("ArrowLeft", { x: 10, y: 10 })) === JSON.stringify({ x: 0, y: 10 }) && JSON.stringify(n("ArrowDown", { x: 10, y: 800 })) === JSON.stringify({ x: 10, y: 844 - 72 }), "against the edge it stops there, on the screen"); }

/* ---- where the panel opens ---- */
{ const VP = { w: 1440, h: 900 }, orb = (x, y) => ({ x, y, size: 84 }), inScreen = (p, h = 400) => p.left >= 12 - 0.01 && p.top >= 12 - 0.01 && p.left + p.width <= VP.w - 12 + 0.01 && p.top + h <= VP.h - 12 + 0.01;
  let p = placePanel(orb(1340, 800), VP, { height: 400 });
  ok(p.placement === "left" && p.left + p.width <= 1340 - 12 + 0.01 && inScreen(p), "an orb on the right opens it to the left of the orb, wholly on the screen", p);
  ok(p.top + 400 <= 800 + 84 + 0.01 && p.top >= 12, "and by an orb low on the screen it sits level with the orb's foot", p);
  p = placePanel(orb(16, 100), VP, { height: 300 });
  ok(p.placement === "right" && p.left >= 16 + 84 + 12 - 0.01 && inScreen(p, 300), "an orb on the left opens it to the right", p);
  p = placePanel(orb(700, 16), VP, { height: 300 });
  ok(inScreen(p, 300) && (p.placement === "left" || p.placement === "right") && (p.left + p.width <= 700 - 12 + 0.01 || p.left >= 700 + 84 + 12 - 0.01), "an orb at the top middle of a desk still has room on a side", p);
  ok(placePanel(orb(1340, 400), VP, { height: 5000 }).maxHeight === 900 - 24, "a tall panel is held to the screen and scrolls inside it");
  const PH = { w: 390, h: 844 };
  p = placePanel({ x: 302, y: 756, size: 72 }, PH, { height: 500 });
  ok(p.placement === "left" && p.width === 278 && p.left === 12 && p.left + p.width <= 302 - 12 + 0.01, "on a phone, beside an orb on the right edge, the panel takes the room left of it (278 wide)", p);
  p = placePanel({ x: 16, y: 300, size: 72 }, PH, { height: 500 });
  ok(p.placement === "right" && p.width === 278 && p.left + p.width <= 390 - 12 + 0.01, "and to the right of an orb on the left edge", p);
  p = placePanel({ x: 159, y: 16, size: 72 }, PH, { height: 500 });
  ok(p.placement === "below" && p.top >= 16 + 72 + 12 - 0.01 && p.left >= 12 && p.left + p.width <= 390 - 12 + 0.01 && p.top + Math.min(500, p.maxHeight) <= 844 - 12 + 0.01, "an orb at the top middle of a phone opens it below, still wholly on the screen", p);
  p = placePanel({ x: 159, y: 756, size: 72 }, PH, { height: 500 });
  ok(p.placement === "above" && p.top + Math.min(500, p.maxHeight) <= 756 - 12 + 0.01 && p.top >= 12, "an orb at the bottom middle opens it above", p);
  for (const x of [0, 16, 80, 159, 250, 302, 318]) for (const y of [0, 16, 400, 772]) { const q = placePanel({ x, y, size: 72 }, PH, { height: 600 }), h = Math.min(600, q.maxHeight); ok(q.left >= 11.99 && q.top >= 11.99 && q.left + q.width <= 390 - 11.99 && q.top + h <= 844 - 11.99 && q.maxHeight >= 120, `on a phone an orb at (${x}, ${y}) never opens the panel off the screen`, q); } }

/* ---- the slow wander ---- */
{ const a = roamAnchors(72, 390, 844);
  ok(IDLE_MS === 9000 && ROAM_MS === 24000 && GLIDE_MS === 2400, "the wander's timing is BidVoice's: 9 seconds quiet, one move in 24, a 2.4 second glide");
  ok(a.length === 12 && a[0].name === "bottom-right" && a[0].x === 390 - 72 - GAP && a[0].y === 844 - 72 - GAP, "the orb starts at the bottom-right corner, the first of twelve places", a[0]);
  ok(a.every((q) => q.x >= GAP && q.y >= GAP && q.x <= 390 - 72 - GAP && q.y <= 844 - 72 - GAP), "every place is inside the screen");
  ok(a.every((q) => q.x === GAP || q.y === GAP || q.x === 390 - 72 - GAP || q.y === 844 - 72 - GAP || false) , "every place is on an edge");
  const sides = new Set(a.map((q) => q.edge)); ok(["left", "right", "top", "bottom"].every((e) => sides.has(e)), "the places go all the way round: right, top, left and bottom");
  ok(new Set(a.map((q) => q.x + "," + q.y)).size === 12, "no two places are the same");
  ok(nextAnchor(a, 0, () => false) === 1 && nextAnchor(a, 11, () => false) === 0, "it goes to the next place, and from the last back to the first");
  ok(nextAnchor(a, 0, (q) => q === a[1]) === 2 && nextAnchor(a, 0, (q) => q === a[1] || q === a[2]) === 3, "a blocked place is skipped");
  ok(nextAnchor(a, 3, () => true) === -1, "when every place is blocked it stays where it is");
  let at = 0; const seen = []; for (let i = 0; i < 12; i++) { at = nextAnchor(a, at, () => false); seen.push(at); } ok(new Set(seen).size === 12 && at === 0, "twelve moves take it once round and home again");
  ok(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }) && !overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 }) && overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 }, 11) && !overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }), "overlaps: touching is not covering, and room around a box can be asked for"); }

/* ---- what the files promise ---- */
{ const files = ["public/js/eden.js", "public/js/eden-place.js", "public/js/eden-orb.js", "public/js/orb.js"].map((f) => [f, strip(read(f))]);
  for (const [f, t] of files) {
    ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(t), `${f}: keeps no place in the browser (in memory, for this page view only)`);
    ok(!/setAttribute\(\s*["']style|\.cssText|style=/.test(t), `${f}: no style attribute is written`);
    ok(!/https?:\/\//.test(t) && !/\bimport\s*\(/.test(t), `${f}: loads nothing from anywhere else`);
  }
  const eden = files[0][1];
  ok(/pointerdown/.test(eden) && /setPointerCapture/.test(eden) && /pointermove/.test(eden) && /pointerup/.test(eden) && /ArrowLeft|nudge/.test(eden) && /prefers-reduced-motion/.test(eden), "eden.js: pointer events, capture, the arrow keys and less motion");
  const css = strip(read("public/css/lm.css")), orbCss = css.match(/\.eden-float\{[\s\S]*?\.eden-panel\{[^}]*\}/)[0];
  ok(/touch-action:none/.test(orbCss) && (css.match(/touch-action:none/g) || []).length === 1 && /\.eden-orb-btn\{[^}]*touch-action:none/.test(css), "touch-action none is on the orb's button only");
  ok(/217,\s*119,\s*6/.test(css.match(/\.eden-orb-glow\{[^}]*\}/)[0]), "the glow is the site's gold (#D97706)");
  ok(/@media \(prefers-reduced-motion:reduce\)\{[^}]*\.eden-float[^}]*transition:none[^}]*\}[^}]*\.eden-orb-canvas\{animation:none\}/.test(css), "the style sheet turns off the slide, the glide and the drift for less motion");
  ok(/\.eden-float\{[^}]*position:fixed[^}]*z-index:90/.test(css) && /\.eden-panel\{[^}]*position:fixed[^}]*z-index:91/.test(css), "the orb and its panel are fixed to the screen above the page");
  ok(/\.eden-float\[data-state=off\] \.eden-orb-canvas\{filter:grayscale\(1\)/.test(css), "not set up is grey");
  ok(!/background(-color)?:\s*(#0|#1|black|rgb\(\s*[0-9]{1,2}\s*,)/i.test(orbCss), "no dark panel behind the orb or in its panel");
  const orb = strip(read("public/js/eden-orb.js"));
  ok(["255,167,102", "255,107,26", "122,36,0", "46,12,0", "255,214,188", "255,151,82", "255,196,150"].every((n) => orb.includes(n)) && /breath = 1 \+/.test(orb) && /edenOrbMesh/.test(orb) && /glowEl\.style\.opacity/.test(orb), "eden-orb.js: the copied drawing is whole (the amber and copper numbers, the breathing, the mesh, the glow)"); }

process.exit(T.done());

/* eden-place.js — where Eden's floating orb is, and where its panel opens. Only arithmetic: no page, no timer, nothing to load, so
   tests/unit-test.mjs can run every piece on its own. public/js/eden.js does the moving and calls these.
   The orb lives on the whole edge of the screen (founder, 2026-10-18): when a person lets go it slides to the nearest of the four
   edges and can rest anywhere along it. Its slow wander at rest is the one BidVoice's orb has (edenRoam in that product's
   public/index.html): after 9 seconds of quiet it moves to the next resting place every 24 seconds, gliding for 2.4 seconds,
   and never when someone is using the page. Here the resting places run all the way round the four edges. */

export const TAP_LIMIT = 6;      // a press that moves 6 pixels or less is a tap
export const NUDGE = 24;         // one arrow key moves the orb this far
export const GAP = 16;           // how far from the very edge the orb rests
export const IDLE_MS = 9000;     // BidVoice: let the person settle first
export const ROAM_MS = 24000;    // BidVoice: one move in 24 seconds
export const GLIDE_MS = 2400;    // BidVoice: it glides with a 2.4 second transition
export const SNAP_MS = 480;      // after a drag: the short eased slide to the edge
export const NEAR = 1.6;         // a pointer within this many orb-widths of its centre holds it still

/** the orb's width and height: a little bolder than a corner widget, larger on a computer */
export const orbSize = (vw) => (vw < 700 ? 72 : 84);

const lim = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** keep the whole orb inside the screen (gap: how far in from the edge it must stay) */
export function clampToViewport(p, size, vw, vh, gap = 0) {
  return { x: lim(p.x, gap, vw - size - gap), y: lim(p.y, gap, vh - size - gap) };
}

/** after a drag: the nearest of the four edges (a tie goes right, then left, bottom, top), and the place on that edge.
    The other coordinate is kept, so the orb slides along the edge to where it was let go. */
export function snapToEdge(p, size, vw, vh, gap = GAP) {
  const c = clampToViewport(p, size, vw, vh, 0);
  const d = { right: vw - size - c.x, left: c.x, bottom: vh - size - c.y, top: c.y };
  let edge = "right";
  for (const e of ["left", "bottom", "top"]) if (d[e] < d[edge]) edge = e;
  const g = clampToViewport(c, size, vw, vh, gap);
  const x = edge === "left" ? gap : edge === "right" ? Math.max(gap, vw - size - gap) : g.x;
  const y = edge === "top" ? gap : edge === "bottom" ? Math.max(gap, vh - size - gap) : g.y;
  return { x, y, edge };
}

/** a press is a tap when it did not move beyond the limit */
export const isTap = (dx, dy, limit = TAP_LIMIT) => Math.hypot(dx, dy) <= limit;

/** an arrow key: the orb moves one step and stays inside the screen. Any other key returns null. */
export function nudge(p, key, size, vw, vh, step = NUDGE) {
  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[key];
  if (!d) return null;
  return clampToViewport({ x: p.x + d[0], y: p.y + d[1] }, size, vw, vh, 0);
}

/** the nearest edge of an orb that is anywhere on the screen */
export function edgeOf(p, size, vw, vh) { return snapToEdge(p, size, vw, vh, 0).edge; }

/** Where the panel opens: beside the orb, on whichever side the orb sits (an orb on the right edge opens it to the left), and wholly
    on the screen. If neither side has room for the narrowest panel (an orb parked in the middle of the top or bottom edge on a
    phone) it opens above or below the orb instead. want: { height } the panel's own height; the panel scrolls inside maxHeight. */
export function placePanel(orb, vp, want = {}, o = {}) {
  const gap = o.gap ?? 12, m = o.margin ?? 12, minW = o.minWidth ?? 260, maxW = o.maxWidth ?? 380;
  const maxH = Math.max(120, vp.h - 2 * m);
  const cx = orb.x + orb.size / 2, cy = orb.y + orb.size / 2;
  const roomR = vp.w - (orb.x + orb.size) - gap - m, roomL = orb.x - gap - m;
  const sit = cx < vp.w / 2 ? "left" : "right";             // the side the orb sits on
  const order = sit === "left" ? ["right", "left"] : ["left", "right"];   // the panel opens to the other side of it first
  for (const side of order) {
    const room = side === "right" ? roomR : roomL;
    if (room < minW) continue;
    const width = Math.min(maxW, room), h = Math.min(want.height || maxH, maxH);
    const left = side === "right" ? orb.x + orb.size + gap : orb.x - gap - width;
    const top = lim(cy > vp.h / 2 ? orb.y + orb.size - h : orb.y, m, vp.h - h - m);
    return { left, top, width, maxHeight: maxH, placement: side };
  }
  const width = Math.min(maxW, vp.w - 2 * m), left = lim(cx - width / 2, m, vp.w - width - m);
  const below = cy <= vp.h / 2, room = below ? vp.h - (orb.y + orb.size) - gap - m : orb.y - gap - m;
  const maxHeight = Math.max(120, Math.min(maxH, room)), h = Math.min(want.height || maxHeight, maxHeight);
  const top = below ? orb.y + orb.size + gap : Math.max(m, orb.y - gap - h);
  return { left, top, width, maxHeight, placement: below ? "below" : "above" };
}

/** the resting places all the way round the four edges, from the bottom-right corner (where the orb starts) up the right edge, along
    the top, down the left edge and back along the bottom: BidVoice's four places (right and left, middle and low) widened to the
    whole edge. */
export function roamAnchors(size, vw, vh, gap = GAP) {
  const xs = { l: gap, c: Math.round((vw - size) / 2), r: Math.max(gap, vw - size - gap) };
  const ys = { t: gap, b: Math.max(gap, vh - size - gap) };
  const along = (f) => Math.round(ys.t + (ys.b - ys.t) * f);
  return [
    { name: "bottom-right", x: xs.r, y: ys.b, edge: "right" },
    { name: "right-low", x: xs.r, y: along(0.72), edge: "right" },
    { name: "right-middle", x: xs.r, y: along(0.5), edge: "right" },
    { name: "right-high", x: xs.r, y: along(0.28), edge: "right" },
    { name: "top-right", x: xs.r, y: ys.t, edge: "top" },
    { name: "top-middle", x: xs.c, y: ys.t, edge: "top" },
    { name: "top-left", x: xs.l, y: ys.t, edge: "top" },
    { name: "left-high", x: xs.l, y: along(0.28), edge: "left" },
    { name: "left-middle", x: xs.l, y: along(0.5), edge: "left" },
    { name: "left-low", x: xs.l, y: along(0.72), edge: "left" },
    { name: "bottom-left", x: xs.l, y: ys.b, edge: "bottom" },
    { name: "bottom-middle", x: xs.c, y: ys.b, edge: "bottom" },
  ];
}

/** the next resting place after `from` that is not blocked; -1 when every one is blocked (then the orb stays) */
export function nextAnchor(anchors, from, blocked) {
  for (let k = 1; k <= anchors.length; k++) {
    const i = (from + k) % anchors.length;
    if (i !== from && !blocked(anchors[i])) return i;
  }
  return -1;
}

/** do two boxes { x, y, w, h } touch, with `pad` pixels of room around the first? */
export const overlaps = (a, b, pad = 0) => a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;

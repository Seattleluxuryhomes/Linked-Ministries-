/* eden-orb.js — Eden's orange orb, drawn on a canvas. The drawing is copied from the family's orb (lexos/src/edenorb.jsx in the other
   repository; recorded in commons.json): the same state table, the four breathing blobs, the seeded mesh of nodes and signals, the hot
   nucleus, the vignette and the glint, with the same amber and copper numbers. Only the framework layer is changed: it is a plain
   function that mounts a canvas into an element, instead of a component. Nothing is loaded from outside: it is a canvas and arithmetic.
   Motion: under prefers-reduced-motion the orb draws one still frame per state and stops; it never loops then.
   The orb is the one warm accent on the signed-in pages. It is small and never alarmed. It carries no words: the words are beside it. */
const EDEN_ORB_STATES = ["ready", "listening", "thinking", "speaking"];
const EDEN_ORB_P = {
  ready: { speed: 0.04, energy: 0.55, pulse: 0.045, pulseHz: 0.22, filament: 0.10 },
  listening: { speed: 0.09, energy: 0.80, pulse: 0.02, pulseHz: 0.6, filament: 0.14 },
  thinking: { speed: 0.26, energy: 0.88, pulse: 0.03, pulseHz: 1.3, filament: 0.24 },
  speaking: { speed: 0.09, energy: 0.78, pulse: 0.09, pulseHz: 1.5, filament: 0.16 },
};
const EDEN_ORB_BLOBS = [
  { r: 0.34, ax: 0.30, ay: 0.22, w1: 0.31, w2: 0.23, ph: 0.0, hue: "255,214,188" },
  { r: 0.26, ax: 0.24, ay: 0.30, w1: 0.19, w2: 0.29, ph: 2.1, hue: "255,151,82" },
  { r: 0.30, ax: 0.33, ay: 0.18, w1: 0.26, w2: 0.17, ph: 4.2, hue: "255,107,26" },
  { r: 0.20, ax: 0.18, ay: 0.27, w1: 0.37, w2: 0.21, ph: 1.3, hue: "255,196,150" },
];
const EDEN_ORB_FILAMENTS = [0, 1, 2].map((i) => ({ ph: i * 2.3, w: 0.14 + i * 0.06 }));
function edenOrbRng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/* the seeded neural mesh: generated once per orb, stable for as long as it is mounted */
function edenOrbMesh(small, rnd) {
  const NN = small ? 3 : 14, nodes = []; let tries = 0;
  while (nodes.length < NN && tries < 600) {
    tries++;
    const az = rnd() * Math.PI * 2, el = Math.acos(2 * rnd() - 1), rr = 0.30 + 0.55 * Math.pow(rnd(), 0.7);
    const x = rr * Math.sin(el) * Math.cos(az), y = rr * Math.sin(el) * Math.sin(az), z = rr * Math.cos(el); let ok = true;
    for (let q = 0; q < nodes.length; q++) { const n = nodes[q], dx = n.x - x, dy = n.y - y, dz = n.z - z; if (dx * dx + dy * dy + dz * dz < 0.32 * 0.32) { ok = false; break; } }
    if (ok) nodes.push({ x, y, z, f: 0, wp: rnd() * 6.283, ww: 0.5 + rnd() * 0.7, surf: Math.min(1, rr / 0.85) });
  }
  const edges = [], seen = {};
  for (let a = 0; a < nodes.length; a++) {
    const ds = [];
    for (let b = 0; b < nodes.length; b++) { if (b === a) continue; const ex = nodes[a].x - nodes[b].x, ey = nodes[a].y - nodes[b].y, ez = nodes[a].z - nodes[b].z; ds.push([ex * ex + ey * ey + ez * ez, b]); }
    ds.sort((u, v) => u[0] - v[0]);
    for (let k = 0; k < 2 && k < ds.length; k++) { const b2 = ds[k][1], key = Math.min(a, b2) + "-" + Math.max(a, b2); if (!seen[key]) { seen[key] = 1; edges.push({ a, b: b2 }); } }
  }
  const byR = nodes.map((n, i) => [n.x * n.x + n.y * n.y + n.z * n.z, i]).sort((u, v) => u[0] - v[0]);
  for (let c = 0; c < 3 && c < byR.length; c++) edges.push({ a: -1, b: byR[c][1] });
  return { nodes, edges, sigs: [] };
}
/* one frame of the orb: BidVoice's frame() with the framework layer taken out. s is the orb's own state bag. */
function edenOrbDraw(s, ctx, W, reduced, glowEl) {
  const small = s.small, SIZE = s.logical, cx = SIZE / 2, cy = SIZE / 2, R = SIZE / 2 - 2;
  const g = EDEN_ORB_P[s.state] || EDEN_ORB_P.ready;
  for (const k in s.cur) s.cur[k] += (g[k] - s.cur[k]) * (reduced ? 1 : 0.05);
  const cur = s.cur, mesh = s.mesh, speedMul = small ? 0.6 : 1;
  const useBlobs = small ? EDEN_ORB_BLOBS.slice(0, 2) : EDEN_ORB_BLOBS, useFil = small ? [] : EDEN_ORB_FILAMENTS;
  s.t += cur.speed * speedMul * (reduced ? 0 : 1);
  const t = s.t;
  s.thinkAmt += (((s.state === "thinking") ? 1 : 0) - s.thinkAmt) * (reduced ? 1 : 0.06);
  const thinkAmt = s.thinkAmt;
  /* biomimetic breathing: two incommensurate sines so the expand and contract never looks robotic */
  const breath = 1 + (reduced ? 0 : (0.035 * Math.sin(t * 0.9) + 0.016 * Math.sin(t * 1.63 + 1.1)));
  const pulse = 1 + cur.pulse * Math.sin(t * cur.pulseHz * 6);
  const energy = Math.min(1.30, cur.energy * pulse);
  const rad = R * breath;
  const swirl = thinkAmt * t * 0.7;
  if (glowEl) {
    const gOp = 0.5 + 0.5 * Math.min(1, cur.energy);
    glowEl.style.opacity = Math.max(0, Math.min(1, gOp)).toFixed(3);
    glowEl.style.transform = "translate(-50%,-50%) scale(" + (1 + (breath - 1) * 1.6).toFixed(3) + ")";
  }
  ctx.clearRect(0, 0, SIZE, SIZE); ctx.save();
  /* the liquid silhouette: a slowly morphing blob (mercury, a cell) */
  const WSTEPS = 48, warpA = reduced ? 0 : 0.06, EDGE = SIZE / 2 - 1;
  ctx.beginPath();
  for (let wi = 0; wi <= WSTEPS; wi++) {
    const wa = wi / WSTEPS * Math.PI * 2;
    let wr = rad * (1 + warpA * ((Math.sin(wa * 3 + t * 0.9) + 0.6 * Math.sin(wa * 2 - t * 0.6 + 1.7) + 0.4 * Math.sin(wa * 5 + t * 0.4)) / 2.0));
    if (wr > EDGE) wr = EDGE;
    const wx = cx + Math.cos(wa) * wr, wy = cy + Math.sin(wa) * wr;
    if (wi === 0) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
  }
  ctx.closePath(); ctx.clip();
  const base = ctx.createRadialGradient(cx - 14, cy - 16, 8, cx, cy, rad * 1.05);
  base.addColorStop(0, "rgba(255,167,102," + (0.9 * energy) + ")");
  base.addColorStop(0.35, "rgba(255,107,26," + (0.85 * energy) + ")");
  base.addColorStop(0.72, "rgba(122,36,0,0.95)"); base.addColorStop(1, "rgba(46,12,0,1)");
  ctx.fillStyle = base; ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < useBlobs.length; i++) {
    const b = useBlobs[i];
    let ox = Math.sin(t * b.w1 + b.ph) * b.ax * R, oy = Math.cos(t * b.w2 + b.ph) * b.ay * R;
    if (thinkAmt > 0.01) { const ca = Math.cos(swirl), sa = Math.sin(swirl), rx = ox * ca - oy * sa, ry = ox * sa + oy * ca; ox += (rx - ox) * thinkAmt; oy += (ry - oy) * thinkAmt; }
    const bx = cx + ox, by = cy + oy, br = b.r * R * (1 + 0.12 * Math.sin(t * 0.4 + b.ph));
    const gg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    gg.addColorStop(0, "rgba(" + b.hue + "," + (0.34 * energy) + ")"); gg.addColorStop(1, "rgba(" + b.hue + ",0)");
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
  }
  ctx.lineWidth = 1.4;
  for (let j = 0; j < useFil.length; j++) {
    const f = useFil[j], y0 = cy + Math.sin(t * 0.5 + f.ph) * R * 0.45;
    ctx.strokeStyle = "rgba(255,224,196," + (cur.filament * energy) + ")";
    ctx.beginPath(); ctx.moveTo(cx - R * 0.85, y0);
    ctx.bezierCurveTo(cx - R * 0.3, y0 + Math.sin(t * f.w + f.ph) * R * 0.5, cx + R * 0.3, y0 + Math.cos(t * f.w + f.ph * 1.7) * R * 0.5, cx + R * 0.85, y0 + Math.sin(t * 0.3 + f.ph) * 12);
    ctx.stroke();
  }
  /* the Living Brain: thought moving inside the glass. Idle is a mind at rest; thinking cascades. */
  const proc = thinkAmt;
  s.coreFlare *= 0.90;
  if (!small) {
    const wob = t * 0.13, cw2 = Math.cos(wob), sw2 = Math.sin(wob), pts = [], NL = mesh.nodes.length;
    for (let pi = 0; pi < NL; pi++) {
      const n = mesh.nodes[pi], rx = n.x * cw2 + n.z * sw2, rz = n.z * cw2 - n.x * sw2;
      const jx = reduced ? 0 : Math.sin(t * n.ww + n.wp) * 0.018, jy = reduced ? 0 : Math.cos(t * n.ww * 0.8 + n.wp) * 0.018, per = 1 + rz * 0.22;
      pts.push({ x: cx + (rx + jx) * R * per, y: cy + (n.y + jy) * R * 0.94 * per, d: 0.55 + 0.45 * ((rz / 0.85) + 1) / 2 });
    }
    const PT = (i) => (i < 0 ? { x: cx, y: cy, d: 1 } : pts[i]);
    if (!reduced) {
      const rate = 0.010 + proc * 0.11, maxS = Math.round(4 + proc * 12);
      if (mesh.sigs.length < maxS && Math.random() < rate) {
        const ei = (Math.random() * mesh.edges.length) | 0, fw = Math.random() < 0.5;
        mesh.sigs.push({ e: ei, p: fw ? 0 : 1, d: fw ? 1 : -1, sp: 0.016 + Math.random() * 0.012 + proc * 0.030 });
      }
      for (let si = mesh.sigs.length - 1; si >= 0; si--) {
        const sg = mesh.sigs[si]; sg.p += sg.sp * sg.d;
        if (sg.p <= 0 || sg.p >= 1) {
          const ed0 = mesh.edges[sg.e], arr = (sg.p >= 1) ? ed0.b : ed0.a;
          if (arr < 0) s.coreFlare = 1;
          else {
            mesh.nodes[arr].f = 1;
            if (mesh.sigs.length < maxS && Math.random() < 0.30 + proc * 0.55) {
              for (let e2 = 0; e2 < mesh.edges.length; e2++) { const ee = mesh.edges[e2]; if (e2 !== sg.e && (ee.a === arr || ee.b === arr)) { mesh.sigs.push({ e: e2, p: (ee.a === arr) ? 0 : 1, d: (ee.a === arr) ? 1 : -1, sp: 0.018 + proc * 0.035 }); break; } }
            }
          }
          mesh.sigs.splice(si, 1);
        }
      }
    }
    for (let eI = 0; eI < mesh.edges.length; eI++) {
      const eg = mesh.edges[eI], A = PT(eg.a), B = PT(eg.b), dd = (A.d + B.d) / 2, eA = dd * (0.065 + 0.11 * proc);
      eg.mx = (A.x + B.x) / 2 + (cx - (A.x + B.x) / 2) * 0.14 + (reduced ? 0 : Math.sin(t * 0.6 + eI) * R * 0.015);
      eg.my = (A.y + B.y) / 2 + (cy - (A.y + B.y) / 2) * 0.14 + (reduced ? 0 : Math.cos(t * 0.5 + eI * 1.3) * R * 0.015);
      ctx.strokeStyle = "rgba(255,178,118," + eA.toFixed(3) + ")"; ctx.lineWidth = 0.8 + 0.6 * proc * dd;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.quadraticCurveTo(eg.mx, eg.my, B.x, B.y); ctx.stroke();
    }
    for (let s4 = 0; s4 < mesh.sigs.length; s4++) {
      const g4 = mesh.sigs[s4], e4 = mesh.edges[g4.e], A2 = PT(e4.a), B2 = PT(e4.b), p2 = g4.p, q2 = 1 - p2;
      const sx = q2 * q2 * A2.x + 2 * q2 * p2 * e4.mx + p2 * p2 * B2.x, sy = q2 * q2 * A2.y + 2 * q2 * p2 * e4.my + p2 * p2 * B2.y;
      const sd = A2.d * q2 + B2.d * p2, sr = (1.4 + 2.2 * proc) * sd;
      ctx.fillStyle = "rgba(255,160,72," + (0.16 * sd).toFixed(3) + ")"; ctx.beginPath(); ctx.arc(sx, sy, sr * 3.0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,246,228," + (0.85 * sd).toFixed(3) + ")"; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    }
    for (let nI2 = 0; nI2 < NL; nI2++) {
      const nd = mesh.nodes[nI2], pq = pts[nI2]; nd.f *= 0.90;
      const a0 = pq.d * (0.17 + 0.17 * proc) + (reduced ? 0.08 : 0);
      ctx.fillStyle = "rgba(255,220,172," + Math.min(0.66, a0).toFixed(3) + ")"; ctx.beginPath(); ctx.arc(pq.x, pq.y, (R * 0.020 + 0.8) * pq.d, 0, Math.PI * 2); ctx.fill();
      if (nd.f > 0.06) {
        const fr = R * (0.045 + 0.085 * nd.f) * pq.d, fg = ctx.createRadialGradient(pq.x, pq.y, 0, pq.x, pq.y, fr);
        fg.addColorStop(0, "rgba(255,248,232," + (0.75 * nd.f * pq.d).toFixed(3) + ")"); fg.addColorStop(0.5, "rgba(255,190,110," + (0.30 * nd.f * pq.d).toFixed(3) + ")"); fg.addColorStop(1, "rgba(255,140,50,0)");
        ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(pq.x, pq.y, fr, 0, Math.PI * 2); ctx.fill();
      }
    }
  } else {
    /* the dock orb: no mesh, a hot nucleus and three ember sparks flaring on their own slow rhythms */
    for (let mi = 0; mi < mesh.nodes.length; mi++) {
      const mn = mesh.nodes[mi], fl = reduced ? 0.25 : Math.pow(Math.max(0, Math.sin(t * (0.7 + mn.ww * 0.5) + mn.wp)), 8) * (0.5 + proc * 0.6);
      if (fl < 0.04) continue;
      const ex2 = cx + mn.x * R * 0.72, ey2 = cy + mn.y * R * 0.72;
      ctx.fillStyle = "rgba(255,150,70," + (0.20 * fl).toFixed(3) + ")"; ctx.beginPath(); ctx.arc(ex2, ey2, 2.2 + fl * 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,238,210," + (0.65 * fl).toFixed(3) + ")"; ctx.beginPath(); ctx.arc(ex2, ey2, 0.9 + fl * 1.1, 0, Math.PI * 2); ctx.fill();
    }
  }
  /* the nucleus: a dense, bright hot core; the same Data Core on every orb, larger on the small one so it reads */
  const nucP = 1 + 0.12 * Math.sin(t * (0.8 + proc * 2.0)) + s.coreFlare * 0.30, nucR = R * ((small ? 0.30 : 0.15) + 0.05 * proc) * nucP;
  const nuc = ctx.createRadialGradient(cx, cy, 0, cx, cy, nucR);
  nuc.addColorStop(0, "rgba(255,252,246," + Math.min(1, 0.82 + 0.16 * proc + 0.12 * s.coreFlare) + ")"); nuc.addColorStop(0.42, "rgba(255,202,142,0.72)"); nuc.addColorStop(1, "rgba(255,120,40,0)");
  ctx.fillStyle = nuc; ctx.beginPath(); ctx.arc(cx, cy, nucR, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  const vig = ctx.createRadialGradient(cx, cy, rad * 0.55, cx, cy, rad);
  vig.addColorStop(0, "rgba(20,5,0,0)"); vig.addColorStop(1, "rgba(20,5,0,0.5)");
  ctx.fillStyle = vig; ctx.fillRect(0, 0, SIZE, SIZE);
  const spx = cx - R * 0.38, spy = cy - R * 0.46, spec = ctx.createRadialGradient(spx, spy, 0, spx, spy, rad * 0.5);
  spec.addColorStop(0, "rgba(255,255,255,0.300)"); spec.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = spec; ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.restore();
}

/** mount an orb into `host`. Returns { setState(state), destroy() }. state: ready | listening | thinking | speaking. */
export function mountEdenOrb(host, { state = "ready", size = 56, small = true, seed = 7 } = {}) {
  const logical = small ? 128 : 176;
  const s = { logical, small, state: EDEN_ORB_STATES.includes(state) ? state : "ready", t: 0, thinkAmt: 0, coreFlare: 0, cur: { ...EDEN_ORB_P.ready }, mesh: edenOrbMesh(small, edenOrbRng(seed * 7919 + logical)), frames: 0, redraw: null };
  const c = document.createElement("canvas");
  c.className = "eden-orb-canvas"; c.setAttribute("aria-hidden", "true"); c.setAttribute("data-eden-orb-canvas", "");
  c.width = c.height = Math.max(1, Math.round(size * Math.min(window.devicePixelRatio || 1, 2)));
  c.setAttribute("width", String(c.width)); c.setAttribute("height", String(c.height)); c.setAttribute("data-size", String(size));
  host.append(c);
  const ctx = c.getContext && c.getContext("2d");
  if (!ctx) return { setState() {}, destroy() { c.remove(); } };
  const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  let reduced = !!(mq && mq.matches), raf = 0, alive = true;
  ctx.setTransform(c.width / s.logical, 0, 0, c.width / s.logical, 0, 0);
  const draw = () => { edenOrbDraw(s, ctx, s.logical, reduced, null); s.frames++; c.dataset.frames = String(s.frames); c.dataset.state = s.state; };
  const loop = () => { if (!alive) return; if (c.isConnected) draw(); raf = requestAnimationFrame(loop); };
  const start = () => { cancelAnimationFrame(raf); if (reduced) { s.redraw = draw; draw(); draw(); } else { s.redraw = null; raf = requestAnimationFrame(loop); } };
  const onMotion = () => { reduced = !!(mq && mq.matches); c.dataset.motion = reduced ? "still" : "moving"; start(); };
  c.dataset.motion = reduced ? "still" : "moving";
  if (mq && mq.addEventListener) mq.addEventListener("change", onMotion);
  start();
  return {
    setState(next) { s.state = EDEN_ORB_STATES.includes(next) ? next : "ready"; c.dataset.state = s.state; if (s.redraw) { s.redraw(); s.redraw(); } },
    destroy() { alive = false; cancelAnimationFrame(raf); if (mq && mq.removeEventListener) mq.removeEventListener("change", onMotion); c.remove(); },
  };
}

/* eden.js — Eden, the writing helper, on the signed-in pages. Eden is a glowing orb at the side of the screen (founder, 2026-10-18): a
   person can drag it, it slides to the nearest edge, it wanders slowly on its own when nobody is using the page, and a tap opens
   Eden's panel beside it. The pieces of arithmetic are in public/js/eden-place.js; the drawing is public/js/eden-orb.js. This script holds no rule and no prompt: it sends a job name and what the
   person typed to /api/eden, and shows what comes back. The server decides everything (its prompt, its key, its limits, the crisis check,
   the verse list). What Eden writes is shown, marked, and goes into a form field only when the person presses "Use these words"; the
   form's own Save or Send is still the only way anything is kept or sent. With no key on the server it says so and offers nothing.
   The free box (founder, 2026-10-18: "tap the orb anywhere while signed in, say what you want, she writes it"): a signed-in person says what
   they want in their own words and the page sends ONLY { job: "freeform", fields: { words } }. The server decides which kind of writing it is
   and answers with the kind and the draft; this script shows both, with one button. "Use this in a new ask / give" opens the form on /me
   with the draft in it (not saved); "Copy letter" copies a letter. */
import { h, get, post, msg, field, area, select, busy } from "/js/common.js";
import { WORDS, CRISIS } from "/js/pure.js";
import { mountEdenOrb } from "/js/eden-orb.js";
import { TAP_LIMIT, NUDGE, GAP, IDLE_MS, ROAM_MS, GLIDE_MS, SNAP_MS, NEAR, orbSize, clampToViewport, snapToEdge, isTap, nudge, placePanel, roamAnchors, nextAnchor, overlaps } from "/js/eden-place.js";

/* append only what is there: a missing piece is skipped, never written as the word "null" */
const add = (el, ...kids) => { el.append(...kids.flat(Infinity).filter((k) => k != null && k !== false)); return el; };

/* the free box's way into the new-post form. /me sets this; on every other page the draft travels in the address, after the #, which never
   leaves the browser, and /me reads it once and clears it. Nothing is stored. */
let handoff = null;
export function onEdenDraft(fn) { handoff = fn; }
export const HAND = "#eden=";
export function readHandoff(hash) {
  if (typeof hash !== "string" || !hash.startsWith(HAND)) return null;
  try {
    const o = JSON.parse(decodeURIComponent(hash.slice(HAND.length)));
    if (!o || (o.kind !== "ask" && o.kind !== "give")) return null;
    return { kind: o.kind, title: String(o.title || "").slice(0, 120), body: String(o.body || "").slice(0, 2000) };
  } catch (e) { return null; }
}

const draftView = (job, d) => {
  if (job === "ask_give") return [h("p", {}, h("strong", {}, d.title)), h("p", { class: "eden-draft" }, d.body)];
  if (job === "page_words") return [h("p", {}, h("strong", {}, d.tagline)), h("p", { class: "eden-draft" }, d.about)];
  return [h("p", { class: "eden-draft" }, d.letter)];
};


/* ---- the one orb on the page -------------------------------------------------------------------------------------------- */
/* edenPanel() is called by a form (the ask form, the page form, the money page's letters). It returns a small empty marker for the
   form to carry. While a marker is on the page, Eden's orb is on the screen and its panel writes for that form's job; when the form
   goes, the orb stays: it is on every page (founder, 2026-10-18, "Let's try it"). Before sign-in its panel is only words and makes no call
   to Eden; after sign-in it is the writing helper. The orb's place is kept only for this page view, in memory: nothing is stored in the browser. */
let shell = null;
const reduceMotion = () => { try { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; } };
const CONTROL = "a, button, input, select, textarea, summary, label, [role=button], [role=link], [role=checkbox]";
const EDITABLE = "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable]";
const DIALOG = "dialog[open], [role=dialog]:not([hidden]):not([data-eden-panel]), [role=alertdialog]:not([hidden]), [aria-modal=true]:not([hidden])";

function makeShell() {
  const root = h("div", { class: "eden-float", "data-eden-float": "", "data-state": "ready", hidden: true });
  const glow = h("span", { class: "eden-orb-glow", "aria-hidden": "true" });
  const btn = h("button", { class: "eden-orb-btn", type: "button", "data-eden-orb-button": "", title: WORDS.edenOpen, "aria-label": WORDS.edenOrbLabel, "aria-expanded": "false", "aria-controls": "eden-panel" });
  root.append(glow, btn);
  const panel = h("div", { class: "eden-panel", id: "eden-panel", role: "dialog", "aria-label": "Eden", "data-eden-panel": "", tabindex: "-1", hidden: true });
  document.body.append(root, panel);
  const orb = mountEdenOrb(btn, { size: 84, small: false, seed: 11, glowEl: glow });

  const S = { cfg: null, job: "", member: null, memberAsked: false, open: false, pos: null, edge: "right", placed: false, drag: null, idleSince: Date.now(), pointer: null, status: null, statusAsked: false, me: null, free: { words: "", data: null, note: "" },
    thinking: false, speaking: false, listening: false, speakTimer: 0, glideTimer: 0, snapTimer: 0, roamTimer: 0, anchorAt: 0, skipClick: false };
  const size = () => root.offsetWidth || orbSize(window.innerWidth);
  const vw = () => document.documentElement.clientWidth || window.innerWidth, vh = () => window.innerHeight;
  const calm = () => { S.idleSince = Date.now(); };

  /* the orb's picture follows what is true: not set up, thinking while a request is out, speaking for a moment when a draft arrives,
     listening while the person types to it. It is a state of the picture, never a sound. */
  function show() {
    const st = S.member && S.status && S.status.configured === false ? "off" : S.thinking ? "thinking" : S.speaking ? "speaking" : S.listening ? "listening" : "ready";
    root.dataset.state = st; orb.setState(st);
    btn.setAttribute("aria-label", st === "off" ? WORDS.edenOrbOff : S.member === false ? WORDS.edenOrbPublic : WORDS.edenOrbLabel);
  }
  const keyboardUp = () => { const v = window.visualViewport; return !!(v && window.innerHeight - v.height > 120); };
  /* where it is drawn: the kept place, lifted clear of an on-screen keyboard while one is up */
  function apply() {
    if (!S.pos) return;
    const v = window.visualViewport; let y = S.pos.y;
    if (keyboardUp()) y = Math.min(y, v.offsetTop + v.height - size() - GAP);
    root.style.left = Math.round(S.pos.x) + "px"; root.style.top = Math.round(Math.max(0, y)) + "px";
    if (S.open) placeThePanel();
  }
  function setPos(p, edge) { S.pos = { x: p.x, y: p.y }; if (edge) S.edge = edge; apply(); }
  function startPlace() { const a = roamAnchors(size(), vw(), vh())[0]; S.anchorAt = 0; setPos(a, a.edge); }
  /* a glide or a snap is a CSS transition; with less motion asked for there is none and the orb simply arrives */
  function moving(cls, ms, timerKey) {
    clearTimeout(S[timerKey]); root.classList.remove("gliding", "snapping");
    if (reduceMotion()) return;
    void root.offsetWidth; root.classList.add(cls); S[timerKey] = setTimeout(() => root.classList.remove(cls), ms + 80);
  }
  /* freeze wherever a glide has got to */
  function stopGlide() {
    if (!root.classList.contains("gliding")) return;
    const r = root.getBoundingClientRect(); clearTimeout(S.glideTimer); root.classList.remove("gliding");
    S.pos = { x: r.left, y: r.top }; root.style.left = Math.round(r.left) + "px"; root.style.top = Math.round(r.top) + "px";
  }

  /* ---- the panel opens beside the orb, wholly on the screen ---- */
  function placeThePanel() {
    if (panel.hidden || !S.pos) return;
    const o = { x: S.pos.x, y: S.pos.y, size: size() };
    panel.style.width = "auto";
    const first = placePanel(o, { w: vw(), h: vh() }, {});
    panel.style.maxHeight = Math.round(first.maxHeight) + "px"; panel.style.width = Math.round(first.width) + "px";
    const want = Math.min(panel.scrollHeight + 2, first.maxHeight);
    const p = placePanel(o, { w: vw(), h: vh() }, { height: want });
    panel.style.width = Math.round(p.width) + "px"; panel.style.maxHeight = Math.round(p.maxHeight) + "px";
    panel.style.left = Math.round(p.left) + "px"; panel.style.top = Math.round(p.top) + "px"; panel.dataset.placement = p.placement;
  }
  const grow = typeof ResizeObserver === "function" ? new ResizeObserver(() => placeThePanel()) : null;
  function openPanel() {
    if (S.open) return;
    S.open = true; stopGlide(); calm(); btn.setAttribute("aria-expanded", "true"); panel.hidden = false; buildPanel(); placeThePanel();
    if (grow) grow.observe(panel);
    /* the cursor goes into the box for a mouse or a key; for a finger it stays out, so the phone's keyboard does not jump up over the panel */
    const first = S.touched ? panel : panel.querySelector("textarea, [data-act=eden-close]"); if (first) first.focus({ preventScroll: true });
    askMember(); askStatus();
  }
  function closePanel(giveFocus) {
    if (!S.open) return;
    S.open = false; S.listening = false; btn.setAttribute("aria-expanded", "false"); panel.hidden = true; if (grow) grow.disconnect(); show();
    if (giveFocus) btn.focus({ preventScroll: true });
  }

  /* ---- who is here: asked once. A visitor who has not signed in gets words only: nothing below this line runs for them. ---- */
  async function askMember() {
    if (S.memberAsked) return; S.memberAsked = true;
    const r = await get("/api/me");
    S.member = !!(r.ok && r.data && r.data.signed_in); S.me = S.member ? r.data : null;
    if (S.member) askStatus();
    show(); if (S.open) buildPanel();
  }
  /* ---- Eden's own state of being set up: asked once, only for a signed-in person ---- */
  async function askStatus() {
    if (!S.member || S.statusAsked) return; S.statusAsked = true;
    const st = await get("/api/eden/status");
    if (!st.ok) { S.statusAsked = false; if (S.open) buildPanel(st.data.words || WORDS.tryAgain); return; }
    S.status = st.data; show(); if (S.open) buildPanel();
  }

  /* ---- the panel's words and the writing form (the same as before; only its place changed) ---- */
  function buildPanel(problem) {
    const cfg = S.cfg;
    panel.dataset.eden = cfg ? cfg.job : S.member ? "member" : "public";
    const head = h("div", { class: "eden-head" }, h("div", { class: "grow" }, h("strong", {}, "Eden"), h("p", { class: "eden-note" }, S.member === false ? WORDS.edenPublicAbout : WORDS.edenAbout)),
      h("button", { class: "btn ghost small", type: "button", "data-act": "eden-close", on: { click: () => closePanel(true) } }, WORDS.edenClose));
    const body = h("div", { class: "eden-body" });
    panel.replaceChildren(head, body);
    if (problem) { add(body, msg(problem)); return; }
    if (S.member === null) { add(body, msg(WORDS.edenChecking)); return; }
    if (!S.member) { buildPublic(body); return; }
    if (!S.status) { add(body, msg(WORDS.edenChecking)); return; }
    if (!S.status.configured) { add(body, msg(WORDS.edenNotSetUp)); return; }
    if (!cfg) { buildMember(body); return; }
    buildWriter(cfg, body);
  }
  /* before sign-in: who Eden is, what she never does, and the way in. Words only. */
  function buildPublic(body) {
    add(body, h("p", {}, WORDS.edenPublicWho), h("p", {}, WORDS.edenPublicMark), h("p", {}, WORDS.edenPublicNever), h("p", { class: "eden-note", "data-eden-crisis-line": "" }, CRISIS),
      h("p", { class: "row" }, h("a", { class: "btn small", href: "/join", "data-act": "eden-join" }, WORDS.edenJoin)));
  }
  /* signed in, with no form open: the free box. A person with no ministry and no seat on the money team has nothing Eden can write yet. */
  function buildMember(body) {
    if (!canWrite()) { add(body, h("p", {}, WORDS.edenNeedMinistry), h("p", { class: "row" }, h("a", { class: "btn small", href: "/join" }, WORDS.edenStartMinistry)), h("p", { class: "eden-note", "data-eden-crisis-line": "" }, CRISIS)); return; }
    add(body, freeBox());
  }
  const canWrite = () => !!(S.me && (S.me.ministry || S.me.treasurer));
  const KIND_WORDS = { ask: "edenAsAsk", give: "edenAsGive", grant_letter: "edenAsGrant", thank_you: "edenAsThanks" };
  /* what the free box did with the draft the person pressed "Use" on */
  function useFree(d, out) {
    const draft = d.draft || {};
    if (d.kind === "ask" || d.kind === "give") {
      const p = { kind: d.kind, title: draft.title || "", body: draft.body || "" };
      if (handoff) { if (handoff(p) === true) { S.free = { words: "", data: null, note: "" }; closePanel(false); } else out.replaceChildren(msg(WORDS.edenFormBusy)); return; }
      location.assign("/me" + HAND + encodeURIComponent(JSON.stringify(p)));
      return;
    }
    const t = draft.letter || "";
    navigator.clipboard.writeText(t).then(() => out.replaceChildren(msg(WORDS.edenCopied, "ok")), () => out.replaceChildren(msg(WORDS.edenSelect)));
  }
  /* the box itself: words in, the draft and its kind out. It sends { job, fields: { words } } and nothing else. */
  function freeBox(inForm) {
    const ta = area("words", S.free.words, 1500); ta.setAttribute("placeholder", WORDS.edenFreePlaceholder);
    ta.addEventListener("input", () => { S.free.words = ta.value; });
    ta.addEventListener("focus", () => { S.listening = true; show(); }); ta.addEventListener("blur", () => { S.listening = false; show(); });
    const out = h("div", { class: "out", "aria-live": "polite" }), result = h("div", { class: "eden-result" });
    const go = h("button", { class: "btn small", type: "button", "data-act": "eden-free-draft" }, WORDS.edenFreeButton);
    function showResult(d) {
      const letter = d.kind === "grant_letter" || d.kind === "thank_you";
      const card = h("div", { class: "eden-card", "data-eden-free-draft": "", "data-kind": d.kind },
        h("p", { "data-eden-kind": "" }, h("strong", {}, WORDS[KIND_WORDS[d.kind]])), h("p", { class: "label" }, d.mark), ...draftView(letter ? "letter" : "ask_give", d.draft),
        d.grade != null && d.grade > 8 ? h("p", { class: "eden-note" }, WORDS.edenHard) : null);
      const label = d.kind === "ask" ? WORDS.edenUseAsk : d.kind === "give" ? WORDS.edenUseGive : WORDS.edenCopyLetter;
      add(card, h("p", { class: "row" }, h("button", { class: "btn small", type: "button", "data-act": "eden-free-use", on: { click: () => useFree(d, out) } }, label),
        h("button", { class: "btn small ghost", type: "button", on: { click: () => { S.free.data = null; result.replaceChildren(); out.replaceChildren(); } } }, WORDS.edenAgain)));
      result.replaceChildren(card);
      try { card.scrollIntoView({ block: "nearest" }); } catch (e) { /* a browser without it leaves the panel where it is */ }
    }
    go.addEventListener("click", async () => {
      out.replaceChildren(); result.replaceChildren(); S.free.data = null; S.thinking = true; show();
      await busy(go, async () => {
        const r = await post("/api/eden", { job: "freeform", fields: { words: ta.value } });
        S.thinking = false; show();
        if (!r.ok) return out.replaceChildren(msg(r.data.words || WORDS.tryAgain));
        if (r.data.crisis) return out.replaceChildren(h("p", { class: "msg", "data-eden-crisis": "" }, r.data.words || CRISIS));
        if (!r.data.ok) return out.replaceChildren(msg(r.data.words || WORDS.tryAgain));
        S.free.data = r.data; showResult(r.data);
        S.speaking = true; show(); clearTimeout(S.speakTimer); S.speakTimer = setTimeout(() => { S.speaking = false; show(); }, 3500);
      });
    });
    if (S.free.data) showResult(S.free.data);
    return h("div", { class: "eden-free", "data-eden-free": "" },
      field(WORDS.edenFreeLabel, ta, S.me && S.me.treasurer ? WORDS.edenFreeHelpMoney : WORDS.edenFreeHelp),
      out, h("p", { class: "row" }, go), result,
      h("p", { class: "eden-note", "data-eden-crisis-line": "" }, CRISIS),
      inForm ? null : h("p", { class: "eden-note" }, WORDS.edenNothingSaved));
  }
  function buildWriter({ job, getFields, onUse, useLabel = WORDS.edenUse, withVerse = false, notesLabel = WORDS.edenNotes, notesHelp = WORDS.edenNotesHelp }, body) {
    const notes = area("notes", "", 1500), verse = h("input", { type: "checkbox", name: "include_verse", id: "eden-verse-" + job });
    notes.addEventListener("focus", () => { S.listening = true; show(); }); notes.addEventListener("blur", () => { S.listening = false; show(); });
    const out = h("div", { class: "out", "aria-live": "polite" }), result = h("div", { class: "eden-result" });
    const go = h("button", { class: "btn small", type: "button", "data-act": "eden-write" }, WORDS.edenWrite);
    go.addEventListener("click", async () => {
      out.replaceChildren(); result.replaceChildren(); S.thinking = true; show();
      await busy(go, async () => {
        const r = await post("/api/eden", { job, fields: { ...getFields(), notes: notes.value }, include_verse: !!verse.checked });
        S.thinking = false; show();
        if (!r.ok) return out.replaceChildren(msg(r.data.words || WORDS.tryAgain));
        if (r.data.crisis) return out.replaceChildren(h("p", { class: "msg", "data-eden-crisis": "" }, r.data.words || CRISIS));
        if (!r.data.ok) return out.replaceChildren(msg(r.data.words || WORDS.tryAgain));
        showDraft(r.data);
        S.speaking = true; show(); clearTimeout(S.speakTimer); S.speakTimer = setTimeout(() => { S.speaking = false; show(); }, 3500);
      });
    });
    function showDraft(d) {
      const card = h("div", { class: "eden-card", "data-eden-draft": "" },
        h("p", { class: "label" }, d.mark), ...draftView(job, d.draft),
        d.verse ? h("blockquote", { class: "scripture" }, h("p", {}, d.verse.text), h("cite", {}, `${d.verse.ref} (KJV)`)) : null,
        d.grade != null && d.grade > 8 ? h("p", { class: "eden-note" }, WORDS.edenHard) : null);
      const acts = h("p", { class: "row" });
      if (onUse) acts.append(h("button", { class: "btn small", type: "button", "data-act": "eden-use", on: { click: () => { onUse(d.draft, d.verse); out.replaceChildren(msg(WORDS.edenUsed, "ok")); } } }, useLabel));
      else acts.append(h("button", { class: "btn small", type: "button", "data-act": "eden-copy", on: { click: async () => { const t = Object.values(d.draft).join("\n\n") + (d.verse ? `\n\n${d.verse.text} ${d.verse.ref} (KJV)` : ""); try { await navigator.clipboard.writeText(t); out.replaceChildren(msg(WORDS.edenCopied, "ok")); } catch (e) { out.replaceChildren(msg(WORDS.edenSelect)); } } } }, WORDS.edenCopy));
      acts.append(h("button", { class: "btn small ghost", type: "button", on: { click: () => { result.replaceChildren(); out.replaceChildren(); } } }, WORDS.edenAgain));
      card.append(acts); result.replaceChildren(card);
    }
    body.replaceChildren(...[canWrite() ? freeBox(true) : null, canWrite() ? h("p", { class: "eden-sub" }, h("strong", {}, WORDS.edenFormTitle)) : null, field(notesLabel, notes, notesHelp),
      withVerse ? h("p", {}, h("label", { for: verse.id }, verse, " ", WORDS.edenVerse)) : null, out, h("p", { class: "row" }, go), result, h("p", { class: "eden-note" }, WORDS.edenNothingSaved)].filter(Boolean));
  }

  /* ---- a finger or a mouse: drag anywhere, let go, and it slides to the nearest edge; a press that hardly moves is a tap ---- */
  btn.addEventListener("pointerdown", (ev) => {
    if (ev.button > 0) return;
    S.touched = ev.pointerType === "touch"; S.skipClick = false; stopGlide(); calm(); const r = root.getBoundingClientRect();
    S.drag = { id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, ox: r.left, oy: r.top, moved: false };
    try { btn.setPointerCapture(ev.pointerId); } catch (e) { /* a pointer that cannot be captured still drags while it is over the orb */ }
  });
  btn.addEventListener("pointermove", (ev) => {
    const d = S.drag; if (!d || ev.pointerId !== d.id) return;
    const dx = ev.clientX - d.sx, dy = ev.clientY - d.sy;
    if (!d.moved && !isTap(dx, dy, TAP_LIMIT)) { d.moved = true; clearTimeout(S.snapTimer); root.classList.remove("snapping", "gliding"); root.classList.add("dragging"); }
    if (d.moved) { calm(); setPos(clampToViewport({ x: d.ox + dx, y: d.oy + dy }, size(), vw(), vh(), 0)); }
  });
  const release = (ev) => {
    const d = S.drag; if (!d || ev.pointerId !== d.id) return;
    S.drag = null; try { btn.releasePointerCapture(d.id); } catch (e) { /* already let go */ }
    root.classList.remove("dragging"); calm();
    S.skipClick = true;                    /* the click that follows a press is this press's: the next press or key clears this */
    if (!d.moved) { if (ev.type === "pointerup") toggle(); return; }   /* a tap (6 pixels or less) opens or closes the panel */
    S.placed = true;                       /* it stays where the person put it for the rest of this page view */
    moving("snapping", SNAP_MS, "snapTimer");
    const s = snapToEdge(S.pos, size(), vw(), vh(), GAP); setPos(s, s.edge);
  };
  btn.addEventListener("pointerup", release); btn.addEventListener("pointercancel", release);
  const toggle = () => { S.open ? closePanel(false) : openPanel(); };
  btn.addEventListener("click", () => { if (S.skipClick) { S.skipClick = false; return; } toggle(); });   /* Enter, Space and assistive tools arrive here */
  /* the keyboard: Enter or Space opens (it is a button); the arrow keys move it 24 pixels */
  btn.addEventListener("keydown", (ev) => {
    S.touched = false; S.skipClick = false; calm(); const p = S.pos && nudge(S.pos, ev.key, size(), vw(), vh(), NUDGE); if (!p) return;
    ev.preventDefault(); S.placed = true; stopGlide(); root.classList.remove("snapping", "gliding"); setPos(p, snapToEdge(p, size(), vw(), vh(), 0).edge);
  });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && S.open) closePanel(true); });   /* wherever the focus is: a touch tap leaves it on the orb */

  /* ---- the slow wander at rest (BidVoice's edenRoam, widened to the whole edge) ---- */
  function nearPointer() {
    const p = S.pointer; if (!p || !S.pos) return false;
    const c = size() / 2; return Math.hypot(p.x - (S.pos.x + c), p.y - (S.pos.y + c)) < size() * NEAR;
  }
  const bump = () => { calm(); };
  document.addEventListener("pointermove", (ev) => { if (ev.pointerType === "touch") return; S.pointer = { x: ev.clientX, y: ev.clientY }; if (nearPointer()) { calm(); stopGlide(); } }, { passive: true });
  for (const t of ["pointerdown", "keydown", "wheel", "touchstart"]) document.addEventListener(t, bump, { passive: true, capture: true });
  window.addEventListener("scroll", bump, { passive: true });
  /* a place is blocked when the orb would sit on a field the person is typing in, on a button or link, or under the pointer */
  function blocked(a) {
    const box = { x: a.x, y: a.y, w: size(), h: size() };
    const ae = document.activeElement;
    if (ae && ae !== document.body && ae.matches && ae.matches(EDITABLE)) { const r = ae.getBoundingClientRect(); if (overlaps(box, { x: r.left, y: r.top, w: r.width, h: r.height }, 12)) return true; }
    if (S.pointer && overlaps(box, { x: S.pointer.x - 24, y: S.pointer.y - 24, w: 48, h: 48 }, size() * 0.5)) return true;
    for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) {
      const hit = document.elementsFromPoint(a.x + box.w * fx, a.y + box.h * fy).find((e) => !root.contains(e) && !panel.contains(e));
      if (hit && hit.closest && hit.closest(CONTROL)) return true;
    }
    return false;
  }
  function roam() {
    S.roamTimer = setTimeout(roam, ROAM_MS);
    if (root.hidden || reduceMotion() || S.placed || S.open || S.drag || document.hidden) return;
    if (Date.now() - S.idleSince < IDLE_MS || keyboardUp() || nearPointer() || document.querySelector(DIALOG)) return;
    const list = roamAnchors(size(), vw(), vh()), i = nextAnchor(list, S.anchorAt % list.length, blocked);
    if (i < 0) return;
    S.anchorAt = i; moving("gliding", GLIDE_MS, "glideTimer"); setPos(list[i], list[i].edge);
  }
  /* a new size of the screen, or the keyboard coming up: stay inside, on the same edge */
  function fit() {
    if (!S.pos) return;
    const c = clampToViewport(S.pos, size(), vw(), vh(), GAP), keep = S.edge, right = Math.max(GAP, vw() - size() - GAP), bottom = Math.max(GAP, vh() - size() - GAP);
    root.classList.remove("gliding", "snapping");
    S.pos = { x: keep === "left" ? GAP : keep === "right" ? right : c.x, y: keep === "top" ? GAP : keep === "bottom" ? bottom : c.y };
    apply();
  }
  window.addEventListener("resize", fit); if (window.visualViewport) window.visualViewport.addEventListener("resize", apply);

  S.roamTimer = setTimeout(roam, ROAM_MS);
  S.root = root; S.btn = btn;
  S.reveal = (cfg) => {
    const had = !root.hidden, job = cfg ? cfg.job : "", changed = S.job !== job;
    S.cfg = cfg; S.job = job; root.hidden = false;
    if (!S.pos) { startPlace(); }
    if (!had) { calm(); show(); askMember(); }
    if (S.open && changed) buildPanel();
  };
  return S;
}

/** The marker a form carries. job: ask_give | page_words | grant_letter | thank_you. getFields() reads the form as it is now.
    onUse(draft, verse) puts the words in the form (not saved). With no onUse, the words are shown to copy. While a form's marker is on the
    page, the orb's panel writes for that form's job. */
export function edenPanel(cfg) {
  const marker = h("div", { class: "eden-anchor", "data-eden-anchor": cfg.job, hidden: true });
  marker._eden = cfg;
  startEden();
  return marker;
}
/** Eden's orb on this page: every page loads this (public/js/orb.js). */
export function startEden() {
  if (!watching) watch();
  queueMicrotask(sync);
}
let watching = false, pending = false;
function sync() {
  pending = false;
  if (!document.body) return;
  const marks = [...document.querySelectorAll("[data-eden-anchor]")].filter((m) => m._eden);
  if (!shell) shell = makeShell();
  shell.reveal(marks.length ? marks[marks.length - 1]._eden : null);
}
function watch() {
  watching = true;
  new MutationObserver(() => { if (!pending) { pending = true; queueMicrotask(sync); } }).observe(document.body, { childList: true, subtree: true });
}

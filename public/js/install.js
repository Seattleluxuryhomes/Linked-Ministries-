/* install.js: one calm card that asks a person to put Linked Ministries on their phone. It is on the signed-in landing (/me, and
   /join once a person is signed in) and nowhere else. Every word is in WORDS (public/js/pure.js).
     Chrome on Android: the browser's own beforeinstallprompt event is held; the card's button calls prompt(). The card says
       "Added" only when the browser's appinstalled event fires, never before.
     iPhone and iPad: there is no prompt to call, so the card shows the two real steps, with the Share icon drawn.
   Founder, 2026-10-18: "It should ask until it's done so that it's on the phone." So the card is on every signed-in page view on a
   phone until the site is actually installed, that is, open as an app (display-mode standalone, or navigator.standalone on an
   iPhone). There is no memory at all: nothing is kept in the browser. "Not now" closes the card for the rest of that page view only
   (a variable in memory), and it is back on the next page. After appinstalled the card says "Added" for that view, and the next visit
   from the installed app is standalone, so it never shows again. On Android the card shows only once the browser has said the site can
   be installed (beforeinstallprompt held). Never on a computer and never on a public page. The words stay calm: showing again is the
   founder's call, and the words never guilt (tests/pwa-unit-test.mjs reads them). */
import { h } from "/js/common.js";
import { WORDS } from "/js/pure.js";

const standalone = () => { try { return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; } catch (e) { return false; } };
const ua = () => navigator.userAgent || "";
const onIos = () => /iPhone|iPad|iPod/.test(ua()) || (/Macintosh/.test(ua()) && navigator.maxTouchPoints > 1);
const onAndroid = () => /Android/.test(ua());

/** the Share icon of an iPhone (a box with an arrow leaving it), drawn as an SVG that takes the text colour */
function shareIcon() {
  const ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg");
  for (const [k, v] of Object.entries({ class: "ico share-ico", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) s.setAttribute(k, v);
  for (const d of ["M12 3v12", "M8 7l4-4 4 4", "M7 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"]) { const p = document.createElementNS(ns, "path"); p.setAttribute("d", d); s.append(p); }
  return s;
}

/* what the browser has told us so far. The two events are caught here, when this file loads, so a page that draws itself later
   (after it asked the server who is signed in) has not missed them. */
const st = { held: null, waiting: false, added: false, hidden: false };
let mounted = null;                                  // { slot, card } of the card now on the page, if any
const ios = onIos(), android = onAndroid();
if (android && !ios) {
  window.addEventListener("beforeinstallprompt", (ev) => { ev.preventDefault(); st.held = ev; draw(); });
  window.addEventListener("appinstalled", () => { st.held = null; st.waiting = false; st.added = true; draw(); });
}

function away() { if (mounted) mounted.card.remove(); mounted = null; st.hidden = true; }
function later() { away(); }                      // for the rest of this page view only; the next page asks again
const notNow = () => h("button", { class: "link", type: "button", "data-act": "install-later", on: { click: later } }, WORDS.installNotNow);

async function ask() {
  const ev = st.held; if (!ev) return;
  st.held = null; st.waiting = true; draw();
  try { await ev.prompt(); const c = await ev.userChoice; if (!c || c.outcome !== "accepted") { st.waiting = false; later(); } }
  catch (e) { st.waiting = false; later(); }
  /* accepted: still not "Added". The browser says so with appinstalled, and only then does the card. */
}

/** what the card holds now: an iPhone's two steps, an Android's button, a wait, or the one word "Added" after the browser said so */
function inside() {
  if (st.added) return [h("p", { class: "msg ok", "data-state": "added" }, WORDS.installAdded)];
  if (ios) return [h("p", {}, WORDS.installWhy), h("p", { class: "quiet" }, WORDS.installIosLead),
    h("ol", { class: "plain install-steps" }, h("li", {}, shareIcon(), " ", WORDS.installIosOne), h("li", {}, WORDS.installIosTwo)), h("p", { class: "row" }, notNow())];
  if (st.waiting) return [h("p", { "data-state": "waiting" }, WORDS.installWaiting)];
  if (st.held) return [h("p", {}, WORDS.installWhy), h("p", { class: "row" }, h("button", { class: "btn", type: "button", "data-act": "install-now", on: { click: ask } }, WORDS.installButton), notNow())];
  return null;                                       // an Android browser has not said the site can be installed: no card, no promise
}

function draw() {
  if (!mounted || st.hidden) return;
  const kids = inside();
  if (!kids) { mounted.card.hidden = true; return; }
  const { card } = mounted;
  card.dataset.install = ios ? "ios" : "android";
  card.replaceChildren(h("div", { class: "install-head" }, h("img", { class: "install-mark", src: "/img/icon.svg", alt: "", width: 44, height: 44 }), h("h2", { id: "install-title" }, WORDS.installTitle)), h("div", { class: "install-body" }, ...kids));
  card.hidden = false;
}

/** put the card into `slot` when it should show: on a phone, until the site is open as an app. Not on a computer. "Not now" hides it
    for the rest of this page view only. Safe to call again when the page draws itself again. */
export function installCard(slot) {
  if (!slot || !(ios || android) || standalone()) return;
  if (st.hidden && !st.added) return;
  mounted = { slot, card: h("section", { class: "card install", "aria-labelledby": "install-title", hidden: true }) };
  slot.replaceChildren(mounted.card);
  draw();
}

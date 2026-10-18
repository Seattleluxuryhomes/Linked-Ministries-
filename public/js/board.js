/* board.js — "I can help" / "We need this": the short form under a post. It checks who is asking, then sends one email through the
   server. The screen says "Sent to <ministry>" only after the server says the mail provider took the message; with no mail set
   up it says so and nothing is saved. */
import { h, get, post, msg, field, area, text, busy, values } from "/js/common.js";
import { WORDS, KIND } from "/js/pure.js";

let state = null;   // { me, product }, fetched once when the first form opens
async function who() {
  if (state) return state;
  const [me, product] = await Promise.all([get("/api/me"), get("/api/product")]);
  state = { me: me.ok && me.data.signed_in ? me.data : null, product: product.data };
  return state;
}

function closeSlot(slot) { slot.replaceChildren(); }

async function open(link) {
  const id = link.dataset.answer, kind = link.dataset.kind, ministry = link.dataset.ministry;
  const slot = document.getElementById("slot-" + id);
  if (!slot) return false;
  if (slot.firstChild) { closeSlot(slot); return true; }
  const { me, product } = await who();
  const here = location.pathname.startsWith("/board/") ? location.pathname : "/board/" + id;
  if (!me) { slot.replaceChildren(msg(WORDS.answerNeedSignIn), h("p", {}, h("a", { class: "btn", href: "/join?next=" + encodeURIComponent(here) }, "Join the network"))); return true; }
  if (!me.ministry) { slot.replaceChildren(msg(WORDS.answerNeedMinistry), h("p", {}, h("a", { class: "btn", href: "/join" }, "Add my ministry"))); return true; }
  if (me.ministry.status !== "public") { slot.replaceChildren(msg(WORDS.answerWait)); return true; }
  if (product.mail === false) { slot.replaceChildren(msg(WORDS.answerNoMail)); return true; }
  const words = area("words", "", 1500), phone = text("phone", "", { type: "tel", max: 30, auto: "tel", mode: "tel" });
  const out = h("div", { class: "out" });
  const send = h("button", { class: "btn", type: "submit" }, WORDS.answerSend);
  const form = h("form", { novalidate: true }, h("h4", {}, `${WORDS.answerTitle}: ${KIND[kind].button}`), h("p", { class: "help" }, WORDS.answerHowItWorks),
    field(WORDS.answerWords, words, WORDS.answerWordsHelp), field(WORDS.answerPhone, phone), out,
    h("p", { class: "row" }, send, h("button", { class: "link", type: "button", on: { click: () => closeSlot(slot) } }, "Cancel")));
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault(); out.replaceChildren();
    await busy(send, async () => {
      const v = values(form);
      const r = await post(`/api/posts/${id}/answer`, { words: v.words, phone: v.phone });
      if (!r.ok) return out.replaceChildren(msg(r.data.words || WORDS.tryAgain));
      /* the server said the mail provider took it: now, and only now, the screen says so */
      slot.replaceChildren(msg(`${WORDS.answerSent} ${r.data.sent_to}.`, "ok"));
    });
  });
  slot.replaceChildren(form);
  words.focus();
  return true;
}

for (const a of document.querySelectorAll("a[data-answer]")) {
  a.addEventListener("click", (ev) => { ev.preventDefault(); open(a); });
}
/* a link to /board/<id>#answer opens the form on that page */
if (location.hash === "#answer") { const a = document.querySelector("a[data-answer]"); if (a && location.pathname.startsWith("/board/")) open(a); }

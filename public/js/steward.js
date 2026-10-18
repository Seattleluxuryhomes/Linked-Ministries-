/* steward.js — /steward: what is waiting for a person at Linked Ministries to read. Approve it, or send it back with a note the
   poster reads. The page mirrors the database's decision; the database refuses anyone who is not a steward. */
import { h, get, post, msg, field, text, area, busy, toSignIn } from "/js/common.js";
import { WORDS, KIND, categoryLabel, dateWords } from "/js/pure.js";

const app = document.getElementById("app");
let flash = null;

async function load() {
  const me = await get("/api/me");
  if (!me.ok || !me.data.signed_in) return toSignIn("/steward");
  if (!me.data.steward) return app.replaceChildren(h("h1", {}, WORDS.stewardTitle), msg(WORDS.stewardOnly));
  const q = await get("/api/steward/queue");
  if (!q.ok) return app.replaceChildren(h("h1", {}, WORDS.stewardTitle), msg(q.data.words || WORDS.tryAgain));
  render(q.data);
}

function render(q) {
  const parts = [h("h1", {}, WORDS.stewardTitle), h("p", { class: "lead" }, WORDS.stewardLead)];
  if (flash) { parts.push(msg(flash.words, flash.ok ? "ok" : undefined)); flash = null; }
  if (!q.ministries.length && !q.posts.length) parts.push(h("div", { class: "card" }, h("p", {}, WORDS.stewardEmpty)));
  if (q.ministries.length) parts.push(h("h2", {}, "Ministries"), ...q.ministries.map(ministryCard));
  if (q.posts.length) parts.push(h("h2", {}, "Posts"), ...q.posts.map(postCard));
  parts.push(h("h2", {}, "Stewards"), stewardsCard(q.stewards));
  parts.push(h("p", {}, h("a", { href: "/me" }, "Back to my ministry")));
  app.replaceChildren(...parts);
}

/* approve, or send back with a note */
function decide(kind, id) {
  const note = area("note", "", 1000);
  const noteField = field(WORDS.sendBackNote, note, WORDS.sendBackNoteHelp);
  noteField.hidden = true;
  const out = h("div", { class: "out" });
  const go = async (btn, decision) => {
    out.replaceChildren();
    await busy(btn, async () => {
      const r = await post(`/api/steward/${kind}/${id}/review`, { decision, note: note.value });
      if (!r.ok) return out.replaceChildren(msg(r.data.words || WORDS.tryAgain));
      flash = { words: decision === "approve" ? "Approved." : "Sent back with your note.", ok: true };
      load();
    });
  };
  const back = h("button", { class: "btn ghost", type: "button" }, WORDS.sendBack);
  back.addEventListener("click", () => { if (noteField.hidden) { noteField.hidden = false; note.focus(); back.textContent = WORDS.sendBack + " with this note"; } else go(back, "send_back"); });
  const ok = h("button", { class: "btn", type: "button", on: { click: (ev) => go(ev.currentTarget, "approve") } }, WORDS.approve);
  return h("div", {}, noteField, out, h("p", { class: "row" }, ok, back));
}

function ministryCard(m) {
  return h("div", { class: "card", "data-ministry": m.id },
    h("h3", {}, m.name), h("p", { class: "when" }, `${m.city}, ${m.state}`),
    h("dl", { class: "kv" },
      h("dt", {}, "What it does"), h("dd", {}, m.about),
      h("dt", {}, "Website"), h("dd", {}, m.website || "None"),
      h("dt", {}, "Contact"), h("dd", {}, `${m.contact_name} · ${m.contact_email}`)),
    decide("ministries", m.id));
}
function postCard(p) {
  return h("div", { class: "card", "data-post": p.id },
    h("div", { class: "meta row" }, h("span", { class: "tag " + p.kind }, KIND[p.kind].label), h("span", { class: "cat" }, categoryLabel(p.category))),
    h("h3", {}, p.title),
    h("p", { class: "who" }, `${p.ministry} · ${p.city}, ${p.state}`),
    p.ministry_status !== "public" ? h("p", { class: "msg" }, "This ministry has not been read yet. Read the ministry first, then this post.") : null,
    h("p", { class: "quote" }, p.body),
    h("p", { class: "when" }, `Open until ${dateWords(p.open_until)}`),
    decide("posts", p.id));
}

function stewardsCard(list) {
  const email = text("email", "", { type: "email", max: 254, required: true, mode: "email" });
  const out = h("div", { class: "out" });
  const form = h("form", { novalidate: true }, field(WORDS.stewardAdd, email, WORDS.stewardAddHelp), out, h("p", { class: "row" }, h("button", { class: "btn small", type: "submit" }, "Make a steward")));
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault(); out.replaceChildren();
    await busy(form.querySelector("button"), async () => {
      const r = await post("/api/steward/stewards", { email: email.value, on: true });
      if (!r.ok) return out.replaceChildren(msg(r.data.words || WORDS.tryAgain));
      flash = { words: "Done. They are a steward now.", ok: true }; load();
    });
  });
  return h("div", { class: "card" }, list.map((s) => h("div", { class: "person" }, h("div", { class: "grow" }, h("strong", {}, s.name), ` · ${s.email}`))), h("hr"), form);
}

load();

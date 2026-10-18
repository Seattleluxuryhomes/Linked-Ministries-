/* join.js — /join: sign in by an email code, then (if this person has no ministry yet) join the one that asked them, or add their
   own. Nothing says "sent" unless the server said the mail provider took it. */
import { h, get, post, msg, field, text, busy, values, ministryForm, safeNext, agreeLine } from "/js/common.js";
import { WORDS } from "/js/pure.js";
import { installCard } from "/js/install.js";

const app = document.getElementById("app");
const next = safeNext(new URLSearchParams(location.search).get("next"));
const title = () => h("h1", {}, WORDS.joinTitle);
let wantsMinistry = false;

async function start() {
  const r = await get("/api/me");
  if (r.ok && r.data.signed_in) return signedIn(r.data);
  emailStep();
}

function emailStep(prefill = "") {
  const email = text("to", prefill, { type: "email", max: 254, required: true, auto: "email", mode: "email" });
  const out = h("div", { class: "out" });
  const form = h("form", { class: "card formcard", novalidate: true },
    field("Email", email, WORDS.joinLead), out,
    h("p", { class: "row" }, h("button", { class: "btn", type: "submit" }, WORDS.sendCode)),
    agreeLine());
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault(); out.replaceChildren();
    const btn = form.querySelector("button[type=submit]");
    await busy(btn, async () => {
      const r = await post("/api/auth/start", { to: email.value });
      if (!r.ok) return out.replaceChildren(msg(r.data.words || WORDS.tryAgain));
      if (r.data.channel === "none") return out.replaceChildren(msg(WORDS.codeNotSent));
      if (r.data.delivered === false) return out.replaceChildren(msg(WORDS.codeFailed));
      codeStep(email.value.trim());
    });
  });
  app.replaceChildren(title(), form);
  email.focus();
}

function codeStep(to) {
  const code = text("code", "", { max: 12, required: true, auto: "one-time-code", mode: "numeric" });
  const out = h("div", { class: "out" });
  const form = h("form", { class: "card formcard", novalidate: true },
    msg(`${WORDS.codeSent} (${to})`, "ok"),
    field("Six-number code", code, WORDS.codeHint), out,
    h("p", { class: "row" }, h("button", { class: "btn", type: "submit" }, WORDS.signIn),
      h("button", { class: "link", type: "button", on: { click: () => emailStep(to) } }, WORDS.differentEmail)));
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault(); out.replaceChildren();
    await busy(form.querySelector("button[type=submit]"), async () => {
      const r = await post("/api/auth/verify", { to, code: code.value });
      if (!r.ok) return out.replaceChildren(msg(r.data.words || WORDS.tryAgain));
      const me = await get("/api/me");
      signedIn(me.data);
    });
  });
  app.replaceChildren(title(), form);
  code.focus();
}

function signedIn(me) {
  if (me.ministry) { if (new URLSearchParams(location.search).has("next")) return location.assign(next); return location.assign("/me"); }
  if (me.steward && !wantsMinistry) {
    const slot = h("div", { class: "install-slot" });
    app.replaceChildren(h("h1", {}, WORDS.stewardWelcome), h("p", { class: "lead" }, WORDS.stewardWelcomeLead), slot,
      h("p", { class: "row" }, h("a", { class: "btn", href: "/steward" }, WORDS.stewardOpen), h("button", { class: "btn ghost", type: "button", on: { click: () => { wantsMinistry = true; signedIn(me); } } }, WORDS.alsoMinistry)),
      h("p", { class: "quiet" }, `${WORDS.signedInAs} ${me.user.email}. `, h("button", { class: "link", type: "button", on: { click: signOut } }, WORDS.signOut)));
    installCard(slot);
    return;
  }
  const slot = h("div", { class: "install-slot" });
  const parts = [h("h1", {}, WORDS.profileTitle), h("p", { class: "lead" }, WORDS.profileLead), slot];
  const done = () => location.assign(next === "/me" || !next ? "/me" : next);
  for (const inv of me.invites || []) parts.push(inviteCard(inv, me, done));
  if ((me.invites || []).length) parts.push(h("h2", {}, WORDS.orOwn));
  parts.push(ministryForm({
    v: { contact_name: me.user.name && me.user.name !== me.user.email ? me.user.name : "" }, email: me.user.email, submit: WORDS.profileSave, agree: true,
    onSubmit: async (v) => {
      const r = await post("/api/ministry", v);
      if (!r.ok) return { error: r.data.words || WORDS.tryAgain };
      app.replaceChildren(h("h1", {}, WORDS.mePageTitle), msg(WORDS.profileThanks, "ok"), h("p", {}, h("a", { class: "btn", href: "/me" }, "Go to my ministry")));
    },
  }));
  parts.push(h("p", { class: "quiet" }, `${WORDS.signedInAs} ${me.user.email}. `, h("button", { class: "link", type: "button", on: { click: signOut } }, WORDS.signOut)));
  app.replaceChildren(...parts);
  installCard(slot);
}

function inviteCard(inv, me, done) {
  const name = text("name", me.user.name && me.user.name !== me.user.email ? me.user.name : "", { max: 120, required: true, auto: "name" });
  const out = h("div", { class: "out" });
  const form = h("form", { class: "card formcard", novalidate: true },
    h("h3", {}, WORDS.invitedTitle), h("p", {}, `${inv.ministry} (${inv.city}, ${inv.state})`),
    field(WORDS.yourName, name), out,
    h("p", { class: "row" }, h("button", { class: "btn", type: "submit" }, WORDS.invitedJoin)));
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault(); out.replaceChildren();
    await busy(form.querySelector("button[type=submit]"), async () => {
      const r = await post("/api/team/accept", { invite: inv.id, name: name.value });
      if (!r.ok) return out.replaceChildren(msg(r.data.words || WORDS.tryAgain));
      done();
    });
  });
  return form;
}

async function signOut() { await post("/api/auth/signout"); location.assign("/join"); }

start();

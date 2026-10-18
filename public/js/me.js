/* me.js — /me: the ministry's own page. Its profile, its posts in every state, the answers it got and sent, its team, and the
   forms to post an ask or a give. A post says "On the board" only when a person at Linked Ministries has read it and the
   server says it is public; until then it says it is waiting. */
import { h, get, post, msg, field, text, busy, ministryForm, postForm, toSignIn } from "/js/common.js";
import { WORDS, KIND, POST_STATUS, MINISTRY_STATUS, CLOSE_REASON, categoryLabel, dateWords } from "/js/pure.js";

const app = document.getElementById("app");
let flash = null;          // one message shown at the top, from the last thing the person did
let composer = null;       // the post form that is open, if any
let editingProfile = false;

async function load() {
  const meR = await get("/api/me");
  if (!meR.ok || !meR.data.signed_in) return toSignIn("/me");
  const me = meR.data;
  if (!me.ministry) return location.assign("/join");
  const [postsR, answersR, teamR] = await Promise.all([get("/api/my/posts"), get("/api/answers"), get("/api/team")]);
  render(me, postsR.data.posts || [], answersR.data || { received: [], sent: [] }, teamR.data || { people: [], invites: [] });
}

function say(words, ok) { flash = { words, ok }; }
async function act(button, path, body, okWords) {
  await busy(button, async () => {
    const r = await post(path, body);
    say(r.ok ? okWords : (r.data.words || WORDS.tryAgain), r.ok);
    await load();
  });
}

function render(me, posts, answers, team) {
  const m = me.ministry;
  const parts = [];
  parts.push(h("div", { class: "row between" }, h("h1", {}, m.name), h("span", { class: "status" + (m.status === "public" ? " public" : "") }, m.status === "public" ? "Read" : m.status === "sent_back" ? "Sent back" : "Waiting")));
  parts.push(msg(MINISTRY_STATUS[m.status], m.status === "public" ? "ok" : undefined));
  if (m.status === "sent_back" && m.review_note) parts.push(h("p", { class: "msg" }, h("strong", {}, "Their note: "), m.review_note));
  if (flash) { parts.push(msg(flash.words, flash.ok ? "ok" : undefined)); flash = null; }
  if (me.steward) parts.push(h("p", {}, h("a", { class: "btn ghost", href: "/steward" }, "Open the page for stewards")));

  /* post */
  parts.push(h("div", { class: "row" },
    h("button", { class: "btn", type: "button", on: { click: () => { composer = { kind: "ask" }; load(); } } }, WORDS.postAsk),
    h("button", { class: "btn", type: "button", on: { click: () => { composer = { kind: "give" }; load(); } } }, WORDS.postGive)));
  if (composer) parts.push(composerForm(me, posts, composer));

  /* posts */
  parts.push(h("h2", {}, WORDS.yourPosts));
  const groups = [["draft", "Drafts"], ["waiting", "Waiting to be read"], ["public", "On the board"], ["closed", "Closed"]];
  if (!posts.length) parts.push(h("div", { class: "card" }, h("p", {}, WORDS.noPosts)));
  for (const [status, label] of groups) {
    const list = posts.filter((p) => p.status === status);
    if (!list.length) continue;
    parts.push(h("div", { class: "card", "data-group": status }, h("h3", {}, label), list.map((p) => postRow(me, p))));
  }

  /* answers */
  parts.push(h("h2", {}, WORDS.answersReceived));
  parts.push(h("div", { class: "card", "data-answers": "received" }, answers.received.length ? answers.received.map(receivedRow) : h("p", {}, WORDS.noAnswersReceived)));
  parts.push(h("h2", {}, WORDS.answersSent));
  parts.push(h("div", { class: "card", "data-answers": "sent" }, answers.sent.length ? answers.sent.map(sentRow) : h("p", {}, WORDS.noAnswersSent)));

  /* profile and team */
  parts.push(h("h2", {}, WORDS.mePageTitle));
  parts.push(editingProfile && me.lead ? profileForm(me) : profileCard(me));
  parts.push(h("h2", {}, WORDS.teamTitle));
  parts.push(teamCard(me, team));
  parts.push(h("p", { class: "quiet" }, `${WORDS.signedInAs} ${me.user.email}. `, h("button", { class: "link", type: "button", on: { click: async () => { await post("/api/auth/signout"); location.assign("/"); } } }, WORDS.signOut)));
  app.replaceChildren(...parts);
}

/* ---- posts ---------------------------------------------------------------------------------------------------------------- */
function composerForm(me, posts, c) {
  const limits = { today: me.limits.today, max: me.limits.max };
  const editing = c.id ? posts.find((p) => p.id === c.id) : null;
  const done = (words) => { composer = null; say(words, true); load(); };
  const send = async (v, submit) => {
    const r = editing ? await post(`/api/posts/${editing.id}/update`, { ...v, submit }) : await post("/api/posts", { ...v, submit });
    if (!r.ok) return { error: r.data.words || WORDS.tryAgain };
    done(submit ? WORDS.sentToRead : WORDS.draftSaved);
  };
  const form = postForm({ kind: c.kind, v: editing || {}, ministry: me.ministry, limits, submitLabel: editing ? WORDS.saveChanges : WORDS.saveDraft, onSave: (v) => send(v, false), onSend: (v) => send(v, true) });
  form.append(h("p", {}, h("button", { class: "link", type: "button", on: { click: () => { composer = null; load(); } } }, "Cancel")));
  return form;
}

function postRow(me, p) {
  const k = KIND[p.kind];
  const closing = p.status === "public" ? ["met", "no_longer_needed"] : ["no_longer_needed"];
  const reason = p.status === "closed" ? ` (${CLOSE_REASON[p.closed_reason] || ""})` : "";
  return h("div", { class: "mine", "data-post": p.id },
    h("div", { class: "meta row" }, h("span", { class: "tag " + p.kind }, k.label), h("span", { class: "cat" }, categoryLabel(p.category))),
    h("h3", {}, p.status === "public" ? h("a", { href: "/board/" + p.id }, p.title) : p.title),
    h("p", {}, h("span", { class: "status" + (p.status === "public" ? " public" : p.status === "closed" ? " closed" : "") }, POST_STATUS[p.status] + reason)),
    p.status === "draft" && p.review_note ? h("p", { class: "msg" }, h("strong", {}, WORDS.sentBackNote + ": "), p.review_note) : null,
    h("p", { class: "when" }, `Open until ${dateWords(p.open_until)}`, p.status === "public" ? ` · ${p.answers} ${p.answers === 1 ? "answer" : "answers"}` : ""),
    p.status !== "closed" ? h("div", { class: "row" },
      p.status === "draft" ? h("button", { class: "btn small ghost", type: "button", on: { click: () => { composer = { kind: p.kind, id: p.id }; load().then(() => scrollTo(0, 0)); } } }, "Edit") : null,
      p.status === "draft" ? h("button", { class: "btn small", type: "button", on: { click: (ev) => act(ev.currentTarget, `/api/posts/${p.id}/submit`, {}, WORDS.sentToRead) } }, WORDS.sendToRead) : null,
      closing.map((why) => h("button", { class: "btn small ghost", type: "button", "aria-label": `${p.status === "draft" ? "Close this draft" : "Close this post"}: ${CLOSE_REASON[why]}`, on: { click: (ev) => act(ev.currentTarget, `/api/posts/${p.id}/close`, { reason: why }, "Closed.") } }, p.status === "public" ? CLOSE_REASON[why] : "Close this post"))) : null);
}

function receivedRow(a) {
  return h("div", { class: "mine" }, h("h3", {}, `${a.from_ministry} (${a.from_city}, ${a.from_state})`),
    h("p", { class: "when" }, `Answered "${a.post_title}" on ${dateWords(a.sent_at)}`),
    h("p", { class: "quote" }, a.words),
    h("p", {}, `Reply to ${a.from_name || "the ministry"}: `, h("a", { href: "mailto:" + a.email }, a.email), a.phone ? ` · ${a.phone}` : ""));
}
function sentRow(a) {
  return h("div", { class: "mine" }, h("h3", {}, a.to_ministry), h("p", { class: "when" }, `${a.kind === "ask" ? "You offered help with" : "You asked about"} "${a.post_title}" on ${dateWords(a.sent_at)}`), h("p", { class: "quote" }, a.words));
}

/* ---- the profile ---------------------------------------------------------------------------------------------------------------- */
function profileCard(me) {
  const m = me.ministry;
  return h("div", { class: "card" },
    h("dl", { class: "kv" },
      h("dt", {}, WORDS.fieldName), h("dd", {}, m.name),
      h("dt", {}, WORDS.fieldCity), h("dd", {}, `${m.city}, ${m.state}`),
      h("dt", {}, WORDS.fieldAbout), h("dd", {}, m.about),
      h("dt", {}, WORDS.fieldWebsite), h("dd", {}, m.website || "None"),
      h("dt", {}, WORDS.fieldContact), h("dd", {}, m.contact_name),
      h("dt", {}, WORDS.fieldContactEmail), h("dd", {}, m.contact_email)),
    me.lead ? h("p", { class: "row" }, h("button", { class: "btn ghost small", type: "button", on: { click: () => { editingProfile = true; load(); } } }, WORDS.profileChange)) : null);
}
function profileForm(me) {
  return ministryForm({
    v: me.ministry, submit: "Save", note: WORDS.publicFields,
    onSubmit: async (v) => {
      const r = await post("/api/ministry/update", v);
      if (!r.ok) return { error: r.data.words || WORDS.tryAgain };
      editingProfile = false; say(r.data.status === "waiting" && me.ministry.status !== "waiting" ? MINISTRY_STATUS.waiting : WORDS.profileSaved, true); load();
    },
  });
}

/* ---- the team ------------------------------------------------------------------------------------------------------------------ */
function teamCard(me, team) {
  const rows = team.people.map((p) => h("div", { class: "person" },
    h("div", { class: "grow" }, h("strong", {}, p.name), ` · ${p.role === "lead" ? "Lead" : "Member"} · ${p.email}`),
    h("div", { class: "row" },
      me.lead && p.user_id !== me.user.id ? h("button", { class: "btn small ghost", type: "button", on: { click: (ev) => act(ev.currentTarget, `/api/team/${p.user_id}/role`, { role: p.role === "lead" ? "member" : "lead" }, "Saved.") } }, p.role === "lead" ? "Make a member" : "Make a lead") : null,
      me.lead && p.user_id !== me.user.id ? h("button", { class: "btn small ghost", type: "button", on: { click: (ev) => act(ev.currentTarget, `/api/team/${p.user_id}/remove`, {}, "Removed.") } }, "Remove") : null,
      p.user_id === me.user.id ? h("button", { class: "btn small ghost", type: "button", on: { click: async (ev) => { await busy(ev.currentTarget, async () => { const r = await post(`/api/team/${p.user_id}/remove`, {}); if (r.ok) return location.assign("/join"); say(r.data.words || WORDS.tryAgain, false); await load(); }); } } }, WORDS.teamLeave) : null)));
  const invites = team.invites.map((i) => h("div", { class: "person" }, h("div", { class: "grow" }, `${i.email} · asked to join`),
    h("button", { class: "btn small ghost", type: "button", on: { click: (ev) => act(ev.currentTarget, `/api/team/invites/${i.id}/withdraw`, {}, "Taken back.") } }, "Take back")));
  const card = h("div", { class: "card" }, rows, invites);
  if (me.lead) {
    const email = text("email", "", { type: "email", max: 254, required: true, auto: "off", mode: "email" });
    const form = h("form", { novalidate: true }, h("hr"), field(WORDS.teamInvite, email, WORDS.teamInviteHelp), h("p", { class: "row" }, h("button", { class: "btn small", type: "submit" }, WORDS.teamInviteSend)));
    form.addEventListener("submit", (ev) => { ev.preventDefault(); act(form.querySelector("button"), "/api/team/invite", { email: email.value }, WORDS.teamInviteSaved); });
    card.append(form);
  }
  return card;
}

load();

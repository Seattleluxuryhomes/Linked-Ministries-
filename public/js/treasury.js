/* treasury.js — /money (it was /treasury): what a person on the money team does. Write a gift down, propose a grant, approve it as a different treasurer after the board's
   vote, mark it paid, correct a gift, set the giving door, take the ledger as a spreadsheet. The page mirrors the database's decisions;
   the database refuses anyone who is not a treasurer, a proposer who approves their own grant, and a grant larger than the gifts. */
import { h, get, post, msg, field, text, area, select, busy, values, toSignIn } from "/js/common.js";
import { edenPanel } from "/js/eden.js";
import { WORDS, GIFT_METHODS, GRANT_STATUS, money, methodLabel, receiptCode, dateWords } from "/js/pure.js";

const app = document.getElementById("app");
let flash = null, openForm = null;     // one message from the last thing done; which row's form is open

async function load() {
  const me = await get("/api/me");
  if (!me.ok || !me.data.signed_in) return toSignIn("/money");
  if (!me.data.treasurer) return app.replaceChildren(h("h1", {}, WORDS.treasuryTitle), msg(WORDS.treasuryOnly));
  const v = await get("/api/treasury");
  if (!v.ok) return app.replaceChildren(h("h1", {}, WORDS.treasuryTitle), msg(v.data.words || WORDS.tryAgain));
  render(v.data, me.data);
}
const today = () => new Date().toISOString().slice(0, 10);
const say = (words, ok) => { flash = { words, ok }; };

function render(v, me) {
  const t = v.totals, parts = [h("h1", {}, WORDS.treasuryTitle), h("p", { class: "lead" }, WORDS.treasuryLead)];
  if (flash) { parts.push(msg(flash.words, flash.ok ? "ok" : undefined)); flash = null; }
  parts.push(h("div", { class: "summary", "data-summary": "" },
    sum(WORDS.sumGifts, money(t.money_cents), `${t.money_count} ${t.money_count === 1 ? "gift" : "gifts"}`),
    sum(WORDS.sumGranted, money(t.granted_cents), `${t.granted_count} ${t.granted_count === 1 ? "grant" : "grants"}`),
    sum(WORDS.sumPaid, money(t.paid_cents), ""),
    sum(WORDS.sumAvailable, money(t.available_cents), "")));
  if (t.in_kind_count) parts.push(h("p", { class: "quiet" }, `${WORDS.sumInKind}: ${t.in_kind_count}, worth ${money(t.in_kind_cents)}.`));
  parts.push(h("p", { class: "row" }, h("a", { class: "btn ghost small", href: "/api/treasury/export.csv?what=gifts", download: "linked-ministries-gifts.csv" }, WORDS.exportGifts), h("a", { class: "btn ghost small", href: "/api/treasury/export.csv?what=grants", download: "linked-ministries-grants.csv" }, WORDS.exportGrants), h("a", { class: "btn ghost small", href: "/giving" }, "See the public page")));
  parts.push(h("h2", {}, WORDS.edenTitleTreasury), edenLetters());
  parts.push(h("h2", {}, WORDS.giftTitle), giftForm());
  parts.push(h("h2", {}, WORDS.grantTitle), grantForm(v));
  parts.push(h("h2", {}, "Grants"), grantsCard(v, me));
  parts.push(h("h2", {}, WORDS.ledgerTitle), ledgerCard(v));
  parts.push(h("h2", {}, WORDS.settingsTitle), settingsForm(v));
  parts.push(h("h2", {}, WORDS.treasurersTitle), treasurersCard(v));
  parts.push(h("p", {}, h("a", { href: "/me" }, "Back to my ministry")));
  app.replaceChildren(...parts);
}
const sum = (label, big, small) => h("div", { class: "card" }, h("p", { class: "label" }, label), h("p", { class: "big" }, big), small ? h("p", { class: "quiet" }, small) : null);

/* a small helper: a form that posts, shows the database's words if it refuses, and reloads only when the server said yes */
function formOf({ cls = "card formcard", children, path, build, onOk, submit }) {
  const out = h("div", { class: "out" });
  const form = h("form", { class: cls, novalidate: true }, ...children, out, h("p", { class: "row" }, h("button", { class: "btn", type: "submit" }, submit)));
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault(); out.replaceChildren();
    await busy(form.querySelector("button[type=submit]"), async () => {
      const r = await post(typeof path === "function" ? path() : path, build(values(form)));
      if (!r.ok) return out.replaceChildren(msg(r.data.words || WORDS.tryAgain));
      say(onOk ? onOk(r.data) : r.data.words, true); openForm = null; load();
    });
  });
  return form;
}

/* Eden writes a grant request letter or a thank-you to a donor. The words are shown to copy; nothing is saved or sent from here. */
function edenLetters() {
  const kind = select("eden_job", [["grant_letter", WORDS.edenLetterGrant], ["thank_you", WORDS.edenLetterThanks]], "thank_you");
  const who = text("eden_who", "", { max: 120 }), amount = text("eden_amount", "", { max: 20, mode: "decimal" }), purpose = text("eden_purpose", "", { max: 500 });
  const holder = h("div", {});
  const mount = () => {
    const job = kind.value;
    holder.replaceChildren(edenPanel({ job, withVerse: true, notesLabel: WORDS.edenLetterNotes, notesHelp: WORDS.edenLetterNotesHelp,
      getFields: () => (job === "grant_letter" ? { recipient: who.value, amount: amount.value, purpose: purpose.value } : { donor: who.value, amount: amount.value }) }));
  };
  kind.addEventListener("change", mount); mount();
  return h("div", { class: "card formcard", "data-eden-letters": "" }, h("p", { class: "note" }, WORDS.edenLetterLead),
    h("div", { class: "formgrid" }, field(WORDS.edenLetterKind, kind), field(WORDS.edenLetterWho, who), field(WORDS.edenLetterAmount, amount), field(WORDS.edenLetterPurpose, purpose, WORDS.edenLetterPurposeHelp)), holder);
}

function giftForm() {
  return formOf({ submit: WORDS.giftRecord, path: "/api/treasury/gifts",
    children: [h("p", { class: "note" }, WORDS.giftLead), h("div", { class: "formgrid" },
      field(WORDS.giftDonor, text("donor_name", "", { max: 120 }), WORDS.giftDonorHelp),
      field(WORDS.giftEmail, text("donor_email", "", { type: "email", max: 254, mode: "email" }), WORDS.giftEmailHelp),
      field(WORDS.giftAmount, text("amount", "", { max: 14, mode: "decimal", placeholder: "25.00" }), WORDS.giftAmountHelp),
      field(WORDS.giftDate, Object.assign(text("received_on", today(), { type: "date" }), { max: today() })),
      field(WORDS.giftMethod, select("method", GIFT_METHODS, "check")),
      field(WORDS.giftNote, text("note", "", { max: 500 })))],
    build: (v) => ({ donor_name: v.donor_name, donor_email: v.donor_email, amount: v.amount, received_on: v.received_on, method: v.method, note: v.note }) });
}

function grantForm(v) {
  const kind = select("recipient_kind", [["ministry", "A ministry on the network"], ["outside", WORDS.grantOutside]], "ministry");
  const mins = select("ministry_id", v.ministries.map((m) => [m.id, `${m.name} (${m.city}, ${m.state})`]), "", "Choose a ministry");
  const outside = text("recipient_name", "", { max: 120 });
  const outField = field(WORDS.grantOutsideName, outside); outField.hidden = true;
  const minField = field(WORDS.grantTo, mins);
  kind.addEventListener("change", () => { const o = kind.value === "outside"; outField.hidden = !o; minField.hidden = o; });
  return formOf({ submit: WORDS.grantPropose, path: "/api/treasury/grants",
    children: [h("p", { class: "note" }, WORDS.grantLead), h("div", { class: "formgrid" }, field("Kind of recipient", kind), minField, outField,
      field(WORDS.grantAmount, text("amount", "", { max: 14, mode: "decimal", placeholder: "500.00" })),
      field(WORDS.grantPurpose, area("purpose", "", 500), WORDS.grantPurposeHelp, "full"))],
    build: (f) => ({ recipient_kind: f.recipient_kind, ministry_id: f.ministry_id, recipient_name: f.recipient_name, amount: f.amount, purpose: f.purpose }) });
}

function grantsCard(v, me) {
  if (!v.grants.length) return h("div", { class: "card" }, h("p", {}, "No grants yet."));
  return h("div", { class: "card", "data-grants": "" }, v.grants.map((g) => grantRow(g, me)));
}
function voteWords(vt) {
  const parts = ["Vote on " + dateWords(vt.voted_on) + ": yes, " + vt.yes_names.join(", ")];
  if (vt.abstain_names.length) parts.push("abstained, " + vt.abstain_names.join(", "));
  if (vt.no_names.length) parts.push("no, " + vt.no_names.join(", "));
  return parts.join(". ") + ". Record: " + vt.doc_ref + ".";
}
function grantRow(g, me) {
  const mine = g.proposed_by === me.user.id;
  const row = h("div", { class: "lrow", "data-grant": g.id },
    h("div", { class: "main" }, h("strong", {}, g.recipient_name), g.recipient_kind === "outside" ? " (outside the network)" : ""),
    h("div", { class: "amt" }, money(g.amount_cents)),
    h("div", { class: "sub" }, g.purpose),
    h("div", { class: "sub" }, `${GRANT_STATUS[g.status]} Proposed by ${g.proposed_by_name}.${g.approved_by_name ? ` Approved by ${g.approved_by_name}.` : ""}${g.paid_ref ? ` Paid by ${g.paid_by_name}, reference ${g.paid_ref}.` : ""}${g.decline_note ? ` Why: ${g.decline_note}` : ""}`),
    g.vote ? h("div", { class: "sub" }, voteWords(g.vote)) : null);
  if (g.status === "proposed") {
    if (mine) row.append(h("div", { class: "sub" }, WORDS.grantNeedOther));
    row.append(h("div", { class: "row" },
      mine ? null : h("button", { class: "btn small", type: "button", "data-act": "approve", on: { click: () => { openForm = { id: g.id, kind: "approve" }; load(); } } }, WORDS.grantApprove),
      h("button", { class: "btn small ghost", type: "button", "data-act": "decline", on: { click: () => { openForm = { id: g.id, kind: "decline" }; load(); } } }, WORDS.grantDecline)));
  }
  if (g.status === "approved") row.append(h("div", { class: "row" }, h("button", { class: "btn small", type: "button", "data-act": "paid", on: { click: () => { openForm = { id: g.id, kind: "paid" }; load(); } } }, WORDS.grantPaid)));
  if (openForm && openForm.id === g.id) {
    const f = openForm.kind === "approve" ? formOf({ cls: "formcard inner", submit: WORDS.grantApprove, path: `/api/treasury/grants/${g.id}/approve`,
        children: [field(WORDS.voteDate, Object.assign(text("voted_on", today(), { type: "date" }), { max: today() })), field(WORDS.voteYes, Object.assign(area("yes", "", 2000), { className: "names" }), WORDS.voteYesHelp), field(WORDS.voteAbstain, Object.assign(area("abstain", "", 2000), { className: "names" }), WORDS.voteYesHelp), field(WORDS.voteNo, Object.assign(area("no", "", 2000), { className: "names" }), WORDS.voteYesHelp), field(WORDS.voteDoc, text("doc_ref", "", { max: 200 }), WORDS.voteDocHelp)],
        build: (x) => ({ voted_on: x.voted_on, yes: x.yes, abstain: x.abstain, no: x.no, doc_ref: x.doc_ref }) })
      : openForm.kind === "decline" ? formOf({ cls: "formcard inner", submit: WORDS.grantDecline, path: `/api/treasury/grants/${g.id}/decline`, children: [field(WORDS.declineNote, text("note", "", { max: 500 }))], build: (x) => ({ note: x.note }) })
      : formOf({ cls: "formcard inner", submit: WORDS.grantPaid, path: `/api/treasury/grants/${g.id}/paid`, children: [field(WORDS.paidRef, text("reference", "", { max: 120 }), WORDS.paidRefHelp)], build: (x) => ({ reference: x.reference }) });
    row.append(h("div", { class: "sub" }, f, h("button", { class: "link", type: "button", on: { click: () => { openForm = null; load(); } } }, "Cancel")));
  }
  return row;
}

function ledgerCard(v) {
  if (!v.gifts.length) return h("div", { class: "card" }, h("p", {}, "No gifts yet."));
  const byId = new Map(v.gifts.map((g) => [g.id, g]));
  return h("div", { class: "card", "data-ledger": "" }, v.gifts.map((g) => {
    const first = byId.get(g.corrects_id);
    const row = h("div", { class: "lrow", "data-receipt": g.receipt_no },
      h("div", { class: "main" }, h("strong", {}, receiptCode(g.receipt_no)), ` · ${g.donor_name} · ${methodLabel(g.method)}`),
      h("div", { class: "amt" }, money(g.amount_cents)),
      h("div", { class: "sub" }, `${dateWords(g.received_on)} · written down by ${g.recorded_by_name}${g.corrects_id ? ` · corrects ${first ? receiptCode(first.receipt_no) : "an earlier record"}` : ""}${g.note ? ` · ${g.note}` : ""}${g.donor_email && !g.corrects_id ? ` · ${g.receipt_sent_at ? "receipt email sent" : "no receipt email sent yet"}` : ""}`));
    if (!g.corrects_id) {
      const acts = [];
      if (g.donor_email && !g.receipt_sent_at) acts.push(h("button", { class: "btn small ghost", type: "button", "data-act": "resend", on: { click: async (ev) => { await busy(ev.currentTarget, async () => { const r = await post(`/api/treasury/gifts/${g.id}/receipt`, {}); say(r.ok ? r.data.words : (r.data.words || WORDS.tryAgain), r.ok); load(); }); } } }, WORDS.ledgerResend));
      acts.push(h("button", { class: "btn small ghost", type: "button", "data-act": "correct", on: { click: () => { openForm = { id: g.id, kind: "correct" }; load(); } } }, WORDS.ledgerCorrect));
      row.append(h("div", { class: "row" }, acts));
    }
    if (openForm && openForm.id === g.id && openForm.kind === "correct") row.append(h("div", { class: "sub" }, formOf({ cls: "formcard inner", submit: WORDS.ledgerCorrect, path: `/api/treasury/gifts/${g.id}/correct`, children: [field(WORDS.ledgerChange, text("change", "", { max: 14, mode: "decimal" })), field(WORDS.ledgerWhy, text("note", "", { max: 500 }))], build: (x) => ({ change: x.change, note: x.note }) }), h("button", { class: "link", type: "button", on: { click: () => { openForm = null; load(); } } }, "Cancel")));
    return row;
  }));
}

function settingsForm(v) {
  const s = v.settings;
  const door = h("input", { type: "checkbox", name: "door_open", id: "door-open" }); door.checked = !!s.door_open;
  const f = formOf({ submit: WORDS.settingsSave, path: "/api/treasury/settings",
    children: [h("p", { class: "note" }, WORDS.settingsLead), h("div", { class: "formgrid" },
      field(WORDS.settingsRegNo, text("registration_number", s.registration_number, { max: 60 })),
      field(WORDS.settingsRegDate, text("registration_date", s.registration_date, { type: "date" })),
      field(WORDS.settings990, text("form990_url", s.form990_url, { type: "url", max: 300, mode: "url", placeholder: "https://" }), null, "full")),
      h("p", {}, h("label", { for: "door-open" }, door, " ", WORDS.settingsOpen))],
    build: (x) => ({ registration_number: x.registration_number, registration_date: x.registration_date, form990_url: x.form990_url, door_open: door.checked }) });
  return f;
}

function treasurersCard(v) {
  const email = text("email", "", { type: "email", max: 254, required: true, mode: "email" });
  const out = h("div", { class: "out" });
  const form = h("form", { novalidate: true }, field(WORDS.treasurerAdd, email, WORDS.treasurerAddHelp), out, h("p", { class: "row" }, h("button", { class: "btn small", type: "submit" }, WORDS.moneyTeamAddButton)));
  form.addEventListener("submit", async (ev) => { ev.preventDefault(); out.replaceChildren(); await busy(form.querySelector("button"), async () => { const r = await post("/api/treasury/treasurers", { email: email.value, on: true }); if (!r.ok) return out.replaceChildren(msg(r.data.words || WORDS.tryAgain)); say("Done. They are on the money team now.", true); load(); }); });
  return h("div", { class: "card" }, v.treasurers.map((t) => h("div", { class: "person" }, h("div", { class: "grow" }, h("strong", {}, t.name), ` · ${t.email}`),
    v.treasurers.length > 1 && t.user_id !== v.me.user_id ? h("button", { class: "btn small ghost", type: "button", on: { click: async (ev) => { await busy(ev.currentTarget, async () => { const r = await post("/api/treasury/treasurers", { email: t.email, on: false }); say(r.ok ? "Done." : (r.data.words || WORDS.tryAgain), r.ok); load(); }); } } }, "Take off") : null)), h("hr"), form);
}

load();

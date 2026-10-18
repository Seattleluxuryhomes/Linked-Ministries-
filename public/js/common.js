/* common.js — what the signed-in pages share: building the page without ever writing a person's words as markup (text goes in
   as text, never as HTML), calling the API, and the few form pieces. No inline script, no style attribute, nothing from
   anyone else's server (shaped on Behavioral Health's public/js/common.js; origin in commons.json). */
import { WORDS, STATES, CATEGORIES, KIND } from "/js/pure.js";

/** h("div", { class: "card", on: { click } }, "text", child) — text is always text */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "on") for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === "text") el.textContent = v;
    else if (k === "value") el.value = v;
    else if (k === "checked" || k === "disabled" || k === "selected" || k === "required") el[k] = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(Infinity)) { if (k == null || k === false) continue; el.append(k.nodeType ? k : document.createTextNode(String(k))); }
  return el;
}

/* ---- the API: a calm answer for every refusal ----------------------------------------------------------------------------- */
export async function api(method, path, body) {
  let r;
  try { r = await fetch(path, { method, headers: body !== undefined ? { "content-type": "application/json" } : {}, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: "same-origin" }); }
  catch (e) { return { ok: false, status: 0, data: { words: "We could not reach the site. Check your connection and try again." } }; }
  let data = null; try { data = await r.json(); } catch (e) { data = null; }
  return { ok: r.ok, status: r.status, data: data || {} };
}
/** send a file as the whole body (a picture); the type is the file's own, and the server checks the bytes, not the label */
export async function upload(path, file) {
  let r;
  try { r = await fetch(path, { method: "POST", headers: { "content-type": file.type }, body: file, credentials: "same-origin" }); }
  catch (e) { return { ok: false, status: 0, data: { words: "We could not reach the site. Check your connection and try again." } }; }
  let data = null; try { data = await r.json(); } catch (e) { data = null; }
  return { ok: r.ok, status: r.status, data: data || {} };
}
export const get = (p) => api("GET", p);
export const post = (p, b = {}) => api("POST", p, b);

/** a message that is read aloud and seen: kind "ok" is for a thing that happened, the plain kind is for a thing to know */
export function msg(text, kind) { return h("p", { class: "msg" + (kind === "ok" ? " ok" : ""), role: "status" }, text); }

let uid = 0;
/** a labelled field: field("City", h("input", {...}), "help words") */
export function field(label, control, help, cls) {
  const id = "f" + ++uid;
  control.id = id;
  return h("div", { class: "field" + (cls ? " " + cls : "") }, h("label", { for: id }, label), control, help ? h("p", { class: "help", id: id + "-h" }, help) : null);
}
export const text = (name, value, o = {}) => h("input", { type: o.type || "text", name, value: value || "", maxlength: o.max, autocomplete: o.auto || "off", required: o.required, inputmode: o.mode, placeholder: o.placeholder });
export const area = (name, value, max) => h("textarea", { name, maxlength: max }, value || "");
export function select(name, options, value, first) {
  const s = h("select", { name }, first ? h("option", { value: "" }, first) : null, options.map(([v, l]) => h("option", { value: v }, l)));
  s.value = value || "";
  return s;
}
export const stateSelect = (value) => select("state", STATES.map(([c, n]) => [c, `${n} (${c})`]), value, "Choose a state");
export const categorySelect = (value) => select("category", CATEGORIES, value, "Choose one");

/** the values of a form by field name */
export function values(form) { const o = {}; for (const el of form.elements) if (el.name) o[el.name] = el.value; return o; }

/** disable a button while a request runs; the page never says "saved" until the request said so */
export async function busy(button, fn) {
  button.disabled = true;
  try { return await fn(); } finally { button.disabled = false; }
}

/** the ministry's profile form (used when a ministry is made and when a lead changes it) */
export function ministryForm({ v = {}, email, submit, onSubmit, note, agree = false }) {
  const form = h("form", { class: "card formcard", novalidate: true },
    note ? h("p", { class: "note" }, note) : null,
    h("div", { class: "formgrid" },
      field(WORDS.fieldName, text("name", v.name, { max: 120, required: true, auto: "organization" })),
      field(WORDS.fieldContact, text("contact_name", v.contact_name, { max: 120, required: true, auto: "name" })),
      field(WORDS.fieldCity, text("city", v.city, { max: 80, required: true, auto: "address-level2" })),
      field(WORDS.fieldState, stateSelect(v.state)),
      field(WORDS.fieldAbout, area("about", v.about, 1200), WORDS.fieldAboutHelp, "full"),
      field(WORDS.fieldWebsite, text("website", v.website, { type: "url", max: 200, mode: "url", placeholder: "https://" })),
      field(WORDS.fieldContactEmail, text("contact_email", v.contact_email || email, { type: "email", max: 254, required: true, auto: "email" }), WORDS.fieldContactEmailHelp)),
    h("div", { class: "out" }),
    h("p", { class: "row" }, h("button", { class: "btn", type: "submit" }, submit)),
    agree ? agreeLine() : null);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const out = form.querySelector(".out"), btn = form.querySelector("button[type=submit]");
    out.replaceChildren();
    await busy(btn, async () => { const r = await onSubmit(values(form)); if (r && r.error) out.replaceChildren(msg(r.error)); });
  });
  return form;
}

/** "By joining you agree to the terms and the privacy page. You must be 18 or older." with both links */
export function agreeLine() {
  return h("p", { class: "agree" }, "By joining you agree to the ", h("a", { href: "/terms" }, WORDS.agreeTerms), " and the ", h("a", { href: "/privacy" }, WORDS.agreePrivacy), ". ", WORDS.adultsOnly);
}

/** the post form: kind is fixed by which button opened it */
export function postForm({ kind, v = {}, ministry, limits, submitLabel, onSave, onSend }) {
  const until = v.open_until || addDays(limits.today, 30);
  const dateInput = text("open_until", until, { type: "date", required: true });
  dateInput.min = limits.today; dateInput.max = limits.max;
  const form = h("form", { class: "card formcard", novalidate: true },
    h("h3", {}, KIND[kind].post),
    h("p", { class: "note" }, WORDS.fieldBodyHelp),
    h("div", { class: "formgrid" },
      field(WORDS.fieldCategory, categorySelect(v.category)),
      field(WORDS.fieldTitle, text("title", v.title, { max: 120, required: true })),
      field(WORDS.fieldBody, area("body", v.body, 2000), null, "full"),
      field(WORDS.fieldUntil, dateInput, WORDS.fieldUntilHelp),
      field(WORDS.fieldPostCity, text("city", v.city || ministry.city, { max: 80, auto: "address-level2" })),
      h("input", { type: "hidden", name: "state", value: v.state || ministry.state }),
      h("input", { type: "hidden", name: "kind", value: kind })),
    h("div", { class: "out" }),
    h("p", { class: "row" },
      h("button", { class: "btn ghost", type: "button", "data-act": "save" }, submitLabel || WORDS.saveDraft),
      h("button", { class: "btn", type: "submit" }, WORDS.sendToRead)));
  const run = async (btn, fn) => { const out = form.querySelector(".out"); out.replaceChildren(); await busy(btn, async () => { const r = await fn(values(form)); if (r && r.error) out.replaceChildren(msg(r.error)); }); };
  form.addEventListener("submit", (ev) => { ev.preventDefault(); run(form.querySelector("button[type=submit]"), onSend); });
  form.querySelector("[data-act=save]").addEventListener("click", (ev) => run(ev.currentTarget, onSave));
  return form;
}

export function addDays(iso, n) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

/** go to the sign-in page, and come back to where we were */
export function toSignIn(next) { location.assign("/join" + (next ? "?next=" + encodeURIComponent(next) : "")); }
export const safeNext = (n) => (/^\/(me|board|review|money|steward)(\/[A-Za-z0-9-]*)?(#[a-z]*)?$/.test(String(n || "")) ? n : "/me");

/* eden.js — Eden, the writing helper, on the signed-in pages. This script holds no rule and no prompt: it sends a job name and what the
   person typed to /api/eden, and shows what comes back. The server decides everything (its prompt, its key, its limits, the crisis check,
   the verse list). What Eden writes is shown, marked, and goes into a form field only when the person presses "Use these words"; the
   form's own Save or Send is still the only way anything is kept or sent. With no key on the server it says so and offers nothing. */
import { h, get, post, msg, field, area, select, busy } from "/js/common.js";
import { WORDS, CRISIS } from "/js/pure.js";
import { mountEdenOrb } from "/js/eden-orb.js";

const draftView = (job, d) => {
  if (job === "ask_give") return [h("p", {}, h("strong", {}, d.title)), h("p", { class: "eden-draft" }, d.body)];
  if (job === "page_words") return [h("p", {}, h("strong", {}, d.tagline)), h("p", { class: "eden-draft" }, d.about)];
  return [h("p", { class: "eden-draft" }, d.letter)];
};

/** The panel. job: ask_give | page_words | grant_letter | thank_you. getFields() reads the form as it is now.
    onUse(draft, verse) puts the words in the form (not saved). With no onUse, the words are shown to copy. */
export function edenPanel({ job, getFields, onUse, useLabel = WORDS.edenUse, withVerse = false, notesLabel = WORDS.edenNotes, notesHelp = WORDS.edenNotesHelp }) {
  const orbHost = h("span", { class: "eden-orb", "data-eden-orb": "" });
  const orb = mountEdenOrb(orbHost, { size: 44, small: true, seed: 11 });
  const body = h("div", { class: "eden-body", hidden: true });
  const open = h("button", { class: "btn ghost small", type: "button", "data-act": "eden-open" }, WORDS.edenOpen);
  const root = h("div", { class: "eden", "data-eden": job },
    h("div", { class: "eden-head" }, orbHost, h("div", { class: "grow" }, h("strong", {}, "Eden"), h("p", { class: "eden-note" }, WORDS.edenAbout))), h("p", {}, open), body);
  let opened = false;
  open.addEventListener("click", async () => {
    if (opened) { body.hidden = !body.hidden; return; }
    opened = true; body.hidden = false; body.replaceChildren(msg(WORDS.edenChecking));
    const st = await get("/api/eden/status");
    if (!st.ok) { body.replaceChildren(msg(st.data.words || WORDS.tryAgain)); opened = false; return; }
    if (!st.data.configured) { body.replaceChildren(msg(WORDS.edenNotSetUp)); open.hidden = true; return; }
    build();
  });
  function build() {
    const notes = area("notes", "", 1500), verse = h("input", { type: "checkbox", name: "include_verse", id: "eden-verse-" + job });
    const out = h("div", { class: "out", "aria-live": "polite" }), result = h("div", { class: "eden-result" });
    const go = h("button", { class: "btn small", type: "button", "data-act": "eden-write" }, WORDS.edenWrite);
    go.addEventListener("click", async () => {
      out.replaceChildren(); result.replaceChildren(); orb.setState("thinking");
      await busy(go, async () => {
        const r = await post("/api/eden", { job, fields: { ...getFields(), notes: notes.value }, include_verse: !!verse.checked });
        orb.setState("ready");
        if (!r.ok) return out.replaceChildren(msg(r.data.words || WORDS.tryAgain));
        if (r.data.crisis) return out.replaceChildren(h("p", { class: "msg", "data-eden-crisis": "" }, r.data.words || CRISIS));
        if (!r.data.ok) return out.replaceChildren(msg(r.data.words || WORDS.tryAgain));
        showDraft(r.data);
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
    body.replaceChildren(...[field(notesLabel, notes, notesHelp),
      withVerse ? h("p", {}, h("label", { for: verse.id }, verse, " ", WORDS.edenVerse)) : null, out, h("p", { class: "row" }, go), result, h("p", { class: "eden-note" }, WORDS.edenNothingSaved)].filter(Boolean));
  }
  return root;
}

/* page.js — the form that makes a ministry's public page (/m/<slug>), used on /me. One form, no code. The page says "public" only
   when the server says so, and "sent" only when the server took it. A picture is checked on the server: this script only sends bytes. */
import { h, get, post, upload, msg, field, text, area, select, stateSelect, busy, values } from "/js/common.js";
import { WORDS, PAGE_STATUS, MEET_DAYS, PAGE_LIMITS } from "/js/pure.js";
import { edenPanel } from "/js/eden.js";

/** how the page is doing, in words, for the lead */
export function pageStatusWords(pg) {
  if (!pg || !pg.exists) return null;
  const live = pg.has_live;
  if (live && pg.state === "approved") return pg.public ? PAGE_STATUS.approved : PAGE_STATUS.ministry_waiting;
  if (live && pg.state === "waiting") return PAGE_STATUS.changes_waiting;
  if (live) return PAGE_STATUS.changes_draft;
  if (pg.state === "waiting") return PAGE_STATUS.waiting;
  if (pg.state === "sent_back") return PAGE_STATUS.sent_back;
  return PAGE_STATUS.draft;
}

/** the card on /me: where the page stands, and the way into the form */
export function pageCard(me, pg, { onEdit }) {
  const card = h("div", { class: "card", "data-page-card": "" });
  const words = pageStatusWords(pg);
  if (!pg.exists) {
    card.append(h("p", {}, WORDS.pageLead));
    card.append(me.lead ? h("p", { class: "row" }, h("button", { class: "btn", type: "button", "data-act": "page-start", on: { click: onEdit } }, WORDS.pageStart)) : h("p", { class: "quiet" }, "Only a lead can make the page."));
    return card;
  }
  card.append(msg(words, pg.public && pg.state === "approved" ? "ok" : undefined));
  if (pg.state === "sent_back" && pg.review_note) card.append(h("p", { class: "msg" }, h("strong", {}, "Their note: "), pg.review_note));
  card.append(h("p", { class: "row" },
    h("a", { class: "btn ghost small", href: "/m/" + pg.slug, "data-act": "page-view" }, pg.public ? "Open your public page" : WORDS.pageView),
    me.lead ? h("button", { class: "btn small", type: "button", "data-act": "page-edit", on: { click: onEdit } }, WORDS.pageEdit) : null));
  card.append(h("p", { class: "quiet" }, `linkedm.org/m/${pg.slug}`));
  return card;
}

function meetRow(r = {}) {
  const day = select("day", MEET_DAYS.map((d) => [d, d]), r.day || "", "Day");
  const time = text("time", r.time || "", { max: 30, placeholder: "6:30 pm" });
  const place = text("place", r.place || "", { max: 120, placeholder: "Where" });
  const row = h("div", { class: "meetrow", "data-meet": "" },
    h("div", { class: "field" }, h("label", {}, WORDS.pageDay), day), h("div", { class: "field" }, h("label", {}, WORDS.pageTime), time), h("div", { class: "field grow" }, h("label", {}, WORDS.pagePlace), place),
    h("button", { class: "link", type: "button", "aria-label": WORDS.pageRemoveRow, on: { click: () => row.remove() } }, "Remove"));
  row.read = () => ({ day: day.value, time: time.value, place: place.value });
  return row;
}

/** the form. `pg` is GET /api/page; onDone(words) is called after the server took it. */
export function pageForm(me, pg, { onDone, onCancel }) {
  const d = pg.draft || {}, m = pg.ministry || me.ministry;
  const photos = (d.photos || []).map((p) => ({ id: p.id, alt: p.alt || "" }));
  const photoBox = h("div", { class: "photos", "data-photos": "" });
  const out = h("div", { class: "out" });
  const drawPhotos = () => photoBox.replaceChildren(...photos.map((p, i) => h("div", { class: "photo-edit" },
    h("img", { src: "/photos/" + p.id, alt: p.alt || "A picture you added", width: 160, height: 120 }),
    field(WORDS.pagePhotoAlt, text("alt" + i, p.alt, { max: 160 }), null, "grow"),
    h("button", { class: "link", type: "button", "aria-label": WORDS.pagePhotoRemove, on: { click: () => { const cur = readPhotos(); cur.splice(i, 1); photos.splice(0, photos.length, ...cur); drawPhotos(); } } }, "Remove"))));
  /* the alt boxes write back into the list when the form is read */
  const readPhotos = () => photos.map((p, i) => { const el = photoBox.querySelectorAll("input[type=text]")[i]; return { id: p.id, alt: el ? el.value : p.alt }; });
  drawPhotos();
  const file = h("input", { type: "file", accept: "image/jpeg,image/png", id: "page-photo-file", "data-act": "photo-file" });
  file.addEventListener("change", async () => {
    const f = file.files && file.files[0]; if (!f) return;
    out.replaceChildren();
    if (photos.length >= PAGE_LIMITS.photos) { out.replaceChildren(msg("A page holds two pictures. Remove one first.")); file.value = ""; return; }
    if (f.size > PAGE_LIMITS.photoBytes) { out.replaceChildren(msg("That picture is bigger than 1.5 MB. Choose a smaller one.")); file.value = ""; return; }
    const r = await upload("/api/page/photos", f);
    file.value = "";
    if (!r.ok) return out.replaceChildren(msg(r.data.words || WORDS.tryAgain));
    photos.splice(0, photos.length, ...readPhotos(), { id: r.data.id, alt: "" }); drawPhotos();
  });
  const meetBox = h("div", { class: "meets-edit", "data-meets": "" });
  const rows = (d.meets && d.meets.length ? d.meets : []).map(meetRow);
  rows.forEach((r) => meetBox.append(r));
  const addRow = h("button", { class: "btn ghost small", type: "button", "data-act": "meet-add", on: { click: () => { if (meetBox.children.length >= PAGE_LIMITS.meets) return; meetBox.append(meetRow({})); } } }, WORDS.pageAddRow);

  const slugLocked = !!pg.slug_locked;
  const slug = text("slug", pg.slug || pg.suggested_slug || "", { max: 60 });
  if (slugLocked) slug.disabled = true;
  const verseSel = select("verse", (pg.verses || []).map((v) => [v.key, `${v.ref}: ${v.text.slice(0, 48)}...`]), d.verse || "", WORDS.pageVerseNone);
  const form = h("form", { class: "card formcard", novalidate: true, "data-page-form": "" },
    h("h3", {}, WORDS.pageTitle),
    h("p", { class: "note" }, WORDS.pageNameNote),
    h("div", { class: "formgrid" },
      field(WORDS.fieldName, text("name", m.name, { max: 120, required: true, auto: "organization" })),
      h("div", { class: "field" }),
      field(WORDS.fieldCity, text("city", m.city, { max: 80, required: true, auto: "address-level2" })),
      field(WORDS.fieldState, stateSelect(m.state)),
      field(WORDS.pageTagline, text("tagline", d.tagline, { max: 140, required: true }), WORDS.pageTaglineHelp, "full"),
      field(WORDS.pageAbout, area("about", d.about, 3000), WORDS.pageAboutHelp, "full")),
    h("h4", {}, WORDS.pageMeets), h("p", { class: "help" }, WORDS.pageMeetsHelp), meetBox, h("p", {}, addRow),
    h("h4", {}, WORDS.pageReach), h("p", { class: "help" }, WORDS.pageReachHelp),
    h("div", { class: "formgrid" },
      field(WORDS.pageEmail, text("email", d.email, { type: "email", max: 254, mode: "email" })),
      field(WORDS.pagePhone, text("phone", d.phone, { type: "tel", max: 30, mode: "tel" })),
      field(WORDS.pageWebsite, text("website", d.website, { type: "url", max: 200, mode: "url", placeholder: "https://" })),
      field(WORDS.pageGive, text("give_url", d.give_url, { type: "url", max: 300, mode: "url", placeholder: "https://" }), WORDS.pageGiveHelp)),
    h("h4", {}, WORDS.pagePhotos), h("p", { class: "help" }, WORDS.pagePhotosHelp), photoBox,
    h("div", { class: "field" }, h("label", { for: "page-photo-file" }, WORDS.pagePhotoAdd), file),
    h("div", { class: "formgrid" }, field(WORDS.pageVerse, verseSel), field(WORDS.pageAddress, slug, slugLocked ? WORDS.pageAddressLocked : WORDS.pageAddressHelp)),
    out,
    h("p", { class: "row" },
      h("button", { class: "btn ghost", type: "button", "data-act": "page-save" }, WORDS.pageSave),
      h("button", { class: "btn", type: "submit", "data-act": "page-send" }, WORDS.pageSend),
      h("button", { class: "link", type: "button", on: { click: onCancel } }, "Cancel")));
  /* Eden: the one line and the about words, from a few words. They go into the form only when the person presses "Use these words"; a verse is only ever one from the list. */
  const eden = edenPanel({ job: "page_words", withVerse: true, getFields: () => { const v = values(form); return { name: v.name, city: v.city, state: v.state, tagline: v.tagline, about: v.about }; },
    onUse: (d, verse) => { form.elements.tagline.value = d.tagline; form.elements.about.value = d.about; if (verse && form.elements.verse) form.elements.verse.value = verse.key; } });
  form.insertBefore(eden, form.querySelector("h4"));
  const run = async (btn, submit) => {
    out.replaceChildren();
    await busy(btn, async () => {
      const v = values(form);
      const body = { name: v.name, city: v.city, state: v.state, slug: slugLocked ? undefined : v.slug, tagline: v.tagline, about: v.about, email: v.email, phone: v.phone, website: v.website,
        give_url: v.give_url, verse: v.verse, meets: [...meetBox.querySelectorAll("[data-meet]")].map((r) => r.read()), photos: readPhotos(), submit };
      const r = await post("/api/page", body);
      if (!r.ok) return out.replaceChildren(msg(r.data.words || WORDS.tryAgain));
      onDone(r.data.state === "approved" ? WORDS.pageNoChange : submit ? WORDS.pageSent : WORDS.pageSaved);
    });
  };
  form.addEventListener("submit", (ev) => { ev.preventDefault(); run(form.querySelector("[data-act=page-send]"), true); });
  form.querySelector("[data-act=page-save]").addEventListener("click", (ev) => run(ev.currentTarget, false));
  return form;
}

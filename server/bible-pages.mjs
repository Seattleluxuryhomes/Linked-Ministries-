/* bible-pages.mjs — the Bible on a ministry's page, at /m/<slug>/bible (migration 0012): the books, a book's chapters, and a chapter.
   Built whole on the server like every public page, so it reads with no script, and worn in the ministry's own theme. The verses are
   the Bible's own words from server/bible.mjs, shown exactly inside <blockquote class="scripture">, each chapter with its translation's
   name and licence. Our own words around them stay plain. A ministry that chose two languages gets a switch between them that keeps
   the reader's place. */
import { layout, e } from "./pages.mjs";
import { BOOKS, pageBibles, bookNames, book, chapter } from "./bible.mjs";

const at = (slug) => "/m/" + slug + "/bible";
/* the first language the ministry chose is the address with no ?t=; a second one carries ?t=<id> */
const withT = (href, t, bibles) => (t.id === bibles[0].id ? href : `${href}?t=${encodeURIComponent(t.id)}`);
const attrs = (t) => `lang="${e(t.lang)}" dir="${e(t.dir)}"`;

/** which of the page's translations to show: the one ?t= names when the page offers it, or the first */
export function pick(bibles, t) { return bibles.find((x) => x.id === t) || bibles[0]; }

function frame({ page, preview, title, crumbs, body, bibles, current, switchHref, base, notice }) {
  const c = page.live || {};
  const langs = bibles.length > 1 ? `<nav class="bible-langs" aria-label="Bible language">${bibles.map((t) => `<a href="${e(withT(switchHref, t, bibles))}" ${attrs(t)}${t.id === current.id ? ' aria-current="true"' : ""}>${e(t.native)}</a>`).join("")}</nav>` : "";
  const html = `<article class="mpage bible">
<header class="mhero"><div class="wrap">
${preview ? `<p class="note">This is how your Bible will look. Only your ministry can see this until a person at Linked Ministries reads your page.</p>` : ""}<p class="eyebrow"><a href="/m/${e(page.slug)}">${e(page.name)}</a></p>
<p class="crumbs">${crumbs}</p>
${langs}
</div></header>
<div class="wrap bible-body">${body}</div>
</article>`;
  return layout({ title: `${title} · ${page.name}`, body: html, base, path: switchHref, noindex: preview, notice, theme: c.theme || "gold",
    description: `Read the Bible in ${bibles.map((t) => t.language).join(" and ")}, from ${page.name}.` });
}

/** /m/<slug>/bible: the 66 books, in the chosen language */
export function bibleHomePage({ page, preview = false, t, base = "", notice = "" }) {
  const bibles = pageBibles((page.live || {}).bible), cur = pick(bibles, t), names = bookNames(cur.id), root = at(page.slug);
  const list = (testament, heading) => `<section class="bible-shelf" aria-labelledby="b-${testament}"><h2 id="b-${testament}">${heading}</h2><ul class="bible-books" ${attrs(cur)}>${BOOKS.map((b, i) => [b, i]).filter(([b]) => b.testament === testament)
    .map(([b, i]) => `<li><a href="${e(withT(`${root}/${b.key}`, cur, bibles))}">${e(names[i])}</a></li>`).join("")}</ul></section>`;
  const body = `<h1>The Bible</h1>
<p class="lead">${e(cur.name)}. Choose a book.</p>
${list("OT", "Old Testament")}
${list("NT", "New Testament")}
<p class="quiet bible-licence">${e(cur.name)}. ${e(cur.licence)}</p>`;
  return frame({ page, preview, title: "The Bible", crumbs: `<span>The Bible</span>`, body, bibles, current: cur, switchHref: root, base, notice });
}

/** /m/<slug>/bible/<book>: the book's chapters, or null when there is no such book */
export function bibleBookPage({ page, preview = false, key, t, base = "", notice = "" }) {
  const b = book(key); if (!b) return null;
  const bibles = pageBibles((page.live || {}).bible), cur = pick(bibles, t), name = bookNames(cur.id)[b.index], root = at(page.slug);
  const body = `<h1 ${attrs(cur)}>${e(name)}</h1>
<p class="lead">${b.chapters === 1 ? "One chapter." : `${b.chapters} chapters.`} Choose one.</p>
<ul class="bible-chapters">${Array.from({ length: b.chapters }, (_, i) => `<li><a href="${e(withT(`${root}/${b.key}/${i + 1}`, cur, bibles))}" aria-label="${e(b.en)} ${i + 1}">${i + 1}</a></li>`).join("")}</ul>`;
  return frame({ page, preview, title: b.en, crumbs: `<a href="${e(withT(root, cur, bibles))}">The Bible</a> <span aria-hidden="true">›</span> <span ${attrs(cur)}>${e(name)}</span>`, body, bibles, current: cur, switchHref: `${root}/${b.key}`, base, notice });
}

/** /m/<slug>/bible/<book>/<chapter>: the chapter, or null when there is no such chapter */
export function bibleChapterPage({ page, preview = false, key, n, t, base = "", notice = "" }) {
  const bibles = pageBibles((page.live || {}).bible), cur = pick(bibles, t), ch = chapter(cur.id, key, n), root = at(page.slug);
  if (!ch) return null;
  const verses = ch.verses.map(([v, text]) => `<p>${ch.unnumbered ? "" : `<sup>${e(v)}</sup>`}${e(text)}</p>`).join("");
  const step = (r, label, cls) => (r ? `<a class="btn ghost ${cls}" href="${e(withT(`${root}/${r.key}/${r.chapter}`, cur, bibles))}"><span class="step-label">${label}</span> <span ${attrs(cur)}>${e(r.name)} ${r.chapter}</span></a>` : "");
  const body = `<h1 ${attrs(cur)}>${e(ch.name)} ${ch.chapter}</h1>
${ch.unnumbered ? `<p class="note">This translation numbers the verses in this chapter in its own way, so the verse numbers are not shown here.</p>` : ""}
<blockquote class="scripture bible-text" ${attrs(cur)}>${verses}<cite>${e(ch.name)} ${ch.chapter} (${e(cur.short)})</cite></blockquote>
<nav class="bible-steps" aria-label="Chapters">${step(ch.prev, "Back", "prev")}${step(ch.next, "Next", "next")}</nav>
<p class="quiet bible-licence">${e(cur.name)}. ${e(cur.licence)}</p>`;
  return frame({ page, preview, title: `${ch.book.en} ${ch.chapter}`, body, bibles, current: cur, switchHref: `${root}/${ch.book.key}/${ch.chapter}`, base, notice,
    crumbs: `<a href="${e(withT(root, cur, bibles))}">The Bible</a> <span aria-hidden="true">›</span> <a href="${e(withT(`${root}/${ch.book.key}`, cur, bibles))}" ${attrs(cur)}>${e(ch.name)}</a> <span aria-hidden="true">›</span> <span>${ch.chapter}</span>` });
}

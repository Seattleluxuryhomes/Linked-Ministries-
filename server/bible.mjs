/* bible.mjs — the Bible a ministry's page carries, in the language it chose (migration 0012). The words are read from
   data/bible/<id>.json.gz, made by tools/import-bible.mjs from a text whose licence lets this repository carry it, and are shown
   exactly: nothing here writes, shortens or explains a verse. A translation the catalog does not mark ready, or whose file is
   missing, is not offered and not shown. A chapter whose verses a source numbers differently from the King James Version is shown
   without numbers, so a page never prints a chapter and verse that may be wrong. */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { ROOT } from "./db.mjs";

const DIR = path.join(ROOT, "data", "bible");
export const BOOKS = JSON.parse(fs.readFileSync(path.join(DIR, "books.json"), "utf8"));
const BOOK_AT = new Map(BOOKS.map((b, i) => [b.key, i]));
/** the translations this server carries: ready in the catalog and present on disk, in the catalog's order */
export const TRANSLATIONS = JSON.parse(fs.readFileSync(path.join(DIR, "translations.json"), "utf8"))
  .filter((t) => t.ready && fs.existsSync(path.join(DIR, t.id + ".json.gz")));
const BY_ID = new Map(TRANSLATIONS.map((t) => [t.id, t]));
export const BIBLE_DEFAULT = "en-kjv";

/** a translation's catalog entry, or null */
export const translation = (id) => BY_ID.get(String(id || "")) || null;
/** the translations a page asked for that this server carries, in its order; the default when none */
export function pageBibles(list) {
  const out = (Array.isArray(list) ? list : []).map(translation).filter(Boolean);
  return out.length ? out : [translation(BIBLE_DEFAULT)].filter(Boolean);
}

/* a whole translation is about 5 to 15 MB once unpacked, so only the last few read are kept */
const KEEP = 4, cache = new Map();
function load(id) {
  if (cache.has(id)) { const v = cache.get(id); cache.delete(id); cache.set(id, v); return v; }
  const t = translation(id); if (!t) return null;
  const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR, id + ".json.gz"))));
  cache.set(id, data); while (cache.size > KEEP) cache.delete(cache.keys().next().value);
  return data;
}

/** a book by its key: { key, en, testament, chapters, index } or null */
export function book(key) { const i = BOOK_AT.get(String(key || "").toLowerCase()); return i == null ? null : { ...BOOKS[i], index: i }; }
/** the names of the 66 books in one translation, in order */
export function bookNames(id) { const d = load(id); return d ? d.books.map((b) => b.name) : BOOKS.map((b) => b.en); }

/** one chapter: { translation, book, name, chapter, verses: [[n, text]], unnumbered, prev, next } or null */
export function chapter(id, key, n) {
  const t = translation(id), b = book(key), d = t && load(id);
  const c = Number(n);
  if (!t || !b || !d || !Number.isInteger(c) || c < 1 || c > b.chapters) return null;
  const ch = d.books[b.index].chapters[c - 1];
  const prev = c > 1 ? { key: b.key, chapter: c - 1 } : b.index > 0 ? { key: BOOKS[b.index - 1].key, chapter: BOOKS[b.index - 1].chapters } : null;
  const next = c < b.chapters ? { key: b.key, chapter: c + 1 } : b.index < BOOKS.length - 1 ? { key: BOOKS[b.index + 1].key, chapter: 1 } : null;
  const names = d.books.map((x) => x.name);
  const label = (r) => r && { ...r, name: names[book(r.key).index] };
  return { translation: t, book: b, name: names[b.index], chapter: c, verses: ch.v, unnumbered: !!ch.unnumbered, prev: label(prev), next: label(next) };
}

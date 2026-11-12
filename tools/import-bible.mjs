#!/usr/bin/env node
/* tools/import-bible.mjs: turns one Bible translation into data/bible/<id>.json.gz, the file the reader at /m/<slug>/bible reads.
   Founder, 2026-11-12: every ministry's page carries a Bible "in the language that they choose". The words are the Bible's, never ours:
   this tool only takes out what is not the text (cross-references printed after a verse, a source's own numbering note) and never
   rewrites a word. A translation goes in only when its licence lets this public repository carry it (data/bible/translations.json says
   which licence, and `ready` is true only then).

     node tools/import-bible.mjs <id> <source.json>

   <source.json> is a list of the 66 books in order, each { "name": "<the book's name in that language>", "chapters": [[verse, ...], ...] }
   (the shape of the open "bible" JSON collection), or, for a source that numbers its own verses, each chapter may be a list of
   [number, text] pairs, where the number may be a range such as "10-11".
   A source with no numbers is numbered by place. Where a chapter holds a different count of verses than the King James Version's, the
   verses are kept but their numbers are not shown (`unnumbered`), so the page never prints a chapter and verse that may be wrong. */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "data", "bible");
const BOOKS = JSON.parse(fs.readFileSync(path.join(DIR, "books.json"), "utf8"));
const CATALOG = JSON.parse(fs.readFileSync(path.join(DIR, "translations.json"), "utf8"));

/* what is taken out of a verse, by translation: never a word of the text */
const CLEAN = {
  /* the Indian Revised Version prints its cross-references in brackets after a verse: (इब्रा. 1:10, इब्रा. 11:3) */
  "hi-irv": [/\s*\([^()]*\d+:\d+[^()]*\)/g],
  "bn-irv": [/\s*\([^()]*\d+:\d+[^()]*\)/g],
  /* the 1925 Vietnamese text marks a few verses with the source's other numbering: (022:49) */
  "vi-1925": [/^\(\d+:\d+\)\s*/g],
};

export function readSource(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  const books = JSON.parse(raw);
  if (!Array.isArray(books) || books.length !== 66) throw new Error("the source must list the 66 books in order");
  return books;
}

/** one translation, ready to write: { id, books: [{ name, chapters: [{ v: [[n, text], ...], unnumbered? }] }] } */
export function build(id, books, reference) {
  const rules = CLEAN[id] || [];
  const clean = (t) => rules.reduce((s, re) => s.replace(re, ""), String(t)).replace(/\s+/g, " ").trim();
  const out = { id, books: [] };
  books.forEach((b, bi) => {
    const want = BOOKS[bi].chapters;
    if (!Array.isArray(b.chapters) || b.chapters.length !== want) throw new Error(`${BOOKS[bi].en}: the source has ${b.chapters && b.chapters.length} chapters, not ${want}`);
    const chapters = b.chapters.map((ch, ci) => {
      const numbered = ch.length && Array.isArray(ch[0]);
      const v = ch.map((x, i) => (numbered ? [String(x[0]), clean(x[1])] : [String(i + 1), clean(x)])).filter(([, t]) => t);
      if (!v.length) throw new Error(`${BOOKS[bi].en} ${ci + 1} is empty`);
      const ref = reference ? reference[bi][ci] : null;
      return !numbered && ref != null && ref !== v.length ? { v, unnumbered: true } : { v };
    });
    out.books.push({ name: String(b.name || BOOKS[bi].en).trim(), chapters });
  });
  return out;
}

/* the King James Version's verse count for every chapter, from the file already made, to check a source that has no numbers */
function kjvCounts() {
  const f = path.join(DIR, "en-kjv.json.gz");
  if (!fs.existsSync(f)) return null;
  const k = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)));
  return k.books.map((b) => b.chapters.map((c) => c.v.length));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [id, file] = process.argv.slice(2);
  const t = CATALOG.find((x) => x.id === id);
  if (!t || !file) { console.error("usage: node tools/import-bible.mjs <id from data/bible/translations.json> <source.json>"); process.exit(1); }
  if (!t.ready) { console.error(`${id} is not ready: its licence is not confirmed (data/bible/translations.json). Nothing was written.`); process.exit(1); }
  const out = build(id, readSource(file), id === "en-kjv" ? null : kjvCounts());
  const dest = path.join(DIR, id + ".json.gz");
  fs.writeFileSync(dest, zlib.gzipSync(JSON.stringify(out), { level: 9 }));
  const verses = out.books.reduce((n, b) => n + b.chapters.reduce((m, c) => m + c.v.length, 0), 0);
  const un = out.books.reduce((n, b) => n + b.chapters.filter((c) => c.unnumbered).length, 0);
  console.log(`wrote ${path.relative(ROOT, dest)}: 66 books, ${verses} verses, ${un} chapters shown without verse numbers (${(fs.statSync(dest).size / 1048576).toFixed(1)} MB)`);
}

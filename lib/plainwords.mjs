/* plainwords.mjs: a readability reader over English text (D-472). Pure. Browser global `PlainWords`.

   Hard rule 5 (lexos/CLAUDE.md): the client side is plain language at an eighth-grade level or below. Until this file
   that was a habit. This is the measure: sentences, words, syllables, the two Flesch formulas as published, the
   longest sentence, the hard words, the passive markers, and a verdict against a ceiling the firm sets. The same
   reader runs over every sentence a portal or self-help surface shows (tests/plainwords-audit-test.mjs) and under the
   firm's own writing to a client (the thread composer and the engagement letter), as a small pill that never blocks.

   THE FORMULAS, as published (graded engineer: the constants are the authors' own and are checked by hand in the
   suite; the syllable counter is a heuristic, and the grade is an estimate, never a judgment of a person).

     Flesch-Kincaid grade level (Kincaid, Fishburne, Rogers and Chissom, 1975):
       grade = 0.39 × (words ÷ sentences) + 11.8 × (syllables ÷ words) − 15.59

     Flesch reading ease (Flesch, 1948):
       ease = 206.835 − 1.015 × (words ÷ sentences) − 84.6 × (syllables ÷ words)

   WHAT THIS FILE WILL NOT DO. It never rewrites a sentence; a person does. It never grades a person. It never says a
   paper is wrong because the court's own noun is long: the terms a court paper must use are listed below as allowed
   and count as one syllable, so a true sentence is never penalized for "petition" or "decree". The list is the
   product's and is shown wherever the grade is shown. It is English only: another language's words are counted,
   and the verdict says the grade is not meaningful for them. */

export const PLAINWORDS_VERSION = "2026-10-04";
export const GRADE = "engineer";
export const VERIFY_GRADE = "engineer's reading, verify";

/* ── the product's choices, stated ────────────────────────────────────────────────────────────────────────────── */
/** The ceiling the product ships with: grade 8.0 (hard rule 5: "an eighth-grade level or below"). A firm may set its own. */
export const DEFAULT_CEILING = 8.0;
/** No sentence a client reads runs past this many words. */
export const MAX_SENTENCE_WORDS = 25;
/** A sentence is graded on its own only from this many words: the formula was published for passages, and on a
    four-word sentence it measures the length of one noun, not the reading. Shorter sentences still count in the
    passage's grade and are still held to the word limit. (The same floor tools/ui-audit.mjs gradeOf uses.) */
export const MIN_GRADED_WORDS = 10;
/** A word is "hard" from this many syllables (Gunning's rule of thumb: over three). */
export const HARD_SYLLABLES = 4;

/** The court's own nouns, which a true sentence has to use. Each counts as one syllable in the grade and is never
    listed as a hard word. The reason is beside each; the list is the product's and is shown with the grade. */
export const ALLOWED_TERMS = [
  { word: "petition", why: "the paper that starts a family case; the court's name for it" },
  { word: "petitioner", why: "the person who files the petition; the court's word" },
  { word: "respondent", why: "the person who answers; the court's word" },
  { word: "dissolution", why: "the court's word for a divorce (RCW 26.09)" },
  { word: "declaration", why: "a sworn statement under GR 13; the court's word" },
  { word: "decree", why: "the order that ends the case; the court's word" },
  { word: "summons", why: "the paper that says how long there is to answer" },
  { word: "affidavit", why: "a sworn statement before a notary; the court's word" },
  { word: "subpoena", why: "the court's order to appear or produce" },
  { word: "facilitator", why: "the court's own title for its family law help desk (RCW 26.12.240)" },
];
export const ALLOWED = new Set(ALLOWED_TERMS.map((t) => t.word));
/** The noun, its plural or its possessive (petitions, decree's, summonses). */
export const isAllowed = (w) => { const k = String(w == null ? "" : w).toLowerCase().replace(/[’']/g, "").replace(/[^a-z]/g, ""); return ALLOWED.has(k) || ALLOWED.has(k.replace(/s$/, "")) || ALLOWED.has(k.replace(/es$/, "")); };
export const ALLOWED_NOTE = "The court's own nouns count as one syllable each, so a true sentence is never marked hard for a word the paper has to use: " + ALLOWED_TERMS.map((t) => t.word).join(", ") + ".";

/** Words the counter gets wrong by rule, with the count a person would give. Tested one by one. */
export const SYLLABLE_EXCEPTIONS = {
  business: 2, businesses: 3, everything: 3, everybody: 4, anyone: 3, wednesday: 2, create: 2, created: 3, creates: 2, creating: 3,
  area: 3, areas: 3, idea: 3, ideas: 3, quiet: 2, science: 2, real: 1, poem: 2, poems: 2, evening: 2, fuel: 2, cruel: 2, video: 3,
  videos: 3, being: 2, hour: 1, hours: 1, our: 1, fire: 1, hire: 1, hired: 1, interest: 3, interested: 4,
  evaluate: 4, usually: 4, cafe: 2, recipe: 3, apostrophe: 4, catastrophe: 4, resume: 2, naive: 2, chaos: 2, diet: 2,
  violence: 3, trial: 2, trials: 2, reality: 4, react: 2, period: 3, radio: 3, union: 2, onion: 2, opinion: 3,
  people: 2, someone: 2, everyone: 3, the: 1, i: 1, a: 1, hundred: 2, hundreds: 2, sacred: 2, naked: 2, wicked: 2, rugged: 2, ragged: 2,
  crooked: 2, wretched: 2, kindred: 2, hatred: 2, quietly: 3, lien: 1, liens: 1, friend: 1, friends: 1, friendly: 2, element: 3, elements: 3,
};

/* ── words and sentences ──────────────────────────────────────────────────────────────────────────────────────── */
const ABBR = /\b(v|vs|Inc|Corp|Co|Ltd|LLC|No|Nos|Mr|Mrs|Ms|Dr|Jr|Sr|St|Ave|Ex|Dkt|RCW|e\.g|i\.e|etc|p|pp|a\.m|p\.m|U\.S|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.$/i;
const S = (v) => String(v == null ? "" : v);

/** Sentences: split on . ! ? (and a closing quote or bracket after one); an abbreviation, an initial and a numbered
    list mark do not end one. A line break with no end mark ends a sentence too (a label, a heading). */
export function sentences(text) {
  const out = [];
  for (const chunk of S(text).replace(/\r/g, "").split(/\n+/)) {
    let cur = "";
    const toks = chunk.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    for (const tok of toks) {
      cur += (cur ? " " : "") + tok;
      const bare = tok.replace(/["”’')\]]+$/, "");
      const first = cur === tok; /* a list mark ("1.") or an initial ends nothing when it opens the sentence; "call 911." ends one */
      const ends = /[.!?]$/.test(bare) && !ABBR.test(bare) && !(first && /^\d+\.$/.test(bare)) && !/^[A-Z]\.$/.test(bare) && !/^\d{1,2}\.\d{1,2}\.?$/.test(bare);
      if (ends) { out.push(cur.trim()); cur = ""; }
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out.filter((s) => /[A-Za-z]/.test(s));
}

/** Words: a run of letters or digits with inner apostrophes, hyphens, commas and dots ($1,000.50, RCW 26.09.030 and a
    date are one word each); the end mark after a word is not part of it. A number is a word. */
export function words(text) {
  return (S(text).match(/[A-Za-z0-9$§][A-Za-z0-9'’$%,.-]*/g) || []).map((w) => w.replace(/[.,]+$/, "")).filter((w) => /[A-Za-z0-9]/.test(w));
}

/* ── syllables, without a dictionary ──────────────────────────────────────────────────────────────────────────────
   The rules, in order, each tested:
     1. an exception is answered from the list; an allowed term is one syllable
     2. a word with no letters (a number, a case number) is one syllable
     3. a leading y is a consonant (yes, your)
     4. a trailing -es is silent after any letter but s, x, z, ch, sh, c, g (names 1, boxes 2, pages 2)
     5. a trailing -ed is silent after any consonant but t and d (served 1, wanted 2, agreed 2)
     6. a trailing e is silent (file, decree, rule), unless the word is "the" or ends in consonant + le (table, people)
     7. a silent e in the middle of a compound before -ly -ful -ment -ness -less -some -thing -time -times -teen -ty
        -where -ward -ship is dropped (ninety, safety, statement, careful), unless it closes an -le syllable (settlement)
     8. a y between two vowels is a consonant (employee, player); a vowel group is one syllable: a e i o u y in a run
     9. two vowels that are two syllables: ia (trial), except after c, t or s (special, partial, Asia); io (prior,
        violin), except in -tion, -sion, -cious, -tious, -gion, -nion; ua (usual), except after g or q (guard, quality);
        ie before n (experience, audience), except after c, t, s or n (patient, ancient, convenient); a vowel before a
        final -ing (going, seeing, lying)
    10. never less than one */
const VOWEL_GROUPS = /[aeiouy]+/g;
export function syllables(word) {
  const raw = S(word).toLowerCase().replace(/[’']/g, "");
  const w = raw.replace(/[^a-z]/g, "");
  if (!w) return /[0-9]/.test(raw) ? 1 : 0;                             /* rule 2 */
  if (isAllowed(w)) return 1;                                             /* the court's noun, its plural or possessive: one */
  if (Object.prototype.hasOwnProperty.call(SYLLABLE_EXCEPTIONS, w)) return SYLLABLE_EXCEPTIONS[w]; /* rule 1 */
  let s = w.replace(/^y/, "");                                            /* rule 3 */
  const SUFFIX = "(?=(?:ly|ful|ment|ness|less|some|thing|times?|teen|ty|where|ward|ship)$)";
  s = s.replace(new RegExp("([aeiouy][^aeiouy]*[^aeiouyl])e" + SUFFIX), "$1"); /* rule 7: nine-ty, state-ment */
  s = s.replace(new RegExp("([aeiouy]l)e" + SUFFIX), "$1");               /* rule 7: sole-ly (a vowel, l, e); settle-ment keeps its le */
  if (/[^sxzcgh]es$/.test(s) && !/[cs]hes$/.test(s)) s = s.slice(0, -2);  /* rule 4: silent -es (clothes keeps th + es silent too) */
  else if (/thes$/.test(s)) s = s.slice(0, -2);
  if (/[^aeioutd]ed$/.test(s)) s = s.slice(0, -2);                        /* rule 5: silent -ed (stayed too: the y is a consonant there) */
  let extra = 0;
  if (/[^aeiouy]le$/.test(s) && s.length > 2) { extra += 1; s = s.slice(0, -2); } /* rule 6b: ta-ble */
  else if (/[^e]e$/.test(s) && s.length > 1) s = s.slice(0, -1);          /* rule 6: silent e (fee and agree keep their ee) */
  s = s.replace(/([aeiou])y(?=[aeiou])/g, "$1x");                         /* rule 8: em-ploy-ee */
  const groups = s.match(VOWEL_GROUPS) || [];
  let n = groups.length + extra;
  n += (s.match(/(?<![cts])ia/g) || []).length;                           /* rule 9: tri-al */
  n += (s.match(/(?<![cstgn])io(?!u)/g) || []).length;                    /* rule 9: pri-or, vi-o-lin; not -tion -sion -gion -nion -cious */
  n += (s.match(/(?<![gq])ua/g) || []).length;                            /* rule 9: u-su-al */
  n += (s.match(/(?<![ctsn])ie(?=n)/g) || []).length;                     /* rule 9: ex-pe-ri-ence */
  if (/[aeiouy]ing$/.test(s)) n += 1;                                     /* rule 9: go-ing */
  return Math.max(1, n);                                                  /* rule 10 */
}

/* ── passive voice ────────────────────────────────────────────────────────────────────────────────────────────────
   A marker is a form of "to be" followed by a past participle ("was served by", "is required", "has been filed").
   It is listed, never counted against the grade: a court paper says "the petition was filed" and means it. */
const IRREGULAR = "given|taken|told|made|sent|done|seen|known|written|held|paid|found|kept|left|lost|brought|bought|caught|taught|thought|said|heard|read|put|set|cut|shown|chosen|built|sold|met|led|fed|begun|broken|driven|eaten|fallen|forgotten|frozen|gotten|hidden|ridden|risen|spoken|stolen|torn|worn|won|understood|withdrawn|drawn|thrown|grown|known|sworn|born|dealt|felt|meant|sought|struck|hurt|shut|split|spread|bound|wound|struck|lent|spent|bent|sent";
const PASSIVE_RE = new RegExp("\\b(?:am|is|are|was|were|be|been|being|get|gets|got|gotten)\\s+(?:(?:not|never|also|then|already|still|only|first|later|duly|properly|personally)\\s+)?(?:[a-z]+(?:ed|en)|" + IRREGULAR + ")\\b(?:\\s+by\\b)?", "gi");
const NOT_PASSIVE = /^(?:am|is|are|was|were|be|been|being|get|gets|got|gotten)\s+(?:not\s+)?(?:the|a|an|one|two|three|no|more|less|most|few|many|some|any|only|also|then|already|still)$/i;
export function passiveMarkers(text) {
  const out = [];
  for (const m of S(text).matchAll(PASSIVE_RE)) {
    const hit = m[0].replace(/\s+/g, " ").trim();
    if (NOT_PASSIVE.test(hit)) continue;
    out.push(hit);
  }
  return out;
}

/* ── the hard words ─────────────────────────────────────────────────────────────────────────────────────────── */
export function hardWords(text) {
  const seen = new Set(); const out = [];
  for (const w of words(text)) {
    const k = w.toLowerCase().replace(/[^a-z]/g, "");
    if (!k || isAllowed(k) || seen.has(k)) continue;
    if (syllables(w) >= HARD_SYLLABLES) { seen.add(k); out.push(w); }
  }
  return out;
}

/* ── the reading ─────────────────────────────────────────────────────────────────────────────────────────────── */
const r1 = (n) => Math.round(n * 10) / 10;
/** The published formulas over counts. Null when there is nothing to read. */
export function fleschKincaid(wordCount, sentenceCount, syllableCount) {
  if (!wordCount || !sentenceCount) return null;
  return r1(0.39 * (wordCount / sentenceCount) + 11.8 * (syllableCount / wordCount) - 15.59);
}
export function readingEase(wordCount, sentenceCount, syllableCount) {
  if (!wordCount || !sentenceCount) return null;
  return r1(206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllableCount / wordCount));
}

/** One sentence's own reading: its words, its syllables, its grade (null under MIN_GRADED_WORDS), its passive markers. */
export function readSentence(sentence) {
  const text = S(sentence).trim();
  const ws = words(text);
  const syl = ws.reduce((n, w) => n + syllables(w), 0);
  return {
    text, words: ws.length, syllables: syl,
    grade: ws.length >= MIN_GRADED_WORDS ? fleschKincaid(ws.length, 1, syl) : null,
    gradeIfGraded: fleschKincaid(ws.length, 1, syl),
    hard: hardWords(text), passive: passiveMarkers(text),
  };
}

/** The whole reading of a passage. */
export function read(text) {
  const ss = sentences(text).map(readSentence);
  const wordCount = ss.reduce((n, s) => n + s.words, 0);
  const syllableCount = ss.reduce((n, s) => n + s.syllables, 0);
  const longest = ss.reduce((a, s) => (s.words > (a ? a.words : -1) ? s : a), null);
  return {
    sentences: ss, sentenceCount: ss.length, words: wordCount, syllables: syllableCount,
    grade: fleschKincaid(wordCount, ss.length, syllableCount),
    ease: readingEase(wordCount, ss.length, syllableCount),
    averageSentence: ss.length ? r1(wordCount / ss.length) : 0,
    longest: longest ? { text: longest.text, words: longest.words } : null,
    hard: hardWords(text), passive: ss.flatMap((s) => s.passive),
    english: looksEnglish(text),
  };
}

/** A rough tell that the text is English: most words are ASCII letters. The grade means nothing for Spanish. */
export function looksEnglish(text) {
  const ws = words(text); if (!ws.length) return true;
  const ascii = ws.filter((w) => /^[A-Za-z0-9'’$%.-]+$/.test(w)).length;
  const spanish = (S(text).match(/\b(?:el|la|los|las|usted|para|una|con|por|que|está|es|del|su)\b/gi) || []).length;
  return ascii / ws.length > 0.9 && spanish < Math.max(2, ws.length / 8);
}

/** The ceiling as a number: the firm's, else the product's; never below 1 or above 16. */
export function ceilingOf(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 16 ? r1(n) : DEFAULT_CEILING;
}

/* ── the verdict ───────────────────────────────────────────────────────────────────────────────────────────────
   A passage fails when any sentence runs past MAX_SENTENCE_WORDS, or when a sentence of MIN_GRADED_WORDS or more
   words reads above the ceiling, or when the passage as a whole does. Every failing sentence is named with its
   count and its grade so a person can fix that one. The passive list and the hard words ride along and never fail. */
export function verdict(text, { ceiling = DEFAULT_CEILING, maxWords = MAX_SENTENCE_WORDS } = {}) {
  const cap = ceilingOf(ceiling);
  const max = Number.isInteger(maxWords) && maxWords > 0 ? maxWords : MAX_SENTENCE_WORDS;
  const r = read(text);
  const over = r.sentences.filter((s) => s.words > max).map((s) => ({ text: s.text, words: s.words, grade: s.grade, why: `${s.words} words; the limit is ${max}` }));
  const high = r.sentences.filter((s) => s.grade != null && s.grade > cap).map((s) => ({ text: s.text, words: s.words, grade: s.grade, why: `grade ${s.grade.toFixed(1)}; the ceiling is ${cap.toFixed(1)}` }));
  const passageHigh = r.english && r.grade != null && r.words >= MIN_GRADED_WORDS && r.grade > cap;
  /* not English: the formula was built for English, so no grade is held against the words; the word limit still is */
  const ok = !over.length && (!r.english || (!high.length && !passageHigh));
  const nothing = r.words === 0;
  return {
    ok: nothing ? true : ok, empty: nothing, ceiling: cap, maxWords: max, english: r.english,
    grade: r.grade, ease: r.ease, words: r.words, sentences: r.sentenceCount, averageSentence: r.averageSentence,
    longest: r.longest, hard: r.hard, passive: r.passive, over, high: r.english ? high : [], passageHigh,
    line: verdictWords({ ok: nothing ? true : ok, nothing, grade: r.grade, cap, over, high, passageHigh, english: r.english }),
    allowed: ALLOWED_NOTE,
  };
}

function verdictWords({ ok, nothing, grade, cap, over, high, passageHigh, english }) {
  if (nothing) return "Nothing to read yet.";
  if (!english) return "This does not read as English, so the grade means nothing here.";
  const g = grade == null ? "no grade" : `grade ${grade.toFixed(1)}`;
  if (ok) return `Plain words: ${g}, under the ceiling of ${cap.toFixed(1)}.`;
  const parts = [];
  if (passageHigh) parts.push(`${g} as a whole, over the ceiling of ${cap.toFixed(1)}`);
  if (high.length) parts.push(`${high.length} sentence${high.length === 1 ? "" : "s"} over the ceiling`);
  if (over.length) parts.push(`${over.length} sentence${over.length === 1 ? "" : "s"} over ${MAX_SENTENCE_WORDS} words`);
  return `Plain words: ${parts.join("; ")}. A shorter sentence or a shorter word brings it down.`;
}

/* ── for the audit and the screen ─────────────────────────────────────────────────────────────────────────────── */
/** Every failing sentence of a passage with its reason, for a test that names the sentence and its file. */
export function failures(text, o = {}) {
  const v = verdict(text, o);
  const seen = new Set(); const out = [];
  for (const f of [...v.over, ...v.high]) { if (seen.has(f.text)) { const e = out.find((x) => x.text === f.text); e.why += "; " + f.why; continue; } seen.add(f.text); out.push({ ...f }); }
  return out;
}

export const WHY_NOTE = "Hard rule 5 says a client reads plain words at an eighth-grade level or below. That was a habit. This is the measure: the two Flesch formulas as published, a word limit per sentence, and the court's own nouns allowed, run over every sentence a portal shows and under the firm's own writing to a client. It never rewrites a sentence and never grades a person.";
export const PILL_NOTE = "The grade of what you are about to send, by the Flesch-Kincaid formula. It never blocks a message. The court's own nouns are not held against it.";

/** Words that must never appear in anything this file says; the suite greps every sentence. */
export const NEVER_SAY = [
  /\bearn(?:ed|s|ing)?\b/i, /\breward/i, /\bunlock/i, /\bstreak/i, /\bhurry\b/i, /don't miss/i, /before it'?s too late/i,
  /\bcongratulations\b/i, /we miss you/i, /don't go\b/i, /are you sure/i, /last chance/i, /before you go/i, /special offer/i, /we'd hate/i,
  /\bqualif\w*/i, /\bguarantee/i, /\byou should\b/i, /\bwill win\b/i,
];
export const neverSaid = (text) => NEVER_SAY.filter((re) => re.test(S(text))).map(String);

export const CITE = {
  grade: { words: "Flesch-Kincaid grade level: 0.39 × (words ÷ sentences) + 11.8 × (syllables ÷ words) − 15.59.", grade: GRADE, verify: "Kincaid, Fishburne, Rogers and Chissom (1975), as the engineer recalls it; the constants are checked by hand in the suite." },
  ease: { words: "Flesch reading ease: 206.835 − 1.015 × (words ÷ sentences) − 84.6 × (syllables ÷ words).", grade: GRADE, verify: "Flesch (1948), as the engineer recalls it; the constants are checked by hand in the suite." },
  ceiling: { words: `The product's ceiling is grade ${DEFAULT_CEILING.toFixed(1)} (lexos/CLAUDE.md hard rule 5). A firm sets its own.`, grade: GRADE, verify: "A product rule, not a law." },
  syllables: { words: "Syllables are counted by rule, without a dictionary, with the exceptions listed.", grade: GRADE, verify: "A heuristic: the count is right on common words and tested on a list; it is an estimate on rare ones." },
  grade_: GRADE,
  verify: "The grade is an estimate of reading level by a published formula. It is not a judgment of any person and not legal advice.",
};

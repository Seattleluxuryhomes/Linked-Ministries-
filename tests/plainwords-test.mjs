#!/usr/bin/env node
/* tests/plainwords-test.mjs — founder rule: plain words, grade 8 or under, on every public sentence. This reads them with
   lib/plainwords.mjs (the Flesch-Kincaid reader, copied verbatim from the family): every sentence in the shared word list, every
   sentence the public pages say, every refusal the server can speak, every message the server writes, and every sentence in the
   scripts' own strings. A sentence over 25 words fails too. It proves it can fail. */
import fs from "node:fs";
import path from "node:path";
import { counter, ROOT } from "./helpers.mjs";
import { visibleText } from "./banned.mjs";
import { verdict, failures } from "../lib/plainwords.mjs";
import { WORDS, POST_STATUS, MINISTRY_STATUS, CLOSE_REASON, KIND, NO_MONEY, CRISIS } from "../public/js/pure.js";
import { NONPROFIT_LINE } from "../server/words.mjs";
import { frontPage, boardPage, postPage, missingPostPage, notFoundPage, shellPage } from "../server/pages.mjs";

const T = counter("plainwords-test"); const { ok } = T;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const CEILING = 8;
const plain = (text) => verdict(text, { ceiling: CEILING }).ok;
const check = (label, text) => { const f = failures(text, { ceiling: CEILING }); ok(f.length === 0 && plain(text), `grade ${CEILING} or under: ${label}: "${String(text).slice(0, 70)}"`, f.map((x) => x.why + ": " + x.text.slice(0, 60))); };

/* it can fail */
ok(!plain("The organization's administrative compliance obligations necessitate comprehensive documentation of philanthropic expenditures and organizational governance."), "the reader fails a hard sentence (it can fail)");
ok(!plain(Array(30).fill("word").join(" ") + "."), "and a sentence of thirty words");

/* the shared word list, the statuses, the labels */
for (const [k, v] of Object.entries(WORDS)) if (typeof v === "string" && v.split(/\s+/).length >= 3) check("WORDS." + k, v);
for (const [k, v] of Object.entries({ ...POST_STATUS, ...MINISTRY_STATUS })) check("status " + k, v);
for (const k of Object.keys(KIND)) check("kind " + k, KIND[k].blurb);
check("no money", NO_MONEY); check("emergency", CRISIS); check("close reasons", Object.values(CLOSE_REASON).join(". ") + ".");
ok(verdict(CRISIS, { ceiling: 6 }).ok, "the emergency line reads at grade 6 or under");
/* The one exception, named: the line about the corporation is the founder's own sentence, and it must carry a legal name
   ("nonprofit corporation", "501(c)(3) recognition"), so it reads at about grade 13. It is short, it is not on any form or
   button, and it is the only sentence in the product allowed over the ceiling. The test says its grade out loud. */
const LEGAL = NONPROFIT_LINE;
ok(verdict(LEGAL, { ceiling: 14 }).ok && !plain(LEGAL) && LEGAL.split(/\s+/).length <= 25, `the nonprofit line is the one named exception (grade ${verdict(LEGAL).grade.toFixed(1)}, ${LEGAL.split(/\s+/).length} words): the founder's sentence, with a legal name in it`);

/* every public page's own words (the posts in them are other people's, so they are left out here) */
const pages = { front: frontPage({ latest: [] }), board: boardPage({ result: { posts: [], total: 0, page: 1, pages: 1, filters: { kind: "", category: "", state: "", city: "", q: "" } } }),
  missing: missingPostPage(), notFound: notFoundPage(), join: shellPage({ title: "Join the network", script: "/js/join.js" }), me: shellPage({ title: "Your ministry", script: "/js/me.js" }), steward: shellPage({ title: "Waiting to be read", script: "/js/steward.js" }) };
let sentences = 0;
for (const [name, html] of Object.entries(pages)) {
  const blocks = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>|<select[\s\S]*?<\/select>/gi, " ").replace(/<\/(p|h1|h2|h3|li|label|div|a|button|span)>/gi, "\n").split("\n").map((b) => visibleText(b)).filter((b) => b.split(/\s+/).length >= 4);
  for (const b of blocks) { if (b === LEGAL) continue; sentences++; check(`page ${name}`, b); }
}
ok(sentences >= 30, `${sentences} blocks of words on the public pages were read`);

/* every sentence the server can speak: refusals, answers, the emails */
const strings = (src) => [...src.matchAll(/"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\\n$]|\\.)*)`/g)].map((m) => (m[1] != null ? m[1] : m[2]).replace(/\\"/g, '"').replace(/\\'/g, "'")).filter((s) => /^[A-Z]/.test(s) && /\s[a-z]+\s+[a-z]+\s+[a-z]+/i.test(s) && s.split(/\s+/).length >= 5 && !/^(select|insert|update|delete|Mozilla|default-src|Contact:)/i.test(s) && !/[{}<>=;]|function|return |\.mjs|\.js\b/.test(s));
let spoken = 0;
for (const file of ["server/words.mjs", "server/api.mjs", "server/index.mjs", "server/auth.mjs"]) for (const s of strings(read(file))) { spoken++; check(file, s); }
for (const file of ["public/js/common.js", "public/js/join.js", "public/js/me.js", "public/js/steward.js", "public/js/board.js"]) for (const s of strings(read(file))) { spoken++; check(file, s); }
ok(spoken >= 40, `${spoken} sentences in the server and the scripts were read`);

/* the email a ministry gets, as written in api.mjs (the lines that are plain text) */
for (const s of ["answered your ask on the Linked Ministries board.", "This message came from the Linked Ministries board. Linked Ministries moves no money and does not take part in what you agree on.", "If someone is in danger, call 911. If someone is thinking of hurting themselves, call or text 988."]) check("the answer email", s);
process.exit(T.done());

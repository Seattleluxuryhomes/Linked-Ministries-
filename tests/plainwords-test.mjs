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
import { WORDS, POST_STATUS, MINISTRY_STATUS, CLOSE_REASON, KIND, NO_MONEY, CRISIS, STAY_SAFE, REPORT_REASONS } from "../public/js/pure.js";
import { signInEmail, answerEmail, inviteEmail, reportEmail } from "../server/emails.mjs";
import { NONPROFIT_LINE, IRS_PHRASE } from "../server/words.mjs";
import { receiptEmail } from "../server/emails.mjs";
import { takeDonationsPage, givingPage, givePage, ministryPage, frontPage, boardPage, postPage, missingPostPage, notFoundPage, shellPage, termsPage, privacyPage, postCard } from "../server/pages.mjs";

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
check("no money", NO_MONEY); check("stay safe", STAY_SAFE); check("report reasons", Object.values(REPORT_REASONS).join(". ") + "."); check("emergency", CRISIS); check("close reasons", Object.values(CLOSE_REASON).join(". ") + ".");
ok(verdict(CRISIS, { ceiling: 6 }).ok, "the emergency line reads at grade 6 or under");
/* The one exception, named: the line about the corporation is the founder's own sentence, and it must carry a legal name
   ("nonprofit corporation", "501(c)(3) recognition"), so it reads at about grade 13. It is short, it is not on any form or
   button, and it is the only sentence in the product allowed over the ceiling. The test says its grade out loud. */
const LEGAL = NONPROFIT_LINE;
ok(verdict(LEGAL, { ceiling: 14 }).ok && !plain(LEGAL) && LEGAL.split(/\s+/).length <= 25, `the nonprofit line is the one named exception (grade ${verdict(LEGAL).grade.toFixed(1)}, ${LEGAL.split(/\s+/).length} words): the founder's sentence, with a legal name in it`);

/* every public page's own words (the posts in them are other people's, and Scripture is the Bible's, so both are left out here) */
const gv = { door_open: true, registration_number: "WA-123456", registration_date: "2026-10-01", form990_url: null, money_cents: 106200, money_count: 5, in_kind_cents: 80000, in_kind_count: 1, granted_cents: 30000, granted_count: 1, paid_cents: 30000, months: Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, "0")}`, gifts_cents: 0, grants_cents: 0 })), grants: [{ recipient_name: "Alpha", recipient_kind: "ministry", page_slug: null, amount_cents: 30000, purpose: "x", status: "approved", voted_on: "2026-10-18", paid_on: null, doc_ref: "x", yes: 2, abstain: 1, no: 1 }] };
const pages = { giving: givingPage({ giving: gv }), givingClosed: givingPage({ giving: { ...gv, door_open: false, registration_number: null, registration_date: null, grants: [] } }), give: givePage({ open: true, notice: "notices@linkedm.example" }), giveClosed: givePage({ open: false }), takeDonations: takeDonationsPage({ notice: "notices@linkedm.example" }), ministry: ministryPage({ page: { slug: "alpha", name: "Alpha Table Ministry", city: "Seattle", state: "WA", live_at: "2026-10-18T10:00:00Z", live: { tagline: "x", about: "x", meets: [{ day: "Sundays", time: "9 am", place: "The hall" }], email: "a@b.example", website: "https://a.example", give_url: "https://pay.example/g", photos: [] } }, notice: "notices@linkedm.example", giving: { open: true } }), front: frontPage({ latest: [] }), board: boardPage({ result: { posts: [], total: 0, page: 1, pages: 1, filters: { kind: "", category: "", state: "", city: "", q: "" } } }),
  missing: missingPostPage(), notFound: notFoundPage(), terms: termsPage({ notice: "notices@linkedm.example" }), privacy: privacyPage({ notice: "notices@linkedm.example" }), termsNoAddress: termsPage({}),
  card: postCard({ id: "11111111-1111-4111-8111-111111111111", kind: "ask", category: "furniture", title: "x", body: "x", city: "Seattle", state: "WA", open_until: "2026-11-17", posted_at: "2026-10-18T10:00:00Z", ministry: "x", ministry_city: "Seattle", ministry_state: "WA" }), join: shellPage({ title: "Join the network", script: "/js/join.js" }), me: shellPage({ title: "Your ministry", script: "/js/me.js" }), steward: shellPage({ title: "Waiting to be read", script: "/js/steward.js" }) };
let sentences = 0;
for (const [name, html] of Object.entries(pages)) {
  const blocks = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>|<select[\s\S]*?<\/select>|<blockquote class="scripture[\s\S]*?<\/blockquote>/gi, " ").replace(/<\/(p|h1|h2|h3|li|label|div|a|button|span|td|th|tr|caption|figcaption)>/gi, "\n").split("\n").map((b) => visibleText(b)).filter((b) => b.split(/\s+/).length >= 4);
  for (const b of blocks) { if (b === LEGAL) continue; sentences++; check(`page ${name}`, b); }
}
{ /* the offline page is a plain file, so its sentences are read from the file itself */
  const off = read("public/offline.html"); const blocks = off.replace(/<svg[\s\S]*?<\/svg>|<head>[\s\S]*?<\/head>/gi, " ").replace(/<\/(p|h1|h2|li|a|span|div)>/gi, "\n").replace(/<[^>]+>/g, " ").split("\n").map((x) => x.replace(/\s+/g, " ").trim()).filter((x) => x.split(" ").length >= 3 && x !== "Linked Ministries linkedm.org");
  for (const b of blocks) { if (b === CRISIS) { check("offline page: the emergency line", b); continue; } sentences++; check("the offline page", b); }
  ok(blocks.length >= 3 && blocks.some((b) => /offline/.test(b)), "the offline page's words were read", blocks);
  ok(WORDS.offlineBody === "This phone cannot reach Linked Ministries right now. Nothing was sent and nothing was saved since the connection dropped." && blocks.includes(WORDS.offlineBody), "and they are the same words as the shared list, so the two cannot drift apart"); }
ok(sentences >= 120, `${sentences} blocks of words on the public pages were read`);

/* every sentence the server can speak: refusals, answers, the emails */
const strings = (src) => [...src.matchAll(/"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\\n$]|\\.)*)`/g)].map((m) => (m[1] != null ? m[1] : m[2]).replace(/\\"/g, '"').replace(/\\'/g, "'")).filter((s) => /^[A-Z]/.test(s) && /\s[a-z]+\s+[a-z]+\s+[a-z]+/i.test(s) && s.split(/\s+/).length >= 5 && !/^(select|insert|update|delete|Mozilla|default-src|Contact:)/i.test(s) && !/[{}<>=;]|function|return |\.mjs|\.js\b/.test(s));
let spoken = 0;
for (const file of ["server/words.mjs", "server/api.mjs", "server/index.mjs", "server/auth.mjs"]) for (const s of strings(read(file))) { if (s === IRS_PHRASE) continue; /* the IRS's own sentence, quoted exactly from its letter; shown only once IRS_LETTER_DATE is set (the second named exception) */ spoken++; check(file, s); }
for (const file of ["public/js/common.js", "public/js/page.js", "public/js/treasury.js", "public/js/eden.js", "public/js/join.js", "public/js/me.js", "public/js/steward.js", "public/js/board.js", "public/js/install.js"]) for (const s of strings(read(file))) { spoken++; check(file, s); }
ok(spoken >= 40, `${spoken} sentences in the server and the scripts were read`);

/* every email, as the server writes it: each sentence of the words that are ours (what a person typed is theirs) */
const ours = (text) => text.split("\n").filter((l) => l.trim() && !/^(Hello |Your post:|Post:|Link:|https?:|What they wrote:|They say |[A-Z][a-z]+ [A-Z][a-z]+ added you|To reply, write to|Their website:)/.test(l)).filter((l) => !/@/.test(l) || /Why you got this/.test(l));
let mailSentences = 0;
for (const [name, m] of Object.entries({ signIn: signInEmail("123456"), invite: inviteEmail({ inviter: "Alex", ministry: "Alpha Table", joinUrl: "https://linkedm.org/join" }),
  answer: answerEmail({ toContact: "Alex", fromMinistry: "Bravo House", place: "Spokane, WA", kind: "give", title: "Tables", words: "We need ten.", fromName: "Blake", fromEmail: "blake@bravo.example", phone: "", website: null }),
  report: reportEmail({ title: "Tables", ministry: "Alpha", reason: "scam", note: "", reporter: "", url: "https://linkedm.org/board/1", stewardUrl: "https://linkedm.org/review" }) })) {
  for (const l of ours(m.text)) { mailSentences++; check(`the ${name} email`, l.replace(/https?:\S+/g, "").replace(/\(linkedm\.org\)/g, "")); }
}
ok(mailSentences >= 15, `${mailSentences} lines of the four emails were read`);

/* what Eden says to a person (its system prompt is for the model and is not a public sentence; these are) */
{ const src = read("server/eden.mjs"); let n = 0; for (const m of src.matchAll(/words: (?:why === "scripture" \? )?"((?:[^"\\]|\\.)*)"/g)) { n++; check("Eden's words", m[1]); }
  check("Eden's mark", "Eden wrote this; read it before you use it."); ok(n >= 8, `${n} of Eden's own sentences were read`); }

/* the email a ministry gets, as written in api.mjs (the lines that are plain text) */
for (const s of ["answered your ask on the Linked Ministries board.", "This message came from the Linked Ministries board. The board moves no money, and Linked Ministries does not take part in what you agree on.", "If someone is in danger, call 911. If someone is thinking of hurting themselves, call or text 988."]) check("the answer email", s);
/* the receipt email, as the server writes it: the lines that are ours (what a person typed is theirs) */
{ let n = 0; const r = receiptEmail({ receiptNo: 12, donor: "Jordan Donor", amountCents: 102550, receivedOn: "2026-10-18", method: "check", notice: "notices@linkedm.example", base: "https://linkedm.org" });
  for (const l of r.text.split("\n").filter((x) => x.trim() && !/^(Hello |Receipt number:|Day it came in:|Amount:|How it came in:|Every gift and every grant is counted)/.test(x)).filter((x) => !/@/.test(x) || /Why you got this/.test(x))) { n++; check("the receipt email", l.replace(/https?:\S+/g, "").replace(/\(linkedm\.org\)/g, "")); }
  ok(n >= 3, `${n} lines of the receipt email were read`); }
process.exit(T.done());

#!/usr/bin/env node
/* tests/unit-test.mjs — the parts that need no server and no database: the shared lists, the boot guard (every refusal in words),
   the refusal words, the filters, the pages built with sample posts and escaped, the things no page may carry (a CDN, a tracker,
   AI, a price, a dollar sign, a word about taxes, red), the migration files that must never change, the licences of what ships,
   what was copied and from where (commons.json), and no key in the repository. Shaped on Behavioral Health's unit test. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { counter, ROOT } from "./helpers.mjs";
import { checkPage, visibleText, READ, SOURCE } from "./banned.mjs";
import { CATEGORIES, CATEGORY_IDS, KIND, KINDS, STATES, STATE_CODES, WORDS, dateWords, categoryLabel, NO_MONEY, CRISIS, POST_STATUS, MINISTRY_STATUS } from "../public/js/pure.js";
import { checkConfig } from "../server/config.mjs";
import { refusal, NONPROFIT_LINE, FILING_STATUS, FORMED, FLAGS, statusLine, receiptStatusLine, IRS_PHRASE, APPLIED_501C3, IRS_LETTER_DATE } from "../server/words.mjs";
import { receiptEmail } from "../server/emails.mjs";
import { deductibleAnswer, FOUNDER } from "../server/words.mjs";
import { BOARD } from "../server/board-members.mjs";
import { toCsv, cell, dollars } from "../lib/csv.mjs";
import { money, parseCents, receiptCode } from "../public/js/pure.js";
import { cleanFilters } from "../server/board.mjs";
import { dayLimits } from "../server/api.mjs";
import { frontPage, boardPage, postPage, missingPostPage, shellPage, notFoundPage, termsPage, privacyPage, e, postCard, MARK, ministryPage, givingPage, givePage, givingChart, FRONT_IMG } from "../server/pages.mjs";
import { noticeEmail } from "../lib/email.mjs";
import { signInEmail, answerEmail, inviteEmail, reportEmail } from "../server/emails.mjs";
import { TERMS, PRIVACY, DRAFT_LINE } from "../server/legal.mjs";
import { STAY_SAFE, REPORT_REASONS } from "../public/js/pure.js";
import { smtpUrlWithTimeouts } from "../server/mail.mjs";
import { normCode, normEmail, validEmail } from "../server/auth.mjs";
import { securityHeaders, POLICY } from "../server/headers.mjs";
import { problems as frozenProblems } from "../tools/freeze-migrations.mjs";
const { pool: unitPool } = await import("../server/db.mjs");

const T = counter("unit-test"); const { ok } = T;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const walk = (d, out = []) => { for (const en of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { if (en.name === "node_modules" || en.name.startsWith(".git")) continue; const p = path.join(d, en.name); en.isDirectory() ? walk(p, out) : out.push(p); } return out; };

/* ---- the lists ---- */
ok(CATEGORY_IDS.join() === "housing,food,clothing,transportation,volunteers,equipment,furniture,teaching_training,prayer,other", "the ten categories are the founder's, in order");
ok(!CATEGORIES.some(([id, label]) => /money|cash|donat|fund|gift|financ|tithe|dollar/i.test(id + label)), "and none of them is about money");
ok(categoryLabel("teaching_training") === "Teaching and training" && categoryLabel("housing") === "Housing", "a category has its plain label");
ok(KINDS.join() === "ask,give" && KIND.ask.button === "I can help" && KIND.give.button === "We need this", "an ask has the button 'I can help' and a give has 'We need this'");
ok(STATES.length === 51 && STATE_CODES.every((c) => /^[A-Z]{2}$/.test(c)) && STATE_CODES.includes("WA") && STATE_CODES.includes("DC"), "the states are the fifty and the District, in two capital letters");
ok(dateWords("2026-10-18") === "October 18, 2026" && dateWords("2026-01-05T23:59:00Z") === "January 5, 2026" && dateWords("") === "", "a date is read the way a person says it, the same on every machine");
ok(/no money/i.test(NO_MONEY) && /911/.test(CRISIS) && /988/.test(CRISIS) && CRISIS === "If someone is in danger, call 911. If someone is thinking of hurting themselves, call or text 988.", "the network says it moves no money, and the emergency line is the founder's words");
ok(!/published/i.test(JSON.stringify([POST_STATUS, MINISTRY_STATUS, WORDS])) && /Waiting for a person at Linked Ministries to read it/.test(POST_STATUS.waiting), "a poster is told 'Waiting for a person at Linked Ministries to read it' and nothing says 'published'");
ok(/^On the board/.test(POST_STATUS.public) && !/^On the board/.test(POST_STATUS.waiting) && !/^On the board/.test(POST_STATUS.draft), "'On the board' belongs to a public post alone");

/* ---- the one line the founder edits ---- */
ok(NONPROFIT_LINE === `Linked Ministries is ${FORMED ? "a Washington nonprofit corporation" : "forming as a Washington nonprofit corporation"}; its application for 501(c)(3) recognition is ${FILING_STATUS}.` && FILING_STATUS === "not yet filed" && FORMED === true, "the nonprofit line is built from one value, FILING_STATUS, in server/words.mjs");
{ const places = walk(".").filter((p) => /\.(mjs|js|html|css|json)$/.test(p) && !/^(tests|docs)\//.test(p) && !/package-lock/.test(p) && /application for 501\(c\)\(3\) recognition/.test(read(p)));
  ok(places.join() === path.join("server", "words.mjs"), "the sentence is written in one file only", places); }

/* ---- the boot guard, every refusal in words ---- */
const base = { LEXOS_ENV: "production", DATABASE_URL: "postgres://u:p@db.example.internal:5432/x", LEXOS_DB_TLS: "require", LEXOS_DB_TLS_UNVERIFIED: "attested:BenMorton:2026-10-18", LEXOS_INTERNAL_KEY: "a".repeat(64), LEXOS_SMTP_URL: "smtps://u:pw@smtp.example.org:465", LEXOS_MAIL_FROM: "Linked Ministries <board@linkedm.org>", LEXOS_PUBLIC_URL: "https://linkedm.org" };
ok(checkConfig(base).ok, "the settings DEPLOY.md gives pass the guard", checkConfig(base).fail);
for (const [what, patch, re] of [
  ["no DATABASE_URL", { DATABASE_URL: "" }, /DATABASE_URL is not set/], ["a short key", { LEXOS_INTERNAL_KEY: "short" }, /LEXOS_INTERNAL_KEY/], ["printing codes", { LEXOS_DEV_CODES: "1" }, /prints sign-in codes/],
  ["no way to send mail", { LEXOS_SMTP_URL: "" }, /no way to send a sign-in code/], ["a mail address that is not smtp", { LEXOS_SMTP_URL: "http://x.example" }, /smtp:\/\/ or smtps:\/\//], ["no From", { LEXOS_MAIL_FROM: "" }, /LEXOS_MAIL_FROM/],
  ["an http address", { LEXOS_PUBLIC_URL: "http://linkedm.org" }, /https/], ["no public address", { LEXOS_PUBLIC_URL: "" }, /LEXOS_PUBLIC_URL/], ["a policy that is not enforced", { LEXOS_CSP: "report-only" }, /enforce/],
  ["a short operator token", { KPI_READ_TOKEN: "tiny" }, /KPI_READ_TOKEN/], ["an unattested unverified database", { LEXOS_DB_TLS_UNVERIFIED: "" }, /attested/], ["a bad attestation", { LEXOS_DB_TLS_UNVERIFIED: "yes" }, /attested:<who>/],
]) { const r = checkConfig({ ...base, ...patch }); ok(!r.ok && r.fail.some((f) => re.test(f)), `the guard refuses ${what}, in words`, r.fail); }
ok(!checkConfig({ ...base, LEXOS_SMTP_URL: "smtps://u:secretpass@smtp.example.org:465", LEXOS_MAIL_FROM: "" }).fail.join(" ").includes("secretpass"), "and never prints the mail password");
ok(checkConfig({ LEXOS_ENV: "test", DATABASE_URL: "postgres://postgres:x@127.0.0.1:5432/t" }).ok, "a test host needs none of that");

/* ---- the refusal words ---- */
const pg = (message, hint, code = "P0001") => Object.assign(new Error(message), { code, hint });
ok(refusal(pg("last_lead", "A ministry always keeps one lead. Make someone else a lead first.")).status === 409 && /one lead/.test(refusal(pg("last_lead", "A ministry always keeps one lead. Make someone else a lead first.")).body.words), "the last lead is a 409 in the database's own words");
ok(refusal(pg("steward_required")).status === 403 && refusal(pg("open_until_too_far")).status === 422 && refusal(pg("post_frozen")).status === 409 && refusal(pg("not_waiting")).status === 409, "the steward rule, the 90-day rule, the frozen words and 'not waiting' each have a status");
ok(refusal(pg("something_new")).status === 422 && refusal(Object.assign(new Error("x"), { code: "23514" })).status === 422 && refusal(Object.assign(new Error("x"), { code: "42501" })).status === 403, "an unknown rule, a check and a permission each map to a calm refusal");
{ const r = refusal(Object.assign(new Error('relation "lm.people" does not exist at /srv/x.js'), { code: "XX000" })); ok(r.status === 500 && !/lm\.|people|srv/.test(JSON.stringify(r.body)), "an unexpected error says nothing about tables or files", r.body); }

/* ---- the filters, the day limits, the sign-in helpers ---- */
{ const f = cleanFilters({ kind: "ask", category: "food", state: "wa", city: "  Seattle ", q: "  tables  chairs ", page: "3" });
  ok(f.kind === "ask" && f.category === "food" && f.state === "WA" && f.city === "Seattle" && f.q === "tables  chairs" && f.page === 3, "filters are cleaned", f);
  const g = cleanFilters({ kind: "loan", category: "money", state: "ZZ", page: "-4", q: ["a", "b"] }); ok(g.kind === "" && g.category === "" && g.state === "" && g.page === 1 && g.q === "a", "an unknown value is dropped and a list is read as its first value", g);
  ok(cleanFilters({ page: "99999" }).page === 500 && cleanFilters({ q: "x".repeat(500) }).q.length === 120, "the page and the search are capped"); }
{ const l = dayLimits(Date.UTC(2026, 9, 18, 23, 59)); ok(l.today === "2026-10-18" && l.max === "2027-01-16", "today and the last day a post may stay open are 90 days apart, in UTC", l); }
ok(normCode("123 456") === "123456" && normCode("123-456") === "123456" && normCode("１２３４５６") === "123456", "a code typed with spaces, dashes or wide digits is the same six digits");
ok(normEmail("  Ben@Example.ORG ") === "ben@example.org" && validEmail("a@b.co") && !validEmail("a@b") && !validEmail("a b@c.de"), "an email is read in lower case and checked");
ok(["a,b@c.example", "a;b@c.example", '"x"<y>@z.example', "<a@b.example>", "a@b..example", "a@-b.example", "a@b.example\n", "a b@c.example", "a@b", "@b.example", "a@@b.example"].every((x) => !validEmail(x)) && ["a@b.co", "first.last+tag@sub.example.org", "o'neil@example.org"].every(validEmail), "an address has one strict shape: a list, a quoted name, an angle bracket and a line break are all refused");
ok(smtpUrlWithTimeouts("smtps://u:p@h:465").includes("connectionTimeout=15000"), "the mail connection has timeouts, so the truth arrives while someone is reading");

/* ---- the pages, built with sample posts ---- */
const sample = [
  { id: "11111111-1111-4111-8111-111111111111", kind: "ask", category: "furniture", title: "Ten folding tables, please", body: "We need ten tables for the Saturday meal.\nNear the church.", city: "Seattle", state: "WA", open_until: "2026-11-17", posted_at: "2026-10-18T10:00:00Z", ministry: "Alpha Table Ministry", ministry_city: "Seattle", ministry_state: "WA" },
  { id: "22222222-2222-4222-8222-222222222222", kind: "give", category: "food", title: "Surplus canned goods", body: "Forty cases to give away.", city: "Tacoma", state: "WA", open_until: "2026-11-02", posted_at: "2026-10-17T10:00:00Z", ministry: "Gamma Outreach", ministry_city: "Seattle", ministry_state: "WA" },
];
const samplePage = { slug: "alpha-table-ministry", name: "Alpha Table Ministry", city: "Seattle", state: "WA", live_at: "2026-10-18T10:00:00Z", live: { tagline: "A hot meal every Saturday", about: "We serve a hot meal every Saturday.\nEveryone is welcome.", meets: [{ day: "Saturdays", time: "12:00 pm", place: "Grace Hall" }], email: "hello@alpha.example", phone: "206-555-0100", website: "https://alpha.example.org", give_url: "https://pay.alpha.example/give", verse: "heb_13_2", photos: [{ id: "33333333-3333-4333-8333-333333333333", alt: "Tables" }] } };
const months = Array.from({ length: 12 }, (_, i) => ({ month: `${i < 3 ? 2026 : 2025}-${String(((i + 9) % 12) + 1).padStart(2, "0")}`, gifts_cents: i === 11 ? 106200 : i * 1000, grants_cents: i === 11 ? 30000 : 0 })).sort((a, b) => a.month.localeCompare(b.month));
const sampleGiving = { door_open: false, registration_number: null, registration_date: null, form990_url: null, money_cents: 106200, money_count: 5, in_kind_cents: 80000, in_kind_count: 1, granted_cents: 30000, granted_count: 1, paid_cents: 30000, months,
  grants: [{ recipient_name: "Alpha Table Ministry", recipient_kind: "ministry", page_slug: "alpha-table-ministry", amount_cents: 30000, purpose: "Help with a van for the Saturday meals", status: "paid", voted_on: "2026-10-18", paid_on: "2026-10-19", doc_ref: "Minutes of the board, item 4", yes: 2, abstain: 1, no: 0 }] };
const result = (posts, filters = {}) => ({ posts, total: posts.length, page: 1, pages: 1, filters: { kind: "", category: "", state: "", city: "", q: "", ...filters } });
const built = {
  front: frontPage({ latest: sample }), frontEmpty: frontPage({ latest: [] }), board: boardPage({ result: result(sample) }), boardEmpty: boardPage({ result: result([]) }),
  boardFiltered: boardPage({ result: result([], { kind: "ask", q: "zebra" }) }), post: postPage({ post: sample[0] }), missing: missingPostPage(), notFound: notFoundPage(),
  giving: givingPage({ giving: sampleGiving }), givingOpen: givingPage({ giving: { ...sampleGiving, door_open: true, registration_number: "WA-123456", registration_date: "2026-10-01", form990_url: "https://example.org/990.pdf" } }), givingEmpty: givingPage({ giving: { ...sampleGiving, money_cents: 0, money_count: 0, in_kind_count: 0, granted_cents: 0, granted_count: 0, paid_cents: 0, grants: [], months: months.map((m) => ({ ...m, gifts_cents: 0, grants_cents: 0 })) } }), give: givePage({ open: false }), giveOpen: givePage({ open: true, notice: "notices@linkedm.example" }), ministry: ministryPage({ page: samplePage, notice: "notices@linkedm.example" }), ministryOpen: ministryPage({ page: samplePage, giving: { open: true } }), ministryPreview: ministryPage({ page: samplePage, preview: true }), terms: termsPage({ notice: "notices@linkedm.example" }), privacy: privacyPage({ notice: "notices@linkedm.example" }), termsNoAddress: termsPage({}),
  join: shellPage({ title: "Join the network", script: "/js/join.js", nav: "join" }), me: shellPage({ title: "Your ministry", script: "/js/me.js", nav: "me" }), steward: shellPage({ title: "Waiting to be read", script: "/js/steward.js" }),
};
for (const [name, html] of Object.entries(built)) {
  const bad = checkPage(html, { money: /^(giving|give|ministryOpen|front)/.test(name) }); ok(bad.length === 0, `page ${name}: nothing banned, no inline script, no style attribute, no other host, never tax-deductible or write-off`, bad);
  ok(html.includes(NONPROFIT_LINE) && html.includes("If someone is in danger, call 911. If someone is thinking of hurting themselves, call or text 988."), `page ${name}: the nonprofit line and the emergency line are in the footer`);
  ok(/<title>[^<]{3,}<\/title>/.test(html) && /<meta name="viewport"/.test(html) && /<html lang="en">/.test(html) && /<meta name="color-scheme" content="light">/.test(html), `page ${name}: a title, a viewport, a language and a light colour scheme`);
  ok(/Linked Ministries/.test(html) && /<svg class="mark"/.test(html), `page ${name}: the name and the mark`);
}
ok(built.front.includes('href="https://www.disciplesauthority.org"') && /Sober-living housing/.test(built.front) && /Planned/.test(built.front) && /free, 24-week/.test(built.front), "the front links Disciples' Authority and says sober-living housing is planned");
ok(/Join the network/.test(built.front) && /href="\/board"/.test(built.front) && /Latest on the board/.test(built.front), "the front has the board's latest and 'Join the network'");
ok(!/data-answer|I can help|We need this/.test(built.front), "the front's posts are read-only: no answer button");
ok(/I can help/.test(built.board) && /We need this/.test(built.board) && (built.board.match(/data-answer=/g) || []).length === 2, "on the board an ask has 'I can help' and a give has 'We need this', one button each");
ok(/October 18, 2026/.test(built.board) && /Open until November 17, 2026/.test(built.board) && /Alpha Table Ministry/.test(built.board) && /Seattle, WA/.test(built.board), "a post shows when it was posted, until when it is open, and the ministry's name and city");
ok(/<span class="label">Where<\/span> Tacoma, WA/.test(built.board) && !/<span class="label">Where<\/span> Seattle/.test(built.board), "and where it is, only when that differs from the ministry's city");
ok(["Asks", "Gives", "Housing", "Food", "Clothing", "Transportation", "Volunteers", "Equipment", "Furniture", "Teaching and training", "Prayer", "Other"].every((w) => built.board.includes(w)) && /name="state"/.test(built.board) && /name="city"/.test(built.board) && /type="search"/.test(built.board) && /method="get"/.test(built.board), "the board's filters: kind, the ten categories, state, city and a search box, as a plain GET form");
ok(/No posts match/.test(built.boardFiltered) && /Clear/.test(built.boardFiltered) && /Nothing is on the board yet/.test(built.boardEmpty), "an empty board and an empty search each say so in words");
{ const evil = { ...sample[0], title: '<script>alert("x")</script>', body: '"><img src=x onerror=alert(1)>', ministry: "<b>Bold</b> & Co" };
  const html = postCard(evil); ok(!/<script>|<img |<b>/.test(html) && html.includes("&lt;script&gt;") && html.includes("&amp; Co"), "what a person typed is escaped: text is never markup"); ok(e("a<b>&\"'") === "a&lt;b&gt;&amp;&quot;&#39;", "the escape covers < > & and both quotes"); }
ok(!/<script(?![^>]*src)/.test(built.me) && /<script type="module" src="\/js\/me\.js">/.test(built.me) && /<noscript>/.test(built.me), "the signed-in pages are a shell and one script, with a plain note if scripts are off");
{ const m = built.board.match(/<main[\s\S]*<\/main>/)[0]; ok(!/\bred\b|alarm|danger-zone|error-red/i.test(m), "no alarm styling on the board"); }


/* ---- a ministry's own page: built whole on the server, escaped, honest about the giving door ---- */
{ const m = built.ministry, o = built.ministryOpen, pv = built.ministryPreview;
  ok(/<h1>Alpha Table Ministry<\/h1>/.test(m) && /A hot meal every Saturday/.test(m) && /Grace Hall/.test(m) && /mailto:hello@alpha\.example/.test(m) && /tel:2065550100/.test(m) && /Hebrews 13:2/.test(m), "a ministry page shows the name, the line, where it meets, how to reach it and the verse the ministry chose");
  ok(!/Give to Alpha/.test(m) && !/pay\.alpha\.example/.test(m) && /Give to Alpha Table Ministry/.test(o) && /href="https:\/\/pay\.alpha\.example\/give"/.test(o) && /This link is Alpha Table Ministry's own/.test(o) && /does not collect or see a gift/.test(o), "the Give button is there only when the giving door is open, goes to the ministry's own link, and says whose link it is");
  ok(/Only your ministry can see this/.test(pv) && /noindex/.test(pv) && !/noindex/.test(m) && /read this page on October 18, 2026/.test(m) && /does not check or vouch/.test(m), "a preview is marked private and not indexed; a public page says a person read it and that Linked Ministries does not vouch");
  ok(/og:type" content="profile"/.test(m) && /og:image" content="\/photos\/33333333-3333-4333-8333-333333333333"/.test(m) && /<title>Alpha Table Ministry · Linked Ministries<\/title>/.test(m), "its share card is its own: its title and its first picture");
  const evil = ministryPage({ page: { ...samplePage, name: "<b>X</b> & Co", live: { ...samplePage.live, about: '<script>alert(1)</script>"><img src=x onerror=alert(1)>', website: 'https://a.example/"><script>x</script>', verse: "not_a_key" } } });
  ok(!/<script>alert|<b>X|<img src=x/.test(evil) && /&lt;script&gt;alert/.test(evil), "a ministry's words are escaped: text is never markup");
  ok(!/blockquote class="scripture/.test(evil.replace(/<footer[\s\S]*<\/footer>/, "")), "a verse key the file does not hold shows nothing: never a guess"); }

/* ---- giving: where the money went, the door, the flags, the receipt (founder, 2026-10-18: safe and transparent) ---- */
{ const t = (h) => visibleText(h).split(NONPROFIT_LINE).join(" ");
  const g = built.giving, o = built.givingOpen, em = built.givingEmpty;
  ok(money(106200) === "$1,062.00" && money(5) === "$0.05" && money(-2550) === "-$25.50" && money(100000000) === "$1,000,000.00" && parseCents("1,062.5") === 106250 && parseCents("20") === 2000 && parseCents("$3.07") === 307 && parseCents("1.234") === null && parseCents("-5") === null && parseCents("") === null && parseCents("abc") === null && parseCents("12345678901") === null, "money is whole cents, shown and read with integer maths: never a floating-point number");
  ok(receiptCode(1) === "LM-000001" && receiptCode(123456) === "LM-123456", "a receipt number looks like LM-000001");
  ok(/Where the money went/.test(g) && /Linked Ministries is not taking gifts online yet/.test(g) && /has not finished that registration/.test(g) && !/href="\/give"/.test(g) && !/class="btn"[^>]*>Give</.test(g), "with the door closed the page says so, says why (the registration), and has no Give button");
  ok(/href="\/give"/.test(o) && !/not taking gifts online yet/i.test(t(o)) && /WA-123456/.test(o) && /October 1, 2026/.test(o) && /href="https:\/\/example\.org\/990\.pdf"/.test(o), "with the door open it has the Give button, the registration and the Form 990 link");
  ok(/\$1,062\.00/.test(g) && /5 gifts/.test(g) && /\$300\.00/.test(g) && /1 gift of goods or services, worth \$800\.00/.test(t(g)) && /Alpha Table Ministry/.test(g) && /2 yes, 1 abstained/.test(t(g)) && /Paid on October 19, 2026/.test(t(g)), "the totals, the count, the grant with its vote counts and its payment day are on the page");
  ok(!/Ann Board|Jordan|@/.test(g), "no name of a person is on it");
  ok((g.match(/<rect x=/g) || []).length === 24 && /<svg class="chart"[^>]*role="img"/.test(g) && /aria-label="Bar chart of the last twelve months/.test(g) && (g.match(/<tr><th scope="row">/g) || []).length === 12, "the chart is 24 bars drawn inline as SVG with a spoken label, and the same twelve months are in a table");
  ok(/No grants yet/.test(em) && /\$0\.00/.test(em) && !/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[1-9]/.test(givingChart(months.map((m) => ({ ...m, gifts_cents: 0, grants_cents: 0 })))), "with nothing yet the page says so and the chart draws no bar");
  ok(/Not taking gifts online yet/.test(built.give) && !/<form|<input/.test(built.give) && /not connected yet/.test(built.giveOpen) && !/<form|<input/.test(built.giveOpen) && /Nothing can be sent or saved on this page/.test(built.giveOpen), "/give says the payment service is not connected, and has no form to fake it");
  /* the flags */
  ok(FORMED === true && APPLIED_501C3 === false && IRS_LETTER_DATE === "" && FLAGS.APPLIED_501C3 === false, "today: the Secretary of State shows the corporation Active (founder, 2026-10-20), so formed; the application is not filed; there is no IRS letter");
  ok(statusLine({ FORMED: false, APPLIED_501C3: false, IRS_LETTER_DATE: "" }) === "Linked Ministries is forming as a nonprofit in Washington. Linked Ministries has not applied for 501(c)(3) status yet." && statusLine({ FORMED: true, APPLIED_501C3: true, IRS_LETTER_DATE: "" }) === "Linked Ministries is a nonprofit in Washington. Linked Ministries has applied for 501(c)(3) status." && statusLine({ FORMED: true, APPLIED_501C3: true, IRS_LETTER_DATE: "2027-03-02" }) === "Linked Ministries is a nonprofit in Washington. Linked Ministries is recognized under 501(c)(3), letter dated March 2, 2027.", "the status line has three states, and says only what is true in each");
  const L = { FORMED: true, APPLIED_501C3: true, IRS_LETTER_DATE: "2027-03-02" }, A = { FORMED: true, APPLIED_501C3: true, IRS_LETTER_DATE: "" };
  const withLetter = givingPage({ giving: sampleGiving, flags: L }), withApplied = givingPage({ giving: sampleGiving, flags: A });
  ok(/recognized under 501\(c\)\(3\), letter dated March 2, 2027/.test(withLetter) && withLetter.includes(IRS_PHRASE) === false, "with a dated IRS letter the giving page says the letter's date");
  ok(/has applied for 501\(c\)\(3\) status/.test(withApplied) && !/deduct|tax|write-off/i.test(t(withApplied)), "with the application filed it says so, and still says nothing about deductions");
  ok(!/tax[- ]deductible|write[- ]?off/i.test(g + o + em + withLetter + withApplied + built.front + built.terms + built.privacy), "'tax-deductible' and 'write-off' are on no page");
  const rc = (flags) => receiptEmail({ receiptNo: 12, donor: "Jordan Donor", amountCents: 102550, receivedOn: "2026-10-18", method: "check", notice: "notices@linkedm.example", base: "https://linkedm.org", flags });
  const r0 = rc(FLAGS), rA = rc(A), rL = rc(L);
  ok(r0.subject === "Receipt LM-000012 from Linked Ministries" && /Why you got this:/.test(r0.text) && /Receipt number: LM-000012/.test(r0.text) && /Day it came in: October 18, 2026/.test(r0.text) && /Amount: \$1,025\.50/.test(r0.text) && /How it came in: Check/.test(r0.text) && /https:\/\/linkedm\.org\/giving/.test(r0.text) && !/[\r\n]/.test(r0.subject), "the receipt says why it was sent, the number, the day, the amount, how it came in, and where the public record is");
  ok(/has not applied for 501\(c\)\(3\) status yet; this receipt is a record of your gift\./.test(r0.text) && /has applied for 501\(c\)\(3\) status; this receipt is a record of your gift\./.test(rA.text) && !/deduct|tax|write-off/i.test(r0.text + rA.text), "until the IRS letter is dated the receipt says only what is true about the application, 'this receipt is a record of your gift', and nothing about deductions");
  ok(/recognized under 501\(c\)\(3\), letter dated March 2, 2027/.test(rL.text) && rL.text.includes(IRS_PHRASE) && /Donors may deduct contributions to you as provided in section 170 of the Code\./.test(rL.text), "once the letter is dated, the receipt says so, with the IRS's own sentence and no other");
  ok(!/Hello Anonymous/.test(receiptEmail({ receiptNo: 1, donor: "Anonymous", amountCents: 100, receivedOn: "2026-10-18", method: "cash", notice: "", base: "https://linkedm.org", flags: FLAGS }).text), "an anonymous donor is not greeted by that word");
  /* nowhere in the code or the words, outside the one gated sentence */
  const offenders = walk(".").filter((p) => /\.(mjs|js|html|css|json|sql|md|yml|example)$/.test(p) && !/^tests\//.test(p) && !/package-lock/.test(p) && /tax[- ]deductible|write[- ]?offs?\b/i.test(read(p)));
  ok(offenders.length === 0, "the words 'tax-deductible' and 'write-off' are in no file of the repository (the tests name them to ban them)", offenders);
  ok(read("server/words.mjs").split("IRS_PHRASE").length >= 3 && walk(".").filter((p) => /\.(mjs|js)$/.test(p) && !/^tests\//.test(p) && /Donors may deduct/.test(read(p))).join() === path.join("server", "words.mjs"), "the IRS's own sentence is written in one file only, and is shown only when IRS_LETTER_DATE is set");
  /* the spreadsheet */
  ok(cell("=SUM(A1)") === '"\'=SUM(A1)"' && cell("+1+2") === '"\'+1+2"' && cell("@cmd") === '"\'@cmd"' && cell("-5+cmd") === '"\'-5+cmd"' && cell("-25.50") === '"-25.50"' && cell('say "hi"') === '"say ""hi"""' && cell(null) === '""', "a cell that a spreadsheet would run as a formula gets a quote mark; a plain negative number does not; quotes are doubled");
  ok(toCsv(["a", "b"], [["x", "=y"]]) === '"a","b"\r\n"x","\'=y"\r\n' && dollars(102550) === "1025.50" && dollars(-5) === "-0.05" && dollars(0) === "0.00" && dollars(100000000000) === "1000000000.00", "a CSV has a header, quoted cells and exact dollars from whole cents"); }

/* ---- the front page, complete (founder, 2026-10-18: "couldn't this be more complete") ---- */
{ const f = built.front, t = (h) => visibleText(h).split(NONPROFIT_LINE).join(" ");
  const withBoard = frontPage({ latest: sample, notice: "notices@linkedm.example", board: [{ name: "Ada Example", role: "Chair" }, { name: "Ben Example", role: "" }] }), withNotice = frontPage({ latest: sample, notice: "notices@linkedm.example" });
  for (const id of ["who", "questions"]) ok(new RegExp(`<section class="band[^"]*" id="${id}">`).test(f), `the front has its "${id}" section`);
  ok(/<h2>Who we are<\/h2>/.test(f) && t(f).includes(`It was started by ${FOUNDER}.`) && FOUNDER === "Ben Morton" && /is a nonprofit in Washington/.test(f) && !/forming as a nonprofit/.test(f) && /The network\.<\/strong>/.test(f) && /Disciples(&#39;|') Authority\.<\/strong>/.test(f) && /Housing\.<\/strong>/.test(f) && /planned, and it is not open yet/.test(f), "Who we are: a Washington nonprofit, started by Ben Morton, with its three works: the network, Disciples' Authority, and housing that is planned");
  ok(!/\b(born|raised|years of experience|decades|pastor|minister of|ordained|served as|graduated|degree)\b/i.test(t(f)), "and claims no biography about the founder");
  ok((f.match(/<div class="faq">[\s\S]*?<\/div>\n?<\/div><\/section>/) || [""])[0].split("<h3>").length - 1 === 6 && ["Is it free?", "Who reads my post?", "Does money change hands?", "Can my ministry get a page?", "How do gifts work?", "Is my gift deductible?"].every((q) => f.includes(`<h3>${q}</h3>`)), "Questions: the six real ones, in order");
  ok(/They are real people\. Nothing goes up until one of them has read it/.test(f) && /The board moves no money between ministries/.test(f) && /Every grant is shown on the giving page/.test(f) && /Gifts online open after the state registration is filed/.test(f), "and each answer says what is true");
  ok(deductibleAnswer(FLAGS)[0] === "Not yet. Linked Ministries has not applied for 501(c)(3) status yet." && /do not count a gift as deductible/.test(deductibleAnswer(FLAGS)[1]) && deductibleAnswer(FLAGS).at(-1) === "We cannot give tax advice. Ask your own tax adviser.", "'Is my gift deductible?' answers 'Not yet' today, says not to count it, and gives no tax advice");
  ok(/has applied for 501\(c\)\(3\) status\. The IRS has not answered/.test(deductibleAnswer({ FORMED: true, APPLIED_501C3: true, IRS_LETTER_DATE: "" })[0]) && !deductibleAnswer({ FORMED: true, APPLIED_501C3: true, IRS_LETTER_DATE: "" }).join(" ").includes(IRS_PHRASE) && deductibleAnswer({ FORMED: true, APPLIED_501C3: true, IRS_LETTER_DATE: "2027-03-02" }).includes(IRS_PHRASE), "with the application filed it says the IRS has not answered; the IRS's sentence appears only when the letter is dated");
  ok(!/tax-deductible|write-off/i.test(f + frontPage({ latest: [], flags: { FORMED: true, APPLIED_501C3: true, IRS_LETTER_DATE: "" } })), "the front never says 'tax-deductible' or 'write-off'");
  ok(BOARD.length === 0 && !/Our board of directors/.test(f) && !/id="directors"/.test(f), "no directors have been given, so there is no board section and no placeholder");
  ok(/<h2>Our board of directors<\/h2>/.test(withBoard) && /<strong>Ada Example<\/strong><span class="quiet">Chair<\/span>/.test(withBoard) && /<strong>Ben Example<\/strong><\/li>/.test(withBoard), "when the founder gives names, the section lists each by name and role");
  ok(!/id="contact"/.test(f) && /id="contact"/.test(withNotice) && /href="mailto:notices@linkedm\.example"/.test(withNotice), "Contact shows the notice address when there is one, and nothing when there is none");
  const verses = (f.match(/<blockquote class="scripture/g) || []).length; ok(verses >= 7 && (f.match(/<cite>[^<]+ \(KJV\)<\/cite>/g) || []).length === verses, `every verse on the front carries its chapter and verse (${verses} of them)`);
  ok(/Giving<\/h2>/.test(f) && /href="\/giving"/.test(f) && /Latest on the board/.test(f) && /What we run<\/h2>/.test(f), "Giving (linking to /giving), What we run and the latest posts stay");
  for (const [k, im] of Object.entries(FRONT_IMG)) { const b = fs.readFileSync(path.join(ROOT, "public", im.src)); ok(b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" && b.readUInt32BE(16) === im.w && b.readUInt32BE(20) === im.h && b.length < 300 * 1024, `the front's ${k} picture is a real PNG of the stated size, under 300 KB (${b.length} bytes), made by tools/make-front-shots.mjs`); }
  ok(f.includes(`src="${FRONT_IMG.ministry.src}"`) && f.includes(`src="${FRONT_IMG.post.src}"`) && /Screenshots of this site, with a sample ministry\./.test(f) && !/<svg class="art"/.test(f), "the hero shows the two screenshots, says they are samples, and the line drawing is gone");
  ok(/alt="A ministry's own page, on a phone/.test(f) && /alt="A post on the board, on a phone/.test(f), "each picture has words that describe it"); }

/* ---- what a lawyer will ask about, answered in code (founder, 2026-10-18: nothing we can be sued for) ---- */
{
  const all = { ...built }; const text = (h) => visibleText(h).split(NONPROFIT_LINE).join(" ");
  for (const [name, html] of Object.entries(all)) {
    ok(/href="\/terms"/.test(html) && /href="\/privacy"/.test(html), `page ${name}: the footer links the terms and the privacy page`);
    if (/^(giving|give|front)/.test(name)) continue;   /* the giving pages are about money; the rule for them is below */
    /* "donation" is allowed since 2026-10-30: the Make a donation button sits in the top bar while the giving door is open (tests/banned.mjs) */
    ok(!/501\(c\)|tax|deduct|exempt|charitable|tithe/i.test(text(html)), `page ${name}: no claim of nonprofit status, no word about taxes, no tithe`, text(html).match(/501\(c\)|tax\w*|deduct\w*|exempt|charitable|tithe/i));
  }
  ok(built.front.includes("is a Washington nonprofit corporation") && !built.front.includes("forming as a Washington nonprofit corporation") && built.front.includes("not yet filed"), "the footer says the corporation is formed and the application is not filed");
  for (const name of ["terms", "privacy"]) { const main = built[name].match(/<main[\s\S]*?<\/main>/)[0]; ok(main.startsWith(`<main id="main" tabindex="-1">\n<div class="wrap prose">\n<p class="draft">${DRAFT_LINE}</p>\n<h1>`), `/${name} begins with the line: ${DRAFT_LINE}`); }
  const T = text(built.terms), P = text(built.privacy);
  ok(/free board/.test(T) && /is a Washington nonprofit corporation/.test(T) && !/forming as a Washington nonprofit corporation/.test(T), "the terms say what the service is: a free board, run by a Washington nonprofit corporation");
  ok(/do not check or vouch for any ministry or person/.test(T) && /The board moves no money/.test(T) && /do not promise that any ask will be met/.test(T), "the terms say Linked Ministries does not check or vouch for anyone, moves no money, and does not promise an ask is met");
  ok(/18 or older/.test(T) && /No one under 18 may post/.test(T) && /not for anyone under 18/.test(P), "the terms and the privacy page say the service is for ministries and adults, and no one under 18 posts");
  ok(/Stay safe: meet in a public place, bring someone with you, and never send money/.test(T) && /911/.test(T) && /988/.test(T), "the terms carry the stay-safe line and the 911 and 988 line");
  ok(/Copyright and takedown/.test(T) && /notices@linkedm\.example/.test(T) && /good faith/.test(T) && /sign it with your name/i.test(T) && /close the post while we look/.test(T), "the terms give a notice address and a way to send a takedown by email, and say what the notice holds");
  ok(/Report on a post/.test(T) && /Nothing is hidden when a report comes in/.test(T), "the terms say a report hides nothing until a steward acts");
  ok(/href="mailto:notices@linkedm\.example"/.test(built.terms) && /href="mailto:notices@linkedm\.example"/.test(built.privacy) && !/mailto:/.test(built.termsNoAddress) && /the address on any email we send you/.test(built.termsNoAddress), "the notice address is a mail link; with none set the page says where to find one, and invents none");
  ok(/email address and your name/.test(P) && /ministry's page/.test(P) && /posts/.test(P) && /Answers you send and get/.test(P), "the privacy page says what is stored: email, name, the ministry's page, posts, answers");
  ok(/Anyone can see a public post/.test(P) && /contact email is never on the board/.test(P) && /one email/.test(P), "and who sees what: public posts are public, the contact email only reaches an answerer by email");
  ok(/do not track you/.test(P) && /do not sell or rent your data/.test(P) && /show no ads/.test(P) && /one cookie/.test(P), "and that there is no tracking, no sale of data, no advertising, and one cookie");
  ok(/Delete my account/.test(P) && /Download my data/.test(P) && /write to <a href="mailto:notices@linkedm.example">notices@linkedm.example<\/a>, and we will do it/.test(built.privacy), "and how to delete an account and its data, by one press or one email, and how to take a copy");
  ok(!/\d+(,\d{3})* (dollars|users|ministries)\b/.test(T + P), "no number is claimed in the legal pages");
  /* every post, everywhere, says to stay safe and can be reported */
  const front = frontPage({ latest: sample }), board = boardPage({ result: result(sample) }), one = postPage({ post: sample[0] });
  for (const [name, html] of [["front", front], ["board", board], ["post", one]]) {
    const cards = (html.match(/<article class="post/g) || []).length, safe = (html.match(new RegExp(STAY_SAFE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length, rep = (html.match(/data-report="/g) || []).length;
    ok(cards >= 1 && safe === cards && rep === cards, `${name}: each of the ${cards} posts carries the stay-safe line and a Report link`, { cards, safe, rep });
  }
  ok(/class="reportlink" href="\/board\/[^"]+#report"/.test(front) && !/data-answer/.test(front), "on the front, Report is a plain link to the post's own page");
  ok(/<h1 class="post-title">/.test(one) && !/<h3 class="post-title">/.test(one) && /<h3 class="post-title"><a /.test(board), "a post page has its title as the page heading, and on the board each title is a link");
  /* the mark: drawn inline, small, gold on ink, the same file as the icon */
  ok(Buffer.byteLength(MARK) < 2048 && /#1b2430/.test(MARK) && /#d97706/.test(MARK) && Buffer.byteLength(read("public/img/icon.svg")) < 2048 && /#d97706/.test(read("public/img/icon.svg")), "the mark is under 2 KB, gold on ink, inline in every page and in the icon file", Buffer.byteLength(MARK));
  /* share card and icons */
  { const png = fs.readFileSync(path.join(ROOT, "public/img/share.png")); ok(png.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630 && png.length < 150 * 1024, `the share card is a 1200 by 630 PNG under 150 KB (${png.length} bytes)`);
    const ico = fs.readFileSync(path.join(ROOT, "public/favicon.ico")); ok(ico.readUInt16LE(2) === 1 && ico.readUInt16LE(4) === 1 && ico.length < 8 * 1024, "the favicon is a real .ico file");
    const at = fs.readFileSync(path.join(ROOT, "public/img/apple-touch-icon.png")); ok(at.readUInt32BE(16) === 180 && at.readUInt32BE(20) === 180, "and the home-screen icon is 180 by 180"); }
  for (const [name, html] of [["front", frontPage({ latest: [], base: "https://linkedm.org" })], ["board", boardPage({ result: result(sample), base: "https://linkedm.org" })], ["post", postPage({ post: sample[0], base: "https://linkedm.org" })], ["terms", termsPage({ base: "https://linkedm.org" })]]) {
    ok(/<meta property="og:title" content="[^"]+">/.test(html) && /<meta property="og:description" content="[^"]+">/.test(html) && html.includes('<meta property="og:image" content="https://linkedm.org/img/share.png">') && /og:image:width" content="1200"/.test(html) && /og:image:height" content="630"/.test(html) && /twitter:card" content="summary_large_image"/.test(html) && /twitter:image" content="https:\/\/linkedm\.org\/img\/share\.png"/.test(html), `${name}: a title, a line and a 1200 by 630 picture for Open Graph and Twitter`);
    ok(/<link rel="icon" href="\/img\/icon\.svg"/.test(html) && /apple-touch-icon/.test(html) && /theme-color/.test(html), `${name}: the icon, the home-screen icon and the theme colour`);
  }
  ok(/og:title" content="Ten folding tables, please · Alpha Table Ministry"/.test(postPage({ post: sample[0] })), "a post's share title is its title and its ministry");
  ok(/<meta name="robots" content="noindex,nofollow">/.test(built.join) && /<meta name="robots" content="noindex,nofollow">/.test(built.me) && /noindex/.test(built.notFound) && !/noindex/.test(built.front) && !/noindex/.test(built.terms), "the signed-in pages and the 404 are noindex; the public pages are not");
  ok(/class="empty/.test(built.frontEmpty) && /This board is new/.test(built.frontEmpty) && /class="empty/.test(built.boardEmpty) && /class="empty/.test(built.notFound) && /class="empty/.test(built.missing), "an empty board, a missing post and a missing page each have a designed state, not a bare line");
  /* the notice address */
  ok(noticeEmail({ LEXOS_NOTICE_EMAIL: "Notices <n@linkedm.org>", LEXOS_MAIL_FROM: "b@linkedm.org" }) === "n@linkedm.org" && noticeEmail({ LEXOS_MAIL_FROM: "Linked Ministries <board@linkedm.org>" }) === "board@linkedm.org" && noticeEmail({ LEXOS_NOTICE_EMAIL: "a,b@c.example", LEXOS_MAIL_FROM: "x" }) === "" && noticeEmail({}) === "", "the notice address is LEXOS_NOTICE_EMAIL, else the sender address, else none; a list or junk is never used");
  /* the emails: who sent it and why, no marketing, one-line subjects */
  const mails = { signIn: signInEmail("123456"), answer: answerEmail({ toContact: "Alex", fromMinistry: "Bravo House", place: "Spokane, WA", kind: "ask", title: "Tables", words: "We can bring eleven.", fromName: "Blake", fromEmail: "blake@bravo.example", phone: "509-555-0142", website: "https://bravo.example.org" }),
    invite: inviteEmail({ inviter: "Alex", ministry: "Alpha Table", joinUrl: "https://linkedm.org/join" }), report: reportEmail({ title: "Tables", ministry: "Alpha", reason: "scam", note: "It looks wrong.", reporter: "r@x.example", url: "https://linkedm.org/board/1", stewardUrl: "https://linkedm.org/review" }) };
  for (const [name, m] of Object.entries(mails)) {
    ok(/Why you got this:/.test(m.text) && !/[\r\n]/.test(m.subject), `the ${name} email says why it was sent, and its subject is one line`);
    ok(!/\b(sale|discount|offer ends|limited time|unsubscribe|newsletter|promo|buy|upgrade|\$)\b/i.test(m.text.replace(/We send no news and no ads\./g, "").replace(/offer help/g, "")) && !/https?:\/\/(?!linkedm\.org|bravo\.example)/.test(m.text), `the ${name} email sells nothing and links nowhere strange`);
    ok(!/501\(c\)|tax|deduct|donat/i.test(m.text), `the ${name} email says nothing about taxes or donations`);
  }
  ok(/free board where ministries ask for help and offer help/.test(mails.signIn.text) && /We send no news and no ads/.test(mails.signIn.text) && /works for 10 minutes/.test(mails.signIn.text) && /^123456 is your Linked Ministries sign-in code$/.test(mails.signIn.subject), "the sign-in email says who sent it (Linked Ministries, linkedm.org), why, and that no news or ads follow");
  ok(mails.answer.text.includes(STAY_SAFE) && /does not check or vouch/.test(mails.answer.text) && /911/.test(mails.answer.text) && /We sent you their words for them/.test(mails.answer.text), "the answer email carries the stay-safe line, the no-vouching line and 911 and 988, and says Linked Ministries sent it for them");
  ok(/Nothing has been hidden/.test(mails.report.text) && /you are on the Linked Ministries team/.test(mails.report.text) && !/steward/i.test(mails.report.text), "the report email tells the team that nothing has been hidden, in plain words");
  ok(Object.keys(REPORT_REASONS).join() === "scam,money,unsafe,copy,private,other", "the Report form has six reasons, one of them copying");
}

/* ---- every static file: no CDN, no tracker, no third-party host, no inline script ---- */
const surfaces = walk("public").filter((p) => /\.(js|css|svg)$/.test(p));
ok(surfaces.length >= 8, `${surfaces.length} script, style and picture files are read`);
for (const p of surfaces) {
  const t = read(p).replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [re, why] of SOURCE.filter(([, w]) => !/inline|style attribute|event attribute|stylesheet or icon|picture or frame|^red$/.test(w))) ok(!re.test(t.replace(/(^|[^:])\/\/.*$/gm, "$1")), `${p}: no ${why}`);
  const hosts = [...t.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase()).filter((h) => !["www.disciplesauthority.org", "www.w3.org"].includes(h));
  ok(hosts.length === 0, `${p}: no host but Disciples' Authority and the SVG namespace`, hosts);
}
{ const css = read("public/css/lm.css"); ok(!/@import|url\(\s*["']?https?:/i.test(css) && [...css.matchAll(/url\((\/fonts\/[^)]+)\)/g)].every((m) => fs.existsSync(path.join(ROOT, "public", m[1]))), "the stylesheet imports nothing and every font file it names is on disk");
  ok([...css.matchAll(/url\(([^)]+)\)/g)].length === 6, "six faces: Fraunces 500 and 600, Plus Jakarta Sans 400, 500, 600 and 700");
  ok(/Fraunces/.test(css) && /Plus Jakarta Sans/.test(css) && /--gold:#d97706/i.test(css), "titles in Fraunces, words in Plus Jakarta Sans, and the one gold #D97706"); }
{ const js = walk("public/js").map((p) => read(p)).join("\n"); ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/.test(js), "no script writes a person's words as markup: no innerHTML, no eval"); ok(!/localStorage|sessionStorage|document\.cookie/.test(js), "no script keeps anything in the browser: the session is an httpOnly cookie");
  ok(!/\bfetch\(\s*["'`]https?:/.test(js) && [...js.matchAll(/fetch\(([^)]*)\)/g)].every((m) => /path|p\b/.test(m[1])), "the only fetch is to this site's own paths"); }
const csp = POLICY.join("; ");
ok(/default-src 'none'/.test(csp) && /script-src 'self'(;|$)/.test(csp) && /style-src 'self'(;|$)/.test(csp) && /img-src 'self' data:/.test(csp) && /connect-src 'self'/.test(csp) && /frame-ancestors 'none'/.test(csp) && !/unsafe/.test(csp) && !/https?:/.test(csp), "the policy lets nothing in but this site: no inline script, no eval, no other host");
{ const h = {}; const res = { setHeader: (k, v) => { h[k] = v; } }; securityHeaders({ LEXOS_PUBLIC_URL: "https://linkedm.org" })({ path: "/me" }, res, () => {}); ok(/noindex/.test(h["X-Robots-Tag"]) && h["Cache-Control"] === "no-store" && /includeSubDomains|preload/.test(h["Strict-Transport-Security"] || "") === false, "the private pages are noindex and not cached, and the transport header has no includeSubDomains and no preload"); }

/* ---- no model name, no technology name, nothing a person should not read ---- */
const everything = walk(".").filter((p) => /\.(mjs|js|json|sql|md|html|css|yml|yaml|txt|example|svg)$/.test(p) && !/package-lock/.test(p));
const MODEL_NAME = /\b(sonnet|opus|haiku|fable|gpt-?[0-9]|gemini|anthropic|openai|llama|mistral)\b/i;
for (const p of everything.filter((x) => x !== path.join("tests", "unit-test.mjs") && x !== path.join("tests", "banned.mjs") && x !== path.join("tests", "eden-test.mjs") && x !== path.join("server", "eden-engine.mjs"))) {
  const t = read(p);
  ok(!MODEL_NAME.test(t), `${p}: no model name`);
}
ok(MODEL_NAME.test(read("server/eden-engine.mjs")) && !/\b(sonnet|haiku|fable|gpt|gemini|openai|llama|mistral)\b/i.test(read("server/eden-engine.mjs")) && /ANTHROPIC_API_KEY/.test(read("server/eden-engine.mjs")), "the model and its company are named in one server file, and only the one model Eden uses");
for (const p of walk("public").filter((x) => /\.(js|css|svg)$/.test(x)).concat(["server/pages.mjs", "server/words.mjs", "server/api.mjs", "server/index.mjs", "server/board.mjs", "server/auth.mjs"])) { const t = read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1"); ok(!/builder\s?buy\s?box|\bloxo\b|\bbidvoice\b|cross universal/i.test(t), `${p}: the strings a person reads carry no name that stays behind the front`); }

/* ---- the server listens where the host says, and the host knows how to check it ---- */
ok(/Number\(process\.env\.PORT\) \|\| 8080/.test(read("server/index.mjs")) && /ENV PORT=8080/.test(read("Dockerfile")) && /EXPOSE 8080/.test(read("Dockerfile")), "the server listens on process.env.PORT or 8080");
{ const rj = JSON.parse(read("railway.json")); ok(rj.build.builder === "DOCKERFILE" && rj.deploy.healthcheckPath === "/api/health" && /Linked Ministries listening on :/.test(read("server/index.mjs")), "Railway builds the Dockerfile and checks /api/health"); }
ok(/USER node/.test(read("Dockerfile")) && /npm ci --omit=dev/.test(read("Dockerfile")), "the image runs as an unprivileged user with the lockfile's packages only");

/* ---- migrations: numbered, reversible, never edited ---- */
const mig = fs.readdirSync(path.join(ROOT, "migrations")).filter((f) => f.endsWith(".sql")).sort();
ok(mig.length >= 4 && mig.every((m, i) => m.startsWith(String(i + 1).padStart(4, "0") + "_")), "the migrations are numbered from 0001 with no gap", mig);
ok(mig.every((m) => /-- Down:/.test(read("migrations/" + m))), "every migration says how to take it back (Down)");
const fp = frozenProblems(); ok(fp.length === 0, "no migration differs from its record, and none is unrecorded", fp);
ok(mig.every((m) => !/\bdrop (table|schema|column)\b[^;]*;/i.test(read("migrations/" + m).split("-- Down:")[0].replace(/--.*$/gm, ""))), "no migration drops anything above its Down line");

/* ---- never open our code: every package that ships is under a licence that asks only for credit ---- */
{
  const ALLOWED = ["MIT", "MIT-0", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0"];   /* the founder's four families, and no wider */
  const okLicense = (x0) => { const x = String(x0 || "").replace(/[()]/g, " ").trim(); if (!x) return false; if (/\sOR\s/i.test(x)) return x.split(/\s+OR\s+/i).some(okLicense); if (/\sAND\s/i.test(x)) return x.split(/\s+AND\s+/i).every(okLicense); return ALLOWED.includes(x); };
  const lock = JSON.parse(read("package-lock.json")); let n = 0; const badLic = [];
  for (const [k, v] of Object.entries(lock.packages || {})) {
    if (!k || v.dev) continue; const pj = path.join(ROOT, k, "package.json"); if (!fs.existsSync(pj)) continue;
    const j = JSON.parse(fs.readFileSync(pj, "utf8")); const lic = typeof j.license === "string" ? j.license : j.license && j.license.type; n++;
    if (!okLicense(lic)) badLic.push(`${j.name}: ${lic}`);
  }
  ok(n > 30 && badLic.length === 0, `${n} packages that ship are all under MIT, ISC, BSD or Apache-2.0`, badLic);
  /* the advisories of 2026 (npm audit, found by the 2026-10-18 audit): nothing that ships may be older than the release that fixed them */
  const atLeast = (have, want) => { const a = String(have).split(".").map(Number), b = want.split(".").map(Number); for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== b[i]) return (a[i] || 0) > b[i]; } return true; };
  const locked = (name) => (lock.packages["node_modules/" + name] || {}).version || "0";
  ok(atLeast(locked("express"), "4.22.3") && atLeast(locked("body-parser"), "1.20.7") && atLeast(locked("path-to-regexp"), "0.1.13") && atLeast(locked("qs"), "6.15.4"), "the locked express, body-parser, path-to-regexp and qs are past their known advisories", ["express", "body-parser", "path-to-regexp", "qs"].map((n) => n + " " + locked(n)));
  ok(Object.keys(JSON.parse(read("package.json")).dependencies).sort().join() === "express,nodemailer,pg", "the server's own dependencies are express, nodemailer and pg and nothing else");
  ok(JSON.parse(read("package.json")).engines.node === ">=22", "Node 22 or later");
  const fonts = fs.readdirSync(path.join(ROOT, "public/fonts")); ok(fonts.length === 6 && fonts.every((f) => /^(fraunces|plus-jakarta-sans)-latin-\d+-normal\.woff2$/.test(f)), "the six faces are Fraunces and Plus Jakarta Sans, both under the SIL Open Font Licence", fonts);
}

/* ---- what was copied, and from where (commons.json) ---- */
{
  const cj = JSON.parse(read("commons.json")); const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
  ok(cj.version === 1 && cj.origin_repo === "cross-univeral" && /^[0-9a-f]{40}$/.test(cj.origin_commit) && cj.pieces.length >= 30, "commons.json records the origin repository, its commit, and every piece copied", cj.pieces.length);
  const ids = new Set(); const missing = [], drift = [], stale = [], modeless = [], moved = [];
  const originDir = process.env.LM_ORIGIN_DIR || "/home/user/cross-univeral"; let checkedOrigin = 0;
  for (const pc of cj.pieces) {
    ids.add(pc.id);
    if (!/^[0-9a-f]{64}$/.test(pc.origin_sha256) || !pc.note || !pc.origin_path || pc.origin_repo !== "cross-univeral") missing.push(pc.id);
    if (!["verbatim", "adapted", "shaped-on"].includes(pc.mode)) modeless.push(pc.id);
    const lp = path.join(ROOT, pc.local_path); if (!fs.existsSync(lp)) { missing.push(pc.id + " (no file)"); continue; }
    const lsha = sha(fs.readFileSync(lp));
    if (pc.mode === "verbatim" && lsha !== pc.origin_sha256) drift.push(pc.id);
    if (lsha !== pc.local_sha256) stale.push(pc.id);
    const op = path.join(originDir, pc.origin_path);
    if (fs.existsSync(op)) { checkedOrigin++; if (sha(fs.readFileSync(op)) !== pc.origin_sha256) moved.push(pc.id); }
  }
  ok(ids.size === cj.pieces.length && missing.length === 0 && modeless.length === 0, "every piece has an origin path, a hash, a mode, a note and a file here", { missing, modeless });
  ok(drift.length === 0, "every verbatim copy is byte for byte its origin", drift);
  ok(stale.length === 0, "every recorded hash is the file's hash today (run node tools/commons.mjs after a change)", stale);
  console.log(`      (${checkedOrigin} of ${cj.pieces.length} origin files were present to compare${moved.length ? "; the origin has moved on for: " + moved.join(", ") + " (a note, not a failure: the origin is another repository)" : ""})`);
  const need = ["server/ratelimit.mjs", "lib/plainwords.mjs", "tools/local-supabase-shim.sql", "tools/freeze-migrations.mjs", "server/auth.mjs", "server/mail.mjs", "server/config.mjs", "server/headers.mjs", "server/db.mjs", "lib/dbtls.mjs", "Dockerfile", "railway.json", "tests/light-test.mjs", "tests/boot-test.mjs", "DEPLOY.md", "CLAUDE.md", ".github/workflows/test.yml", "migrations/0001_base.sql"];
  ok(need.every((n) => cj.pieces.some((p) => p.local_path === n)), "the boot guard, headers, rate limits, mail, sign-in, database tools, Dockerfile, railway.json, tests, workflow and DEPLOY.md are each recorded", need.filter((n) => !cj.pieces.some((p) => p.local_path === n)));
}

/* ---- the founder's words are in the repository ---- */
{ const d = read("DEPLOY.md"); ok(/␣/.test(d) && /zero/i.test(d) && /letter O|letter o/i.test(d), "DEPLOY.md marks spaces with ␣ and calls out zero and the letter O");
  const cmds = [...d.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1].trim()).filter((c) => !/^[A-Z_]+=/.test(c) && !/^select /i.test(c));
  ok(cmds.every((c) => c.split("\n").length === 1), "every command the founder types is one line", cmds.filter((c) => c.split("\n").length > 1));
  ok(/LEXOS_INTERNAL_KEY/.test(d) && /LEXOS_PUBLIC_URL=https:\/\/linkedm\.org/.test(d) && /LEXOS_SMTP_URL/.test(d) && /LEXOS_MAIL_FROM/.test(d) && /\$\{\{Postgres\.DATABASE_URL\}\}/.test(d) && /LEXOS_ENV=production/.test(d) && /make_steward/.test(d), "DEPLOY.md lists the variables and the one SQL line for the first steward");
  ok(/Never ask|never ask/.test(read("CLAUDE.md")) && /One company|Copy, never rebuild/.test(read("CLAUDE.md")), "CLAUDE.md carries the founder's rules"); }

/* ---- credentials never in the repository ---- */
for (const p of everything.filter((x) => x !== path.join("tests", "unit-test.mjs"))) { const t = read(p); ok(!/(sk-ant-|AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC )?PRIVATE KEY|smtps?:\/\/[^\s:@<]+:(?!abcdabcdabcdabcd|<|\$\{|pw@|secretpass|p@|\.\.\.)[^\s@<]{6,}@)/.test(t), `${p}: no key, no private key, no real mail password`); }

await unitPool.end();
/* ---- founder, 2026-10-18: a person never reads "steward", "treasurer" or "treasury" ----
   Every quoted string in the server and in the scripts is read; one that holds an old name fails unless it is a path, a database call or a bare
   identifier (the flags, the event kinds and the API paths keep their names). The pages, emails and refusals are read again in whole by
   tests/banned.mjs. The team's pages are /review and /money; the first names redirect. */
{ const files = [...walk("server"), ...walk("public/js")].filter((p) => /\.m?js$/.test(p));
  const bad = [];
  for (const f of files) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
    for (const m of src.matchAll(/"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) { const t = (m[1] != null ? m[1] : m[2].replace(/\$\{[^}]*\}/g, "")); if (/steward|treasur/i.test(t) && !/^Disallow: \/|^[\/]|^select |^[a-z_.]+$|\blm\.[a-z_]+\(|\/api\/|\/review|\/money/.test(t) && !/^[a-z_]+ [a-z_]+ [a-z_]+/.test(t.replace(/[^a-z_ ]/g, ""))) bad.push(f + ': ' + t.slice(0, 70)); }
  }
  ok(bad.length === 0, "no sentence in the server or the scripts holds steward, treasurer or treasury", bad.slice(0, 5));
  const r1 = READ.filter(([re]) => re.test("A steward and a treasurer in the treasury"));
  ok(r1.length >= 1, "and the banned list can catch the old names (it can fail)"); }

/* A missing word and a missing piece are the same bug: the page writes the text "undefined" or "null". Every WORDS.key a script reads exists, no
   string in WORDS is empty or reads "null" or "undefined", and no script appends a bare `null` or `undefined` to a panel. (Founder saw "null" as
   the last line of Eden's panel on /me, 2026-10-18: body.append(a, cond ? null : b) writes the word "null".) */
{
  const used = new Set(); const bareNull = [];
  for (const f of fs.readdirSync(path.join(ROOT, "public/js")).filter((x) => x.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(ROOT, "public/js", f), "utf8");
    for (const m of src.matchAll(/\bWORDS\.([A-Za-z0-9_]+)/g)) used.add(m[1]);
    for (const m of src.matchAll(/\b\w+\.(?:append|prepend)\([^;\n]*(?:\? null :|: null\b|, null\)|\(null\))/g)) bareNull.push(f + ": " + m[0].slice(0, 70));
  }
  const missingKeys = [...used].filter((k) => !(k in WORDS));
  ok(missingKeys.length === 0, `every WORDS.key the scripts read exists (${used.size} keys)`, missingKeys);
  ok(Object.entries(WORDS).every(([, v]) => typeof v !== "string" || (v.trim() !== "" && !/^(null|undefined)$/i.test(v.trim()) && !/\bundefined\b/.test(v))), "and no word list entry is empty or reads null or undefined");
  ok(bareNull.length === 0, "and no script appends a possible null to a page with append(): it would be written as the word null (use h(), or filter first)", bareNull);
}

process.exit(T.done());

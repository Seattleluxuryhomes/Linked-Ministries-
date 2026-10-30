#!/usr/bin/env node
/* tests/api-giving-test.mjs — the giving record over HTTP, with the real server and a stand-in mail server that speaks real SMTP.
   A treasurer writes a gift down (the receipt number is the database's) and the receipt email goes only if the provider takes it;
   a second treasurer approves a grant after the board's vote; the public reads /giving signed out and finds sums of the rows, no donor,
   no board member's name, and not the words "tax-deductible" or "write-off". The Give button is behind the door, and the door behind
   the registration. The treasury's spreadsheet cannot run a donor's name as a formula.   LEXOS_DB_NAME=linkedm_t_<mine> node tests/api-giving-test.mjs */
import { counter, ownDatabase, startServer, client, signIn, smtpStandIn, sleep } from "./helpers.mjs";
import { checkPage, visibleText } from "./banned.mjs";
import { seedAlexPage, seedWorld } from "./seed.mjs";

const T = counter("api-giving-test"); const { ok } = T;
const db = await ownDatabase("api_giving");
const { pool } = await import("../server/db.mjs");
const sql = async (s, p = []) => (await pool.query(s, p)).rows;
const smtp = await smtpStandIn();
const s = await startServer({ url: db.url, env: { LEXOS_SMTP_URL: smtp.url, LEXOS_MAIL_FROM: "Linked Ministries <board@linkedm.test>", LEXOS_NOTICE_EMAIL: "notices@linkedm.test" } });
ok(s.up, "the server is up", s.logText().slice(-300));
const today = new Date().toISOString().slice(0, 10);
const anon = client(s.base);

/* ---- the public record before anything is in it ---- */
const g0 = await anon.get("/giving");
ok(g0.status === 200, "/giving answers 200 signed out");
{ const bad = checkPage(g0.text, { money: true }); ok(bad.length === 0, "/giving carries nothing banned: no inline script, no style attribute, no other host, no tax-deductible, no write-off", bad); }
ok(/Where the money went/.test(g0.text) && /Linked Ministries is not taking gifts online yet/.test(g0.text) && /registration/.test(g0.text) && !/href="\/give"/.test(g0.text), "with the door closed it says in words that Linked Ministries is not taking gifts online yet, and why (the registration), and has no Give button");
ok(/Linked Ministries is a nonprofit in Washington\. Linked Ministries has not applied for 501\(c\)\(3\) status yet\./.test(visibleText(g0.text)) && !/forming as a nonprofit/.test(visibleText(g0.text)), "the status line says what is true today and no more");
ok(/<svg class="chart"/.test(g0.text) && (g0.text.match(/<tr><th scope="row">/g) || []).length === 12 && /\$0\.00/.test(g0.text), "the chart is drawn inline as SVG, with twelve months in a table under it, all $0.00");
ok(!/tax-deductible|write-off|deductible/i.test(g0.text), "nothing says a gift is deductible");
ok(/When Linked Ministries files a Form 990, the link is here\./.test(g0.text), "the Form 990 link is not there until a URL is set");
const gv0 = await anon.get("/give");
ok(gv0.status === 200 && /Not taking gifts online yet/.test(gv0.text) && !/<form/.test(gv0.text), "/give with the door closed says so and has no form");
ok(/Giving/.test((await anon.get("/")).text) && /href="\/giving"/.test((await anon.get("/")).text) && (await anon.get("/sitemap.xml")).text.includes("/giving</loc>") && /Disallow: \/treasury/.test((await anon.get("/robots.txt")).text), "the front links /giving, the sitemap lists it, robots keeps /treasury out");
ok((await anon.get("/money")).headers.get("x-robots-tag") === "noindex, nofollow" && (await anon.get("/money")).status === 200 && /<title>Money · /.test((await anon.get("/money")).text), "/money is a noindex shell titled Money");
{ const old = await anon.get("/treasury"); ok(old.status === 301 && old.headers.get("location") === "/money", "and /treasury, its first name, is a permanent redirect to it", [old.status, old.headers.get("location")]); }
ok((await anon.get("/api/giving")).json.money_cents === 0 || Number((await anon.get("/api/giving")).json.money_cents) === 0, "the public JSON is the same record");

/* ---- who may use the treasury ---- */
const tess = client(s.base), stan = client(s.base), lead = client(s.base), pat = client(s.base);
for (const [c, em] of [[tess, "tess@linkedm.test"], [stan, "stan@linkedm.test"], [lead, "alex@alpha.example"], [pat, "pat@example.org"]]) await signIn(c, s, em, { smtp });
await sql("select lm.make_steward('stan@linkedm.test')"); await sql("select lm.make_treasurer('tess@linkedm.test')");
await sql("update lm.people set full_name = 'Tess Treasurer' where user_id = (select id from auth.users where email = 'tess@linkedm.test')");
await sql("update lm.people set full_name = 'Stan Steward' where user_id = (select id from auth.users where email = 'stan@linkedm.test')");
ok((await anon.get("/api/treasury")).status === 401 && (await anon.post("/api/treasury/gifts", {})).status === 401 && (await anon.get("/api/treasury/export.csv")).status === 401, "the treasury needs a sign-in");
for (const [who, c] of [["a steward who is not a treasurer", stan], ["a person with no ministry", pat], ["a ministry's lead", lead]]) {
  const r = await c.get("/api/treasury"); ok(r.status === 403 || r.status === 409 || r.status === 403, `${who} cannot read the treasury`, r.status);
  ok((await c.post("/api/treasury/gifts", { donor_name: "A Donor", amount: "10", method: "cash", received_on: today })).status === 403, `${who} cannot record a gift`);
  ok((await c.get("/api/treasury/export.csv")).status === 403, `${who} cannot take the spreadsheet`); }
ok((await tess.get("/api/me")).json.treasurer === true && (await stan.get("/api/me")).json.treasurer === false, "/api/me says who is a treasurer");

/* ---- recording a gift ---- */
const bad = async (b, re, what) => { const r = await tess.post("/api/treasury/gifts", { donor_name: "Zed Donor", method: "cash", received_on: today, amount: "5", ...b }); ok(r.status === 422 && re.test(r.json.words || ""), `${what} is refused in words`, r.json); };
await bad({ amount: "abc" }, /dollars/, "an amount that is letters"); await bad({ amount: "1.234" }, /dollars/, "an amount with three decimals"); await bad({ amount: "-5" }, /dollars/, "a negative amount"); await bad({ amount: "0" }, /dollars/, "an amount of zero");
await bad({ method: "gold" }, /how the gift came in/, "a method that is not on the list"); await bad({ received_on: "tomorrow" }, /day/, "a day that is not a day"); await bad({ donor_email: "a,b@c.example" }, /email/, "an email that is a list");
{ const r = await tess.post("/api/treasury/gifts", { donor_name: "Zed Donor", method: "cash", received_on: "2999-01-01", amount: "5" }); ok(r.status === 422 && /after today/.test(r.json.words), "a gift dated after today is refused by the database, in words", r.json); }
const gA = await tess.post("/api/treasury/gifts", { donor_name: "Jordan Donor", donor_email: "jordan@donor.example", amount: "1,025.50", method: "check", received_on: today, note: "Check 1042" });
ok(gA.status === 201 && gA.json.gift.code === "LM-000001" && gA.json.gift.amount_cents === 102550 && gA.json.receipt.emailed === true, "a gift is recorded with receipt LM-000001, and the receipt email was taken by the provider", gA.json);
await sleep(100);
const mail = smtp.mails.find((m) => m.to.includes("jordan@donor.example"));
ok(mail && mail.subject === "Receipt LM-000001 from Linked Ministries" && /Why you got this:/.test(mail.text) && /\$1,025\.50/.test(mail.text) && /Receipt number: LM-000001/.test(mail.text) && /How it came in: Check/.test(mail.text) && /Hello Jordan Donor,/.test(mail.text), "the receipt email says why it was sent, the number, the amount and how it came in", mail && mail.subject);
ok(mail && /Linked Ministries has not applied for 501\(c\)\(3\) status yet; this receipt is a record of your gift\./.test(mail.text) && !/deduct|tax|write-off/i.test(mail.text) && /\/giving\./.test(mail.text) && /notices@linkedm\.test/.test(mail.text), "it says what is true about the application, nothing about deductions, and where the public record is");
ok((await sql("select count(*)::int n from lm.gift_receipts"))[0].n === 1, "the record that the receipt went was written, after the provider took it");
const before = smtp.mails.length;
smtp.refuse(true);
const gB = await tess.post("/api/treasury/gifts", { donor_name: "Riley Refused", donor_email: "riley@donor.example", amount: "40", method: "card", received_on: today });
ok(gB.status === 201 && gB.json.gift.code === "LM-000002" && gB.json.receipt.emailed === false && gB.json.receipt.reason === "mail_failed" && /did not go out/.test(gB.json.words) && smtp.mails.length === before, "when the provider refuses the receipt, the gift is still written down and the screen says the email did not go", gB.json);
ok((await sql("select count(*)::int n from lm.gift_receipts"))[0].n === 1, "and no receipt is recorded as sent");
smtp.refuse(false);
const rs = await tess.post(`/api/treasury/gifts/${gB.json.gift.id}/receipt`, {});
ok(rs.status === 200 && rs.json.receipt.emailed === true && smtp.mails.some((m) => m.to.includes("riley@donor.example")) && (await sql("select count(*)::int n from lm.gift_receipts"))[0].n === 2, "the receipt can be sent again from the ledger, and only then is it recorded");
const gC = await tess.post("/api/treasury/gifts", { donor_name: "", amount: "12", method: "cash", received_on: today });
ok(gC.status === 201 && gC.json.receipt.emailed === false && gC.json.receipt.reason === "no_email" && /no email address was given/.test(gC.json.words), "a gift with no email sends nothing and says why");
ok((await tess.post(`/api/treasury/gifts/${gC.json.gift.id}/receipt`, {})).status === 422, "and there is no receipt to send to nobody");
const gD = await tess.post("/api/treasury/gifts", { donor_name: "=HYPERLINK(\"http://x.example\",\"click\")", amount: "3", method: "cash", received_on: today });
ok(gD.status === 201, "a donor's name that looks like a formula is still just a name");
const gE = await tess.post("/api/treasury/gifts", { donor_name: "Pat Pews", amount: "800", method: "in_kind", received_on: today, note: "Twenty used pews" });
ok(gE.status === 201, "a gift in kind is recorded");
/* a gift made online through Zeffy: Zeffy emailed the receipt, so this site sends none; it is still written down, with the next number */
{ const before2 = smtp.mails.length;
  const gZ = await tess.post("/api/treasury/gifts", { donor_name: "Zoe Zeffy", donor_email: "zoe@donor.example", amount: "50", method: "zeffy", received_on: today });
  ok(gZ.status === 201 && gZ.json.receipt.emailed === false && gZ.json.receipt.reason === "zeffy_sent_it" && /Zeffy already sent the receipt/.test(gZ.json.words), "a Zeffy gift is written down and the screen says Zeffy already sent the receipt", gZ.json);
  await sleep(100);
  ok(smtp.mails.length === before2 && !smtp.mails.some((m) => m.to.includes("zoe@donor.example")), "and no second receipt goes to the donor");
  { const rz = await tess.post(`/api/treasury/gifts/${gZ.json.gift.id}/receipt`, {}); ok(rz.status === 422 && /Zeffy already sent the receipt/.test(rz.json.words || ""), "sending it again from the ledger also sends nothing, and says why", rz.json); } }
/* the same, with no mail set up at all */
{ const s2 = await startServer({ url: db.url, env: { LEXOS_SMTP_URL: "" } }); const t2 = client(s2.base); await signIn(t2, s2, "tess@linkedm.test");
  const r = await t2.post("/api/treasury/gifts", { donor_name: "No Mail Donor", donor_email: "nomail@donor.example", amount: "7", method: "cash", received_on: today });
  ok(r.status === 201 && r.json.receipt.emailed === false && r.json.receipt.reason === "mail_not_set_up" && /not set up to send email/.test(r.json.words), "with no mail provider set up, the gift is written down and the screen says no receipt email was sent");
  await s2.stop(); }
/* corrections */
const cr = await tess.post(`/api/treasury/gifts/${gA.json.gift.id}/correct`, { change: "-25.50", note: "The check was for 1000" });
ok(cr.status === 201 && /unchanged/.test(cr.json.words) && /^LM-0000\d\d$/.test(cr.json.code), "a correction is a new row with its own receipt number", cr.json);
ok((await tess.post(`/api/treasury/gifts/${gA.json.gift.id}/correct`, { change: "-5000", note: "Too much" })).status === 422 && (await tess.post(`/api/treasury/gifts/${gA.json.gift.id}/correct`, { change: "-1", note: "" })).status === 422, "a correction below zero, or with no note, is refused");
const tv = (await tess.get("/api/treasury")).json;
ok(tv.gifts.find((g) => g.receipt_no === 1).amount_cents === 102550 && tv.totals.money_count === 6 && Number(tv.totals.money_cents) === 100000 + 4000 + 1200 + 300 + 700 + 5000 && tv.totals.in_kind_cents === 80000, "the treasury reads the first record unchanged, and totals that are sums of the rows", tv.totals);

/* ---- a grant: two treasurers, the board's vote, only money that came in ---- */
const world = await seedWorld({ base: s.base, smtp, sql: (q) => pool.query(q) });
const alexPage = await seedAlexPage({ world });
const mid = alexPage.ministryId;
const tv2 = (await tess.get("/api/treasury")).json;
ok(tv2.ministries.some((m) => m.id === mid) && tv2.ministries.length === 4, "a grant may go to any ministry a steward has read");
const prop = await tess.post("/api/treasury/grants", { recipient_kind: "ministry", ministry_id: mid, amount: "300", purpose: "Help with a van for the Saturday meals" });
ok(prop.status === 201 && /different person on the money team/.test(prop.json.words), "a treasurer proposes a grant", prop.json);
ok((await tess.post("/api/treasury/grants", { recipient_kind: "outside", amount: "50", purpose: "Winter coats for the people we serve" })).status === 422 && (await tess.post("/api/treasury/grants", { recipient_kind: "ministry", ministry_id: mid, amount: "50", purpose: "short" })).status === 422 && (await tess.post("/api/treasury/grants", { recipient_kind: "loan", amount: "50", purpose: "A purpose in words here" })).status === 422, "a grant with no name, no reason, or no real kind of recipient is refused in words");
const vote = (c, id, o = {}) => c.post(`/api/treasury/grants/${id}/approve`, { voted_on: today, yes: "Ann Board\nBob Board", abstain: "Cy Abstain", no: "", doc_ref: "Minutes of the board, item 4", ...o });
const own = await vote(tess, prop.json.id);
ok(own.status === 409 && /different treasurer/.test(own.json.words), "the treasurer who proposed it cannot approve it", own.json);
await sql("select lm.treasurer_set('stan@linkedm.test', true)").catch(() => null);
await sql("update lm.people set treasurer = true where user_id = (select id from auth.users where email = 'stan@linkedm.test')");
ok((await vote(stan, prop.json.id, { yes: "Only One" })).status === 422 && (await vote(stan, prop.json.id, { doc_ref: "" })).status === 422 && (await vote(stan, prop.json.id, { yes: "" })).status === 422, "a vote with one name, no document, or no yes votes is refused in words");
const huge = await tess.post("/api/treasury/grants", { recipient_kind: "outside", recipient_name: "Big Ask Fund", amount: "9999", purpose: "More than the gifts that came in" });
const hv = await vote(stan, huge.json.id);
ok(hv.status === 409 && /not received enough gifts/.test(hv.json.words), "a grant larger than the gifts that came in is refused", hv.json);
const okv = await vote(stan, prop.json.id);
ok(okv.status === 200 && /on the public page/.test(okv.json.words), "a different treasurer approves, with the board's vote written down", okv.json);
ok((await tess.post(`/api/treasury/grants/${prop.json.id}/paid`, { reference: "" })).status === 422, "paying needs a reference");
ok((await tess.post(`/api/treasury/grants/${huge.json.id}/decline`, { note: "More than we have" })).status === 200, "a proposal can be declined, with a note");

/* ---- the public reads it ---- */
const g1 = await anon.get("/giving");
{ const bad2 = checkPage(g1.text, { money: true }); ok(bad2.length === 0, "/giving with a grant on it carries nothing banned", bad2); }
const gt = visibleText(g1.text);
ok(/Gifts received \$1,112\.00 6 gifts\./.test(gt), "the total and the count are the sums of the rows: $1,112.00 from 6 gifts (the first gift was corrected down to $1,000.00, a gift in kind is counted apart, and the $50 Zeffy gift counts like any other)", gt.match(/Gifts received.{0,40}/));
ok(/Alpha Table Ministry/.test(g1.text) && /\$300\.00/.test(g1.text) && /Help with a van for the Saturday meals/.test(g1.text) && /2 yes, 1 abstained/.test(gt) && /Approved by the board\. Not yet paid\./.test(gt), "the grant is there: the ministry, the amount, what for, the vote counts, and that it is not paid yet");
ok(/href="\/m\/alpha-table-ministry">Alpha Table Ministry<\/a>/.test(g1.text), "and the ministry's name links to its page");
ok(!/Jordan|Riley|Pat Pews|Zed|HYPERLINK|donor\.example|Ann Board|Bob Board|Cy Abstain|Tess|Stan/.test(g1.text), "no donor, no email, no board member and no treasurer is named on the page");
ok(!/Big Ask Fund|9,999/.test(g1.text), "a declined proposal is not shown");
ok(/1 gift of goods or services, worth \$800\.00/.test(gt), "the gift in kind is counted apart, with its worth");
ok(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[1-9]/.test(g1.text) && /aria-label="Bar chart of the last twelve months/.test(g1.text), "the chart has bars drawn from the rows, and says what it shows");
await tess.post(`/api/treasury/grants/${prop.json.id}/paid`, { reference: "Check 2201" });
ok(/Paid on /.test(visibleText((await anon.get("/giving")).text)) && !/Check 2201/.test((await anon.get("/giving")).text), "once paid it says so, and the payment's reference is not on the public page");
const pj = (await anon.get("/api/giving")).json;
ok(!/Jordan|Riley|@|Tess|Stan|Ann Board|Cy Abstain/.test(JSON.stringify(pj)) && pj.grants.length === 1 && Number(pj.paid_cents) === 30000, "the public JSON holds no donor and no person's name");

/* ---- the door, and the Give button ---- */
const nodoor = await tess.post("/api/treasury/settings", { door_open: true });
ok(nodoor.status === 409 && /registration number and its date/.test(nodoor.json.words), "the door cannot open with no registration", nodoor.json);
ok((await tess.post("/api/treasury/settings", { registration_number: "WA-123456", door_open: true })).status === 409, "nor with a number and no date");
ok((await tess.post("/api/treasury/settings", { registration_number: "WA-123456", registration_date: today, form990_url: "http://x.example", door_open: false })).status === 422, "a Form 990 link must be https");
const mp = await anon.get("/m/alpha-table-ministry");
ok(!/Give to Alpha/.test(mp.text), "the ministry's page has no Give button while the door is closed");
ok((await tess.post("/api/treasury/settings", { registration_number: "WA-123456", registration_date: today, form990_url: "https://example.org/990.pdf", door_open: true })).status === 200, "with the registration filled in, the door opens");
const g2 = await anon.get("/giving");
ok(/href="\/give"/.test(g2.text) && !/not taking gifts online yet/i.test(g2.text) && /WA-123456/.test(g2.text) && /href="https:\/\/example\.org\/990\.pdf"/.test(g2.text), "the page now has a Give button, the registration and the Form 990 link");
{ const bad3 = checkPage(g2.text, { money: true }); ok(bad3.length === 0, "and is still clean", bad3); }
const gv1 = await anon.get("/give");
ok(gv1.status === 200 && /not connected yet/.test(gv1.text) && !/<form|<input/.test(gv1.text) && /Nothing can be sent or saved on this page/.test(gv1.text), "the Give button goes to a page that says the payment service is not connected, with no form");
/* the door open with a Zeffy form set: the Give page sends a person to Zeffy and says what happens there */
{ const sz = await startServer({ url: db.url, env: { ZEFFY_GIVE_URL: "https://www.zeffy.com/en-US/donation-form/linked-ministries" } });
  const gz = await client(sz.base).get("/give");
  ok(gz.status === 200 && /href="https:\/\/www\.zeffy\.com\/en-US\/donation-form\/linked-ministries"/.test(gz.text) && /Make a donation/.test(gz.text) && /Zeffy takes the gift and emails your receipt/.test(gz.text) && /set it to \$0/.test(gz.text) && !/<form|<input/.test(gz.text), "with a Zeffy form set, the Give page links to it, says Zeffy sends the receipt and that the tip can be $0", gz.status);
  { const bz = checkPage(gz.text, { money: true }); ok(bz.length === 0, "and is clean", bz); }
  await sz.stop?.(); }
{ const sb = await startServer({ url: db.url, env: { ZEFFY_GIVE_URL: "https://evil-zeffy.com.example/x" } });
  ok(!/href="https:\/\/[^"]*zeffy/.test((await client(sb.base).get("/give")).text) && !/wrong\.example/.test((await client(sb.base).get("/give")).text), "an address that is not zeffy.com itself is never linked"); await sb.stop?.(); }
const mp2 = await anon.get("/m/alpha-table-ministry");
ok(/Give to Alpha Table Ministry/.test(mp2.text) && /href="https:\/\/pay\.alpha\.example\/give"/.test(mp2.text) && /This link is Alpha Table Ministry's own/.test(mp2.text), "the ministry's page now shows its own Give button, labelled as theirs");
ok(/Gifts online are open/.test((await anon.get("/")).text), "the front says the gifts are open");
await tess.post("/api/treasury/settings", { registration_number: "WA-123456", registration_date: today, form990_url: "https://example.org/990.pdf", door_open: false });
ok(!/Give to Alpha/.test((await anon.get("/m/alpha-table-ministry")).text), "closing the door takes the button off every page");

/* ---- the spreadsheet ---- */
const csv = await tess.get("/api/treasury/export.csv?what=gifts");
ok(csv.status === 200 && /text\/csv/.test(csv.headers.get("content-type")) && /attachment/.test(csv.headers.get("content-disposition")) && /^"receipt","day","donor"/.test(csv.text), "the gifts come as a CSV file");
ok(csv.text.includes('"\'=HYPERLINK(""http://x.example"",""click"")"') && !/^"=|,"=/m.test(csv.text), "a donor's name that looks like a formula gets a quote mark in front, so a spreadsheet will not run it");
ok(/"LM-000001","[\d-]+","Jordan Donor","jordan@donor\.example","1025\.50","Check"/.test(csv.text) && /"corrects_receipt"/.test(csv.text) && /"LM-0000\d\d",.*"-25\.50"/.test(csv.text), "amounts are exact dollars from cents, a correction names the receipt it corrects");
const gcsv = await tess.get("/api/treasury/export.csv?what=grants");
ok(gcsv.status === 200 && /"Alpha Table Ministry","300\.00"/.test(gcsv.text) && /Ann Board; Bob Board/.test(gcsv.text) && /Check 2201/.test(gcsv.text), "the grants come as a CSV file, with the vote and the payment reference");
ok((await sql("select count(*)::int n from lm.events where kind = 'treasury.export' and actor_label = 'Tess Treasurer'"))[0].n === 2, "each export is written down with the treasurer's name");

/* ---- the record ---- */
const evs = JSON.stringify(await sql("select kind, actor_label, payload from lm.events"));
ok(!/Jordan|Riley|donor\.example|Pat Pews|HYPERLINK|Check 1042|Ann Board|Bob Board|Cy Abstain|van for the Saturday|Minutes of the board|Check 2201/.test(evs), "no event holds a donor, an email, a note, a board member, a reason or a document");
ok((await sql("select count(*)::int n from lm.events where kind in ('gifts.insert','grants.insert','grants.update','board_votes.insert','giving_settings.update','gift_receipts.insert') and actor_label in ('Tess Treasurer','Stan Steward')"))[0].n >= 15, "every act wrote an event with a name on it");

await pool.end(); await s.stop(); await smtp.stop();
process.exit(T.done());

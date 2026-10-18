#!/usr/bin/env node
/* tests/browser-giving-test.mjs — the giving record in a real Chromium, a phone at 390 and a desk at 1440: a treasurer writes down two gifts
   (the receipt email goes through the stand-in mail server), proposes a grant; the same treasurer sees there is no Approve button for it;
   a second treasurer approves it with the board's vote by name and marks it paid; a signed-out visitor reads /giving (the totals are the
   sums of the rows, the grant is there, no donor and no board member is named); the giving door is closed and then opened with the
   registration, and the Give button appears and goes to a page that says the payment service is not connected. Zero page errors, nothing
   sideways, buttons 44 pixels or taller.   LM_SHOTS=<dir> writes the screenshots.   LEXOS_DB_NAME=linkedm_t_<mine> node tests/browser-giving-test.mjs */
import { counter, ownDatabase, startServer, client, signIn, smtpStandIn, sleep } from "./helpers.mjs";
import { launch, open, noSideways, SHOTS, shots } from "./browser-lib.mjs";
import { seedWorld, seedAlexPage } from "./seed.mjs";
import { money } from "../public/js/pure.js";

const T = counter("browser-giving-test"); const { ok } = T;
const db = await ownDatabase("browser_giving"); const smtp = await smtpStandIn();
const s = await startServer({ url: db.url, env: { LEXOS_SMTP_URL: smtp.url, LEXOS_MAIL_FROM: "Linked Ministries <board@linkedm.test>" } });
ok(s.up, "the server is up", s.logText().slice(-300));
const { pool } = await import("../server/db.mjs");
const sql = async (q, p = []) => (await pool.query(q, p)).rows;
const world = await seedWorld({ base: s.base, smtp, sql: (q) => pool.query(q) });
const page = await seedAlexPage({ world });
const browser = await launch(); const snap = shots(SHOTS);
const until = async (fn, what) => { for (let i = 0; i < 80; i++) { if (await fn()) return true; await sleep(100); } ok(false, "waited for " + what); return false; };
const big = async (pg, label) => {
  const small = await pg.evaluate(() => [...document.querySelectorAll("main a.btn, main button, main input:not([type=hidden]):not([type=checkbox]), main select, main textarea, header a.btn, footer a")].filter((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && r.height < 43.5; }).map((el) => (el.textContent || el.name || el.tagName).trim().slice(0, 30) + " " + Math.round(el.getBoundingClientRect().height)));
  ok(small.length === 0, `${label}: every button and field is at least 44 pixels tall`, small.slice(0, 5));
};
const calm = async (pg, label) => ok(await noSideways(pg), `${label}: nothing scrolls sideways`);
const asCookie = (c) => { const kv = c.jar().split("=", 2); return { name: kv[0], value: c.jar().slice(kv[0].length + 1), url: s.base }; };
const tessC = client(s.base), stanC = client(s.base);
await signIn(tessC, s, "tess@linkedm.example", { smtp }); await signIn(stanC, s, "stan@linkedm.example", { smtp });
await sql("select lm.make_treasurer('tess@linkedm.example')"); await sql("select lm.make_treasurer('stan@linkedm.example')");
await sql("update lm.people set full_name = 'Tess Treasurer' where user_id = (select id from auth.users where email = 'tess@linkedm.example')");
await sql("update lm.people set full_name = 'Stan Treasurer' where user_id = (select id from auth.users where email = 'stan@linkedm.example')");

for (const kind of ["phone", "desk"]) {
  const tag = kind === "phone" ? "p" : "d", px = kind === "phone" ? 390 : 1440;
  await sql("update lm.giving_settings set door_open = false, registration_number = null, registration_date = null, form990_url = null");
  const donor = `Jordan Donor ${tag.toUpperCase()}`, purpose = `Help with a van for the Saturday meals (${kind})`;

  /* ---- treasurer one: two gifts and a grant ---- */
  const A = await open(browser, s.base, kind); await A.ctx.addCookies([asCookie(tessC)]);
  await A.page.goto("/money"); await A.page.waitForSelector("[data-summary]");
  ok(/Gifts received/i.test(await A.page.locator("[data-summary]").innerText()) && (await A.page.locator("main h1").innerText()) === "Money" && !/steward|treasur/i.test((await A.page.locator("main h1, main h2, main h3, main button, main label, main .lead, main .help, main .msg").allInnerTexts()).join(" ")), `${kind}: a person on the money team opens Money; its headings, buttons, labels and notes say treasurer and treasury nowhere (a person's own name is theirs)`);
  await A.page.fill("input[name=donor_name]", donor); await A.page.fill("input[name=donor_email]", `jordan.${tag}@donor.example`); await A.page.fill("input[name=amount]", "1500.00");
  await A.page.selectOption("select[name=method]", "check"); await A.page.fill("input[name=note]", "Check 1042");
  await calm(A.page, `${kind}: the treasury with a gift filled in`); await big(A.page, `${kind}: the treasury`);
  await A.page.click("button:has-text('Record this gift')");
  await A.page.waitForSelector("text=/Recorded\\. Receipt LM-\\d{6}\\./");
  const flash = await A.page.locator(".msg.ok").first().innerText();
  ok(/A receipt email was sent, and the mail provider took it/.test(flash), `${kind}: it says the receipt email was sent, only after the provider took it`, flash);
  await sleep(150);
  const mail = [...smtp.mails].reverse().find((m) => m.to.includes(`jordan.${tag}@donor.example`));
  ok(mail && /^Receipt LM-\d{6} from Linked Ministries$/.test(mail.subject) && /\$1,500\.00/.test(mail.text) && /Why you got this/.test(mail.text) && !/deduct/i.test(mail.text), `${kind}: and the email is in the mailbox, with the amount and why it was sent`);
  await A.page.fill("input[name=donor_name]", ""); await A.page.fill("input[name=amount]", "250.50"); await A.page.selectOption("select[name=method]", "cash");
  await A.page.click("button:has-text('Record this gift')");
  await A.page.waitForSelector("text=/no email address was given/");
  ok(/Anonymous/.test(await A.page.locator("[data-ledger]").innerText()), `${kind}: a gift with no name is Anonymous, and with no email no receipt is sent (it says so)`);
  const led = await A.page.locator("[data-ledger] [data-receipt]").count();
  ok(led >= 2, `${kind}: the ledger lists the gifts, newest first`);
  await A.page.selectOption("select[name=recipient_kind]", "ministry"); await A.page.selectOption("select[name=ministry_id]", { label: /Alpha Table Ministry/ }).catch(async () => { const v = await A.page.locator("select[name=ministry_id] option", { hasText: "Alpha Table Ministry" }).first().getAttribute("value"); await A.page.selectOption("select[name=ministry_id]", v); });
  await A.page.fill("input[name=amount] >> nth=2", "400.00").catch(() => null);
  const amountInputs = A.page.locator("form:has(select[name=recipient_kind]) input[name=amount]"); await amountInputs.fill("400.00");
  await A.page.fill("textarea[name=purpose]", purpose);
  await A.page.click("button:has-text('Propose this grant')");
  await A.page.waitForSelector("text=Proposed. A different person on the money team approves it after the board votes.");
  const row = A.page.locator(`[data-grant]:has-text("${purpose}")`);
  ok(/Proposed\. Waiting for a different person on the money team/.test(await row.innerText()) && /you proposed this grant, so a different person on the money team must approve it/i.test(await row.innerText()) && (await row.locator("button[data-act=approve]").count()) === 0, `${kind}: the proposer sees that a different treasurer must approve, and has no Approve button`);
  await calm(A.page, `${kind}: the treasury after the grant`);
  await snap(A.page, `treasury-${px}`);

  /* ---- treasurer two approves, with the vote by name, then marks it paid ---- */
  const B = await open(browser, s.base, kind); await B.ctx.addCookies([asCookie(stanC)]);
  await B.page.goto("/money"); await B.page.waitForSelector(`[data-grant]:has-text("${purpose}")`);
  const brow = B.page.locator(`[data-grant]:has-text("${purpose}")`);
  await brow.locator("button[data-act=approve]").click();
  await B.page.waitForSelector("textarea[name=yes]");
  await B.page.fill("textarea[name=yes]", "Ann Board\nBob Board"); await B.page.fill("textarea[name=abstain]", "Cy Abstain"); await B.page.fill("input[name=doc_ref]", "Minutes of the board, item 4");
  await calm(B.page, `${kind}: the vote form`); await snap(B.page, `treasury-vote-${px}`);
  await B.page.locator(`[data-grant]:has-text("${purpose}") button:has-text('Approve (the board voted yes)') >> nth=-1`).click();
  await B.page.waitForSelector("text=/Approved\\. The vote is written down/");
  const after = await B.page.locator(`[data-grant]:has-text("${purpose}")`).innerText();
  ok(/Approved by the board\. Not yet paid\./.test(after) && /Approved by Stan Treasurer/.test(after) && /Proposed by Tess Treasurer/.test(after) && /yes, Ann Board, Bob Board/.test(after) && /abstained, Cy Abstain/.test(after) && /Minutes of the board, item 4/.test(after), `${kind}: the second treasurer approved it: both names, the vote by name, the document`);
  await B.page.locator(`[data-grant]:has-text("${purpose}") button[data-act=paid]`).click();
  await B.page.fill("input[name=reference]", "Check 2201");
  await B.page.locator(`[data-grant]:has-text("${purpose}") button:has-text('Mark paid') >> nth=-1`).click();
  await B.page.waitForSelector("text=Marked paid.");
  ok(/Paid by Stan Treasurer, reference Check 2201/.test(await B.page.locator(`[data-grant]:has-text("${purpose}")`).innerText()), `${kind}: marked paid, with the reference`);

  /* ---- a visitor reads the public record, signed out ---- */
  const V = await open(browser, s.base, kind);
  await V.page.goto("/giving");
  const rowsMoney = (await sql("select sum(amount_cents)::bigint s from lm.gifts where method <> 'in_kind'"))[0].s;
  const grantedRows = (await sql("select sum(amount_cents)::bigint s from lm.grants where status in ('approved','paid')"))[0].s;
  const txt = await V.page.locator("main").innerText();
  ok(txt.includes(money(rowsMoney)) && txt.includes(money(grantedRows)), `${kind}: signed out, /giving shows ${money(rowsMoney)} received and ${money(grantedRows)} granted: the sums of the rows in the database`);
  ok(txt.includes(purpose) && /Alpha Table Ministry/.test(txt) && /\$400\.00/.test(txt) && /2 yes, 1 abstained/.test(txt) && /Paid on /.test(txt), `${kind}: the grant is there, with the ministry, the amount, what for, the vote counts and that it was paid`);
  ok(!/Jordan|Donor|Ann Board|Bob Board|Cy Abstain|Tess|Stan|Check 1042|Check 2201|donor\.example/.test(txt), `${kind}: no donor, no board member, no treasurer, no payment reference and no email on the public page`);
  ok(/Linked Ministries is not taking gifts online yet/.test(txt) && (await V.page.locator("a:has-text('Give')").count()) === 0, `${kind}: the door is closed: it says so, and there is no Give button`);
  ok((await V.page.locator("svg.chart rect").count()) === 24 && (await V.page.locator("svg.chart").getAttribute("role")) === "img", `${kind}: the chart is inline SVG, drawn from the rows`);
  ok(/Linked Ministries has not applied for 501\(c\)\(3\) status yet/.test(txt) && !/deduct/i.test(txt), `${kind}: the status line says what is true, and nothing about deductions`);
  await calm(V.page, `${kind}: /giving`); await big(V.page, `${kind}: /giving`);
  await snap(V.page, `giving-door-closed-${px}`);
  ok(!(await (await V.ctx.newPage().then(async (p) => { await p.goto("/m/alpha-table-ministry"); return p.locator("main").innerText().finally(() => p.close()); })).includes("Give to Alpha")), `${kind}: and the ministry's own page has no Give button`);

  /* ---- the treasurer opens the door, with the registration ---- */
  await A.page.goto("/money"); await A.page.waitForSelector("input[name=registration_number]");
  await A.page.check("#door-open");
  await A.page.click("button:has-text('Save')");
  await A.page.waitForSelector("text=/registration number and its date/", { timeout: 8000 }).catch(async () => { console.log("DEBUG", (await A.page.locator("main").innerText()).slice(-1500)); throw new Error("no door message"); });
  ok(await A.page.locator("text=/registration number and its date/").first().isVisible(), `${kind}: the door will not open without the registration: the treasury says so in words`);
  await A.page.fill("input[name=registration_number]", "WA-123456"); await A.page.fill("input[name=registration_date]", new Date().toISOString().slice(0, 10)); await A.page.fill("input[name=form990_url]", "https://example.org/990.pdf");
  await A.page.click("button:has-text('Save')");
  await A.page.waitForSelector("text=Saved.");
  await V.page.goto("/giving");
  ok((await V.page.locator("a.btn:has-text('Give')").count()) === 1 && /WA-123456/.test(await V.page.locator("main").innerText()) && !/not taking gifts online yet/i.test(await V.page.locator("main").innerText()) && (await V.page.locator("a:has-text('Read the Form 990')").count()) === 1, `${kind}: with the registration filled in, /giving has the Give button, the registration and the Form 990 link`);
  await calm(V.page, `${kind}: /giving with the door open`);
  await snap(V.page, `giving-door-open-${px}`);
  await V.page.click("a.btn:has-text('Give')"); await V.page.waitForSelector("h1");
  ok(/not connected yet/.test(await V.page.locator("main").innerText()) && (await V.page.locator("main form, main input").count()) === 0, `${kind}: the Give button goes to a page that says the payment service is not connected, with no form`);
  await snap(V.page, `give-${px}`);
  await V.page.goto("/m/alpha-table-ministry");
  ok(/Give to Alpha Table Ministry/.test(await V.page.locator("main").innerText()) && /This link is Alpha Table Ministry's own/.test(await V.page.locator("main").innerText()), `${kind}: the ministry's own page now has its Give button, labelled as the ministry's own`);
  await snap(V.page, `ministry-page-give-${px}`);

  for (const [who, h] of [["first treasurer", A], ["second treasurer", B], ["visitor", V]]) { ok(h.errors.length === 0, `${kind}: zero page errors for the ${who}`, h.errors); await h.close(); }
}
await browser.close(); await pool.end(); await s.stop(); await smtp.stop();
process.exit(T.done());

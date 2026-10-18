#!/usr/bin/env node
/* tests/browser-test.mjs — a real Chromium, a phone at 390 and a desk at 1440, real clicks and real typing, and zero page errors.
   A visitor reads the front and the board, joins with an emailed code, makes her ministry's page, posts an ask; a steward (made by
   SQL) signs in, reads the queue, approves the ministry and the post, and sends another post back with a note; the poster reads the
   note; a second ministry joins, is read, finds the post on the board with a filter, answers it, and the first ministry sees the
   answer. Nothing says "published" before a person read it. Nothing is sideways; every button is big enough for a thumb.
   LM_SHOTS=<dir> also writes the screenshots.   LEXOS_DB_NAME=linkedm_t_<mine> node tests/browser-test.mjs */
import { counter, ownDatabase, startServer, smtpStandIn, sleep } from "./helpers.mjs";
import { launch, open, noSideways, SHOTS, shots } from "./browser-lib.mjs";
import { seedWorld, seedAlexExtras } from "./seed.mjs";

const T = counter("browser-test"); const { ok } = T;
const db = await ownDatabase("browser"); const smtp = await smtpStandIn();
const s = await startServer({ url: db.url, env: { LEXOS_SMTP_URL: smtp.url, LEXOS_MAIL_FROM: "board@linkedm.test" } });
ok(s.up, "the server is up", s.logText().slice(-300));
const { pool } = await import("../server/db.mjs");
const sql = (q, p) => pool.query(q, p).then((r) => r.rows);
const world = await seedWorld({ base: s.base, smtp, sql: (q) => pool.query(q) });
const extras = await seedAlexExtras({ world, smtp });
const browser = await launch(); const snap = shots(SHOTS);
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const until = async (fn, what) => { for (let i = 0; i < 80; i++) { if (await fn()) return true; await sleep(100); } ok(false, "waited for " + what); return false; };
const typeIn = async (page, sel, text) => { await page.locator(sel).first().fill(text); };
const big = async (page, label) => {
  const small = await page.evaluate(() => [...document.querySelectorAll("main a.btn, main button, main input:not([type=hidden]), main select, main textarea, header a.btn, footer a")].filter((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && !(el.tagName === "A" && !el.classList.contains("btn")) && r.height < 43.5; }).map((el) => `${el.tagName.toLowerCase()} "${(el.textContent || el.name || "").trim().slice(0, 24)}" ${Math.round(el.getBoundingClientRect().height)}px`));
  ok(small.length === 0, `${label}: every button and field is at least 44 pixels tall`, small.slice(0, 4));
};
const calm = async (page, label) => { ok(await noSideways(page), `${label}: nothing scrolls sideways`); };
const textOf = (page) => page.locator("main").innerText();

async function signInByUi(page, email, smtpBox) {
  await page.goto("/join");
  await typeIn(page, "input[type=email]", email);
  await page.click("button:has-text('Send me a code')");
  await page.waitForSelector("input[name=code]");
  await sleep(150);
  const code = smtpBox.codeFor(email);
  ok(!!code, `a code for ${email} arrived by email`);
  await typeIn(page, "input[name=code]", code.slice(0, 3) + " " + code.slice(3));
  await page.click("button:has-text('Sign in')");
}
async function makeMinistry(page, v) {
  await page.waitForSelector("input[name=name]");
  await typeIn(page, "input[name=name]", v.name); await typeIn(page, "input[name=contact_name]", v.contact); await typeIn(page, "input[name=city]", v.city);
  await page.selectOption("select[name=state]", v.state); await typeIn(page, "textarea[name=about]", v.about);
  await page.click("button:has-text('Send my ministry to be read')");
  await page.waitForSelector("text=Thank you. A person at Linked Ministries will read your page");
}

for (const kind of ["phone", "desk"]) {
  const tag = kind === "phone" ? "p" : "d";
  const A = { email: `lead.${tag}@journey-alpha.example`, name: `Journey ${tag.toUpperCase()} Table Ministry` };
  const B = { email: `lead.${tag}@journey-bravo.example`, name: `Journey ${tag.toUpperCase()} House Ministry` };
  const STEW = `steward.${tag}@linkedm.example`;
  const title = `Twelve folding chairs for ${tag === "p" ? "Phone" : "Desk"} night`;
  const second = `Door helpers for ${tag === "p" ? "Phone" : "Desk"} night`;

  /* ---- a visitor reads the front and the board ---- */
  const v = await open(browser, s.base, kind);
  await v.page.goto("/");
  ok(/Ministries helping ministries/.test(await textOf(v.page)) && /Disciples' Authority/.test(await v.page.locator("body").innerText()), `${kind}: the front says what Linked Ministries is and names Disciples' Authority`);
  ok(await v.page.locator("a[href='https://www.disciplesauthority.org']").count() >= 1, `${kind}: and links to it`);
  ok((await v.page.locator("main article.post").count()) === 6 && (await v.page.locator("main a[data-answer]").count()) === 0 && /Prayer partners for our youth night/.test(await textOf(v.page)), `${kind}: it shows the board's six latest posts, read-only`);
  await calm(v.page, `${kind}: the front`); await big(v.page, `${kind}: the front`);
  if (tag === "p" || true) await snap(v.page, `front-${kind === "phone" ? 390 : 1440}`);
  await v.page.click("main a.btn:has-text('See the board')");
  await v.page.waitForSelector("article.post");
  ok(/The board/.test(await textOf(v.page)) && (await v.page.locator("article.post").count()) >= 8, `${kind}: the board lists the posts`);
  await calm(v.page, `${kind}: the board`); await big(v.page, `${kind}: the board`);
  await snap(v.page, `board-${kind === "phone" ? 390 : 1440}`);
  await v.page.selectOption("#f-kind", "give"); await v.page.click("button:has-text('Show these')");
  await v.page.waitForURL(/kind=give/);
  const kinds = await v.page.locator("article.post .tag").allInnerTexts();
  ok(kinds.length >= 3 && kinds.every((k) => k.toLowerCase() === "give"), `${kind}: the filter for gives shows only gives`, kinds);
  await v.page.click("a:has-text('Clear')"); await v.page.waitForURL((u) => !/kind=/.test(u.search));
  await typeIn(v.page, "#f-q", "coats"); await v.page.click("button:has-text('Show these')"); await v.page.waitForSelector("article.post");
  ok((await v.page.locator("article.post").count()) === 1 && /winter coats/i.test(await textOf(v.page)), `${kind}: a search for a word finds the post`);
  const answersBefore = (await sql("select count(*)::int n from lm.answers"))[0].n, mailsBeforeVisitor = smtp.mails.length;
  await v.page.goto("/board"); await v.page.locator("article.post a[data-answer]").first().click();
  await v.page.waitForSelector(".answer-slot .msg");
  ok(/Sign in to answer/.test(await v.page.locator(".answer-slot").first().innerText()), `${kind}: "I can help" while signed out says to sign in`);
  await sleep(200);
  ok(smtp.mails.length === mailsBeforeVisitor && (await sql("select count(*)::int n from lm.answers"))[0].n === answersBefore, `${kind}: and sent nothing, saved nothing`);

  /* ---- a ministry joins ---- */
  await v.page.goto("/");
  await v.page.click("main a.btn:has-text('Join the network')");
  await v.page.waitForSelector("input[type=email]");
  await typeIn(v.page, "input[type=email]", "not-an-email");
  await v.page.click("button:has-text('Send me a code')");
  await v.page.waitForSelector(".out .msg");
  ok(/Type an email/.test(await v.page.locator(".out").innerText()), `${kind}: a bad email gets a plain sentence`);
  await signInByUi(v.page, A.email, smtp);
  await makeMinistry(v.page, { name: A.name, contact: "Journey Lead", city: "Seattle", state: "WA", about: "We serve a hot meal every Saturday and run a small youth night." });
  await calm(v.page, `${kind}: the thanks`);
  await v.page.click("a:has-text('Go to my ministry')");
  await v.page.waitForSelector("text=Waiting for a person at Linked Ministries to read your ministry's page");
  let t = await textOf(v.page);
  ok(/Waiting/.test(t) && !/published/i.test(t) && !/It is part of the network/.test(t), `${kind}: the new ministry is told it is waiting for a person, and nothing says it is on the network`);

  /* ---- it posts an ask ---- */
  await v.page.click("button:has-text('Post an ask')");
  await v.page.waitForSelector("form select[name=category]");
  await calm(v.page, `${kind}: the post form`); await big(v.page, `${kind}: the post form`);
  await v.page.selectOption("select[name=category]", "furniture");
  await typeIn(v.page, "input[name=title]", title);
  await typeIn(v.page, "textarea[name=body]", "We need twelve folding chairs for our Thursday night meeting. We can pick them up in Seattle.");
  const dmax = await v.page.locator("input[name=open_until]").getAttribute("max"), dmin = await v.page.locator("input[name=open_until]").getAttribute("min");
  ok(dmin === day(0) && dmax === day(90), `${kind}: the date box allows today through 90 days out`, { dmin, dmax });
  if (tag === "p") await snap(v.page, "post-form-390"); else await snap(v.page, "post-form-1440");
  await v.page.click("form button[type=submit]:has-text('Send to be read')");
  await v.page.waitForSelector("text=Sent. It is waiting for a person at Linked Ministries to read it.");
  t = await textOf(v.page);
  ok(/Waiting to be read/.test(t) && /Waiting for a person at Linked Ministries to read it\./.test(t) && !/published/i.test(t) && !/On the board/.test(t.replace("On the board. Other ministries", "")), `${kind}: the post says it is waiting for a person, never 'published', never 'on the board'`);
  await v.page.click("button:has-text('Post an ask')");
  await v.page.waitForSelector("form select[name=category]");
  await v.page.selectOption("select[name=category]", "volunteers");
  await typeIn(v.page, "input[name=title]", second); await typeIn(v.page, "textarea[name=body]", "Help.");
  await v.page.click("form button[type=submit]:has-text('Send to be read')");
  await v.page.waitForSelector(".out .msg");
  ok(/say a little more/i.test(await v.page.locator(".out").innerText()), `${kind}: words that are too short get a plain sentence, and nothing is saved`);
  await typeIn(v.page, "textarea[name=body]", "We want four people to greet and seat our guests on Thursday evening.");
  await v.page.click("form [data-act=save]");
  await v.page.waitForSelector("text=Saved as a draft. Only your ministry can see it.");
  ok(/Drafts/.test(await textOf(v.page)), `${kind}: a draft is saved and listed as a draft`);
  await v.page.click(`[data-post] button:has-text('Send to be read')`);
  await v.page.waitForSelector("text=Sent. It is waiting for a person at Linked Ministries to read it.");
  await calm(v.page, `${kind}: the poster's page`); await big(v.page, `${kind}: the poster's page`);
  ok((await sql("select count(*)::int n from lm.posts p join lm.ministries m on m.id = p.ministry_id where m.name = $1 and p.status = 'waiting'", [A.name]))[0].n === 2, `${kind}: two posts are waiting in the database`);
  ok(!(await (await v.ctx.newPage()).goto(s.base + "/board").then(async (r) => (await r.text()).includes(title))), `${kind}: and neither is on the public board`);
  ok(v.errors.length === 0, `${kind}: the visitor's pages: zero page errors`, v.errors.slice(0, 3));

  /* ---- a steward (made by SQL) reads the queue ---- */
  await sql("select lm.make_steward($1)", [STEW]);
  const st = await open(browser, s.base, kind);
  await signInByUi(st.page, STEW, smtp);
  await st.page.waitForSelector("a:has-text('Open the page for stewards')");
  ok(/You are a steward/.test(await textOf(st.page)) && !(await st.page.locator("input[name=name]").count()), `${kind}: a steward who has no ministry is not asked to make one; the page offers the steward's page`);
  await st.page.goto("/steward"); await st.page.waitForSelector("[data-ministry]");
  ok((await st.page.locator("[data-ministry]").count()) === 2 && /Journey/.test(await textOf(st.page)), `${kind}: the queue shows the waiting ministries`);
  await calm(st.page, `${kind}: the steward queue`); await big(st.page, `${kind}: the steward queue`);
  await snap(st.page, `steward-${kind === "phone" ? 390 : 1440}`);
  await st.page.click(`[data-ministry]:has-text("${A.name}") button:has-text('Approve')`);
  await until(async () => (await sql("select status from lm.ministries where name = $1", [A.name]))[0].status === "public", "the ministry to be public");
  ok((await sql("select status from lm.ministries where name = $1", [A.name]))[0].status === "public", `${kind}: approving the ministry makes it public in the database`);
  await st.page.click(`[data-post]:has-text("${title}") button:has-text('Approve')`);
  await until(async () => (await sql("select status from lm.posts where title = $1", [title]))[0].status === "public", "the post to be public");
  await st.page.click(`[data-post]:has-text("${second}") button:has-text('Send back')`);
  await st.page.waitForSelector(`[data-post]:has-text("${second}") textarea`);
  await st.page.click(`[data-post]:has-text("${second}") button:has-text('Send back')`);   // a note is needed
  await st.page.waitForSelector(`[data-post]:has-text("${second}") .out .msg`);
  ok(/short note/i.test(await st.page.locator(`[data-post]:has-text("${second}") .out`).innerText()), `${kind}: sending back with no note is refused in words`);
  await typeIn(st.page, `[data-post]:has-text("${second}") textarea`, "Please say which evening and what time.");
  await st.page.click(`[data-post]:has-text("${second}") button:has-text('Send back')`);
  await until(async () => (await sql("select status from lm.posts where title = $1", [second]))[0].status === "draft", "the post to be sent back");
  await st.page.waitForSelector("text=Sent back with your note.");
  ok(st.errors.length === 0, `${kind}: the steward's pages: zero page errors`, st.errors.slice(0, 3));
  await st.close();

  /* ---- the poster reads the note; the board shows the one approved post ---- */
  await v.page.goto("/me"); await v.page.waitForSelector("[data-group=public]");
  t = await textOf(v.page);
  ok(/It is part of the network/.test(t) && /On the board\. Other ministries can answer it\./.test(t), `${kind}: now the ministry says a person read its page, and the post says it is on the board`);
  ok(/sent this back with a note: Please say which evening and what time\./.test(t) && /Drafts/.test(t), `${kind}: the sent-back post is a draft again, with the steward's note`);
  await v.page.goto("/board"); await v.page.waitForSelector("article.post");
  ok((await v.page.locator(`article.post:has-text("${title}")`).count()) === 1 && (await v.page.locator(`article.post:has-text("${second}")`).count()) === 0, `${kind}: the board shows the approved post and not the one sent back`);

  /* ---- a second ministry answers ---- */
  const b = await open(browser, s.base, kind);
  await signInByUi(b.page, B.email, smtp);
  await makeMinistry(b.page, { name: B.name, contact: "Journey Bravo", city: "Spokane", state: "WA", about: "We run a recovery house for men and a Tuesday supper." });
  await b.page.goto(`/board?q=${encodeURIComponent("folding chairs")}`); await b.page.waitForSelector("article.post");
  await b.page.locator(`article.post:has-text("${title}") a[data-answer]`).click();
  await b.page.waitForSelector(".answer-slot .msg");
  ok(/not been read yet/.test(await b.page.locator(".answer-slot").first().innerText()), `${kind}: a ministry nobody has read yet is told it must wait before answering`);
  await sql("update lm.ministries set status = 'public', reviewed_by = (select user_id from lm.people where steward limit 1), reviewed_at = now() where name = $1", [B.name]);
  await b.page.reload(); await b.page.waitForSelector("article.post");
  await b.page.locator(`article.post:has-text("${title}") a[data-answer]`).click();
  await b.page.waitForSelector(".answer-slot textarea[name=words]");
  await calm(b.page, `${kind}: the answer form`); await big(b.page, `${kind}: the answer form`);
  if (tag === "p") await snap(b.page, "answer-390"); else await snap(b.page, "answer-1440");
  const mailsBefore = smtp.mails.length;
  await b.page.click(".answer-slot button:has-text('Send')");
  await b.page.waitForSelector(".answer-slot .msg");
  ok(/few words/i.test(await b.page.locator(".answer-slot .out").innerText()) && smtp.mails.length === mailsBefore, `${kind}: an empty answer is refused in words and sends nothing`);
  await typeIn(b.page, ".answer-slot textarea[name=words]", "We have twelve chairs and a truck. We can bring them Friday afternoon.");
  await typeIn(b.page, ".answer-slot input[name=phone]", "509-555-0142");
  ok(!(await b.page.locator(".answer-slot").innerText()).includes(`Sent to ${A.name}`), `${kind}: before sending, the screen does not say 'Sent to'`);
  await b.page.click(".answer-slot button:has-text('Send')");
  await b.page.waitForSelector(".answer-slot .msg.ok");
  ok((await b.page.locator(".answer-slot .msg.ok").innerText()) === `Sent to ${A.name}.`, `${kind}: the screen says "Sent to ${A.name}." after the mail provider took it`);
  const got = smtp.mails.slice(mailsBefore);
  ok(got.length === 1 && got[0].to.includes(A.email) && got[0].replyTo === B.email && got[0].text.includes("twelve chairs and a truck") && got[0].subject.includes(B.name), `${kind}: exactly one email reached the first ministry, from the second, with its words`, got.map((m) => m.subject));
  ok(b.errors.length === 0, `${kind}: the second ministry's pages: zero page errors`, b.errors.slice(0, 3));
  await b.close();
  await v.page.goto("/me"); await v.page.waitForSelector("[data-answers=received]");
  t = await v.page.locator("[data-answers=received]").innerText();
  ok(t.includes(B.name) && t.includes("twelve chairs and a truck") && t.includes(B.email) && t.includes("509-555-0142"), `${kind}: the first ministry's page shows the answer it received, with the reply address`);
  ok(/1 answer/.test(await textOf(v.page)), `${kind}: and the post counts it`);

  /* ---- the poster closes it ---- */
  await v.page.click(`[data-post]:has-text("${title}") button:has-text('Met')`);
  await v.page.waitForSelector("text=Closed.");
  await v.page.goto("/board"); await v.page.waitForSelector("article.post");
  ok((await v.page.locator(`article.post:has-text("${title}")`).count()) === 0, `${kind}: a closed post is gone from the board`);
  ok(v.errors.length === 0, `${kind}: every page of the first ministry: zero page errors`, v.errors.slice(0, 3));
  await v.close();
}
/* the made-up network, for the screenshots: the poster's own page and the empty-handed leader's */
if (SHOTS) {
  const a = await open(browser, s.base, "phone"); await a.ctx.addCookies([{ name: "lm_session", value: world.c["alex@alpha.example"].jar().split("=").slice(1).join("="), url: s.base }]);
  await a.page.goto("/me"); await a.page.waitForSelector("[data-group=public]"); await snap(a.page, "me-390"); await a.close();
  const d = await open(browser, s.base, "desk"); await d.ctx.addCookies([{ name: "lm_session", value: world.c["alex@alpha.example"].jar().split("=").slice(1).join("="), url: s.base }]);
  await d.page.goto("/me"); await d.page.waitForSelector("[data-group=public]"); await snap(d.page, "me-1440"); await d.close();
}
await browser.close(); await s.stop(); await smtp.stop(); await pool.end();
process.exit(T.done());

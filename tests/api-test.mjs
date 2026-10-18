#!/usr/bin/env node
/* tests/api-test.mjs — the whole thing over HTTP, with the real server, a database of its own and a stand-in mail server that
   speaks real SMTP. A ministry joins by an emailed code, makes its page, posts; a steward (set by SQL) reads and approves; the
   board shows only what a person approved; another ministry answers, and the one email arrives. With no mail provider, or one
   that refuses, nothing is sent and nothing is saved, and the screen is told so. Each person also asks for what is not theirs.
   LEXOS_DB_NAME=linkedm_t_<mine> node tests/api-test.mjs */
import { counter, ownDatabase, startServer, client, signIn, smtpStandIn, sleep } from "./helpers.mjs";
import { checkPage } from "./banned.mjs";

const T = counter("api-test"); const { ok } = T;
const db = await ownDatabase("api");
const { pool } = await import("../server/db.mjs");
const sql = async (s, p = []) => (await pool.query(s, p)).rows;
const smtp = await smtpStandIn();
const KPI = "k".repeat(24);
const s = await startServer({ url: db.url, env: { KPI_READ_TOKEN: KPI, LEXOS_SMTP_URL: smtp.url, LEXOS_MAIL_FROM: "Linked Ministries <board@linkedm.test>" } });
ok(s.up, "the server is up", s.logText().slice(-300));
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/* ---- health, headers, pages ---- */
const anon = client(s.base);
const hr = await anon.get("/api/health");
ok(hr.status === 200 && hr.text === '{"status":"ok","service":"Linked Ministries"}', "the public health answer is exactly the status and the name", hr.text);
ok((await anon.get("/api/health/detail")).status === 401 && (await anon.get("/api/health/detail", { authorization: "Bearer wrong-wrong-wrong-wrong" })).status === 401, "the detail refuses a stranger and a wrong key");
const det = await anon.get("/api/health/detail", { authorization: "Bearer " + KPI });
ok(det.status === 200 && det.json.ministries === 0 && det.json.mail === true && det.json.migrations >= 4, "the detail, with the operator's key, counts ministries and says mail is set up", det.json);
const csp = hr.headers.get("content-security-policy") || "";
ok(/default-src 'none'/.test(csp) && /script-src 'self'(;|$)/.test(csp) && !/unsafe-inline|unsafe-eval/.test(csp) && /frame-ancestors 'none'/.test(csp), "the content-security policy is enforced, with no inline script and no eval", csp);
ok(hr.headers.get("x-content-type-options") === "nosniff" && hr.headers.get("referrer-policy") === "no-referrer" && /camera=\(\)/.test(hr.headers.get("permissions-policy") || ""), "the other security headers are on");
const pages = {};
for (const p of ["/", "/board", "/join", "/me", "/steward", "/robots.txt", "/sitemap.xml"]) { const r = await anon.get(p); pages[p] = r.text; ok(r.status === 200, `${p} answers 200`); }
ok((await anon.get("/nope")).status === 404 && (await anon.get("/board/not-a-real-id")).status === 404 && (await anon.get("/board/00000000-0000-4000-8000-000000000000")).status === 404, "an unknown page and an unknown post answer 404, with a page");
for (const p of ["/", "/board", "/join", "/me", "/steward"]) { const bad = checkPage(pages[p]); ok(bad.length === 0, `${p}: no script inline, no style attribute, no banned thing`, bad); }
ok(/Disallow: \/me/.test(pages["/robots.txt"]) && /\/board<\/loc>/.test(pages["/sitemap.xml"]), "robots keeps the private pages out, the sitemap lists the board");
ok((await anon.get("/join")).headers.get("x-robots-tag") === "noindex, nofollow" && /no-store/.test((await anon.get("/me")).headers.get("cache-control")), "the private pages are noindex and not cached");
ok(/not yet filed/.test(pages["/"]) && /Washington nonprofit corporation/.test(pages["/"]) && /911/.test(pages["/"]) && /988/.test(pages["/"]), "the front says the nonprofit line and the emergency line");
ok(/disciplesauthority\.org/.test(pages["/"]) && /Sober-living housing/.test(pages["/"]), "the front names Disciples' Authority with its link and the planned housing");
ok(JSON.stringify((await anon.get("/api/board")).json) === '{"posts":[],"total":0,"page":1,"pages":1}', "an empty board is an empty list");
const prodAnon = await anon.get("/api/product");
ok(prodAnon.json.mail === true && prodAnon.json.categories.length === 10 && !prodAnon.json.categories.some((c) => /money|donat|cash|fund/i.test(c.id + c.label)) && prodAnon.json.categories.map((c) => c.id).join() === "housing,food,clothing,transportation,volunteers,equipment,furniture,teaching_training,prayer,other", "the product answer lists the ten categories, none about money");

/* ---- sign in by a code ---- */
ok((await anon.post("/api/auth/start", { to: "not an email" })).status === 400, "a sign-in with no readable email is refused with words");
ok((await anon.get("/api/me")).status === 401 && (await anon.post("/api/posts", {})).status === 401 && (await anon.get("/api/steward/queue")).status === 401, "nothing signed-in is reachable without signing in");
const alex = client(s.base);
const st1 = await alex.post("/api/auth/start", { to: "alex@alpha.example" });
ok(st1.status === 200 && st1.json.channel === "email" && !("code" in st1.json), "the start answer says where the code went and never carries it", st1.json);
await sleep(100);
const mailed = smtp.mails.find((m) => m.to.includes("alex@alpha.example"));
ok(mailed && /^\d{6} is your Linked Ministries sign-in code$/.test(mailed.subject) && /works for 10 minutes/.test(mailed.text), "the code arrives by email through the real mail path", mailed && mailed.subject);
ok((await alex.post("/api/auth/verify", { to: "alex@alpha.example", code: "000000" })).status === 401, "a wrong code is refused");
const code = smtp.codeFor("alex@alpha.example");
const vr = await alex.post("/api/auth/verify", { to: "alex@alpha.example", code: code.slice(0, 3) + " " + code.slice(3) });
ok(vr.status === 200 && vr.json.has_ministry === false && vr.json.landing === "/join", "the right code (with a space in it) signs in, and a person with no ministry lands on /join", vr.json);
const setc = vr.headers.getSetCookie().join(";");
ok(/lm_session=/.test(setc) && /HttpOnly/.test(setc) && /SameSite=Lax/.test(setc), "the session is an httpOnly SameSite cookie");
ok((await alex.post("/api/auth/verify", { to: "alex@alpha.example", code })).status === 401, "a code works once");
{ const x = client(s.base); await x.post("/api/auth/start", { to: "lock@example.org" }); let last; for (let i = 0; i < 6; i++) last = await x.post("/api/auth/verify", { to: "lock@example.org", code: String(111111 + i) });
  ok(last.status === 429 && /Too many wrong codes/.test(last.json.words) && /canceled/.test(last.json.words), "five wrong codes lock the address and cancel the code", last.json);
  const c2 = smtp.codeFor("lock@example.org"); ok((await x.post("/api/auth/verify", { to: "lock@example.org", code: c2 })).status === 429, "even the right code does not work while it is locked"); }
{ const x = client(s.base); let last; for (let i = 0; i < 8; i++) last = await x.post("/api/auth/start", { to: "flood@example.org" }); ok(last.status === 429, "asking for codes again and again is limited"); }
const me0 = await alex.get("/api/me");
ok(me0.status === 200 && me0.json.signed_in && me0.json.ministry === null && me0.json.steward === false && me0.json.user.email === "alex@alpha.example", "the signed-in page knows the person, and that there is no ministry yet", me0.json);

/* ---- a ministry makes its page ---- */
const good = { name: "Alpha Table Ministry", city: "Seattle", state: "wa", about: "We feed neighbors every week and run a small youth night.", website: "", contact_name: "Alex Lead", contact_email: "answers@alpha.example" };
for (const [what, bad, status] of [["no name", { name: "" }, 422], ["no state", { state: "" }, 422], ["a state that is not one", { state: "ZZ" }, 422], ["too few words about it", { about: "short" }, 422], ["a website that is not http", { website: "javascript:alert(1)" }, 422], ["an email that is not one", { contact_email: "nope" }, 422]])
  ok((await alex.post("/api/ministry", { ...good, ...bad })).status === status, `a ministry with ${what} is refused with words`);
const made = await alex.post("/api/ministry", good);
ok(made.status === 201 && made.json.status === "waiting" && /A person at Linked Ministries will read your page/.test(made.json.words), "the ministry is made and says it is waiting for a person", made.json);
const me1 = (await alex.get("/api/me")).json;
ok(me1.ministry.status === "waiting" && me1.ministry.state === "WA" && me1.lead === true && me1.ministry.contact_email === "answers@alpha.example", "the lead reads the ministry back: waiting, state in capitals, lead", me1.ministry);
ok((await alex.post("/api/ministry", good)).status === 409, "a person who already has a ministry cannot make another");
ok((await anon.get("/")).text.indexOf("Alpha Table") < 0 && (await anon.get("/board")).text.indexOf("Alpha Table") < 0, "a waiting ministry is on no public page");

/* ---- a post ---- */
const body = { kind: "ask", category: "furniture", title: "Ten folding tables, please", body: "We need ten folding tables for the Saturday meal, near the church.", open_until: day(30), submit: true };
for (const [what, bad, re] of [["a day 91 days out", { open_until: day(91) }, /90 days/], ["a day that has passed", { open_until: day(-2) }, /passed/], ["no kind", { kind: "" }, /ask or give/], ["a made-up category", { category: "money" }, /about/], ["no title", { title: "" }, /title/], ["no words", { body: "" }, /words/], ["no date", { open_until: "" }, /day/]])
  { const r = await alex.post("/api/posts", { ...body, ...bad }); ok(r.status === 422 && re.test(r.json.words), `a post with ${what} is refused in words`, r.json); }
ok((await alex.post("/api/posts", { ...body, open_until: day(89) })).status === 201, "a day within 90 days is accepted");
const draft = await alex.post("/api/posts", { ...body, title: "A draft I keep", submit: false });
ok(draft.status === 201 && draft.json.status === "draft", "a draft is saved as a draft");
const sent = await alex.post("/api/posts", body);
ok(sent.status === 201 && sent.json.status === "waiting", "a post sent to be read is waiting, not public");
const mine = (await alex.get("/api/my/posts")).json.posts;
ok(mine.length === 3 && mine.filter((p) => p.status === "waiting").length === 2 && mine.filter((p) => p.status === "draft").length === 1, "the poster sees a draft and two waiting posts, and not one public", mine.map((p) => p.status));
ok(!mine.some((p) => p.status === "public") && !JSON.stringify(mine).includes("published"), "and no word says published");
const pid = sent.json.id;

/* ---- the board shows only what a person approved ---- */
ok(JSON.stringify((await anon.get("/api/board")).json.posts) === "[]" && (await anon.get("/api/board/" + pid)).status === 404, "the board lists nothing while everything waits, and a waiting post has no public address");
ok((await anon.get("/board/" + pid)).status === 404 && !(await anon.get("/board")).text.includes("Ten folding tables"), "nor a page");

/* ---- the steward (set by SQL) ---- */
const sam = client(s.base);
await sam.post("/api/auth/start", { to: "sam@linkedm.example" }); await sleep(80);
await sam.post("/api/auth/verify", { to: "sam@linkedm.example", code: smtp.codeFor("sam@linkedm.example") });
ok((await sam.get("/api/steward/queue")).status === 403, "a person who is not a steward is refused the queue");
ok((await sam.post("/api/steward/stewards", { email: "sam@linkedm.example" })).status === 403, "and cannot make themselves a steward");
ok((await alex.post(`/api/steward/posts/${pid}/review`, { decision: "approve" })).status === 403 && (await alex.post(`/api/steward/ministries/${me1.ministry.id}/review`, { decision: "approve" })).status === 403, "a lead cannot approve their own ministry or post");
await sql("select lm.make_steward('sam@linkedm.example')");
const samMe = (await sam.get("/api/me")).json;
ok(samMe.steward === true && samMe.ministry === null, "after the one line of SQL the person is a steward", samMe.person);
const q1 = (await sam.get("/api/steward/queue")).json;
ok(q1.ministries.length === 1 && q1.ministries[0].contact_email === "answers@alpha.example" && q1.posts.length === 2 && q1.stewards.length === 1, "the steward's queue holds the ministry, the two waiting posts (not the draft), and the stewards", { m: q1.ministries.length, p: q1.posts.length });
ok(!q1.posts.some((p) => p.title === "A draft I keep"), "a draft is not in the queue");
const early = await sam.post(`/api/steward/posts/${pid}/review`, { decision: "approve" });
ok(early.status === 409 && /not read the ministry|ministry/i.test(early.json.words), "a post cannot go public before its ministry has been read", early.json);
ok((await sam.post(`/api/steward/ministries/${me1.ministry.id}/review`, { decision: "send_back" })).status === 422, "sending back needs a note");
ok((await sam.post(`/api/steward/ministries/${me1.ministry.id}/review`, { decision: "maybe" })).status === 400, "and the decision is approve or send back");
const sb = await sam.post(`/api/steward/ministries/${me1.ministry.id}/review`, { decision: "send_back", note: "Please say which neighborhood you serve." });
ok(sb.status === 200, "the steward sends the ministry back with a note");
const meSb = (await alex.get("/api/me")).json;
ok(meSb.ministry.status === "sent_back" && meSb.ministry.review_note === "Please say which neighborhood you serve.", "the lead reads the note");
const upd = await alex.post("/api/ministry/update", { ...good, state: "WA", about: "We feed neighbors every week in Rainier Valley and run a small youth night." });
ok(upd.status === 200 && upd.json.status === "waiting", "changing a ministry that was sent back puts it back in the queue", upd.json);
ok((await sam.post(`/api/steward/ministries/${me1.ministry.id}/review`, { decision: "approve" })).status === 200, "the steward approves the ministry");
ok((await alex.get("/api/me")).json.ministry.status === "public", "the ministry is public");
ok(JSON.stringify((await anon.get("/api/board")).json.posts) === "[]", "its posts are still not public: each post is read on its own");
const sbPost = await sam.post(`/api/steward/posts/${(sent.json.id)}/review`, { decision: "send_back", note: "Say how many people eat." });
ok(sbPost.status === 200, "the steward sends the post back with a note");
const mine2 = (await alex.get("/api/my/posts")).json.posts.find((p) => p.id === pid);
ok(mine2.status === "draft" && mine2.review_note === "Say how many people eat.", "the poster reads the note on a draft again");
const edit = await alex.post(`/api/posts/${pid}/update`, { ...body, body: "We need ten folding tables for the Saturday meal. About eighty people eat. Near the church.", submit: true });
ok(edit.status === 200 && edit.json.status === "waiting", "the poster changes the words and sends it again");
ok((await alex.post(`/api/posts/${pid}/update`, { ...body, title: "Quietly changed after sending" })).status === 409, "a post that is waiting cannot be changed (the words are frozen)");
ok((await sam.post(`/api/steward/posts/${pid}/review`, { decision: "approve" })).status === 200, "the steward approves the post");
const other = alex; // a second post stays waiting
const board = (await anon.get("/api/board")).json;
ok(board.total === 1 && board.posts.length === 1 && board.posts[0].id === pid && board.posts[0].ministry === "Alpha Table Ministry" && board.posts[0].ministry_city === "Seattle", "the board now lists the one approved post, with the ministry's name and city", board.posts);
ok(Object.keys(board.posts[0]).sort().join() === "body,category,city,id,kind,ministry,ministry_city,ministry_state,open_until,posted_at,state,title", "and only the public fields: no contact, no note, no reader", Object.keys(board.posts[0]));
ok(!JSON.stringify(board).match(/answers@alpha|alex@alpha|contact|review_note|approved_by/), "no address and no name of a person is in the public answer");
const one = await anon.get("/api/board/" + pid); ok(one.status === 200 && one.json.post.title === "Ten folding tables, please", "a public post has a public address");
const html = (await anon.get("/board")).text, front = (await anon.get("/")).text;
ok(html.includes("Ten folding tables, please") && html.includes("I can help") && html.includes("Alpha Table Ministry") && /Open until/.test(html), "the board page shows the post: kind, title, ministry, city, dates, and one button");
ok(front.includes("Ten folding tables, please") && !front.includes("I can help") && !front.includes("We need this"), "the front shows the latest posts and no button");
ok(!html.includes("A draft I keep"), "the draft is not on the board");
for (const p of ["/", "/board", "/board/" + pid]) { const r = await anon.get(p); const bad = checkPage(r.text); ok(r.status === 200 && bad.length === 0, `${p}: no script inline, no style attribute, no banned thing`, bad); }
const give = await alex.post("/api/posts", { kind: "give", category: "food", title: "Surplus canned goods", body: "We have forty cases of canned goods to give away. Pickup in Seattle.", open_until: day(20), submit: true });
await sam.post(`/api/steward/posts/${give.json.id}/review`, { decision: "approve" });

/* ---- filters and search ---- */
const f = async (qs) => (await anon.get("/api/board" + qs)).json;
ok((await f("?kind=ask")).total === 1 && (await f("?kind=give")).total === 1 && (await f("")).total === 2, "the board filters by ask and give");
ok((await f("?category=food")).posts[0].title === "Surplus canned goods" && (await f("?category=housing")).total === 0, "by category");
ok((await f("?state=WA")).total === 2 && (await f("?state=OR")).total === 0, "by state");
ok((await f("?city=seattle")).total === 2 && (await f("?city=Spok")).total === 0, "by city, in any case");
ok((await f("?q=canned")).total === 1 && (await f("?q=folding+tables")).total === 1 && (await f("?q=Alpha")).total === 2 && (await f("?q=zebra")).total === 0, "by words in the title, the words or the ministry's name");
ok((await f("?q=%25")).total === 0 && (await f("?q=_")).total === 0, "a search for % or _ finds nothing (they are not wildcards)");
ok((await f("?kind=ask&category=furniture&state=WA&q=tables")).total === 1, "filters work together");
ok((await f("?kind=loan&category=money&state=ZZ")).total === 2, "an unknown filter is ignored, not trusted");
ok((await f("?q=%27%3B+drop+table+lm.posts%3B--")).total === 0 && (await f("")).total === 2, "a search that looks like SQL is only words");
ok((await anon.get("/board?kind=give")).text.includes("Surplus canned goods") && !(await anon.get("/board?kind=give")).text.includes("Ten folding tables"), "the board page filters the same way");
ok(/No posts match/.test((await anon.get("/board?q=zebra")).text), "a search with no match says so in words");
{ const t = (await anon.get("/board?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E")).text; ok(!t.includes("<script>alert") && t.includes("&lt;script&gt;"), "what is typed into a search is shown as text, never as markup"); }

/* ---- another ministry answers ---- */
const blake = client(s.base);
await signIn(blake, s, "blake@bravo.example", { smtp });
ok((await blake.post(`/api/posts/${pid}/answer`, { words: "We have eleven tables and a truck." })).status === 409, "a person with no ministry cannot answer");
await blake.post("/api/ministry", { name: "Bravo House Ministry", city: "Spokane", state: "WA", about: "We run a men's recovery house and a Tuesday supper.", contact_name: "Blake Lead", contact_email: "blake@bravo.example" });
const waitAns = await blake.post(`/api/posts/${pid}/answer`, { words: "We have eleven tables and a truck." });
ok(waitAns.status === 409 && /not read/i.test(waitAns.json.words), "a ministry that has not been read cannot answer yet, and is told why", waitAns.json);
await sam.post(`/api/steward/ministries/${(await blake.get("/api/me")).json.ministry.id}/review`, { decision: "approve" });
const mailsBefore = smtp.mails.length;
ok((await anon.post(`/api/posts/${pid}/answer`, { words: "We have eleven tables." })).status === 401, "a stranger cannot answer");
ok((await blake.post(`/api/posts/${pid}/answer`, { words: "ok" })).status === 422, "an answer needs a few words");
ok((await blake.post(`/api/posts/${pid}/answer`, { words: "We have eleven tables.", phone: "call me maybe" })).status === 422, "a phone number is digits only");
ok((await alex.post(`/api/posts/${pid}/answer`, { words: "We could answer our own post." })).status === 409, "a ministry cannot answer its own post");
ok((await blake.post(`/api/posts/00000000-0000-4000-8000-000000000000/answer`, { words: "We have eleven tables." })).status === 409 && (await blake.post(`/api/posts/${draft.json.id}/answer`, { words: "We have eleven tables." })).status === 409, "nor a post that is not open: unknown, or a draft of another ministry");
ok(smtp.mails.length === mailsBefore && (await sql("select count(*)::int n from lm.answers"))[0].n === 0, "none of those sent an email or saved an answer");
const ans = await blake.post(`/api/posts/${pid}/answer`, { words: "We have eleven tables and a truck. We can bring them Friday.", phone: "509-555-0142" });
ok(ans.status === 201 && ans.json.ok === true && ans.json.sent_to === "Alpha Table Ministry" && ans.json.words === "Sent to Alpha Table Ministry.", "the answer says Sent to the ministry, after the mail provider took it", ans.json);
const em = smtp.mails.slice(mailsBefore);
ok(em.length === 1, "exactly one email was sent", em.length);
ok(em[0].to.join() === "answers@alpha.example" && em[0].replyTo === "blake@bravo.example" && /Bravo House Ministry/.test(em[0].subject + em[0].text) && /Ten folding tables/.test(em[0].subject) && em[0].text.includes("We have eleven tables and a truck. We can bring them Friday.") && /509-555-0142/.test(em[0].text) && /blake@bravo\.example/.test(em[0].text), "to the posting ministry's contact, replying to the answerer, naming the answerer's ministry, with the words, the phone and the reply address", { to: em[0].to, rt: em[0].replyTo, subject: em[0].subject });
ok(/Hello Alex Lead/.test(em[0].text) && /911/.test(em[0].text) && /moves no money/.test(em[0].text), "it greets the contact by name and says the network moves no money");
const rows = await sql("select post_id, from_ministry_id, words, phone, reply_email, mail_id from lm.answers");
ok(rows.length === 1 && rows[0].post_id === pid && rows[0].reply_email === "blake@bravo.example" && rows[0].mail_id, "the answer is one row, with the mail provider's id", rows[0]);
const ansEv = await sql("select kind, actor_label, payload from lm.events where kind = 'answers.insert'");
ok(ansEv.length === 1 && ansEv[0].actor_label === "Blake Lead" && !JSON.stringify(ansEv).includes("eleven tables") && !JSON.stringify(ansEv).includes("509-555"), "the record has the answerer's name and the ids, and not the words", ansEv[0]);
ok((await blake.post(`/api/posts/${pid}/answer`, { words: "We have more tables, too." })).status === 409 && smtp.mails.length === mailsBefore + 1, "a ministry answers once; the second try sends nothing");
const recv = (await alex.get("/api/answers")).json, sentA = (await blake.get("/api/answers")).json;
ok(recv.received.length === 1 && recv.received[0].from_ministry === "Bravo House Ministry" && recv.received[0].phone === "509-555-0142" && recv.sent.length === 0, "the poster's page shows the answer it received", recv.received[0]);
ok(sentA.sent.length === 1 && sentA.sent[0].to_ministry === "Alpha Table Ministry" && sentA.received.length === 0, "and the answerer's page shows the one it sent");
const posts2 = (await alex.get("/api/my/posts")).json.posts.find((p) => p.id === pid);
ok(posts2.answers === 1, "the post counts its answer");

/* no fake state: a provider that refuses */
const gina = client(s.base); await signIn(gina, s, "gina@gamma.example", { smtp });
await gina.post("/api/ministry", { name: "Gamma Outreach", city: "Tacoma", state: "WA", about: "We run a food bank and a clothing closet on Saturdays.", contact_name: "Gina Lead", contact_email: "gina@gamma.example" });
await sam.post(`/api/steward/ministries/${(await gina.get("/api/me")).json.ministry.id}/review`, { decision: "approve" });
const mailsNow = smtp.mails.length;
smtp.refuse(true);
const refusedAns = await gina.post(`/api/posts/${pid}/answer`, { words: "We could bring four more tables." });
ok(refusedAns.status === 502 && /did not go out, so nothing was saved/.test(refusedAns.json.words), "when the mail provider refuses, the screen is told it did not go out", refusedAns.json);
ok((await sql("select count(*)::int n from lm.answers"))[0].n === 1 && smtp.mails.length === mailsNow, "and nothing was saved and nothing was sent");
smtp.refuse(false);
const gAns = await gina.post(`/api/posts/${pid}/answer`, { words: "We could bring four more tables." });
ok(gAns.status === 201 && (await sql("select count(*)::int n from lm.answers"))[0].n === 2, "when the provider takes it, the same answer goes through and is saved");

/* ---- closing ---- */
ok((await blake.post(`/api/posts/${pid}/close`, { reason: "met" })).status === 404, "another ministry cannot close a post");
ok((await alex.post(`/api/posts/${pid}/close`, { reason: "because" })).status === 400, "a close reason is Met or No longer needed");
ok((await alex.post(`/api/posts/${pid}/close`, { reason: "met" })).status === 200, "the poster closes it as met");
ok((await f("")).total === 1 && (await anon.get("/board/" + pid)).status === 404, "a closed post is off the board and has no public page");
ok((await blake.post(`/api/posts/${pid}/answer`, { words: "Too late to answer this." })).status === 409, "a closed post cannot be answered");
ok((await alex.get("/api/my/posts")).json.posts.find((p) => p.id === pid).status === "closed", "the poster still sees it, closed");

/* ---- the wrong person asks for what is not theirs ---- */
const bMine = (await blake.get("/api/my/posts")).json.posts;
ok(bMine.length === 0, "ministry B's posts are its own: none of A's");
ok((await blake.post(`/api/posts/${draft.json.id}/update`, { ...body })).status === 404 && (await blake.post(`/api/posts/${draft.json.id}/submit`)).status === 404, "B cannot change or send A's draft");
ok((await blake.get("/api/team")).json.people.length === 1 && !JSON.stringify((await blake.get("/api/team")).json).includes("alex@alpha"), "B's team is B's own");
ok((await blake.post("/api/ministry/update", { ...good, name: "Taken Over" })).status === 200 && (await sql("select name from lm.ministries where contact_email = 'answers@alpha.example'"))[0].name === "Alpha Table Ministry", "B's profile change touches only B's ministry");
ok(JSON.stringify((await gina.get("/api/answers")).json.received) === "[]", "ministry C reads no answer sent to A");
ok((await blake.get("/api/steward/queue")).status === 403 && (await blake.post(`/api/steward/ministries/${me1.ministry.id}/review`, { decision: "approve" })).status === 403, "B is refused every steward door");
const evil = await blake.post("/api/posts", { ...body }, { origin: "https://evil.example" });
ok(evil.status === 403 && evil.json.error === "cross_origin", "a change that arrives from another website is refused before it is read");

/* ---- the team ---- */
const ope = await alex.post("/api/team/invite", { email: "Dana@Alpha.example" });
ok(ope.status === 201 && ope.json.emailed === true && smtp.mails.some((m) => m.to.includes("dana@alpha.example") && /added you to Alpha Table Ministry/.test(m.subject)), "a lead adds a person by email, and the email goes out", ope.json);
ok((await alex.post("/api/team/invite", { email: "bad" })).status === 422 && (await alex.post("/api/team/invite", { email: "dana@alpha.example" })).status === 409, "a bad address is refused, and so is the same person twice");
const dana = client(s.base); await signIn(dana, s, "dana@alpha.example", { smtp });
const dme = (await dana.get("/api/me")).json;
ok(dme.ministry === null && dme.invites.length === 1 && dme.invites[0].ministry === "Alpha Table Ministry", "the invited person sees the invitation when they sign in with that address");
ok((await dana.post("/api/team/accept", { invite: dme.invites[0].id, name: "" })).status === 422, "joining needs the person's name");
ok((await blake.post("/api/team/accept", { invite: dme.invites[0].id, name: "Blake" })).status === 409, "a person who already has a ministry cannot take someone else's invitation");
ok((await dana.post("/api/team/accept", { invite: dme.invites[0].id, name: "Dana Member" })).status === 200 && (await dana.get("/api/me")).json.ministry.name === "Alpha Table Ministry" && (await dana.get("/api/me")).json.lead === false, "the invited person joins as a member");
ok((await dana.post("/api/team/invite", { email: "x@example.org" })).status === 403 && (await dana.post("/api/ministry/update", good)).status === 403, "a member cannot add people or change the page");
ok((await dana.post("/api/posts", { ...body, title: "Posted by a member", open_until: day(10) })).status === 201, "a member can post for the ministry");
const aid = me1.ministry.id; const team = (await alex.get("/api/team")).json;
ok(team.people.length === 2 && team.people.some((p) => p.role === "lead" && p.email === "alex@alpha.example"), "the lead sees the team");
const leave = await alex.post(`/api/team/${me0.json.user.id}/remove`);
ok(leave.status === 409 && /one lead/.test(leave.json.words), "the last lead cannot leave, and is told why in words", leave.json);
ok((await alex.post(`/api/team/${me0.json.user.id}/role`, { role: "member" })).status === 409, "nor make themselves a member");
ok((await alex.post(`/api/team/${dme.user.id}/role`, { role: "lead" })).status === 200, "the lead makes a second lead");
ok((await alex.post(`/api/team/${me0.json.user.id}/remove`)).status === 200 && (await alex.get("/api/me")).json.ministry === null, "and then can leave");
ok((await dana.post(`/api/team/${dme.user.id}/remove`)).status === 409, "the one who is now the last lead cannot leave");

/* ---- the audit's fixes, each tried over HTTP ---- */
{
  /* a cookie the browser sends that cannot be read is ignored, not a server error */
  for (const cookie of ["lm_session=%E0%A4%A", "junk; lm_session", "=x", "lm_session=" + "a".repeat(5000)]) { const r = await fetch(s.base + "/api/me", { headers: { cookie } }); ok(r.status === 401, `a broken cookie (${JSON.stringify(cookie.slice(0, 18))}) is a plain sign-in refusal, not a 500`, r.status); }
  /* an address is one address: a list, a name in quotes, an angle bracket are refused, and no mail goes anywhere */
  const nMail = smtp.mails.length;
  for (const bad of ["a,victim@bank.example", '"x"<y>@z.example', "a;b@c.example", "a@b..example", "<a@b.example>", "a b@c.example"]) ok((await client(s.base).post("/api/auth/start", { to: bad })).status === 400, `a sign-in with ${JSON.stringify(bad)} is refused`);
  await sleep(150); ok(smtp.mails.length === nMail && (await sql("select count(*)::int n from auth.users where email ~ '[,;<> \"]'"))[0].n === 0, "and no email was sent and no such person was made");
  ok((await client(s.base).post("/api/ministry", {})).status === 401, "(and a stranger cannot make a ministry)");
  /* a code is an email to someone else's inbox: three in ten minutes, twelve in a day, for one address */
  { const x = client(s.base), r = []; for (let i = 0; i < 4; i++) r.push((await x.post("/api/auth/start", { to: "bomb@example.org" })).status);
    ok(r.join() === "200,200,200,429", "a fourth code in ten minutes for one address is refused", r);
    for (let i = 0; i < 12; i++) await sql("insert into rl.events (bucket, key) values ('lm', 'startday:day@example.org')");
    ok((await client(s.base).post("/api/auth/start", { to: "day@example.org" })).status === 429, "and a thirteenth in a day is refused even when the ten minutes were quiet"); }
  /* the posting ministry's contact never reaches the HTTP answer to the answerer */
  ok(!/answers@alpha|Alex Lead|alex@alpha/.test(ans.text) && !/answers@alpha|Alex Lead/.test(JSON.stringify((await blake.get("/api/answers")).json)), "what the answerer's browser is told holds no address or name of the ministry it wrote to");
  ok(!/answers@alpha/.test(JSON.stringify((await anon.get("/api/board")).json)) && !/answers@alpha/.test((await anon.get("/board")).text), "nor the public board, as JSON or as a page");
  /* a double click sends one email, not two, and the screen is not told an error after the email went */
  { const before = smtp.mails.length;
    const twice = await Promise.all([gina.post(`/api/posts/${give.json.id}/answer`, { words: "We would take ten cases for our pantry." }), gina.post(`/api/posts/${give.json.id}/answer`, { words: "We would take ten cases for our pantry." })]);
    const codes = twice.map((r) => r.status).sort().join(); await sleep(100);
    ok(codes === "201,409" && smtp.mails.length === before + 1, "two answers sent at the same moment: one is sent, the other waits its turn and is told so; one email goes out", { codes, mails: smtp.mails.length - before }); }
  /* one post and one ministry can only be written to so often in a day */
  { const bPost = await sql("select id from lm.posts where title = 'Posted by a member'"); const id2 = bPost[0].id;
    await sam.post(`/api/steward/posts/${id2}/review`, { decision: "approve" });
    for (let i = 0; i < 25; i++) await sql("insert into rl.events (bucket, key) values ('lm', $1)", [`answer-post:${id2}`]);
    const before = smtp.mails.length; const capped = await gina.post(`/api/posts/${id2}/answer`, { words: "We could help with this one." });
    ok(capped.status === 429 && /a lot of answers/.test(capped.json.words) && smtp.mails.length === before && (await sql("select count(*)::int n from lm.answers where post_id = $1", [id2]))[0].n === 0, "a post that has had twenty-five answers today takes no more: nothing is sent and nothing is saved", capped.json); }
  /* a person keeps at most ten signed-in browsers */
  { const { createSession, sessionUser } = await import("../server/auth.mjs"); const uid = (await sql("select id from auth.users where email = 'dana@alpha.example'"))[0].id; const toks = [];
    for (let i = 0; i < 13; i++) toks.push(await createSession(uid, "test", "127.0.0.1"));
    const live = (await sql("select count(*)::int n from app.sessions where user_id = $1 and revoked_at is null", [uid]))[0].n;
    ok(live === 10 && !(await sessionUser(toks[0])) && !!(await sessionUser(toks[12])), "a person keeps ten signed-in browsers at most: the oldest are signed out, the newest works", live); }
  /* a header is one line */
  { const { oneLine } = await import("../server/mail.mjs"); ok(oneLine("Gamma\r\nBcc: spy@evil.example") === "Gamma Bcc: spy@evil.example" && !/[\r\n]/.test(oneLine("a b\nc\td")), "a subject made from someone's words is one line, whatever they typed"); }
}

/* ---- sign out ---- */
const out = await blake.post("/api/auth/signout");
ok(out.status === 200 && (await blake.get("/api/me")).status === 401, "signing out ends the session");

/* ---- the record ---- */
const ev = await sql("select actor_label from lm.events");
ok(ev.length > 30 && ev.every((e) => e.actor_label && e.actor_label.trim()), `the record holds ${ev.length} events, every one with a name`);
ok(!s.logText().includes(code) && !/answers@alpha|eleven tables/.test(s.logText()), "the server's log holds no sign-in code, no address and no one's words");
await s.stop();

/* ---- no mail at all: dev codes only, and the answer button says so ---- */
const s2 = await startServer({ url: db.url, env: { LEXOS_SMTP_URL: "" } });
ok(s2.up, "a second server with no mail provider is up", s2.logText().slice(-300));
const p2 = client(s2.base);
ok((await p2.get("/api/product")).json.mail === false, "it says it cannot send mail");
const eva = client(s2.base); await signIn(eva, s2, "eva@echo.example");
await eva.post("/api/ministry", { name: "Echo Fellowship", city: "Olympia", state: "WA", about: "We run a Wednesday supper for neighbors in need.", contact_name: "Eva Lead", contact_email: "eva@echo.example" });
await sql("update lm.ministries set status = 'public', reviewed_by = (select user_id from lm.people where steward limit 1), reviewed_at = now() where name = 'Echo Fellowship'");
const pid2 = (await sql("insert into lm.posts (ministry_id, kind, category, title, body, city, state, open_until, status, approved_by, approved_at, created_by) select m.id, 'give', 'food', 'Extra bread each week', 'We bake too much bread and want to give it away.', 'Seattle', 'WA', (now() at time zone 'utc')::date + 5, 'public', p.user_id, now(), p.user_id from lm.ministries m, lm.people p where m.name = 'Alpha Table Ministry' and p.steward limit 1 returning id"))[0].id;
const before = (await sql("select count(*)::int n from lm.answers"))[0].n;
const nm = await eva.post(`/api/posts/${pid2}/answer`, { words: "We would love some of that bread." });
ok(nm.status === 503 && nm.json.error === "mail_not_set_up" && /not set up to send email yet\. Nothing was sent and nothing was saved/.test(nm.json.words), "with no mail provider the answer is refused in words: nothing sent, nothing saved", nm.json);
ok((await sql("select count(*)::int n from lm.answers"))[0].n === before, "and no row was written");
await s2.stop();

/* ---- no mail and no dev codes: no code can be sent, and the server says so ---- */
const s3 = await startServer({ url: db.url, env: { LEXOS_SMTP_URL: "", LEXOS_DEV_CODES: "" } });
const nUsers = (await sql("select count(*)::int n from auth.users"))[0].n;
const none = await client(s3.base).post("/api/auth/start", { to: "ghost@example.org" });
ok(none.status === 200 && none.json.channel === "none" && !none.json.delivered && (await sql("select count(*)::int n from auth.users"))[0].n === nUsers, "with no way to send a code, sign-in says so and makes no one", none.json);
await s3.stop(); await smtp.stop(); await pool.end();
process.exit(T.done());

/* api.mjs — the signed-in routes. Every one asks the database as the person (asUser): the row-level security and the
   functions in migrations/ decide what comes back and what is refused. Nothing here is a permission; each route is a thin door
   (shaped on Behavioral Health's server/api.mjs; origin in commons.json), and a test calls every one as the wrong person.
   The early, friendly checks below only give a plainer sentence than the database's; the database decides. */
import { asUser, asAdmin } from "./db.mjs";
import { whoami, limited, validEmail } from "./auth.mjs";
import { sendEmail, emailConfigured } from "./mail.mjs";
import { CATEGORY_IDS, STATE_CODES, KINDS, REPORT_REASONS } from "../public/js/pure.js";
import { answerEmail, inviteEmail, reportEmail } from "./emails.mjs";
import { boardPost } from "./board.mjs";
import express from "express";
import { cleanPhoto, MAX_BYTES } from "../lib/photo.mjs";
import { VERSES } from "./scripture.mjs";
import { parseCents, receiptCode, methodLabel, GIFT_METHODS } from "../public/js/pure.js";
import { receiptEmail } from "./emails.mjs";
import { toCsv, dollars } from "../lib/csv.mjs";
import { noticeEmail } from "../lib/email.mjs";
import { runEden, JOBS as EDEN_JOBS, FREEFORM as EDEN_FREEFORM } from "./eden.mjs";
import { keyIsSet } from "./eden-engine.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (words, status = 400, code = "bad_request") => Object.assign(new Error(code), { status, words, code });
const str = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
const id = (v) => { if (!UUID.test(String(v || ""))) throw bad("That was not found.", 404, "not_found"); return String(v).toLowerCase(); };
const EMAIL = { test: (v) => validEmail(String(v)) };   /* one strict shape for every address (auth.mjs); the database holds the same rule */
const DAY = 86400000;
const inFlight = new Set();   /* a double click must not send the same answer twice: the second one waits for the first to finish */

const rows = (req, sql, params = []) => asUser(req.user.id, async (c) => (await c.query(sql, params)).rows);
const one = async (req, sql, params = []) => (await rows(req, sql, params))[0] || null;

/** today (the calendar day in UTC) and the last day a post may stay open, as YYYY-MM-DD */
export function dayLimits(now = Date.now()) {
  const day = (t) => new Date(t).toISOString().slice(0, 10);
  return { today: day(now), max: day(now + 90 * DAY) };
}

function ministryFields(b) {
  const f = { name: str(b.name, 120), city: str(b.city, 80), state: str(b.state, 2).toUpperCase(), about: str(b.about, 1200), website: str(b.website, 200),
    contact_name: str(b.contact_name, 120), contact_email: str(b.contact_email, 254).toLowerCase() };
  if (f.name.length < 2) throw bad("Type your ministry's name.", 422, "name_needed");
  if (f.city.length < 2) throw bad("Type your city.", 422, "city_needed");
  if (!STATE_CODES.includes(f.state)) throw bad("Choose your state.", 422, "state_needed");
  if (f.about.length < 10) throw bad("Say what your ministry does, in a few plain sentences.", 422, "about_needed");
  if (f.website && !/^https?:\/\/[^\s]+$/i.test(f.website)) throw bad("A website starts with http:// or https://. Or leave it empty.", 422, "website_not_readable");
  if (f.contact_name.length < 2) throw bad("Type the name of the person who answers.", 422, "contact_needed");
  if (!EMAIL.test(f.contact_email)) throw bad("That email address does not look right.", 422, "email_not_readable");
  return f;
}

function postFields(b, now) {
  const { today, max } = dayLimits(now);
  const f = { kind: str(b.kind, 10), category: str(b.category, 30), title: str(b.title, 120), body: str(b.body, 2000), city: str(b.city, 80), state: str(b.state, 2).toUpperCase(), open_until: str(b.open_until, 10) };
  if (!KINDS.includes(f.kind)) throw bad("Choose ask or give.", 422, "kind_needed");
  if (!CATEGORY_IDS.includes(f.category)) throw bad("Choose what it is about.", 422, "category_needed");
  if (f.title.length < 4) throw bad("Give it a short title.", 422, "title_needed");
  if (f.body.length < 10) throw bad("Say a little more, in your own words.", 422, "body_needed");
  if (f.state && !STATE_CODES.includes(f.state)) throw bad("Choose a state.", 422, "state_needed");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.open_until)) throw bad("Choose the day it stays open until.", 422, "open_until_needed");
  if (f.open_until < today) throw bad("Choose a day that has not passed.", 422, "open_until_past");
  if (f.open_until > max) throw bad("A post can stay open for 90 days at most. Choose an earlier day.", 422, "open_until_too_far");
  return f;
}

/* the fields of a ministry's public page, cleaned for a friendlier sentence than the database's (the database holds every rule too) */
function pageFields(b) {
  const meets = (Array.isArray(b.meets) ? b.meets : []).slice(0, 8).map((r) => ({ day: str(r && r.day, 30), time: str(r && r.time, 30), place: str(r && r.place, 120) }));
  const photos = (Array.isArray(b.photos) ? b.photos : []).slice(0, 2).map((p) => ({ id: str(p && p.id, 36).toLowerCase(), alt: str(p && p.alt, 160) }));
  const verse = str(b.verse, 30);
  if (verse && !Object.prototype.hasOwnProperty.call(VERSES, verse)) throw bad("Choose a verse from the list, or none.", 422, "verse_not_known");
  const f = { name: str(b.name, 120), city: str(b.city, 80), state: str(b.state, 2).toUpperCase(), slug: str(b.slug, 60).toLowerCase(),
    draft: { tagline: str(b.tagline, 140), about: str(b.about, 3000), meets, email: str(b.email, 254).toLowerCase(), phone: str(b.phone, 30), website: str(b.website, 200), give_url: str(b.give_url, 300), verse, photos } };
  if (f.name.length < 2) throw bad("Type your ministry's name.", 422, "name_needed");
  if (f.city.length < 2) throw bad("Type your city.", 422, "city_needed");
  if (!STATE_CODES.includes(f.state)) throw bad("Choose your state.", 422, "state_needed");
  if (f.draft.tagline.length < 5) throw bad("Write one line that says what your ministry is.", 422, "tagline_needed");
  if (f.draft.about.length < 20) throw bad("Tell people about your ministry in your own words. At least 20 letters.", 422, "about_page_needed");
  if (f.draft.email && !EMAIL.test(f.draft.email)) throw bad("That email address does not look right. Or leave it empty.", 422, "email_not_readable");
  for (const p of photos) if (!UUID.test(p.id)) throw bad("That picture was not found. Add it again.", 422, "photo_not_found");
  return f;
}

const DAYRE = /^\d{4}-\d{2}-\d{2}$/;
const names = (v) => String(v == null ? "" : Array.isArray(v) ? v.join("\n") : v).split(/\r?\n/).map((x) => x.trim().slice(0, 120)).filter(Boolean).slice(0, 40);
function dollarsField(v, what) {
  const c = parseCents(v);
  if (c == null || c <= 0) throw bad(`Type the ${what} in dollars, like 25 or 25.50.`, 422, "amount_not_readable");
  if (c > 1000000000) throw bad("That amount is too large for this page.", 422, "amount_too_large");
  return c;
}

export function mount(app, { wrap, publicBase, env = process.env, now = () => Date.now() }) {
  const need = (req) => { if (!req.user) throw bad("Please sign in.", 401, "unauthenticated"); };
  const get = (path, fn) => app.get(path, wrap(async (req, res) => { need(req); res.set("cache-control", "no-store"); res.json(await fn(req)); }));
  const post = (path, fn, status = 200) => app.post(path, wrap(async (req, res) => { need(req); res.status(status).json(await fn(req)); }));
  const ip = (req) => String(req.ip || "unknown");
  const slow = async (req, key, max, hours = 24) => { if (await limited(`${key}:${req.user.id}`, max, hours * 3600 * 1000) || await limited(`${key}-ip:${ip(req)}`, max * 3, hours * 3600 * 1000)) throw bad("That is a lot of tries. Wait a while and try again.", 429, "too_many"); };

  get("/api/me", async (req) => ({ ...(await whoami(req.user)), limits: dayLimits(now()) }));

  /* everything this site holds about the signed-in person, as one file they can keep (the privacy page says so) */
  app.get("/api/me/export", wrap(async (req, res) => {
    need(req);
    const me = await whoami(req.user);
    const mine = me.ministry ? await rows(req, "select p.id, p.kind, p.category, p.title, p.body, p.city, p.state, to_char(p.open_until,'YYYY-MM-DD') as open_until, p.status, p.review_note, p.closed_reason, p.created_at from lm.posts p where p.ministry_id = lm.my_ministry() order by p.created_at") : [];
    const answers = me.ministry ? (await one(req, "select lm.my_answers() as a")).a : { received: [], sent: [] };
    const team = me.ministry ? (await one(req, "select lm.team_list() as t")).t : null;
    res.set({ "cache-control": "no-store", "content-disposition": 'attachment; filename="linked-ministries-my-data.json"' });
    res.json({ about_this_file: "What Linked Ministries holds about you and your ministry, on the day you asked.", made_on: new Date().toISOString(), you: me.user, ministry: me.ministry, posts: mine, answers, team });
  }));

  /* ---- the ministry ---------------------------------------------------------------------------------------------------- */
  post("/api/ministry", async (req) => {
    const f = ministryFields(req.body || {});
    await slow(req, "ministry", 5);
    const m = await one(req, "select lm.ministry_create($1,$2,$3,$4,$5,$6,$7) as id", [f.name, f.city, f.state, f.about, f.website || null, f.contact_name, f.contact_email]);
    return { ok: true, id: m.id, status: "waiting", words: "Thank you. A person at Linked Ministries will read your page." };
  }, 201);
  post("/api/ministry/update", async (req) => {
    const f = ministryFields(req.body || {});
    const r = await one(req, "select lm.ministry_update($1,$2,$3,$4,$5,$6,$7) as status", [f.name, f.city, f.state, f.about, f.website || null, f.contact_name, f.contact_email]);
    return { ok: true, status: r.status };
  });

  /* ---- Eden, the writing helper. The rules are in server/eden.mjs; this is the door. Nothing here saves or sends what Eden wrote. ---- */
  get("/api/eden/status", async () => ({ configured: keyIsSet(env), jobs: Object.keys(EDEN_JOBS) }));
  app.post("/api/eden", wrap(async (req, res) => {
    need(req);
    const b = req.body || {}, job = str(b.job, 20);
    if (job !== EDEN_FREEFORM && !Object.prototype.hasOwnProperty.call(EDEN_JOBS, job)) throw bad("Eden does not do that.", 400, "no_such_job");
    const me = await whoami(req.user);
    const allow = (who) => (who === "treasurer" ? !!me.treasurer : who === "lead" ? !!(me.ministry && me.lead) : !!me.ministry);
    const perHour = Math.max(1, Number(env.EDEN_LIMIT_HOUR) || 8), perDay = Math.max(1, Number(env.EDEN_LIMIT_DAY) || 40);   /* a person's limit; the defaults are 8 an hour and 40 a day */
    if (await limited(`eden-h:${req.user.id}`, perHour, 3600 * 1000) || await limited(`eden-d:${req.user.id}`, perDay, 24 * 3600 * 1000)) {
      await one(req, "select lm.eden_log($1,'too_many',0,0)", [job]);
      throw bad("You have asked Eden a lot. Try again in a while.", 429, "too_many");
    }
    const r = await runEden({ job, body: b, env, allow });
    if (r.outcome) await one(req, "select lm.eden_log($1,$2,$3,$4)", [job, r.outcome, r.inTokens || 0, r.outTokens || 0]);
    res.set("cache-control", "no-store").status(r.status).json(r.body);
  }));

  /* ---- the ministry's public page: one form, read by a steward before anyone sees it ---------------------------------------------- */
  get("/api/page", async (req) => ({ ...((await one(req, "select lm.page_mine() as p")).p || { exists: false }), verses: Object.entries(VERSES).map(([key, v]) => ({ key, ref: v.ref, text: v.text })) }));
  post("/api/page", async (req) => {
    const b = req.body || {}, f = pageFields(b);
    await slow(req, "page", 60);
    const r = await one(req, "select lm.page_save($1,$2,$3,$4,$5::jsonb,$6) as r", [f.name, f.city, f.state, f.slug, JSON.stringify(f.draft), b.submit === true]);
    return { ok: true, ...r.r };
  });
  /* a picture: the bytes of a JPEG or a PNG as the whole body. It is checked and cleaned (what a phone writes into it about where it was taken is taken out) before it is kept. */
  app.post("/api/page/photos", express.raw({ type: ["image/jpeg", "image/png"], limit: MAX_BYTES + 4096 }), wrap(async (req, res) => {
    need(req);
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw bad("Choose a JPEG or a PNG picture.", 415, "not_a_picture");
    const c = cleanPhoto(req.body);
    if (!c.ok) throw bad(c.words, c.code === "photo_too_big" ? 413 : 422, c.code);
    await slow(req, "photo", 40);
    const alt = str(req.query.alt, 160);
    const r = await one(req, "select lm.photo_add($1,$2,$3) as id", [c.type, c.bytes, alt || null]);
    res.status(201).json({ ok: true, id: r.id, alt, width: c.width, height: c.height });
  }));

  /* ---- the team --------------------------------------------------------------------------------------------------------- */
  get("/api/team", async (req) => (await one(req, "select lm.team_list() as t")).t);
  post("/api/team/invite", async (req) => {
    const email = str((req.body || {}).email, 254).toLowerCase();
    if (!EMAIL.test(email)) throw bad("That email address does not look right.", 422, "email_not_readable");
    await slow(req, "invite", 20);
    const r = await one(req, "select lm.team_invite($1) as id", [email]);
    const me = await whoami(req.user);
    /* the person sees the invitation when they sign in with that address; the email below is a courtesy, and the page says so only if it went */
    let mailed = false;
    if (emailConfigured()) {
      const mail = inviteEmail({ inviter: me.user.name, ministry: me.ministry.name, joinUrl: `${publicBase(req)}/join` });
      const m = await sendEmail({ to: email, subject: mail.subject, text: mail.text });
      mailed = !!m.sent;
    }
    return { ok: true, id: r.id, emailed: mailed };
  }, 201);
  post("/api/team/invites/:id/withdraw", async (req) => { await one(req, "select lm.team_withdraw($1)", [id(req.params.id)]); return { ok: true }; });
  post("/api/team/accept", async (req) => {
    const name = str((req.body || {}).name, 120);
    if (name.length < 2) throw bad("Type your name so your team knows who you are.", 422, "name_needed");
    await one(req, "select lm.team_accept($1, $2)", [id((req.body || {}).invite), name]);
    return { ok: true };
  });
  post("/api/team/:uid/role", async (req) => { await one(req, "select lm.team_set_role($1, $2)", [id(req.params.uid), str((req.body || {}).role, 10)]); return { ok: true }; });
  post("/api/team/:uid/remove", async (req) => { await one(req, "select lm.team_remove($1)", [id(req.params.uid)]); return { ok: true }; });

  /* ---- posts ------------------------------------------------------------------------------------------------------------ */
  get("/api/my/posts", async (req) => {
    const posts = await rows(req, `select p.id, p.kind, p.category, p.title, p.body, p.city, p.state, to_char(p.open_until,'YYYY-MM-DD') as open_until, p.status, p.review_note,
        p.closed_reason, p.created_at, p.submitted_at, p.approved_at, (select count(*)::int from lm.answers a where a.post_id = p.id) as answers
      from lm.posts p where p.ministry_id = lm.my_ministry() order by p.created_at desc`);
    return { posts, limits: dayLimits(now()) };
  });
  post("/api/posts", async (req) => {
    const b = req.body || {}, f = postFields(b, now());
    await slow(req, "post", 30);
    const r = await one(req, "select lm.post_create($1,$2,$3,$4,$5,$6,$7::date,$8) as id", [f.kind, f.category, f.title, f.body, f.city, f.state, f.open_until, b.submit === true]);
    return { ok: true, id: r.id, status: b.submit === true ? "waiting" : "draft" };
  }, 201);
  post("/api/posts/:id/update", async (req) => {
    const b = req.body || {}, f = postFields(b, now());
    await one(req, "select lm.post_update($1,$2,$3,$4,$5,$6,$7,$8::date)", [id(req.params.id), f.kind, f.category, f.title, f.body, f.city, f.state, f.open_until]);
    if (b.submit === true) await one(req, "select lm.post_submit($1)", [id(req.params.id)]);
    return { ok: true, status: b.submit === true ? "waiting" : "draft" };
  });
  post("/api/posts/:id/submit", async (req) => { await one(req, "select lm.post_submit($1)", [id(req.params.id)]); return { ok: true, status: "waiting" }; });
  post("/api/posts/:id/close", async (req) => { await one(req, "select lm.post_close($1, $2)", [id(req.params.id), str((req.body || {}).reason, 30)]); return { ok: true, status: "closed" }; });

  /* ---- answering: check, then email, then record -------------------------------------------------------------------------- */
  get("/api/answers", async (req) => (await one(req, "select lm.my_answers() as a")).a);
  post("/api/posts/:id/answer", async (req) => {
    const pid = id(req.params.id), b = req.body || {};
    const words = str(b.words, 1500), phone = str(b.phone, 30);
    if (words.length < 5) throw bad("Write a few words about how you can help, or what you need.", 422, "words_needed");
    if (phone && !/^[0-9 ()+.-]{7,30}$/.test(phone)) throw bad("A phone number has digits, spaces, dashes and brackets only. Or leave it empty.", 422, "phone_not_readable");
    /* no fake state: with no way to send, nothing is sent and nothing is saved, and the screen says so */
    if (!emailConfigured()) throw bad("The network is not set up to send email yet. Nothing was sent and nothing was saved.", 503, "mail_not_set_up");
    await slow(req, "answer", 10);
    const flightKey = `${req.user.id}:${pid}`;
    if (inFlight.has(flightKey)) throw bad("Your answer is already being sent. Please wait a moment.", 409, "already_sending");
    inFlight.add(flightKey);
    try {
    const p = (await one(req, "select lm.answer_prepare($1) as v", [pid])).v;
    /* who the email goes to is read by the service connection, after the person's own check above said yes: no signed-in role can read it */
    const to = (await asAdmin(async (c) => (await c.query("select lm.answer_contact($1) as v", [pid])).rows[0])).v;
    if (!to) throw bad("That post is not open any more.", 409, "post_not_open");
    /* one post, and one ministry's contact, can only be written to so often in a day, however many ministries ask */
    if (await limited(`answer-post:${pid}`, 25, 24 * 3600 * 1000) || await limited(`answer-to:${p.to_ministry_id}`, 60, 24 * 3600 * 1000)) throw bad("This ministry has had a lot of answers today. Please try again tomorrow.", 429, "too_many");
    const mail = answerEmail({ toContact: to.to_contact, fromMinistry: p.from_ministry, place: `${p.from_city}, ${p.from_state}`, kind: p.kind, title: p.title, words, fromName: p.from_name, fromEmail: p.from_email, phone, website: p.from_website });
    const sent = await sendEmail({ to: to.to_email, subject: mail.subject, text: mail.text, replyTo: p.from_email });
    if (!sent.sent) throw bad("The email did not go out, so nothing was saved. Try again in a minute.", 502, "mail_failed");
    /* the provider took it: now, and only now, it is a row */
    await one(req, "select lm.answer_record($1, $2, $3, $4) as id", [pid, words, phone || null, sent.id || null]);
    return { ok: true, sent_to: p.to_ministry, words: `Sent to ${p.to_ministry}.` };
    } finally { inFlight.delete(flightKey); }
  }, 201);

  /* ---- a report: anyone who reads a public post can tell the stewards. It is saved, then the stewards are emailed, and the answer says
     which of the two happened. Nothing is hidden by it: only a steward closes a post. ---- */
  app.post("/api/posts/:id/report", wrap(async (req, res) => {
    const pid = id(req.params.id), b = req.body || {};
    const reason = str(b.reason, 12), note = str(b.note, 1000), email = str(b.email, 254).toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(REPORT_REASONS, reason)) throw bad("Choose what is wrong.", 422, "reason_needed");
    if (reason === "other" && note.length < 5) throw bad("Say a little about what is wrong.", 422, "note_needed");
    if (email && !validEmail(email)) throw bad("That email address does not look right. Or leave it empty.", 422, "email_not_readable");
    if (await limited(`report-ip:${ip(req)}`, 6, 3600 * 1000) || await limited(`report-post:${pid}`, 20, 24 * 3600 * 1000)) throw bad("That is a lot of reports. Please wait a while and try again.", 429, "too_many");
    const post = await boardPost(pid);
    if (!post) throw bad("That post is not on the board any more.", 404, "not_found");
    const q = (sql, params) => asAdmin(async (c) => (await c.query(sql, params)).rows[0]);
    const rid = (await q("select lm.report_create($1, $2, $3, $4) as id", [pid, reason, note || null, email || null])).id;
    const stewards = (await q("select lm.steward_emails() as v")).v || [];
    let emailed = false;
    if (stewards.length && emailConfigured()) {
      const mail = reportEmail({ title: post.title, ministry: post.ministry, reason, note, reporter: email, url: `${publicBase(req)}/board/${pid}`, stewardUrl: `${publicBase(req)}/review` });
      emailed = !!(await sendEmail({ to: stewards.join(", "), subject: mail.subject, text: mail.text, ...(email ? { replyTo: email } : {}) })).sent;
    }
    res.status(201).json({ ok: true, saved: true, emailed, id: rid, words: emailed ? "Thank you. Your report was sent to the Linked Ministries team. The post stays up until a person there reads it." : "Thank you. Your report was saved, but the email to the Linked Ministries team did not go out. A person on the team will see it on their page." });
  }));

  /* ---- the treasury: gifts, grants, the board's vote, the door. Treasurers only; the database decides (lm.is_treasurer) ---- */
  const view = async (req) => (await one(req, "select lm.treasury_view() as v")).v;
  get("/api/treasury", view);
  /* a gift: written down first (the receipt number is the database's), then the receipt email, and its record only if the mail provider took it */
  const sendReceipt = async (req, gift) => {
    if (!gift.donor_email) return { emailed: false, reason: "no_email", words: "No receipt email was sent, because no email address was given." };
    if (!emailConfigured()) return { emailed: false, reason: "mail_not_set_up", words: "No receipt email was sent: this site is not set up to send email." };
    const mail = receiptEmail({ receiptNo: gift.receipt_no, donor: gift.donor_name, amountCents: gift.amount_cents, receivedOn: gift.received_on, method: gift.method, notice: noticeEmail(env), base: publicBase(req) });
    const sent = await sendEmail({ to: gift.donor_email, subject: mail.subject, text: mail.text });
    if (!sent.sent) return { emailed: false, reason: "mail_failed", words: "The receipt email did not go out. The gift is recorded. You can send the receipt again from the ledger." };
    await one(req, "select lm.gift_receipt_record($1, $2) as id", [gift.id, sent.id || null]);
    return { emailed: true, reason: "sent", words: "A receipt email was sent, and the mail provider took it." };
  };
  post("/api/treasury/gifts", async (req) => {
    const b = req.body || {};
    const cents = dollarsField(b.amount, "amount"), method = str(b.method, 12), on = str(b.received_on, 10), email = str(b.donor_email, 254).toLowerCase();
    if (!GIFT_METHODS.some((m) => m[0] === method)) throw bad("Choose how the gift came in.", 422, "method_needed");
    if (!DAYRE.test(on)) throw bad("Choose the day the gift came in.", 422, "date_needed");
    if (email && !EMAIL.test(email)) throw bad("That email address does not look right. Or leave it empty.", 422, "email_not_readable");
    await slow(req, "gift", 300);
    const g = (await one(req, "select lm.gift_record($1,$2,$3,$4::date,$5,$6) as g", [str(b.donor_name, 120), email || null, cents, on, method, str(b.note, 500) || null])).g;
    const receipt = await sendReceipt(req, g);
    return { ok: true, gift: { id: g.id, receipt_no: g.receipt_no, code: receiptCode(g.receipt_no), amount_cents: g.amount_cents }, receipt, words: `Recorded. Receipt ${receiptCode(g.receipt_no)}. ${receipt.words}` };
  }, 201);
  post("/api/treasury/gifts/:id/correct", async (req) => {
    const b = req.body || {}; const neg = /^\s*-/.test(String(b.change || ""));
    const c = parseCents(String(b.change || "").replace(/^\s*-/, ""));
    if (c == null || c === 0) throw bad("Type the change in dollars, like 5 or -5.", 422, "amount_not_readable");
    const on = str(b.received_on, 10);
    const r = (await one(req, "select lm.gift_correct($1,$2,$3,$4) as c", [id(req.params.id), (neg ? -c : c), DAYRE.test(on) ? on : null, str(b.note, 500)])).c;
    return { ok: true, receipt_no: r.receipt_no, code: receiptCode(r.receipt_no), words: `Recorded as a new row, receipt ${receiptCode(r.receipt_no)}. The first record is unchanged.` };
  }, 201);
  post("/api/treasury/gifts/:id/receipt", async (req) => {
    const g = (await one(req, "select lm.gift_get($1) as g", [id(req.params.id)])).g;
    if (g.corrects_id) throw bad("A correction has no receipt of its own. Send the receipt of the first gift.", 422, "not_a_first_gift");
    const receipt = await sendReceipt(req, g);
    if (!receipt.emailed) throw Object.assign(bad(receipt.words, receipt.reason === "mail_failed" ? 502 : receipt.reason === "mail_not_set_up" ? 503 : 422, receipt.reason), {});
    return { ok: true, receipt, words: receipt.words };
  });
  post("/api/treasury/grants", async (req) => {
    const b = req.body || {}, kind = str(b.recipient_kind, 10);
    if (kind !== "ministry" && kind !== "outside") throw bad("Choose who gets the grant.", 422, "recipient_needed");
    if (kind === "outside" && str(b.recipient_name, 120).length < 2) throw bad("Type the name of the organization.", 422, "name_needed");
    if (kind === "ministry") id(b.ministry_id);
    const cents = dollarsField(b.amount, "amount");
    if (str(b.purpose, 500).length < 10) throw bad("Say what the grant is for, in a sentence.", 422, "purpose_needed");
    await slow(req, "grant", 100);
    const r = await one(req, "select lm.grant_propose($1,$2,$3,$4,$5) as id", [kind, kind === "ministry" ? String(b.ministry_id).toLowerCase() : null, kind === "outside" ? str(b.recipient_name, 120) : null, cents, str(b.purpose, 500)]);
    return { ok: true, id: r.id, words: "Proposed. A different person on the money team approves it after the board votes." };
  }, 201);
  post("/api/treasury/grants/:id/approve", async (req) => {
    const b = req.body || {}, on = str(b.voted_on, 10);
    if (!DAYRE.test(on)) throw bad("Choose the day of the vote.", 422, "date_needed");
    if (str(b.doc_ref, 200).length < 3) throw bad("Name the document that holds the vote.", 422, "doc_needed");
    const yes = names(b.yes), abstain = names(b.abstain), no = names(b.no);
    if (!yes.length) throw bad("Write who voted yes, one name on each line.", 422, "names_needed");
    await one(req, "select lm.grant_approve($1,$2::date,$3,$4,$5,$6)", [id(req.params.id), on, yes, abstain, no, str(b.doc_ref, 200)]);
    return { ok: true, words: "Approved. The vote is written down, and the grant is on the public page." };
  });
  post("/api/treasury/grants/:id/decline", async (req) => { await one(req, "select lm.grant_decline($1,$2)", [id(req.params.id), str((req.body || {}).note, 500)]); return { ok: true, words: "Declined." }; });
  post("/api/treasury/grants/:id/paid", async (req) => { await one(req, "select lm.grant_paid($1,$2)", [id(req.params.id), str((req.body || {}).reference, 120)]); return { ok: true, words: "Marked paid." }; });
  post("/api/treasury/settings", async (req) => {
    const b = req.body || {}, d = str(b.registration_date, 10);
    if (d && !DAYRE.test(d)) throw bad("Choose the registration date.", 422, "date_needed");
    await one(req, "select lm.giving_settings_set($1,$2::date,$3,$4)", [str(b.registration_number, 60) || null, d || null, str(b.form990_url, 300) || null, b.door_open === true]);
    return { ok: true, words: "Saved." };
  });
  post("/api/treasury/treasurers", async (req) => {
    const email = str((req.body || {}).email, 254).toLowerCase();
    if (!EMAIL.test(email)) throw bad("That email address does not look right.", 422, "email_not_readable");
    await one(req, "select lm.treasurer_set($1, $2)", [email, (req.body || {}).on !== false]);
    return { ok: true, words: "Done." };
  });
  /* the ledger as a spreadsheet file. It is read only; the database writes down who took it. */
  app.get("/api/treasury/export.csv", wrap(async (req, res) => {
    need(req);
    const what = str(req.query.what, 8) === "grants" ? "grants" : "gifts";
    const v = await view(req);
    await one(req, "select lm.treasury_export_logged($1)", [what]);
    const csv = what === "grants"
      ? toCsv(["status", "recipient", "amount_dollars", "what_for", "proposed_by", "proposed_on", "approved_by", "voted_on", "voted_yes", "abstained", "voted_no", "document", "paid_on", "payment_reference", "declined_note"],
          v.grants.map((g) => [g.status, g.recipient_name, dollars(g.amount_cents), g.purpose, g.proposed_by_name, String(g.proposed_at || "").slice(0, 10), g.approved_by_name || "", g.vote ? g.vote.voted_on : "", g.vote ? g.vote.yes_names.join("; ") : "", g.vote ? g.vote.abstain_names.join("; ") : "", g.vote ? g.vote.no_names.join("; ") : "", g.vote ? g.vote.doc_ref : "", String(g.paid_at || "").slice(0, 10), g.paid_ref || "", g.decline_note || ""]))
      : toCsv(["receipt", "day", "donor", "email", "amount_dollars", "how", "corrects_receipt", "note", "recorded_by", "receipt_email_sent"],
          v.gifts.map((g) => [receiptCode(g.receipt_no), g.received_on, g.donor_name, g.donor_email || "", dollars(g.amount_cents), methodLabel(g.method), g.corrects_id ? receiptCode((v.gifts.find((x) => x.id === g.corrects_id) || {}).receipt_no) : "", g.note || "", g.recorded_by_name, g.receipt_sent_at ? String(g.receipt_sent_at).slice(0, 10) : ""]));
    res.set({ "content-type": "text/csv; charset=utf-8", "cache-control": "no-store", "content-disposition": `attachment; filename="linked-ministries-${what}.csv"` }).send(csv);
  }));

  /* ---- stewards -------------------------------------------------------------------------------------------------------- */
  get("/api/steward/queue", async (req) => (await one(req, "select lm.steward_queue() as q")).q);
  post("/api/steward/ministries/:id/review", async (req) => {
    const d = str((req.body || {}).decision, 12);
    if (d !== "approve" && d !== "send_back") throw bad("Choose approve or send back.", 400, "decision_needed");
    await one(req, "select lm.ministry_review($1, $2, $3)", [id(req.params.id), d === "approve", str((req.body || {}).note, 1000) || null]);
    return { ok: true };
  });
  post("/api/steward/posts/:id/review", async (req) => {
    const d = str((req.body || {}).decision, 12);
    if (d !== "approve" && d !== "send_back") throw bad("Choose approve or send back.", 400, "decision_needed");
    await one(req, "select lm.post_review($1, $2, $3)", [id(req.params.id), d === "approve", str((req.body || {}).note, 1000) || null]);
    return { ok: true };
  });
  post("/api/steward/pages/:id/review", async (req) => {
    const d = str((req.body || {}).decision, 12);
    if (d !== "approve" && d !== "send_back") throw bad("Choose approve or send back.", 400, "decision_needed");
    await one(req, "select lm.page_review($1, $2, $3)", [id(req.params.id), d === "approve", str((req.body || {}).note, 1000) || null]);
    return { ok: true };
  });
  post("/api/steward/reports/:id/resolve", async (req) => {
    const a = str((req.body || {}).action, 8);
    if (a !== "close" && a !== "keep") throw bad("Choose close the post, or keep it.", 400, "decision_needed");
    await one(req, "select lm.report_resolve($1, $2, $3)", [id(req.params.id), a, str((req.body || {}).note, 1000) || null]);
    return { ok: true };
  });
  post("/api/steward/stewards", async (req) => {
    const email = str((req.body || {}).email, 254).toLowerCase();
    if (!EMAIL.test(email)) throw bad("That email address does not look right.", 422, "email_not_readable");
    await one(req, "select lm.steward_set($1, $2)", [email, (req.body || {}).on !== false]);
    return { ok: true };
  });
}

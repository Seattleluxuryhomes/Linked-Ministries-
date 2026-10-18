/* api.mjs — the signed-in routes. Every one asks the database as the person (asUser): the row-level security and the
   functions in migrations/ decide what comes back and what is refused. Nothing here is a permission; each route is a thin door
   (shaped on Behavioral Health's server/api.mjs; origin in commons.json), and a test calls every one as the wrong person.
   The early, friendly checks below only give a plainer sentence than the database's; the database decides. */
import { asUser } from "./db.mjs";
import { whoami, limited } from "./auth.mjs";
import { sendEmail, emailConfigured } from "./mail.mjs";
import { CATEGORY_IDS, STATE_CODES, KINDS } from "../public/js/pure.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (words, status = 400, code = "bad_request") => Object.assign(new Error(code), { status, words, code });
const str = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
const id = (v) => { if (!UUID.test(String(v || ""))) throw bad("That was not found.", 404, "not_found"); return String(v).toLowerCase(); };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY = 86400000;

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

export function mount(app, { wrap, publicBase, now = () => Date.now() }) {
  const need = (req) => { if (!req.user) throw bad("Please sign in.", 401, "unauthenticated"); };
  const get = (path, fn) => app.get(path, wrap(async (req, res) => { need(req); res.set("cache-control", "no-store"); res.json(await fn(req)); }));
  const post = (path, fn, status = 200) => app.post(path, wrap(async (req, res) => { need(req); res.status(status).json(await fn(req)); }));
  const ip = (req) => String(req.ip || "unknown");
  const slow = async (req, key, max, hours = 24) => { if (await limited(`${key}:${req.user.id}`, max, hours * 3600 * 1000) || await limited(`${key}-ip:${ip(req)}`, max * 3, hours * 3600 * 1000)) throw bad("That is a lot of tries. Wait a while and try again.", 429, "too_many"); };

  get("/api/me", async (req) => ({ ...(await whoami(req.user)), limits: dayLimits(now()) }));

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
      const m = await sendEmail({ to: email, subject: `${me.user.name || "Someone"} added you to ${me.ministry.name} on Linked Ministries`,
        text: `${me.user.name || "A lead"} added you to the team at ${me.ministry.name} on Linked Ministries.\n\nSign in with this email address to join the team:\n${publicBase(req)}/join\n\nIf this is not for you, ignore this message.\n` });
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
    const p = (await one(req, "select lm.answer_prepare($1) as v", [pid])).v;
    const place = `${p.from_city}, ${p.from_state}`;
    const text = [
      `Hello ${p.to_contact},`, "",
      `${p.from_ministry} (${place}) answered your ${p.kind === "ask" ? "ask" : "give"} on the Linked Ministries board:`,
      `"${p.title}"`, "",
      p.kind === "ask" ? "They say they can help:" : "They say they need this:", "",
      words, "",
      `To reply, write to ${p.from_name} at ${p.from_email}${phone ? ` or call ${phone}` : ""}.`,
      ...(p.from_website ? [`Their website: ${p.from_website}`] : []), "",
      "This message came from the Linked Ministries board. Linked Ministries moves no money and does not take part in what you agree on.",
      "If someone is in danger, call 911. If someone is thinking of hurting themselves, call or text 988.", "",
    ].join("\n");
    const subject = `${p.from_ministry} ${p.kind === "ask" ? "can help with" : "needs"}: ${p.title}`.replace(/[\r\n]+/g, " ").slice(0, 200);
    const sent = await sendEmail({ to: p.to_email, subject, text, replyTo: p.from_email });
    if (!sent.sent) throw bad("The email did not go out, so nothing was saved. Try again in a minute.", 502, "mail_failed");
    /* the provider took it: now, and only now, it is a row */
    await one(req, "select lm.answer_record($1, $2, $3, $4) as id", [pid, words, phone || null, sent.id || null]);
    return { ok: true, sent_to: p.to_ministry, words: `Sent to ${p.to_ministry}.` };
  }, 201);

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
  post("/api/steward/stewards", async (req) => {
    const email = str((req.body || {}).email, 254).toLowerCase();
    if (!EMAIL.test(email)) throw bad("That email address does not look right.", 422, "email_not_readable");
    await one(req, "select lm.steward_set($1, $2)", [email, (req.body || {}).on !== false]);
    return { ok: true };
  });
}

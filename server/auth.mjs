/* auth.mjs — passwordless sign-in and sessions (shaped on Behavioral Health's server/auth.mjs, which was shaped on Cross
   Universal's; origin in commons.json). A six-digit code (crypto.randomInt), hash-stored, ten minutes, five attempts, one use,
   by email. Sessions are 256-bit random tokens, hash-stored, an httpOnly cookie, thirty days, revocable. Five wrong codes for
   one address in fifteen minutes lock it, the outstanding codes die, and a new one must be asked for. In development
   LEXOS_DEV_CODES=1 prints the code; production refuses to boot with it set.
   Changed from the original: anyone may sign in with an email address (the first sign-in makes the person), so there is
   nothing to hide about whether an address is known; the text-message channel is gone; the sign-in answer says plainly when
   this site cannot send email, and never says a code was sent unless the mail provider took it. */
import crypto from "node:crypto";
import { asAdmin, asUser, sha256 as sha } from "./db.mjs";
import { makeLimiter, makeCodeGate } from "./ratelimit.mjs";
import { sendEmail, emailConfigured } from "./mail.mjs";
import { validEmail, EMAIL_SHAPE } from "../lib/email.mjs";
import { signInEmail } from "./emails.mjs";

const q = (sql, params) => asAdmin((c) => c.query(sql, params));
export const limited = makeLimiter(q, { bucket: "lm" });
export const codeGate = makeCodeGate(q);
export const SESSION_DAYS = 30;
export const LOCKED_WORDS = "Too many wrong codes. Any code you were sent has been canceled. Wait fifteen minutes, then ask for a new one and check the message you actually received.";
/* a code typed with spaces or dashes ("123 456", "123-456"), or in wide digits from a phone's keyboard, is the same six digits */
export const normCode = (c) => String(c == null ? "" : c).normalize("NFKC").replace(/\D/g, "");
export const normEmail = (e) => String(e || "").trim().toLowerCase();
export { validEmail, EMAIL_SHAPE };   /* one strict shape, in lib/email.mjs (the same rule is in migrations 0005 and 0006) */

export const findUser = (email) => asAdmin(async (c) => (await c.query("select id, email, full_name from auth.users where lower(email) = $1", [normEmail(email)])).rows[0] || null);
export async function ensureUser({ email, full_name }) {
  const em = normEmail(email);
  if (!validEmail(em)) throw Object.assign(new Error("email_not_readable"), { status: 400, words: "That email address does not look right." });
  return asAdmin(async (c) => (await c.query(
    `insert into auth.users (email, full_name) values ($1, $2)
     on conflict (lower(email)) do update set full_name = coalesce(nullif(excluded.full_name, ''), auth.users.full_name)
     returning id, email, full_name`, [em, full_name || null])).rows[0]);
}

/* Start: resolves with where the code went. It says "none" when this site cannot send email, and "delivered: false" when it
   tried and the provider refused. It never says a code was sent unless it was. */
export async function startSignIn({ to, ip, env = process.env }) {
  const e = normEmail(to);
  if (!validEmail(e)) return { ok: false, reason: "email_required" };
  /* a code is an email to a stranger's inbox: three in ten minutes and twelve in a day for one address, and twenty in ten minutes for one
     machine, so this door cannot be used to bury someone's mailbox or to use up the site's daily mail allowance */
  if ((await limited("start:" + e, 3)) || (await limited("startday:" + e, 12, 24 * 3600 * 1000)) || (await limited("ip:" + ip, 20))) return { ok: false, reason: "too_many" };
  const dev = env.LEXOS_DEV_CODES === "1";
  const advertised = emailConfigured() ? "email" : dev ? "console" : "none";
  if (advertised === "none") return { ok: true, channel: "none" };
  const user = await ensureUser({ email: e });
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  let result = { sent: false };
  if (advertised === "email") {
    const mail = signInEmail(code);
    result = await sendEmail({ to: user.email, subject: mail.subject, text: mail.text });
  } else {
    result = { sent: true };
    console.log(`[dev] sign-in code for ${JSON.stringify(user.email)}: ${code}`);
  }
  if (result.sent) await q("insert into app.login_codes (user_id, code_hash, channel, sent_to) values ($1,$2,$3,$4)", [user.id, sha(user.id + ":" + code), advertised, advertised === "email" ? user.email : "console"]);
  return { ok: true, channel: advertised, ...(result.sent ? {} : { delivered: false, reason: "The message did not go out. Try again in a minute." }) };
}

async function lockedAnswer(user) {
  if (user) await q("update app.login_codes set used_at = now() where user_id = $1 and used_at is null", [user.id]);
  return { ok: false, reason: "too_many", locked: true, words: LOCKED_WORDS };
}
export async function verifyCode({ to, code, ip, ua }) {
  const e = normEmail(to);
  if (!validEmail(e)) return { ok: false, reason: "bad_code" };
  const identity = "email:" + e;
  const user = await findUser(e);
  /* the lockout is keyed by what the caller typed, not by a row: an address nobody owns locks exactly like one somebody does */
  if (await codeGate.lockedOut(identity)) return lockedAnswer(user);
  if (await limited("verify:" + e, 10)) return { ok: false, reason: "too_many" };
  const rows = user ? await asAdmin(async (c) => (await c.query("select id, code_hash, attempts from app.login_codes where user_id = $1 and used_at is null and expires_at > now() order by created_at desc limit 6", [user.id])).rows) : [];
  const wrong = async () => { await codeGate.record(identity, ip); return (await codeGate.lockedOut(identity)) ? lockedAnswer(user) : { ok: false, reason: "bad_code" }; };
  const typed = normCode(code);
  const row = rows[0] || null;
  if (!row || row.attempts >= 5 || typed.length !== 6) { if (row) await q("update app.login_codes set attempts = attempts + 1 where id = $1", [row.id]); return wrong(); }
  const h = sha(user.id + ":" + typed);
  const hit = rows.find((r) => crypto.timingSafeEqual(r.code_hash, h));
  await q(hit ? "update app.login_codes set used_at = now() where user_id = $1 and used_at is null" : "update app.login_codes set attempts = attempts + 1 where id = $1", [hit ? user.id : rows[0].id]);
  if (!hit) return wrong();
  await codeGate.clear(identity);
  return { ok: true, token: await createSession(user.id, ua, ip), user };
}

export async function createSession(userId, ua, ip) {
  const token = crypto.randomBytes(32).toString("base64url");
  await q("insert into app.sessions (user_id, token_hash, user_agent, ip, via) values ($1,$2,$3,$4,'code')", [userId, sha(token), String(ua || "").slice(0, 300), String(ip || "").slice(0, 64)]);
  /* a person keeps at most ten signed-in browsers: the oldest are signed out, so the table cannot grow without end */
  await q("update app.sessions set revoked_at = now() where user_id = $1 and revoked_at is null and id not in (select id from app.sessions where user_id = $1 and revoked_at is null order by created_at desc limit 10)", [userId]);
  return token;
}
export async function sessionUser(token) {
  if (!token || token.length < 20) return null;
  return asAdmin(async (c) => (await c.query(
    `select u.id, u.email, u.full_name from app.sessions s join auth.users u on u.id = s.user_id
      where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()`, [sha(token)])).rows[0] || null);
}
export async function revokeSession(token) {
  if (!token) return;
  await q("update app.sessions set revoked_at = now() where token_hash = $1", [sha(token)]);
}

/* Who am I, in terms the pages understand: a person with no ministry yet, or a person in a ministry; maybe a steward. */
export async function whoami(user) {
  return asUser(user.id, async (c) => {
    const person = (await c.query("select user_id, ministry_id, role, full_name, steward from lm.people where user_id = $1", [user.id])).rows[0] || null;
    const ministry = person && person.ministry_id ? (await c.query("select lm.my_ministry_profile() as m")).rows[0].m : null;
    const invites = person && person.ministry_id ? [] : (await c.query("select lm.my_invites() as i")).rows[0].i;
    return {
      signed_in: true,
      user: { id: user.id, email: user.email, name: (person && person.full_name) || user.full_name || null },
      person: person ? { role: person.role, steward: person.steward } : null,
      steward: !!(person && person.steward),
      ministry: ministry ? {
        id: ministry.id, name: ministry.name, city: ministry.city, state: ministry.state, about: ministry.about, website: ministry.website,
        contact_name: ministry.contact_name, contact_email: ministry.contact_email, status: ministry.status, review_note: ministry.review_note,
      } : null,
      lead: !!(person && person.role === "lead"),
      invites,
      session_days: SESSION_DAYS,
    };
  });
}

/* config.mjs — the boot guard (adapted from Behavioral Health's server/config.mjs; origin in commons.json).
   Production refuses to start on an unsafe or half-made configuration and says which line, in words, before anything is served.
   Linked Ministries sends its sign-in codes and every answer by email, so a way to send email is required in production.
   The health-records rule of the original does not apply here and is gone; the board holds a ministry's own words and
   an email address, and nothing else. */
import { dbTls, dbUrl } from "../lib/dbtls.mjs";

const str = (v) => String(v == null ? "" : v).trim();

export function checkConfig(env = process.env) {
  const prod = str(env.LEXOS_ENV || "production").toLowerCase() !== "test";
  const fail = [], warn = [];
  if (prod) {
    if (!str(env.DATABASE_URL)) fail.push("DATABASE_URL is not set. Add the Postgres service's DATABASE_URL (in Railway: ${{Postgres.DATABASE_URL}}).");
    const key = str(env.LEXOS_INTERNAL_KEY);
    if (key.length < 32) fail.push("LEXOS_INTERNAL_KEY is missing or shorter than 32 characters. Make a 64-character hex value (openssl rand -hex 32).");
    if (str(env.LEXOS_DEV_CODES) === "1") fail.push("LEXOS_DEV_CODES=1 prints sign-in codes in the log. It is for a development machine and is refused in production.");
    const smtp = str(env.LEXOS_SMTP_URL);
    if (!smtp) fail.push("There is no way to send a sign-in code. Set LEXOS_SMTP_URL and LEXOS_MAIL_FROM.");
    else {
      let u = null; try { u = new URL(smtp); } catch (e) { u = null; }
      if (!u || !/^smtps?:$/.test(u.protocol)) fail.push("LEXOS_SMTP_URL is not a smtp:// or smtps:// address. (The value is not printed: it holds a password.)");
      if (!str(env.LEXOS_MAIL_FROM)) fail.push("LEXOS_MAIL_FROM is not set; it is the address sign-in codes and answers come from.");
    }
    const pub = str(env.LEXOS_PUBLIC_URL);
    if (!/^https:\/\/[^\s/]+\/?$/.test(pub)) fail.push("LEXOS_PUBLIC_URL must be this site's own address starting https:// (for example https://linkedm.org).");
    const csp = str(env.LEXOS_CSP || "enforce").toLowerCase();
    if (csp !== "enforce") fail.push(`LEXOS_CSP is "${csp}". Production enforces the content-security policy; leave it unset or set it to enforce.`);
    if (str(env.KPI_READ_TOKEN) && str(env.KPI_READ_TOKEN).length < 16) fail.push("KPI_READ_TOKEN is shorter than 16 characters; it opens the operator's health detail.");
  }
  const t = dbTls(env, dbUrl(env));
  for (const f of t.fail) fail.push(f);
  for (const w of t.warn) warn.push(w);
  return { ok: fail.length === 0, fail, warn, prod, tls: t.words };
}

/* call once at boot; exits with the reasons in words when the configuration is unsafe */
export function guardOrExit(env = process.env, log = console) {
  const r = checkConfig(env);
  for (const w of r.warn) log.warn("config warning: " + w);
  if (!r.ok) {
    log.error("Linked Ministries will not start:");
    for (const f of r.fail) log.error("  - " + f);
    process.exit(1);
  }
  log.log("config ok: " + r.tls);
  return r;
}

/* dbtls.mjs — the database connection checks who it is talking to (D-389).

   Until this file, a cloud database (railway, amazonaws, supabase in the address) was reached over TLS with
   rejectUnauthorized:false: encrypted to whoever answered, never checked. One rule now, read by the server's pool,
   the backup, restore and import tools and the wires probe, and refused at boot by server/config-guard.mjs:

     LEXOS_DB_TLS = verify-full   the server's certificate chain is checked against LEXOS_DB_CA_PEM (the PEM text)
                                  or LEXOS_DB_CA_FILE (a path on this host), and the host name is checked.
                                  The default for any database that is not on this box.
                  = require       encrypted, unverified. Production takes it only with
                                  LEXOS_DB_TLS_UNVERIFIED=attested:<who>:<YYYY-MM-DD>, and says in words what that accepts.
                  = off           no TLS. Test hosts, and the box's own socket: 127.0.0.1, localhost, a unix socket,
                                  or a one-word name (db, postgres) that resolves only on the box's own network.
                                  Production refuses it for any other host.

   sslmode=disable in the address means off, the same way. Any other ssl parameter in the address is stripped
   before pg sees it, so this setting is the one authority (pg would otherwise take sslmode=require as its own
   verify-full and fail with no CA, or, in its next major, as unverified). Nothing here logs the address. */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const MODES = ["verify-full", "require", "off"];
export const ATTEST = /^attested:[^:\s]{2,80}:\d{4}-\d{2}-\d{2}$/;
const str = (v) => String(v == null ? "" : v).trim();

export function dbUrl(env = process.env) { return str(env.DATABASE_URL) || str(env.LEXOS_DATABASE_URL) || "postgres://postgres:lexos-local@127.0.0.1:5432/linked_ministries"; }

/** the host in a postgres address; "" when there is none (a unix socket) or it cannot be read */
export function hostOf(url) {
  try { const u = new URL(String(url || "")); let h = u.hostname; if (/^\[.*\]$/.test(h)) h = h.slice(1, -1); const q = u.searchParams.get("host"); return h || (q && q.startsWith("/") ? q : "") ; } catch (e) { return ""; }
}

/** this box's own database: loopback, a socket, or a one-word name that only the box's own network resolves */
export function isLocalHost(host) {
  const h = String(host || "").trim().toLowerCase();
  if (!h || h.startsWith("/")) return true;
  if (h === "localhost" || h === "::1" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  return !h.includes(".") && !h.includes(":");
}

/** the address with every ssl parameter removed, so the setting decides */
export function cleanUrl(url) {
  try { const u = new URL(String(url || "")); for (const k of ["sslmode", "ssl", "sslrootcert", "sslcert", "sslkey", "sslnegotiation", "uselibpqcompat"]) u.searchParams.delete(k); return u.toString(); } catch (e) { return String(url || ""); }
}

const defaultRead = (p) => { try { return fs.readFileSync(p, "utf8"); } catch (e) { return null; } };

/** The decision for one host and one address. Pure apart from the optional file read. */
export function dbTls(env = process.env, url = dbUrl(env), { readFile = defaultRead } = {}) {
  const prod = str(env.LEXOS_ENV || "production").toLowerCase() !== "test";
  const host = hostOf(url), local = isLocalHost(host);
  const where = host ? `the database at ${host}` : "the database on this box's socket";
  const raw = str(env.LEXOS_DB_TLS).toLowerCase();
  let disable = false; try { disable = new URL(String(url)).searchParams.get("sslmode") === "disable"; } catch (e) { disable = false; }
  const fail = [], warn = [];
  let mode = raw;
  if (raw && !MODES.includes(raw)) { fail.push(`LEXOS_DB_TLS is "${raw}"; it is verify-full, require or off`); mode = "verify-full"; }
  if (!raw) mode = disable ? "off" : local ? "off" : prod ? "verify-full" : "require";
  if (disable && raw && raw !== "off") fail.push(`DATABASE_URL says sslmode=disable and LEXOS_DB_TLS says ${raw}; say it once, in LEXOS_DB_TLS`);

  const pem = str(env.LEXOS_DB_CA_PEM).replace(/\\n/g, "\n").trim(), file = str(env.LEXOS_DB_CA_FILE);
  let ca = null, caFrom = null;
  if (pem && file) fail.push("LEXOS_DB_CA_PEM and LEXOS_DB_CA_FILE are both set; the CA comes from one of them");
  else if (pem) { ca = pem; caFrom = "LEXOS_DB_CA_PEM"; }
  else if (file) { ca = readFile(file); caFrom = "LEXOS_DB_CA_FILE"; if (ca == null) fail.push(`LEXOS_DB_CA_FILE names ${file}, which cannot be read on this host`); }
  if (ca != null && !/-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.test(ca)) { fail.push(`${caFrom} is not a PEM certificate (no BEGIN CERTIFICATE block)`); ca = null; }

  const att = str(env.LEXOS_DB_TLS_UNVERIFIED);
  const attested = ATTEST.test(att);
  if (att && !attested) fail.push("LEXOS_DB_TLS_UNVERIFIED is set but not in the form attested:<who>:<YYYY-MM-DD>: a named person on a date accepts an unverified connection, or nobody does");

  let ssl, words;
  if (mode === "verify-full") {
    if (!ca) fail.push(`LEXOS_DB_TLS=verify-full${raw ? "" : " (the default for a database off this box)"} needs the database's CA certificate: LEXOS_DB_CA_PEM (the PEM text) or LEXOS_DB_CA_FILE (a path on this host). Without it there is nothing to check ${where}'s certificate against. Encrypted and unchecked is LEXOS_DB_TLS=require with LEXOS_DB_TLS_UNVERIFIED=attested:<who>:<YYYY-MM-DD>`);
    if (attested) warn.push("LEXOS_DB_TLS_UNVERIFIED is set but LEXOS_DB_TLS is verify-full; the attestation is not used");
    ssl = ca ? { ca, rejectUnauthorized: true } : null;
    words = `The database connection is encrypted and the server's certificate chain and host name are checked against the CA from ${caFrom || "nowhere"} (verify-full).`;
  } else if (mode === "require") {
    const accepts = `LEXOS_DB_TLS=require encrypts the connection to whoever answers as ${where} and never checks that it is the database: a machine in the path could answer in its place and read every row.`;
    if (prod && !attested) fail.push(`${accepts} Production takes it only with LEXOS_DB_TLS_UNVERIFIED=attested:<who>:<YYYY-MM-DD>, a named person on a date accepting exactly that. Set LEXOS_DB_TLS=verify-full with LEXOS_DB_CA_PEM or LEXOS_DB_CA_FILE instead`);
    else if (!prod && !attested) warn.push(`${accepts} A test host takes it; production would not without LEXOS_DB_TLS_UNVERIFIED`);
    else warn.push(`${accepts} Accepted by ${att.split(":")[1]} on ${att.split(":")[2]} (LEXOS_DB_TLS_UNVERIFIED)`);
    if (ca) warn.push(`A CA is on file in ${caFrom} but LEXOS_DB_TLS=require does not use it; set LEXOS_DB_TLS=verify-full`);
    ssl = { rejectUnauthorized: false };
    words = `The database connection is encrypted but the server's identity is not checked (require)${attested ? `, accepted by ${att.split(":")[1]} on ${att.split(":")[2]}` : ""}.`;
  } else {
    if (!local) (prod ? fail : warn).push(`LEXOS_DB_TLS=off with ${where}, which is not this box: every row would cross the network in the clear. ${prod ? "Production takes off only" : "Off is for a test host, or"} for 127.0.0.1, localhost, a socket, or a one-word name on the box's own network`);
    ssl = false;
    words = local ? "The database is on this box; the connection does not leave it (off)." : `The database connection to ${host} is not encrypted (off).`;
  }
  return { mode, explicit: !!raw, host, local, prod, ssl, ca, caFrom, attested, fail, warn, words, url: cleanUrl(url) };
}

/** pg's `ssl` option for an address, or a thrown error with .words: a tool never falls to an unverified connection by itself */
export function sslFor(env = process.env, url = dbUrl(env)) {
  const t = dbTls(env, url);
  if (t.fail.length) throw Object.assign(new Error("db_tls_refused"), { words: t.fail.join(" "), fail: t.fail });
  return t.ssl === false ? undefined : t.ssl;
}

/** what pg_dump and pg_restore read: PGSSLMODE, and the CA as a file (a public certificate, written 0600 under tmp when it came as text) */
export function pgEnvOf(t) {
  if (t.mode === "off") return { PGSSLMODE: t.local ? "prefer" : "disable" };
  if (t.mode === "require") return { PGSSLMODE: "require" };
  let file = t.caFrom === "LEXOS_DB_CA_FILE" ? str(process.env.LEXOS_DB_CA_FILE) : "";
  if (!file && t.ca) { file = path.join(os.tmpdir(), `lexos-db-ca-${crypto.createHash("sha256").update(t.ca).digest("hex").slice(0, 16)}.pem`); if (!fs.existsSync(file)) fs.writeFileSync(file, t.ca, { mode: 0o600 }); }
  return { PGSSLMODE: "verify-full", PGSSLROOTCERT: file };
}

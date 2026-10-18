#!/usr/bin/env node
/* tests/boot-test.mjs — the proof a deployment needs: the server boots ALONE, in PRODUCTION mode, with the settings DEPLOY.md
   gives (a 64-hex key, the mail address, an attested database connection, an enforced content-security policy), against (1) a
   fresh database of its own migrations and (2) a database left at an OLDER migration state, which it brings forward on boot; and
   /api/health is 200 with exactly {"status":"ok","service":"Linked Ministries"}. It also proves the refusals: no DATABASE_URL,
   printing sign-in codes, no way to send mail, a short key, an address that is not https, a policy that is not enforced, an
   edited applied migration. It kills only its own processes, by PID.   LEXOS_DB_NAME=linkedm_t_<mine> node tests/boot-test.mjs
   (Shaped on Behavioral Health's boot test.) */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import pg from "pg";
import { counter, ownDatabase, startServer, client, ROOT, ADMIN, freePort, sleep } from "./helpers.mjs";

const T = counter("boot-test"); const { ok } = T;
const hex = () => crypto.randomBytes(32).toString("hex");
const SMTP_PASSWORD = "abcdabcdabcdabcd";
const prodEnv = () => ({
  LEXOS_ENV: "production", LEXOS_CSP: "enforce", LEXOS_DB_TLS: "require", LEXOS_DB_TLS_UNVERIFIED: "attested:BenMorton:2026-10-18",
  LEXOS_INTERNAL_KEY: hex(), KPI_READ_TOKEN: hex().slice(0, 32),
  LEXOS_SMTP_URL: `smtps://ben%40benmortongroup.com:${SMTP_PASSWORD}@smtp.gmail.com:465`, LEXOS_MAIL_FROM: "Linked Ministries <ben@benmortongroup.com>",
  LEXOS_PUBLIC_URL: "https://linkedm.org",
});
const a = prodEnv(), b = prodEnv();
ok(/^[0-9a-f]{64}$/.test(a.LEXOS_INTERNAL_KEY) && a.LEXOS_INTERNAL_KEY !== b.LEXOS_INTERNAL_KEY, "the key is a 64-hex value");

/* ---- 1. a fresh database of its own migrations ---- */
const fresh = await ownDatabase("boot_fresh");
const { pool } = await import("../server/db.mjs");
await pool.query("drop schema if exists app cascade; drop schema if exists lm cascade; drop schema if exists rl cascade; drop table if exists public.lm_migrations; drop schema if exists auth cascade;");   // empty: the server builds everything itself
const s1 = await startServer({ url: fresh.url, prod: true, env: a });
ok(s1.up, "the server boots in production mode against an empty database and builds its own tables", s1.logText().slice(-500));
const c = client(s1.base);
const h = await c.get("/api/health");
ok(h.status === 200 && h.text === '{"status":"ok","service":"Linked Ministries"}', "/api/health answers 200 with exactly the status and the service name", h.text);
ok(Object.keys(h.json).sort().join() === "service,status", "and nothing else: no count, no version, no host");
ok(/max-age=31536000/.test(h.headers.get("strict-transport-security") || "") && !/includeSubDomains|preload/.test(h.headers.get("strict-transport-security") || ""), "the transport header carries no includeSubDomains and no preload");
ok(/upgrade-insecure-requests/.test(h.headers.get("content-security-policy") || ""), "the content-security policy is enforced in production");
ok((await c.get("/")).status === 200 && (await c.get("/board")).status === 200 && (await c.get("/join")).status === 200, "the front, the board and the join page are served");
const log1 = s1.logText();
ok(/Linked Ministries listening on :\d+/.test(log1), "the log says it is listening");
ok(!log1.includes(SMTP_PASSWORD) && !log1.includes(a.LEXOS_INTERNAL_KEY) && !log1.includes(a.KPI_READ_TOKEN), "no password and no key is in the log");
ok(/The database connection is encrypted but the server's identity is not checked \(require\), accepted by BenMorton on 2026-10-18/.test(log1) || /config ok:/.test(log1), "the log says what the database attestation accepts");
const det = await c.get("/api/health/detail", { authorization: "Bearer " + a.KPI_READ_TOKEN });
ok(det.status === 200 && det.json.migrations >= 5 && det.json.stewards === 0 && det.json.mail === true, "the operator's detail, with the key, counts migrations and stewards", det.text);
ok((await pool.query("select count(*)::int n from public.lm_migrations")).rows[0].n === 5, "the stand-in and the four migrations are recorded");
await s1.stop(); await sleep(200);

/* ---- 2. a database left at an older migration state is brought forward ---- */
const mdir = path.join(ROOT, "migrations"); const files = fs.readdirSync(mdir).filter((f) => f.endsWith(".sql")).sort();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lm-old-"));
for (const f of files.slice(0, 2)) fs.copyFileSync(path.join(mdir, f), path.join(tmp, f));
const admin = new pg.Client({ connectionString: ADMIN }); await admin.connect();
await admin.query("drop database if exists linkedm_t_boot_old with (force)"); await admin.query("create database linkedm_t_boot_old"); await admin.end();
const oldUrl = ADMIN.replace(/\/[^/?]*(\?|$)/, "/linkedm_t_boot_old$1");
const oldPool = new pg.Pool({ connectionString: oldUrl });
await new Promise((res, rej) => { const p = spawn(process.execPath, ["-e", `process.env.DATABASE_URL=${JSON.stringify(oldUrl)};process.env.LEXOS_ENV='test';const {migrate,pool}=await import(${JSON.stringify(path.join(ROOT, "server", "db.mjs"))});await migrate(()=>{},{dir:${JSON.stringify(tmp)}});await pool.end();`], { stdio: "inherit", cwd: ROOT }); p.on("exit", (code) => (code ? rej(new Error("old state failed")) : res())); });
const n0 = (await oldPool.query("select count(*)::int n from public.lm_migrations")).rows[0].n;
ok(n0 === 3 && (await oldPool.query("select to_regclass('lm.posts') f")).rows[0].f === null, "a database at the old state: the stand-in and two migrations, and no board yet", n0);
const s2 = await startServer({ url: oldUrl, prod: true, env: b });
ok(s2.up, "the current server boots in production mode against the old database", s2.logText().slice(-500));
const h2 = await client(s2.base).get("/api/health");
ok(h2.status === 200 && h2.text === '{"status":"ok","service":"Linked Ministries"}', "and /api/health answers 200 with the two words");
ok((await oldPool.query("select count(*)::int n from public.lm_migrations")).rows[0].n === 5 && (await oldPool.query("select to_regclass('lm.posts') f")).rows[0].f !== null, "it applied the two newer migrations on the way up");
const log2 = s2.logText();
ok(/migrated 0003_board\.sql/.test(log2) && /migrated 0004_grants\.sql/.test(log2) && !/migrated 0001_base/.test(log2), "and only those two (an applied migration is never run again)");
await s2.stop(); await oldPool.end();

/* ---- 3. the refusals ---- */
const refuse = async (env, re, why) => {
  const port = await freePort(); const log = path.join(os.tmpdir(), `lm-refuse-${process.pid}-${port}.log`);
  const child = spawn(process.execPath, [path.join(ROOT, "server", "index.mjs")], { env: { ...process.env, PORT: String(port), DATABASE_URL: fresh.url, ...prodEnv(), ...env }, stdio: ["ignore", fs.openSync(log, "a"), fs.openSync(log, "a")] });
  const code = await new Promise((res) => { const t = setTimeout(() => { child.kill(); res("hung"); }, 15000); child.on("exit", (c2) => { clearTimeout(t); res(c2); }); });
  const text = fs.readFileSync(log, "utf8");
  ok(code === 1 && re.test(text) && !text.includes(SMTP_PASSWORD), why, { code, text: text.slice(0, 300) });
};
await refuse({ DATABASE_URL: "" }, /Linked Ministries will not start[\s\S]*DATABASE_URL is not set/, "in production it refuses to start without DATABASE_URL, in words");
await refuse({ LEXOS_DEV_CODES: "1" }, /prints sign-in codes/, "it refuses to start printing sign-in codes");
await refuse({ LEXOS_SMTP_URL: "" }, /no way to send a sign-in code/, "it refuses to start with no way to send a code");
await refuse({ LEXOS_SMTP_URL: "https://example.org" }, /not a smtp:\/\/ or smtps:\/\//, "it refuses a mail address that is not smtp");
await refuse({ LEXOS_MAIL_FROM: "" }, /LEXOS_MAIL_FROM is not set/, "it refuses to start with no From address");
await refuse({ LEXOS_INTERNAL_KEY: "short" }, /LEXOS_INTERNAL_KEY/, "it refuses a short key");
await refuse({ LEXOS_PUBLIC_URL: "http://linkedm.org" }, /LEXOS_PUBLIC_URL must be/, "it refuses a public address that is not https");
await refuse({ LEXOS_CSP: "off" }, /enforces the content-security policy/, "it refuses a policy that is not enforced");
await refuse({ LEXOS_DB_TLS_UNVERIFIED: "" }, /LEXOS_DB_TLS=require/, "it refuses an unverified database connection nobody has put a name to");
await pool.query("update public.lm_migrations set sha256 = 'deadbeef' where name = '0003_board.sql'");
await refuse({ LEXOS_ENV: "test", LEXOS_PUBLIC_URL: "" }, /was applied and has been edited since/, "it refuses to start when an applied migration's recorded hash no longer matches its file");
await pool.end();
process.exit(T.done());

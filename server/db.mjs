/* db.mjs — one pool, three ways in (adapted from Behavioral Health's server/db.mjs; origin in commons.json).
   asAdmin(fn): the service connection (sessions, sign-in codes, the rate limits).
   asUser(uid, fn): a transaction that runs as the `authenticated` role with auth.uid() = uid, so every table's row-level
   security and every trigger's guard applies — the API never gets to be more powerful than the person using it.
   asAnon(fn): a read-only transaction that runs as the `anon` role, for the public pages. The database, not the page, decides
   that only a public post of a public ministry comes back, and which columns of it.
   migrate(): applies migrations/*.sql in order on boot, once, under a lock. An applied migration is never edited (the rule that
   came out of Cross Universal's D-578): the hash of each file is kept when it is applied, and a file that no longer matches
   its recorded hash stops the boot, in words, before anything is served. */
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { dbUrl, dbTls, sslFor } from "../lib/dbtls.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(here, "..");
const URL0 = dbUrl(process.env);
export const DB_TLS = dbTls(process.env, URL0);
export const pool = new pg.Pool({ connectionString: DB_TLS.url, max: 8, ssl: sslFor(process.env, URL0) });
pool.on("error", (e) => console.error("database pool error: " + String(e && e.code || "error")));

export async function asAdmin(fn) {
  const c = await pool.connect();
  try { return await fn(c); } finally { c.release(); }
}

/* `uid` is the signed-in person; `claims` is nothing a client can send */
export async function asUser(uid, fn) {
  if (!uid) throw Object.assign(new Error("unauthenticated"), { status: 401 });
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    try { await c.query("rollback"); } catch (x) { /* the connection is already gone */ }
    throw e;
  } finally { c.release(); }
}

/* the public: nobody is signed in, the `anon` role, read only */
export async function asAnon(fn) {
  const c = await pool.connect();
  try {
    await c.query("begin read only");
    await c.query("set local role anon");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    try { await c.query("rollback"); } catch (x) { /* the connection is already gone */ }
    throw e;
  } finally { c.release(); }
}

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
export function migrationFiles(dir = path.join(ROOT, "migrations")) {
  return fs.readdirSync(dir).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
}

export async function migrate(log = console.log, { dir = path.join(ROOT, "migrations") } = {}) {
  const files = migrationFiles(dir);
  await asAdmin(async (c) => {
    await c.query("select pg_advisory_lock(7735202)");
    try {
      await c.query("create table if not exists public.lm_migrations (name text primary key, sha256 text, applied_at timestamptz not null default now())");
      const done = new Map((await c.query("select name, sha256 from public.lm_migrations")).rows.map((r) => [r.name, r.sha256]));
      const shimFile = path.join(ROOT, "tools", "local-supabase-shim.sql");
      /* Railway's Postgres has no auth schema: the shim stands in for the part of Supabase's runtime these migrations read */
      const supabase = (await c.query("select 1 from pg_roles where rolname = 'supabase_auth_admin'")).rowCount > 0;
      if (!supabase && !done.has("local-supabase-shim.sql")) {
        const sql = fs.readFileSync(shimFile, "utf8");
        await c.query(sql);
        await c.query("insert into public.lm_migrations (name, sha256) values ('local-supabase-shim.sql', $1)", [sha(sql)]);
        log("migrated local-supabase-shim.sql");
      }
      for (const f of files) {
        const sql = fs.readFileSync(path.join(dir, f), "utf8");
        if (done.has(f)) {
          if (done.get(f) && done.get(f) !== sha(sql)) throw new Error(`migration ${f} was applied and has been edited since. An applied migration is never edited; put the change in the next numbered file. Refusing to start.`);
          continue;
        }
        await c.query("begin");
        try {
          await c.query(sql);
          await c.query("insert into public.lm_migrations (name, sha256) values ($1, $2)", [f, sha(sql)]);
          await c.query("commit");
          log("migrated " + f);
        } catch (e) { await c.query("rollback"); throw new Error("migration " + f + " failed: " + e.message); }
      }
    } finally { await c.query("select pg_advisory_unlock(7735202)"); }
  });
}

export const sha256 = (s) => crypto.createHash("sha256").update(Buffer.isBuffer(s) ? s : String(s)).digest();

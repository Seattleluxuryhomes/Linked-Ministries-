#!/usr/bin/env node
/* tools/db-local.mjs — a fresh database from the migrations, on a local Postgres 16.
   Drops and recreates the database named by LEXOS_DB_NAME (default linked_ministries), then applies the Supabase stand-ins
   (tools/local-supabase-shim.sql) and migrations/*.sql in order. Anything the parser accepts but Postgres refuses fails here,
   loudly, before it can fail in production. It never touches a database called lexos (another product's).
   Env: LEXOS_PG_ADMIN_URL  superuser connection (default postgres://postgres:lexos-local@127.0.0.1:5432/postgres)
        LEXOS_DB_NAME       database to (re)create */
import pg from "pg";

const ADMIN = process.env.LEXOS_PG_ADMIN_URL || "postgres://postgres:lexos-local@127.0.0.1:5432/postgres";
const NAME = process.env.LEXOS_DB_NAME || "linked_ministries";
if (!/^[a-z_][a-z0-9_]*$/.test(NAME)) throw new Error("database name must be a plain identifier");
if (NAME === "lexos") throw new Error("lexos is another product's database; give this one a name of its own");

export async function resetDatabase({ admin = ADMIN, name = NAME, quiet = false } = {}) {
  const a = new pg.Client({ connectionString: admin });
  await a.connect();
  await a.query(`drop database if exists ${name} with (force)`);
  await a.query(`create database ${name}`);
  await a.end();
  const url = admin.replace(/\/[^/?]*(\?|$)/, `/${name}$1`);
  process.env.DATABASE_URL = url;
  process.env.LEXOS_ENV = process.env.LEXOS_ENV || "test";
  const { migrate, pool } = await import("../server/db.mjs");
  await migrate(quiet ? () => {} : (m) => console.log("applied  " + m.replace(/^migrated /, "")), process.env.LM_MIGRATIONS_DIR ? { dir: process.env.LM_MIGRATIONS_DIR } : {});
  const t = (await pool.query("select count(*)::int as n from pg_tables where schemaname in ('app','lm')")).rows[0].n;
  const p = (await pool.query("select count(*)::int as n from pg_policies where schemaname in ('app','lm')")).rows[0].n;
  if (!quiet) console.log(`ready    ${name}: ${t} tables, ${p} policies`);
  return { url, tables: t, policies: p, pool };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  resetDatabase().then((r) => r.pool.end()).catch((e) => { console.error("FAILED   " + e.message + (e.hint ? "\n         hint: " + e.hint : "")); process.exit(1); });
}

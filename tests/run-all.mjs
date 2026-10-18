#!/usr/bin/env node
/* tests/run-all.mjs — every test, one after another, each in its own process and its own database (linkedm_t_<name>), to the true end:
   one red test does not hide another. Needs a local Postgres 16 (LEXOS_PG_ADMIN_URL, default
   postgres://postgres:lexos-local@127.0.0.1:5432/postgres) and, for the browser tests, a Chromium (CHROMIUM_PATH).
     npm test                 everything: unit, installable app, plain words, database, API, boot, light, browser
     npm run test:fast        the unit, plain-words, database, API and boot tests only (no browser) */
import { spawn } from "node:child_process";
import path from "node:path";
import { ROOT } from "./helpers.mjs";

const fast = process.env.LM_FAST === "1" || process.argv.includes("--fast");
const ALL = [["migrations are recorded", "tools/freeze-migrations.mjs", ["--check"]], ["unit", "tests/unit-test.mjs"], ["installable app (unit)", "tests/pwa-unit-test.mjs"], ["orb (unit)", "tests/orb-unit-test.mjs"], ["plain words", "tests/plainwords-test.mjs"], ["database", "tests/db-test.mjs"], ["database: pages", "tests/db-pages-test.mjs"], ["database: giving", "tests/db-giving-test.mjs"], ["api", "tests/api-test.mjs"], ["api: pages", "tests/api-pages-test.mjs"], ["api: giving", "tests/api-giving-test.mjs"], ["eden", "tests/eden-test.mjs"], ["boot", "tests/boot-test.mjs"],
  ...(fast ? [] : [["light", "tests/light-test.mjs"], ["browser", "tests/browser-test.mjs"], ["browser: pages", "tests/browser-page-test.mjs"], ["browser: giving", "tests/browser-giving-test.mjs"], ["browser: eden", "tests/browser-eden-test.mjs"], ["browser: orb", "tests/browser-orb-test.mjs"], ["browser: installable app", "tests/browser-pwa-test.mjs"], ["browser: desktop", "tests/browser-desktop-test.mjs"]])];
const results = [];
for (const [name, file, args = []] of ALL) {
  console.log(`\n=== ${name} (${file}) ===`);
  const code = await new Promise((res) => { const p = spawn(process.execPath, [path.join(ROOT, file), ...args], { stdio: "inherit", cwd: ROOT, env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=2800", LEXOS_DB_NAME: "" } }); p.on("exit", res); });
  results.push([name, code]);
}
console.log("\n=== summary ===");
for (const [n, c] of results) console.log((c === 0 ? "ok    " : c === 2 ? "SKIP  " : "FAIL  ") + n + (c === 2 ? " (a needed tool is missing: see the message above)" : ""));
/* the test databases (linkedm_t_*) are thrown away when the run ends, so a shared machine is not left holding forty of them;
   LM_KEEP_DBS=1 keeps them for looking at */
if (process.env.LM_KEEP_DBS !== "1") {
  try {
    const { default: pg } = await import("pg");
    const a = new pg.Client({ connectionString: process.env.LEXOS_PG_ADMIN_URL || "postgres://postgres:lexos-local@127.0.0.1:5432/postgres" });
    await a.connect();
    for (const r of (await a.query("select datname from pg_database where datname ~ '^linkedm_t_'")).rows) await a.query(`drop database if exists ${r.datname} with (force)`);
    await a.end();
  } catch (e) { console.log("(the test databases were not removed: " + e.message + ")"); }
}
process.exit(results.every(([, c]) => c === 0) ? 0 : 1);

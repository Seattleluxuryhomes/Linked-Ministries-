#!/usr/bin/env node
/* tools/freeze-migrations.mjs — an applied migration is never edited (the rule that came out of Cross Universal's D-578).
   migrations/FROZEN.sha256 records the SHA-256 of every migration file that has been pushed. tests/unit-test.mjs fails when a
   recorded file's bytes change, and when a migration file is not recorded yet (so a new one is frozen on purpose, in the same
   commit that adds it). The server also keeps each applied file's hash in the database and refuses to boot on a mismatch.
     node tools/freeze-migrations.mjs            record any migration not recorded yet (never changes a recorded line)
     node tools/freeze-migrations.mjs --check    exit 1 when a file differs from its record or has none */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const rec = path.join(dir, "FROZEN.sha256");
const files = fs.readdirSync(dir).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, f))).digest("hex");
const have = new Map((fs.existsSync(rec) ? fs.readFileSync(rec, "utf8") : "").split("\n").filter(Boolean).map((l) => { const [h, f] = l.split(/\s+/); return [f, h]; }));
export function problems() {
  const out = [];
  for (const f of files) { if (!have.has(f)) out.push(`${f} is not recorded in FROZEN.sha256: run node tools/freeze-migrations.mjs in the commit that adds it`); else if (have.get(f) !== sha(f)) out.push(`${f} was edited after it was recorded. An applied migration is never edited; put the change in the next numbered file.`); }
  for (const f of have.keys()) if (!files.includes(f)) out.push(`${f} is recorded but the file is gone`);
  return out;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--check")) { const p = problems(); for (const x of p) console.error(x); process.exit(p.length ? 1 : 0); }
  const lines = files.map((f) => `${have.get(f) || sha(f)}  ${f}`);
  fs.writeFileSync(rec, lines.join("\n") + "\n");
  console.log(`${files.length} migrations recorded (${files.filter((f) => !have.has(f)).length} new)`);
}

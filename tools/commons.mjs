#!/usr/bin/env node
/* tools/commons.mjs — writes commons.json: the pieces this repository copied from the founder's other products (the sharing map).
   Each piece says where it came from (origin repo, path, SHA-256 at the origin's commit), what it is here (path, SHA-256), and
   how it was copied: verbatim (byte for byte), adapted (the same file with named changes), or shaped-on (written here on the same
   model, rulings and defaults). "Do not rebuild what has been built: copy it."
     node tools/commons.mjs          rewrite commons.json from the list below and the files as they are
   The origin checkout is LM_ORIGIN_DIR (default /home/user/cross-univeral). tests/unit-test.mjs checks that every verbatim piece
   equals its origin, that every recorded hash is the file's hash today, and (when the origin is present) that the origin has
   not moved under the record. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = process.env.LM_ORIGIN_DIR || "/home/user/cross-univeral";
const BH = "behavioral-health-app/";
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

/* [id, name, mode, origin path (under the origin repo), local path, note] */
const FONT = (f) => [`font-${f}`, `Self-hosted face ${f}`, "verbatim", `lexos/landing/fonts/${f}.woff2`, `public/fonts/${f}.woff2`, "SIL Open Font License 1.1 (Fontsource). Served from this origin; no font host."];
const PIECES = [
  ["plainwords", "The plain-words reader (D-472)", "verbatim", BH + "lib/plainwords.mjs", "lib/plainwords.mjs", "Run over every public sentence in tests/plainwords-test.mjs."],
  ["ratelimit", "Rate limits and the code lockout, in Postgres", "verbatim", BH + "server/ratelimit.mjs", "server/ratelimit.mjs", "The tables are in migrations/0001."],
  ["shim", "The stand-in for Supabase's auth schema and roles", "verbatim", BH + "tools/local-supabase-shim.sql", "tools/local-supabase-shim.sql", "Railway's Postgres has no auth schema; the server applies this first."],
  ["freeze", "The migration freeze tool: an applied migration is never edited", "verbatim", BH + "tools/freeze-migrations.mjs", "tools/freeze-migrations.mjs", "migrations/FROZEN.sha256 is its record; the unit test and the server both refuse an edited file."],
  ["railway", "railway.json: Dockerfile build, /api/health check", "verbatim", BH + "railway.json", "railway.json", "Unchanged."],
  ["dockerignore", ".dockerignore", "verbatim", BH + ".dockerignore", ".dockerignore", "Unchanged."],
  ["gitignore", ".gitignore", "verbatim", BH + ".gitignore", ".gitignore", "Unchanged."],
  ["dockerfile", "The Dockerfile: Node 22, lockfile packages only, unprivileged user, port 8080", "adapted", BH + "Dockerfile", "Dockerfile", "One comment line names this product. The build is unchanged."],
  ["dbtls", "The database connection checks who it talks to (D-389)", "adapted", BH + "lib/dbtls.mjs", "lib/dbtls.mjs", "One change: the default database name is linked_ministries."],
  ["mail", "Outbound email, with the truth told either way", "adapted", BH + "server/mail.mjs", "server/mail.mjs", "The text-message sender is gone, the default From names this site, and a Reply-To can be set."],
  ["db", "One pool, three ways in (admin, signed-in person, the public); migrations on boot with a refusal when one was edited", "adapted", BH + "server/db.mjs", "server/db.mjs", "Adds asAnon for the public pages; drops the host stamp and the acting-admin helper; the migration table is lm_migrations."],
  ["headers", "Security headers and the same-origin lock", "adapted", BH + "server/headers.mjs", "server/headers.mjs", "The no-index and no-store paths are this site's. The policy is the original's: script-src 'self', no inline script, no nonce to forget; one line added, worker-src 'self', for the service worker (this site's own file, no blob)."],
  ["config", "The boot guard", "adapted", BH + "server/config.mjs", "server/config.mjs", "The health-records guard, the demo mode and the text-message channel are removed; mail is required in production."],
  ["db-local", "A fresh database from the migrations on a local Postgres 16", "adapted", BH + "tools/db-local.mjs", "tools/db-local.mjs", "Default name linked_ministries; refuses the name lexos."],
  ["auth", "Passwordless sign-in and sessions", "shaped-on", BH + "server/auth.mjs", "server/auth.mjs", "Six-digit code by email, hash-stored, ten minutes, five tries, one use, five wrong codes lock an address, thirty-day httpOnly sessions. Anyone may sign in (the first sign-in makes the person); the phone channel is gone; the answer says plainly when no email can be sent."],
  ["api", "The signed-in routes, each a thin door on the database", "shaped-on", BH + "server/api.mjs", "server/api.mjs", "Same pattern (asUser, functions decide, early friendly checks). The routes are this product's: ministries, team, posts, answers, stewards."],
  ["index", "The server: health, sign-in, API, pages, boot", "shaped-on", BH + "server/index.mjs", "server/index.mjs", "Same boot order and health answer (two words). Public pages are built on the server."],
  ["words", "What the database's refusals say, in calm words", "shaped-on", BH + "server/words.mjs", "server/words.mjs", "Same refusal mapping (a code and a hint); the codes are this product's. The founder's one editable line lives here."],
  ["common-js", "Building a page without writing a person's words as markup", "shaped-on", BH + "public/js/common.js", "public/js/common.js", "Same h() and api() helpers; the forms are this product's."],
  ["migration-base", "Sign-in tables, sessions, rate limits", "shaped-on", BH + "migrations/0001_base.sql", "migrations/0001_base.sql", "The login_codes, sessions and rl tables and functions; the organisation and roles are left out."],
  ["migration-people", "Ministries, people, the last lead, the record of every act, stewards", "shaped-on", BH + "migrations/0002_seats.sql", "migrations/0002_ministries.sql", "The last-administrator rule becomes the last-lead rule; the events trigger (ids and field names only, a name on every row) is the original's audit pattern."],
  ["migration-board", "Posts and answers, row-level security", "shaped-on", BH + "migrations/0003_people_portal.sql", "migrations/0003_board.sql", "Same pattern: RLS decides which rows, functions decide who may change them, the audit trigger names every act, a record that was sent is never changed."],
  ["migration-grants", "What each database role may reach, column by column", "shaped-on", BH + "migrations/0007_grants.sql", "migrations/0004_grants.sql", "Same least-privilege pattern; the public (anon) role gets named columns of public rows only."],
  ["test-helpers", "What every test shares: counter, free port, a database of its own, a real server, a cookie-jar client", "adapted", BH + "tests/helpers.mjs", "tests/helpers.mjs", "Database names are linkedm_t_*; adds a stand-in SMTP server (a real mail conversation) and a sign-in helper."],
  ["test-browser-lib", "A real Chromium, a phone and a desk, every page error collected", "adapted", BH + "tests/browser-lib.mjs", "tests/browser-lib.mjs", "Only the screenshot environment name changes."],
  ["test-run-all", "Every test, each in its own process and database, to the true end", "adapted", BH + "tests/run-all.mjs", "tests/run-all.mjs", "This product's test list; drops the image and mutation tests."],
  ["test-boot", "The server boots alone in production mode, old and fresh database, and every refusal", "shaped-on", BH + "tests/boot-test.mjs", "tests/boot-test.mjs", "Same structure; this product's settings, health answer and refusals."],
  ["test-light", "No dark surface on any page, at 390 and 1440, and it can fail", "shaped-on", BH + "tests/light-test.mjs", "tests/light-test.mjs", "Same method (stylesheet tokens, painted pages, a dark panel is caught); adds a check for red and for contrast."],
  ["test-db", "The database as every person", "shaped-on", BH + "tests/db-test.mjs", "tests/db-test.mjs", "Same method; this product's rules."],
  ["test-api", "The whole thing over HTTP", "shaped-on", BH + "tests/api-test.mjs", "tests/api-test.mjs", "Same method; adds the stand-in mail server."],
  ["test-browser", "Real clicks at 390 and 1440", "shaped-on", BH + "tests/browser-test.mjs", "tests/browser-test.mjs", "Same method; this product's journey."],
  ["test-unit", "Names, claims, licences, commons.json, no key in the repository", "shaped-on", BH + "tests/unit-test.mjs", "tests/unit-test.mjs", "The licence check, the commons check, the no-key scan and the migration checks are the original's."],
  ["eden-orb", "Eden's orange orb, drawn on a canvas", "adapted", "lexos/src/edenorb.jsx", "public/js/eden-orb.js", "The drawing (state table, four blobs, seeded mesh, nucleus, vignette, glint, the amber and copper numbers) is copied as it was; only the framework layer changed, a plain mount function instead of a component. Read only at the origin; the origin file is not edited. This site floats the orb at the side of every page (public/js/eden.js, public/js/eden-place.js, public/js/orb.js; founder, 2026-10-18): the drawing is untouched except one added state, off (not set up), which is the same drawing turned low and slow and made grey by the style sheet, the glow element is passed in and breathed with the orb as the origin does, and setState does nothing when the state has not changed. The slow wander at rest copies BidVoice's edenRoam (acquisition-analyzer, public/index.html): 9 seconds quiet, one move in 24, a 2.4 second glide, never while the page is in use, and the 19 second drift of a few pixels (bbdrift); here its four resting places are widened to twelve around the whole edge."],
  ["pwa-worker", "The service worker (D-290): the shell only, never a page, a form or anything under /api", "adapted", "lexos/pwa/sw.js", "public/sw.js", "Same shape and the same rule (a write is never touched, /api is never touched, a page is always the network and offline is answered by one plain page). Changes: the shell here is the stylesheet, six faces, the mark and the offline page; the signed-in paths, /photos and every other path are named as never kept; the stylesheet and the mark go network-first so a release shows at once; the build stamp, the app chunks and the runners' push alerts are removed."],
  ["pwa-offline", "The offline page (D-290): plainly offline, nothing sent, nothing kept", "adapted", "lexos/pwa/offline.html", "public/offline.html", "Same page and same promise in this site's own light look (it reads /css/lm.css, as every page does) and its own words; the dark ground and the inline style are gone because this site's policy allows neither."],
  ["pwa-make", "Writes the manifest and the icons from the brand mark (D-290)", "adapted", "lexos/pwa/make.mjs", "tools/make-pwa.mjs", "Same outputs (manifest, 192 and 512 icons, a maskable icon, an apple-touch icon, all drawn from the existing mark) with Linked Ministries' own mark, name and light palette. The original renders with a package this repository does not have; here the Chromium the tests use draws them, as tools/make-images.mjs does. One manifest, not three."],
  ["pwa-register", "Registering the worker at the root scope", "shaped-on", "lexos/src/app.jsx", "public/js/pwa.js", "The same one line, navigator.serviceWorker.register('/sw.js', { scope: '/' }) with the failure ignored, in its own external file because this site's policy allows no inline script."],
  ["workflow", "CI: a fresh Postgres 16 and a real Chromium, every test", "adapted", BH + ".github/workflows/test.yml", ".github/workflows/test.yml", "Names only."],
  ["deploy", "DEPLOY.md written for the founder: one-line commands, spaces marked and counted, step tables, zero versus O, never a password in chat", "shaped-on", BH + "DEPLOY.md", "DEPLOY.md", "Same form; this product's steps and variables."],
  ["claude", "CLAUDE.md: working rules, hard rules, founder communication rules", "shaped-on", BH + "CLAUDE.md", "CLAUDE.md", "Same form; this product's hard rules."],
  ["env-example", ".env.example: names only, no values", "adapted", BH + ".env.example", ".env.example", "This product's variables."],
  ["package", "package.json and package-lock.json: express, nodemailer, pg", "adapted", BH + "package.json", "package.json", "Name and description; the same three dependencies. Express is pinned at 4.22.3, the first release past the 2026 advisories on body-parser, path-to-regexp and qs, so the lockfile is no longer the original's."],
  ...["fraunces-latin-500-normal", "fraunces-latin-600-normal", "plus-jakarta-sans-latin-400-normal", "plus-jakarta-sans-latin-500-normal", "plus-jakarta-sans-latin-600-normal", "plus-jakarta-sans-latin-700-normal"].map(FONT),
];

const commit = execFileSync("git", ["-C", ORIGIN, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const out = {
  version: 1,
  about: "Pieces this repository copied from another of the founder's products (Cross Universal), the sharing map. origin_sha256 is the origin file's SHA-256 at origin_commit; local_sha256 is this file's. A verbatim piece equals its origin; an adapted piece says what changed; a shaped-on piece is written new on the same model, rulings and defaults. 'Do not rebuild what has been built: copy it.' Regenerate with: node tools/commons.mjs",
  origin_repo: "cross-univeral",
  origin_commit: commit,
  pieces: PIECES.map(([id, name, mode, op, lp, note]) => {
    for (const p of [path.join(ORIGIN, op), path.join(ROOT, lp)]) if (!fs.existsSync(p)) throw new Error(`missing ${p}`);
    return { id, name, mode, origin_repo: "cross-univeral", origin_path: op, origin_sha256: sha(path.join(ORIGIN, op)), local_path: lp, local_sha256: sha(path.join(ROOT, lp)), note };
  }),
};
fs.writeFileSync(path.join(ROOT, "commons.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`commons.json: ${out.pieces.length} pieces from ${commit.slice(0, 10)} (${out.pieces.filter((p) => p.mode === "verbatim").length} verbatim, ${out.pieces.filter((p) => p.mode === "adapted").length} adapted, ${out.pieces.filter((p) => p.mode === "shaped-on").length} shaped-on)`);

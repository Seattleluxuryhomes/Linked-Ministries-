# Linked Ministries: working rules

A free board where a ministry posts what it needs (an ask) or what it can give (a give), and another ministry answers. It runs
at linkedm.org. Linked Ministries is a Washington nonprofit being formed (the application for 501(c)(3) recognition is to
follow). It also runs Disciples' Authority (https://www.disciplesauthority.org), a free 24-week discipleship and recovery
program, and plans sober-living housing. The shape of this repository is Behavioral Health's (`Seattleluxuryhomes/cross-univeral`,
`behavioral-health-app/`); the family's charter and decision log live there, and this repository is subordinate to them. When a
requested change conflicts with the charter, the decision log or these rules, stop and present the conflict. Never resolve it
silently.

Founder, 2026-10-18: "So if a ministry wants something or needs something we need a board so that they can ask or they can give."

## Hard rules

1. **Permissions live in the database and the API, never in the screen.** The public reads public posts only, and only the columns
   `migrations/0004_grants.sql` names; a ministry never reads another's drafts, people or answers. A page that hides a field is not a
   permission. Row-level security and the functions in `migrations/` decide; each route is a thin door.
2. **A person approves.** A new ministry and every new post wait for a steward (a Linked Ministries staff person; the `steward` flag
   on the person row, set only by SQL or by another steward). The poster sees "Waiting for a person at Linked Ministries to read
   it" and never "published" until it is. What a steward approved is frozen: its words cannot be changed.
3. **No fake states.** Nothing says sent, saved or received unless it happened. An answer says "Sent to <ministry>" only after the
   mail provider accepted the email, and is a row only after that. With no mail set up, or a provider that refuses, the screen says
   so and nothing is saved.
4. **Every mutation writes an `events` row with a name on it**, from the database, and the row holds ids and field names, never what
   a person wrote (an answer's words are in its own row and in the email, never in the event).
5. **Light only.** A pale ground, white cards, dark words, one gold (#D97706) for lines and small labels. No dark theme, panel or
   sidebar; the only dark fill is a button. Never alarmed: no red. `tests/light-test.mjs` fails on any dark surface and on red.
6. **Plain words**, grade 8 or under, on every public sentence. `lib/plainwords.mjs` reads them in `tests/plainwords-test.mjs`. The one
   named exception is the founder's own line about the nonprofit corporation, which carries a legal name.
7. **No AI. No payments. No money category. No tracking.** The network moves no money and says so. No CDN, no analytics, no Tailwind
   CDN, no unpkg, no font host: every face is in `public/fonts`. No inline script and no style attribute (the policy allows neither).
   Nothing about tax deductibility, anywhere. No prices or packages: the old page's are in `docs/OLD-PAGE.md`; whether a paid tier
   ever returns is the founder's decision and a lawyer's question first.
8. **An applied migration is never edited.** The next change is the next numbered file. After adding one, run
   `npm run migrations:freeze` in the same commit. The server keeps each file's hash and refuses to start if one moved.
9. **No credentials, keys or real personal information** in the repository, the log or a page. `.env.example` has names only. No
   model names in files.
10. **Every ministry has a lead**; the last lead cannot be removed, demoted or leave. Every post has a ministry and every act a name.
    A record with nobody's name on it becomes the founder's problem.
11. **Names.** The product is "Linked Ministries", linkedm.org. The technology under the founder's other products is named nowhere a
    person can read it. `tests/unit-test.mjs` scans every page and string.
12. **Two lines that never move:** the footer says "Linked Ministries is a Washington nonprofit corporation; its application for
    501(c)(3) recognition is not yet filed." (the one value to edit is `FILING_STATUS` in `server/words.mjs`), and every page says
    "If someone is in danger, call 911. If someone is thinking of hurting themselves, call or text 988."

## Copy, never rebuild

Pieces copied from another product are listed in `commons.json`, each with where it came from and its hash (`node tools/commons.mjs`
rewrites it). A copy is the same model, fields, defaults and rulings with only the storage translated. Do not redesign while
copying. Outside code only under a credit-only licence (MIT, BSD, Apache-2.0, ISC); `tests/unit-test.mjs` checks every package that
ships.

## Working

- Run: `npm ci`, a local Postgres 16, then see `README.md`. Test: `npm test` (all) or `npm run test:fast`.
- Use a database of your own (`LEXOS_DB_NAME`, for example `linkedm_<you>`); `tools/db-local.mjs` refuses the name `lexos`. The tests make
  and drop databases named `linkedm_t_*`.
- The server listens on `process.env.PORT || 8080` and says `Linked Ministries listening on :<port>`.
- Deploy: `DEPLOY.md`. Railway reads `railway.json`.
- End substantial work with an honest ship assessment.

## Founder communication rules

- Every command the founder types is **one line**. Join steps with `;` or `&&`. Show each space as `␣` and say how many.
- Steps go in a table, one action per row, with what the screen will show. Call out zero vs letter O and l vs I.
- Never ask for or repeat a password. Real links only, never artifact links. Tables, not prose, for settings and steps.

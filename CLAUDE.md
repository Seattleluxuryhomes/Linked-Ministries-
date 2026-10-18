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
   sidebar; the only dark fill is a button (and the 44-pixel ink tile of the mark, which is a logo, drawn as an SVG). Never alarmed: no red. `tests/light-test.mjs` fails on any dark surface and on red.
6. **Plain words**, grade 8 or under, on every public sentence. `lib/plainwords.mjs` reads them in `tests/plainwords-test.mjs`. The one
   named exception is the founder's own line about the nonprofit corporation, which carries a legal name.
7. **No AI. No payment processor. No money category. No tracking.** The board moves no money between ministries and says so. Founder,
   2026-10-18 (D: "We are a safe and transparent place to donate money"): Linked Ministries itself takes gifts and makes grants, through a
   ledger built with the door closed (`migrations/0008_giving_ledger.sql`; the founder ruled this over the old "no payments" line, so the
   rule now reads: no processor and no card number is ever in this repository, and the Give button goes to a page that says no
   processor is connected). No CDN, no analytics, no Tailwind CDN, no unpkg, no font host: every face is in `public/fonts`. No inline
   script and no style attribute (the policy allows neither). The two banned phrases about deducting a gift (`tests/banned.mjs` names them) appear nowhere; only once
   `IRS_LETTER_DATE` is set does one sentence, the IRS's own, say a gift may be deducted. No prices or packages: the old page's are in
   `docs/OLD-PAGE.md`; whether a paid tier ever returns is the founder's decision and a lawyer's question first.
8. **An applied migration is never edited.** The next change is the next numbered file. After adding one, run
   `npm run migrations:freeze` in the same commit. The server keeps each file's hash and refuses to start if one moved.
9. **No credentials, keys or real personal information** in the repository, the log or a page. `.env.example` has names only. No
   model names in files.
10. **Every ministry has a lead**; the last lead cannot be removed, demoted or leave. Every post has a ministry and every act a name.
    A record with nobody's name on it becomes the founder's problem.
11. **Names.** The product is "Linked Ministries", linkedm.org. The technology under the founder's other products is named nowhere a
    person can read it. `tests/unit-test.mjs` scans every page and string.
12. **Two lines that never move:** the footer says "Linked Ministries is forming as a Washington nonprofit corporation; its application for
    501(c)(3) recognition is not yet filed." (three facts in `server/words.mjs` build it and the status line on /giving and the receipt:
    `FORMED`, `APPLIED_501C3`, `IRS_LETTER_DATE`; a developer flips each on the day it is true), and every page says
    "If someone is in danger, call 911. If someone is thinking of hurting themselves, call or text 988."
13. **Legal exposure, audited 2026-10-18.** `/terms` and `/privacy` are drafts a lawyer has not read and say so at the top (`server/legal.mjs`).
    Nothing anywhere claims 501(c)(3) status or says a gift is deductible (the footer's line and the /giving status line, both built in
    `server/words.mjs` from what is true that day, are the only places that name the application); nothing is set beside another company's name; every post carries the stay-safe line and a Report link; a report
    saves, emails the stewards, and hides nothing until a steward acts; a person can download and delete their own data; every email says who
    sent it and why and sells nothing. `tests/banned.mjs` and `tests/unit-test.mjs` hold each of these.
14. **Money is a record, and a person approves it.** Gifts, board votes and receipts are only ever added to; a mistake is a new row that
    points at the old one. A grant needs two different named treasurers and the board's vote by name (a CHECK on the table, not a screen).
    No event holds a donor's name, an email, a note or a board member. The public reads sums of the rows, never a donor. A treasurer is a
    steward with one more flag. `tests/db-giving-test.mjs` holds each of these.
15. **A new database function gets no grant until it needs one.** Postgres lets everyone run a new function: revoke it from public, anon and
    authenticated in the same migration, and grant only what a signed-in person needs (0004's blanket revoke covered only what existed then).
    Whatever reads a contact address, or erases a person, runs on the service connection alone.

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

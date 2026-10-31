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
2. **A person approves.** A new ministry and every new post wait for a person on the Linked Ministries team (a staff person; the `steward` flag
   on the person row, set only by SQL or by another person on the team). The team's page is Review (`/review`; `/steward` redirects to it). The poster sees "Waiting for a person at Linked Ministries to read
   it" and never "published" until it is. What the team approved is frozen: its words cannot be changed.
3. **No fake states.** Nothing says sent, saved or received unless it happened. An answer says "Sent to <ministry>" only after the
   mail provider accepted the email, and is a row only after that. With no mail set up, or a provider that refuses, the screen says
   so and nothing is saved.
4. **Every mutation writes an `events` row with a name on it**, from the database, and the row holds ids and field names, never what
   a person wrote (an answer's words are in its own row and in the email, never in the event).
5. **Light only.** A pale ground, white cards, dark words, one gold (#D97706) for lines and small labels. No dark theme, panel or
   sidebar; the only dark fill is a button (and the 44-pixel ink tile of the mark, which is a logo, drawn as an SVG). Never alarmed: no red. `tests/light-test.mjs` fails on any dark surface and on red.
6. **Plain words**, grade 8 or under, on every public sentence. `lib/plainwords.mjs` reads them in `tests/plainwords-test.mjs`. The one
   named exception is the founder's own line about the nonprofit corporation, which carries a legal name.
7. **No AI except Eden, the writing helper (below). No payment processor. No money category. No tracking.** The board moves no money between ministries and says so. Founder,
   2026-10-18 (D: "We are a safe and transparent place to donate money"): Linked Ministries itself takes gifts and makes grants, through a
   ledger built with the door closed (`migrations/0008_giving_ledger.sql`; the founder ruled this over the old "no payments" line, so the
   rule now reads: no processor and no card number is ever in this repository, and the Give button goes to a page that says no
   processor is connected). Founder, 2026-10-18 (asked "Zeffy online, ledger for the public?", answered yes): gifts online go through
   **Zeffy**, which takes the gift and emails the donor's receipt. The only change: with the door open and `ZEFFY_GIVE_URL` set (an https
   address on zeffy.com, checked at boot), the Give page links to that Zeffy form and says Zeffy sends the receipt and that Zeffy's tip can
   be $0. Still no card number, no processor code and no processor key in this repository. A person on the money team writes each Zeffy gift
   into the ledger with the method `zeffy` (migration 0011) so the public sums add up; such a gift gets **no** receipt email from this site,
   so no donor gets two receipts with two numbers (`tests/api-giving-test.mjs`). Founder, 2026-10-30 ("it should say make a donation"): the button is named **Make a donation** (`DONATE` in `server/pages.mjs`), gold, in the top bar and the footer of every page while the giving door is open, and on the giving page, the give page and the front; "donate" and "donation" left the banned list that day. Founder, 2026-10-30 ("Linked Ministries is registered; I just have to
   set up the 501(c)(3)"): the giving door's registration is Linked Ministries' Washington Secretary of State registration (the corporation's UBI and
   the day it was formed); the Charities Program registration is filed when the law asks for it (gifts of $50,000 a year, or anyone paid to raise
   money) and may replace the number then. The public words say "Washington state registration", which is true of either; they never say
   "charitable solicitation registration" for a UBI. No CDN, no analytics, no Tailwind CDN, no unpkg, no font host: every face is in `public/fonts`. No inline
   script and no style attribute (the policy allows neither). The two banned phrases about deducting a gift (`tests/banned.mjs` names them) appear nowhere; only once
   `IRS_LETTER_DATE` is set does one sentence, the IRS's own, say a gift may be deducted. No prices or packages: the old page's are in
   `docs/OLD-PAGE.md`; whether a paid tier ever returns is the founder's decision and a lawyer's question first.
8. **An applied migration is never edited.** The next change is the next numbered file. After adding one, run
   `npm run migrations:freeze` in the same commit. The server keeps each file's hash and refuses to start if one moved.
9. **No credentials, keys or real personal information** in the repository, the log or a page. `.env.example` has names only. No
   model names in files, except the one that names Eden's model and its company: `server/eden-engine.mjs` (and `package.json` if a
   package ever names it). `tests/unit-test.mjs` fails if a name is anywhere else.
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
    saves, emails the Linked Ministries team, and hides nothing until a person on the team acts; a person can download and delete their own data; every email says who
    sent it and why and sells nothing. `tests/banned.mjs` and `tests/unit-test.mjs` hold each of these.
14. **Money is a record, and a person approves it.** Gifts, board votes and receipts are only ever added to; a mistake is a new row that
    points at the old one. A grant needs two different named people on the money team and the board's vote by name (a CHECK on the table, not a screen).
    No event holds a donor's name, an email, a note or a board member. The public reads sums of the rows, never a donor. The money team (the `treasurer` flag, page Donations at `/donations`, also `/money`; `/treasury` redirects to it) is the Linked Ministries team with one more flag. `tests/db-giving-test.mjs` holds each of these.
15. **Eden is a writing helper and nothing more.** Founder, 2026-10-18: "needs to be a glowing orb on the side that can move around", and then, on
    whether it belongs on every page, "Let's try it". Eden is a glowing orange orb fixed to the side of **every page, public ones included**
    (it was the signed-in pages only: /me, the page form, /money). A person can drag it, it slides to the nearest edge, it wanders slowly on
    its own and holds still for a person, and it never moves for less motion (`public/js/eden.js`, `eden-place.js`, `eden-orb.js`, `orb.js`;
    `tests/browser-orb-test.mjs`). Before sign-in the orb makes no call to Eden or to anyone for it: tapping it shows words only (who Eden is,
    what she never does, the 911 and 988 line) and a "Join the network" button. After sign-in the panel is the writing helper, anywhere (founder,
    2026-10-18: "tap the orb anywhere while signed in, say what you want, she writes it"): with no form open it is one box, "Say what to
    draft", a Draft button and the 911 and 988 line; inside a form (/me, the page form, /money) the same box sits above the form's own
    writing. The page sends only `{ job: "freeform", fields: { words } }`; the server's own short classifier (part of the server prompt,
    offered only the kinds the person's role may have, and checked again after) chooses ask, give, grant letter or thank-you, and the
    existing per-job prompt and rules write the draft. The answer carries the kind and the draft. "Use this in a new ask" or "...give" opens
    the form on /me with the draft in it (not saved; it never replaces words a person typed); "Copy letter" copies a letter. One call to the
    route is one record (job `freeform`) and counts once toward the eight an hour and forty a day. Its prompt and its key live in the server; a client sends a job name and fields, never a prompt. Danger-to-life words
    stop the call and show 911 and 988. Nothing Eden writes is saved or sent until the person presses the form's own Save or Send, and
    every draft says "Eden wrote this; read it before you use it." Scripture is only ever an exact verse from `server/scripture.mjs` by
    its key. No legal, tax or medical advice. One event per call, with token counts and never a word. `tests/eden-test.mjs` holds each.
16. **A new database function gets no grant until it needs one.** Postgres lets everyone run a new function: revoke it from public, anon and
    authenticated in the same migration, and grant only what a signed-in person needs (0004's blanket revoke covered only what existed then).
    Whatever reads a contact address, or erases a person, runs on the service connection alone.

## Installable app

The site installs to a phone (founder, 2026-10-18: "Make sure the app is downloadable to a phone"). The pattern is Cross Universal's D-290,
copied (commons.json: `pwa-worker`, `pwa-offline`, `pwa-make`, `pwa-register`). `public/manifest.webmanifest` and the icons are written by
`node tools/make-pwa.mjs` from the existing mark; `public/sw.js` keeps **only the shell** (the stylesheet, the six faces, the mark, the offline
page) and never `/api`, a signed-in page, a picture, a form or a non-GET; `public/offline.html` says plainly that the phone is offline and nothing
was sent. The policy gains one line, `worker-src 'self'`. `public/js/pwa.js` registers the worker; `public/js/install.js` is the one calm card
on `/me` and the signed-in `/join` that asks a person to add the site to a phone (Android: the browser's own event, and "Added" only after
`appinstalled`; iPhone: the two real steps). It never shows on a computer or on a public page. Founder, 2026-10-18: "It should ask until it's done so that it's on the phone." So it shows on **every**
signed-in page view on a phone until the site is actually installed (open as an app: display-mode standalone, or `navigator.standalone`), with no
memory at all: "Not now" closes it for the rest of that page view only (in memory) and it is back on the next page; after `appinstalled` it says
"Added." for that view and the next visit from the installed app is standalone, so it never shows again. On Android it shows only once the browser
has said the site can be installed (`beforeinstallprompt` held); an iPhone sees the two steps every signed-in visit. No script in `public/js` uses
`localStorage`, `sessionStorage` or a cookie, with no named exception (`tests/unit-test.mjs`). The card's words stay calm: showing again is the
founder's call, and the words never guilt. Tests:
`tests/pwa-unit-test.mjs`, `tests/browser-pwa-test.mjs`, `tests/browser-desktop-test.mjs`.

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

## Words a person reads (founder ruling, 2026-10-18)

A person never reads "steward" or "treasurer" or "treasury". The team's review page is **Review** (`/review`; the button on My ministry is
**Review new posts**), the money page is **Donations** (`/donations`; `/money` still answers; the button is **Record donations**. Founder,
2026-10-30: "Open Money sounds absolutely ridiculous"); a steward as a person is "the Linked Ministries team" or "a person at Linked Ministries", a treasurer is "a person on the money
team". Counts read "3 waiting for review". `/steward` and `/treasury` stay as permanent redirects. Code identifiers, the database flags
(`steward`, `treasurer`), `lm.make_steward`, `lm.make_treasurer`, the API paths under `/api/steward` and `/api/treasury`, event kinds and
migrations keep their names. The public giving and receipt sentences keep their meaning exactly. `tests/banned.mjs` fails if the old words reach a page.

## Founder communication rules

- Every command the founder types is **one line**. Join steps with `;` or `&&`. Show each space as `␣` and say how many.
- Steps go in a table, one action per row, with what the screen will show. Call out zero vs letter O and l vs I.
- Never ask for or repeat a password. Real links only, never artifact links. Tables, not prose, for settings and steps.

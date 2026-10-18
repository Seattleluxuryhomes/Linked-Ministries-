# Linked Ministries

A free board where a ministry posts what it needs (an **ask**) or what it can give (a **give**), and another ministry answers.
It runs at <https://linkedm.org>. A person at Linked Ministries reads every new ministry and every new post before the public
sees it. The network moves no money, has no AI, and tracks no one.

Linked Ministries is a Washington nonprofit being formed (the application for 501(c)(3) recognition is to follow). It also runs
[Disciples' Authority](https://www.disciplesauthority.org), a free 24-week discipleship and recovery program, and plans
sober-living housing.

It is one small service (Node 22, Express, Postgres 16) with no build step. Its shape is Behavioral Health's, and the pieces it
copied are listed in `commons.json`, each with where it came from.

## What a ministry sees, step by step

| # | Where | What happens |
|---|---|---|
| 1 | `/` | The front: what the network is, Disciples' Authority, housing planned, the board's latest posts (read only), "Join the network". |
| 2 | `/board` | Every public post, newest first. Filter by ask or give, by category, state and city, or search words. One button on each: "I can help" (an ask) or "We need this" (a give). |
| 3 | `/join` | Type an email, get a six-number code by email, type it. No password. |
| 4 | `/join` | A new person adds the ministry: name, city, state, what it does, website (optional), contact name, email for answers. Or joins a ministry that asked them by email. |
| 5 | `/me` | The page says: "Waiting for a person at Linked Ministries to read your ministry's page." |
| 6 | `/me` | "Post an ask" or "Post a give": category, title, words, open until (at most 90 days), city. Save as a draft, or send to be read. |
| 7 | `/me` | The post says: "Waiting for a person at Linked Ministries to read it." It never says "published" until a person on the team approved it. |
| 8 | `/review` (was `/steward`, which now redirects) | A person on the team approves, or sends back with a note. A note comes back to the poster, who changes the draft and sends it again. |
| 9 | `/board` | An approved post is public. Another ministry (itself read by a person on the team) opens the form under it: words, optional phone. |
| 10 | email | One email goes to the posting ministry's contact: the answerer's ministry name, the words, a reply address. The screen says "Sent to <ministry>" only after the mail provider took it. |
| 11 | `/me` | The poster sees the answer (and the answerer sees the one it sent). The poster can close the post: "Met" or "No longer needed". |

## The routes

| Route | What it is |
|---|---|
| `/` | The front: the two phones (real screenshots of this site, with a sample ministry), who we are, how it works, what we run, giving, the directors (only once the founder gives their names, in `server/board-members.mjs`), the latest posts, six questions, contact. The two pictures are made by `node tools/make-front-shots.mjs` from the running app |
| `/board`, `/board/<id>`, `/terms`, `/privacy` | Public pages, built whole on the server from the database's public view. The terms and the privacy page are drafts a lawyer has not read, and say so at the top |
| `/giving`, `/give`, `/api/giving` | Where the money went: every approved and paid grant, totals added up from the rows (no donor is ever named), the last twelve months as an inline SVG chart, the status line, the Form 990 link once set. `/give` is the Give button's page: no payment service is connected, so it says so and has no form |
| `/money` (was `/treasury`, which now redirects), `/api/treasury/...` | The money team only (the `treasurer` flag): record a gift, correct one, send a receipt, propose a grant, approve it (a different person on the money team), mark it paid, set the giving door, download the ledger as a CSV |
| `/m/<slug>`, `/photos/<id>` | A ministry's own public page and its pictures. Built whole on the server from the copy a person on the team read; a picture is served only while that copy names it. The ministry's own people see a private preview of the draft at the same address |
| `/join`, `/me`, `/review`, `/money` (`/steward` and `/treasury` redirect to the last two) | Signed-in pages (a shell and a script) |
| `/api/health` | `{"status":"ok","service":"Linked Ministries"}` and nothing else |
| `/api/board`, `/api/board/<id>`, `/api/product` | Public reads |
| `/api/posts/<id>/report` | Anyone reports a public post: saved, then the Linked Ministries team is emailed; nothing is hidden until a person on the team acts |
| `/robots.txt`, `/sitemap.xml`, `/favicon.ico`, `/img/share.png` | Search and share: the sitemap lists public pages and open posts only |
| `/api/auth/start`, `/verify`, `/signout` | Sign in by emailed code |
| `/api/me`, `/api/ministry`, `/api/ministry/update` | The person and the ministry |
| `/api/me/export`, `/api/me/delete` | A person downloads what is held about them, or deletes their account (the database does it in one transaction) |
| `/api/page`, `/api/page/photos` | The ministry's page: the form's draft and send, and a picture (checked on the server, where it was taken is taken out) |
| `/api/team`, `/invite`, `/accept`, `/<id>/role`, `/<id>/remove` | The ministry's people |
| `/api/my/posts`, `/api/posts`, `/<id>/update`, `/submit`, `/close` | Posts |
| `/api/posts/<id>/answer`, `/api/answers` | Answering |
| `/api/steward/queue`, `/ministries/<id>/review`, `/pages/<id>/review`, `/posts/<id>/review`, `/reports/<id>/resolve`, `/stewards` | The Linked Ministries team (the `steward` flag; the API paths keep their first names) |

## The ministry's own page (migration 0007)

| # | Where | What happens |
|---|---|---|
| 1 | `/me` | "Your public page": a lead presses "Make your page" and fills in one form: name, one line, about, city and state, where and when the ministry meets (rows of day, time and place), how to reach it (email, phone, website, each optional), one or two pictures, an optional verse from a list, and the address (chosen from the name, one edit allowed before it is public). |
| 2 | `/me` | "Save as a draft", or "Send to be read". A sent page says "Waiting for a person at Linked Ministries to read it." and never "public". "See how it looks" opens a private preview. |
| 3 | `/review` | The page is in the same queue as ministries and posts. A person on the team reads every word and picture, then approves or sends it back with a note. A page cannot go public before its ministry has been read. |
| 4 | `/m/<slug>` | Anyone, signed out, reads the page: phone first, with its own title, description and share card (its first picture), and in the sitemap. |
| 5 | `/me` | The lead edits any time. The public keeps seeing the copy a person on the team read until a person on the team reads the change. A change to the public name or city sends the whole ministry back to be read, as before. |

A "Give" button shows on the page only when the giving door is open (see below) and the ministry has set a link of its own for gifts. The link is the ministry's, is labelled as theirs, and Linked Ministries never collects or sees that gift.

## Giving: the ledger, with the money door closed (migration 0008)

Founder, 2026-10-18: "We are a safe and transparent place to donate money." The standard is proved by the record, not claimed. The board
still moves no money between ministries; Linked Ministries may fund an ask from its own gifts when its board says yes.

| Rule | Where it is enforced |
|---|---|
| A gift is a record that is only added to. A mistake is a new row that points at the old one; a gift can never go below zero. | Triggers on `lm.gifts` refuse update, delete and truncate, even for the operator's SQL |
| Receipt numbers are the database's, in order, with no gap (a gift that fails uses no number). | `lm.gifts_guard` locks one counter row |
| A grant is proposed by one person on the money team and approved by a different one, after the board's vote is written down by name (yes, abstained, no, the document). | A CHECK on `lm.grants` (`grants_two_people`), `lm.grants_guard`, `lm.board_votes` |
| A grant cannot be more than the money gifts that came in and are not already promised (gifts in kind are not money). | `lm.grants_guard` under a lock |
| An approved grant is never changed, only marked paid with a reference. Nothing is deleted. | `lm.grants_guard` |
| The giving door starts closed and opens only when the Washington registration number and its date are both filled in. | A CHECK on `lm.giving_settings` (`door_needs_registration`) |
| A person on the money team (`treasurer`) is on the team (`steward`) with one more flag, set by SQL or by another person on the money team; the last one cannot be removed. | `lm.treasurer_guard` |
| Every row writes an `events` row with a name on it: ids, amounts, field names. Never a donor, an email, a note, a reason or a board member. | `lm.audit_money` |
| The public reads sums of the rows and the list of grants, never a donor. Nobody reads the tables directly. | `lm.giving_public()`, no grant on any table |
| A receipt email goes to the donor's address only when the mail provider accepts it, and says "Why you got this". Until the IRS letter is dated it says only that the receipt is a record of the gift. | `server/api.mjs`, `server/emails.mjs` (`receiptEmail`) |
| The two banned phrases about deducting a gift (named in `tests/banned.mjs`) appear nowhere. Only when `IRS_LETTER_DATE` is set in `server/words.mjs` does one page sentence, the IRS's own, say a gift may be deducted. | `tests/unit-test.mjs`, `tests/banned.mjs` |

### What a person on the money team does

| # | Where | What happens |
|---|---|---|
| 1 | the database | The operator makes the first person on the money team: `select lm.make_treasurer('EMAIL');` (they join the team too). After that someone on the money team adds another on `/money`. |
| 2 | `/money` | "Record a gift": name (or Anonymous), email if given, dollars, day, how it came in, a note. The receipt number is shown. If an email was given, the screen says whether the receipt email went. |
| 3 | `/money` | "Propose a grant": a ministry on the network or an outside organization, dollars, what for in words. |
| 4 | `/money` | A different person on the money team presses "Approve", writes the day of the vote, the names (one per line) of who voted yes, abstained and no, and the document that holds the vote. The proposer sees "a different person on the money team must approve it". |
| 5 | `/money` | "Mark paid" with a reference (a check or transfer number). |
| 6 | `/money` | "Correct this gift" writes a new row. "Send the receipt" sends it again if the first did not go. |
| 7 | `/money` | The giving door: the registration number, its date, the Form 990 link, and "The door is open". |
| 8 | `/giving` | Anyone reads the result, signed out. |

The Give button on `/giving` (and on a ministry's page, when that ministry has set its own link) shows only when the door is open. It goes to
`/give`, which says the payment service is not connected. Wiring a processor is a later decision with the founder's own keys; none is in
this repository.

### Payroll is not built

Payroll is not app code and is not built here. It needs a payroll provider (to hold the employer's tax accounts, run the payments, file the
returns and keep the records), a decision about who is paid and how (employee or contractor), and a bank account the board has approved.
When the board has chosen a provider, the app's part is small: a grant-like record of what was paid, written the same way (two people on the money team,
a named vote, a reference). Do not write payroll arithmetic in this repository.

## Eden, the writing helper (migration 0009, `server/eden.mjs`)

A small orange orb on the signed-in pages (the ask or give form, the ministry page form, `/money`) with four jobs: write an ask or a
give from a few words, write a ministry's one line and about words, and, for the money team, a grant request letter or a thank-you to a donor.
Every rule is on the server, and `tests/eden-test.mjs` holds each one:

| Rule | How it is kept |
|---|---|
| The prompt is the server's and no client can reach or change it | The prompt is a constant in `server/eden.mjs`. A request is read for a job name and that job's own fields only: a `system`, `model`, `messages` or `prompt` field is ignored. What a person typed goes to the model only inside `<person_input>` tags, with angle brackets turned into brackets. No script, page or answer holds the prompt |
| The model is called only from the server, with a key from the environment | `server/eden-engine.mjs` (one plain HTTPS request; `ANTHROPIC_API_KEY`). With no key the orb says "Eden is not set up on this server yet" and offers no box and no button. The key is in no log, answer or page |
| Danger to life stops the call | `server/crisis.mjs`, the Disciples' Authority list, runs on every field before a key is looked for. The page shows the 911 and 988 line; no model is called |
| Nothing Eden writes is saved or sent | The page shows the draft marked "Eden wrote this; read it before you use it." It goes into a form field only when the person presses "Use these words"; the form's own Save or Send is the only way anything is kept |
| Scripture is never generated | A verse is an exact verse from `server/scripture.mjs`, chosen by its key, only when the person asked. A draft that quotes or names Scripture, or talks about taxes, is held back whole |
| One event per call, never a word | `lm.eden_log`: the person's name, the job, the outcome and the token counts |
| A limit per person | 8 an hour and 40 a day (`EDEN_LIMIT_HOUR`, `EDEN_LIMIT_DAY`) |

## Run it on your machine

You need Node 22 and a Postgres 16 you can create databases in.

```
npm ci
LEXOS_DB_NAME=linkedm_dev node tools/db-local.mjs
LEXOS_ENV=test LEXOS_DEV_CODES=1 DATABASE_URL=postgres://postgres:lexos-local@127.0.0.1:5432/linkedm_dev npm start
```

Then open <http://127.0.0.1:8080/>. With `LEXOS_DEV_CODES=1` the sign-in code is printed in the server's log instead of emailed (the
server refuses that setting in production). With no `LEXOS_SMTP_URL` the answer button says the network is not set up to send yet,
and nothing is sent or saved. To add yourself to the team on your machine:
`psql postgres://postgres:lexos-local@127.0.0.1:5432/linkedm_dev -c "select lm.make_steward('you@example.org')"`.

## Test it

```
npm test            # everything (a few minutes): unit, plain words, database, API, boot, light, browser
npm run test:fast   # no browser
```

The tests need a Postgres 16 (`LEXOS_PG_ADMIN_URL`, default `postgres://postgres:lexos-local@127.0.0.1:5432/postgres`) and, for the
browser tests, a Chromium (`CHROMIUM_PATH`). Each test makes and drops a database of its own (`linkedm_t_*`). `LM_SHOTS=<dir>`
makes the browser test write screenshots.

| Test | What it proves |
|---|---|
| `tests/unit-test.mjs` | The lists (ten categories, none about money), the boot guard's every refusal, the refusal words, the filters, every page built with sample posts and escaped, nothing banned on any page (a CDN, a tracker, AI, a dollar sign, a word about taxes, a price, red, LinkedIn, a technology's name, a model's name), the migrations that must never change, the licences of what ships, `commons.json`, no key in the repository. |
| `tests/plainwords-test.mjs` | Every public sentence, every refusal, every email line, every string in the scripts reads at grade 8 or under and at most 25 words. It can fail. |
| `tests/db-test.mjs` | The database as every person (and, since the audit: the strict email shape, two people on the team or two leads removing each other at once, reports, and leaving): one ministry never reads another's drafts, people or answers; a person not on the team cannot approve (by function or by writing the table); the last lead cannot be removed; a post over 90 days is refused; public always has a named reader; approved words are frozen; an answer is a record; the public reads named columns of public rows only; a name on every event. |
| `tests/api-test.mjs` | Over HTTP with a stand-in mail server that speaks real SMTP: join, profile, post, approval by the team, filters, answer (one email, the right headers), a refusing provider, no provider at all, the team, the wrong person asking for what is not theirs. |
| `tests/boot-test.mjs` | The server boots alone in production mode against an empty and an older database, and refuses to start without `DATABASE_URL`, with codes printed, with no mail, with a short key, with an http address, with an edited migration. |
| `tests/db-pages-test.mjs` | The ministry page as every person: only the copy a person on the team read is public, the address is unique and final once public, the form's rules held by the database, pictures served only when the live copy names them, a ministry that leaves takes its page. |
| `tests/api-pages-test.mjs` | The page builder over HTTP: the form, a picture checked and cleaned (where it was taken is taken out), the private preview, the team's review, the public page signed out, the sitemap, the board's link. |
| `tests/browser-page-test.mjs` | Real clicks at 390 and 1440: a lead makes the page from the form, a person on the team approves it, a visitor opens it, and it prints to a PDF. |
| `tests/db-giving-test.mjs` | The ledger as every person: records only added to, no gap in receipt numbers, two different people on the money team, the board's vote, a grant no larger than the gifts, the door's CHECK, no donor in any event, the public reads sums only. |
| `tests/api-giving-test.mjs` | The money pages over HTTP with a real SMTP stand-in: a receipt only when the provider takes it, the vote, /giving signed out, the door and the Give button, the CSV that cannot run as a formula. |
| `tests/browser-giving-test.mjs` | Real clicks at 390 and 1440: two people on the money team, a gift, a grant proposed and approved by a different person, /giving signed out, the door closed and open. |
| `tests/light-test.mjs` | No dark surface and no red on any page or state (the terms, the privacy page, the report form, the delete page included), at 390 and 1440, and it can fail. |
| `tests/browser-test.mjs` | Real clicks in Chromium at 390 and 1440: visit, filter, join, make a ministry, post, approval by the team and send-back, second ministry answers, poster closes. Zero page errors, nothing sideways, buttons 44 pixels or taller. |

## What is inside

| Piece | Where |
|---|---|
| Sign-in tables, sessions, rate limits | `migrations/0001_base.sql` |
| Ministries, people, invites, the record, stewards | `migrations/0002_ministries.sql` |
| Posts, answers, the review queue, row-level security | `migrations/0003_board.sql` |
| What each database role may reach | `migrations/0004_grants.sql` |
| Sign-in by a code, sessions | `server/auth.mjs` |
| The API | `server/api.mjs` |
| The public read of the board (the `anon` role) | `server/board.mjs` |
| The pages built on the server | `server/pages.mjs` |
| The founder's one editable line, and the refusal words | `server/words.mjs` |
| The boot guard, security headers, mail | `server/config.mjs`, `server/headers.mjs`, `server/mail.mjs` |
| Shared lists and every sentence the pages say | `public/js/pure.js` |
| The ministry's page (`lm.pages`, pictures) | `migrations/0007_ministry_pages.sql`, `server/site.mjs`, `lib/photo.mjs`, `public/js/page.js` |
| The giving ledger, grants, the board's vote, the door, treasurers | `migrations/0008_giving_ledger.sql`, `public/js/treasury.js`, `lib/csv.mjs` |
| Reports, leaving the network (a person's own deletion) | `migrations/0006_reports_and_leaving.sql` |
| The audit's database fixes (strict email, locks, contact out of reach) | `migrations/0005_hardening.sql` |
| The words of /terms and /privacy, and every email | `server/legal.mjs`, `server/emails.mjs` |
| One light stylesheet, six self-hosted faces | `public/css/lm.css`, `public/fonts/` |
| The mark, the share card and the icons (redrawn by `node tools/make-images.mjs`) | `server/pages.mjs` (MARK), `public/img/`, `public/favicon.ico` |
| The old front page's price list, kept for the founder | `docs/OLD-PAGE.md` |

## Taking someone out when they ask by email

A person can delete their own account on `/me` (Settings, Your account). One who writes to the notice address instead is erased by the
operator with one line in the database's SQL box (it does exactly what the button does, and refuses the last person on the team):
`select lm.account_erase((select id from auth.users where lower(email) = lower('EMAIL')));`

## Editing what is true about the corporation

Three facts live in `server/words.mjs` and nowhere else: `FORMED` (the Secretary of State confirmed the articles), `APPLIED_501C3` (the
application is filed) and `IRS_LETTER_DATE` (the date on the IRS letter, `YYYY-MM-DD`, once a letter has come). The footer line, the status
line on `/giving` and the receipt email all read them. Until `IRS_LETTER_DATE` is set, no page and no email says a gift is deductible.
When it is set, one sentence, the IRS's own (`IRS_PHRASE`), appears, and a lawyer checks it against the letter first.

## Putting it on the internet

See `DEPLOY.md`: a Railway project with a Postgres box, the variables, the domain linkedm.org, and the one line of SQL that makes
the first person on the team.

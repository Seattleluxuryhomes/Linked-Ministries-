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
| 7 | `/me` | The post says: "Waiting for a person at Linked Ministries to read it." It never says "published" until a steward approved it. |
| 8 | `/steward` | A steward approves, or sends back with a note. A note comes back to the poster, who changes the draft and sends it again. |
| 9 | `/board` | An approved post is public. Another ministry (itself read by a steward) opens the form under it: words, optional phone. |
| 10 | email | One email goes to the posting ministry's contact: the answerer's ministry name, the words, a reply address. The screen says "Sent to <ministry>" only after the mail provider took it. |
| 11 | `/me` | The poster sees the answer (and the answerer sees the one it sent). The poster can close the post: "Met" or "No longer needed". |

## The routes

| Route | What it is |
|---|---|
| `/`, `/board`, `/board/<id>`, `/terms`, `/privacy` | Public pages, built whole on the server from the database's public view. The terms and the privacy page are drafts a lawyer has not read, and say so at the top |
| `/join`, `/me`, `/steward` | Signed-in pages (a shell and a script) |
| `/api/health` | `{"status":"ok","service":"Linked Ministries"}` and nothing else |
| `/api/board`, `/api/board/<id>`, `/api/product` | Public reads |
| `/api/posts/<id>/report` | Anyone reports a public post: saved, then the stewards are emailed; nothing is hidden until a steward acts |
| `/robots.txt`, `/sitemap.xml`, `/favicon.ico`, `/img/share.png` | Search and share: the sitemap lists public pages and open posts only |
| `/api/auth/start`, `/verify`, `/signout` | Sign in by emailed code |
| `/api/me`, `/api/ministry`, `/api/ministry/update` | The person and the ministry |
| `/api/me/export`, `/api/me/delete` | A person downloads what is held about them, or deletes their account (the database does it in one transaction) |
| `/api/team`, `/invite`, `/accept`, `/<id>/role`, `/<id>/remove` | The ministry's people |
| `/api/my/posts`, `/api/posts`, `/<id>/update`, `/submit`, `/close` | Posts |
| `/api/posts/<id>/answer`, `/api/answers` | Answering |
| `/api/steward/queue`, `/ministries/<id>/review`, `/posts/<id>/review`, `/reports/<id>/resolve`, `/stewards` | Stewards |

## Run it on your machine

You need Node 22 and a Postgres 16 you can create databases in.

```
npm ci
LEXOS_DB_NAME=linkedm_dev node tools/db-local.mjs
LEXOS_ENV=test LEXOS_DEV_CODES=1 DATABASE_URL=postgres://postgres:lexos-local@127.0.0.1:5432/linkedm_dev npm start
```

Then open <http://127.0.0.1:8080/>. With `LEXOS_DEV_CODES=1` the sign-in code is printed in the server's log instead of emailed (the
server refuses that setting in production). With no `LEXOS_SMTP_URL` the answer button says the network is not set up to send yet,
and nothing is sent or saved. To make yourself a steward on your machine:
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
| `tests/db-test.mjs` | The database as every person (and, since the audit: the strict email shape, two stewards or two leads removing each other at once, reports, and leaving): one ministry never reads another's drafts, people or answers; a non-steward cannot approve (by function or by writing the table); the last lead cannot be removed; a post over 90 days is refused; public always has a named reader; approved words are frozen; an answer is a record; the public reads named columns of public rows only; a name on every event. |
| `tests/api-test.mjs` | Over HTTP with a stand-in mail server that speaks real SMTP: join, profile, post, steward approval, filters, answer (one email, the right headers), a refusing provider, no provider at all, the team, the wrong person asking for what is not theirs. |
| `tests/boot-test.mjs` | The server boots alone in production mode against an empty and an older database, and refuses to start without `DATABASE_URL`, with codes printed, with no mail, with a short key, with an http address, with an edited migration. |
| `tests/light-test.mjs` | No dark surface and no red on any page or state (the terms, the privacy page, the report form, the delete page included), at 390 and 1440, and it can fail. |
| `tests/browser-test.mjs` | Real clicks in Chromium at 390 and 1440: visit, filter, join, make a ministry, post, steward approval and send-back, second ministry answers, poster closes. Zero page errors, nothing sideways, buttons 44 pixels or taller. |

## What is inside

| Piece | Where |
|---|---|
| Sign-in tables, sessions, rate limits | `migrations/0001_base.sql` |
| Ministries, people, invites, the record, stewards | `migrations/0002_ministries.sql` |
| Posts, answers, the steward's queue, row-level security | `migrations/0003_board.sql` |
| What each database role may reach | `migrations/0004_grants.sql` |
| Sign-in by a code, sessions | `server/auth.mjs` |
| The API | `server/api.mjs` |
| The public read of the board (the `anon` role) | `server/board.mjs` |
| The pages built on the server | `server/pages.mjs` |
| The founder's one editable line, and the refusal words | `server/words.mjs` |
| The boot guard, security headers, mail | `server/config.mjs`, `server/headers.mjs`, `server/mail.mjs` |
| Shared lists and every sentence the pages say | `public/js/pure.js` |
| Reports, leaving the network (a person's own deletion) | `migrations/0006_reports_and_leaving.sql` |
| The audit's database fixes (strict email, locks, contact out of reach) | `migrations/0005_hardening.sql` |
| The words of /terms and /privacy, and every email | `server/legal.mjs`, `server/emails.mjs` |
| One light stylesheet, six self-hosted faces | `public/css/lm.css`, `public/fonts/` |
| The mark, the share card and the icons (redrawn by `node tools/make-images.mjs`) | `server/pages.mjs` (MARK), `public/img/`, `public/favicon.ico` |
| The old front page's price list, kept for the founder | `docs/OLD-PAGE.md` |

## Taking someone out when they ask by email

A person can delete their own account on `/me` (Settings, Your account). One who writes to the notice address instead is erased by the
operator with one line in the database's SQL box (it does exactly what the button does, and refuses the last steward):
`select lm.account_erase((select id from auth.users where lower(email) = lower('EMAIL')));`

## Editing the nonprofit line

The line at the bottom of every page says the application for 501(c)(3) recognition is "not yet filed". When that changes, a
developer edits one value, `FILING_STATUS`, in `server/words.mjs`. No page says anything about taxes or gifts.

## Putting it on the internet

See `DEPLOY.md`: a Railway project with a Postgres box, the variables, the domain linkedm.org, and the one line of SQL that makes
the first steward.

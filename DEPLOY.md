# Put the Linked Ministries board on linkedm.org: your steps

This puts the board on its own Railway project, from the GitHub repository `Seattleluxuryhomes/Linked-Ministries-`, with its
own Postgres box, at <https://linkedm.org>. Nothing here sets up payments, and the board has no AI.

**Read these three marks before you type anything.**

| Mark | What it means |
|---|---|
| `␣` | One space. Where you see it in a line to type, press the space bar once. Every line below says how many spaces it has. |
| `0` and `O` | In `2026-10-18` every `0` is the number zero. In `LEXOS` (L, E, X, O, S) the `O` is the capital letter O, and in `openssl` and `Postgres` the `o` is the small letter o. Paste the blocks; do not retype them. |
| `l` and `I` | In `Seattleluxuryhomes` the tall thin letter is a lowercase L (`l`). A capital i (`I`) is in `LEXOS_INTERNAL_KEY` (INTERNAL starts with it). Paste the block in Step 6; do not retype it. |

The repository's name ends in a hyphen: `Linked-Ministries-`. That is correct. Do not drop the last hyphen.

Never type a password into a chat. The one secret you need, the 16-letter Google app password, goes only into the Railway
variables box in Step 6 and nowhere else.

## Step 1. Make the Railway project from the repository

| # | You do | The screen shows |
|---|---|---|
| 1 | Open <https://railway.com/new> | "What would you like to create?" |
| 2 | Click **Deploy from GitHub repo** | A list of your repositories. |
| 3 | Click `Seattleluxuryhomes/Linked-Ministries-`. If it is not in the list, click **Configure GitHub App**, allow that one repository, and come back | A project opens with one service card. It starts building and then fails or waits. That is normal: it has no database and no settings yet. |

## Step 2. Add the database

| # | You do | The screen shows |
|---|---|---|
| 1 | In the project, click **Create** (or **New**), then **Database**, then **Add PostgreSQL** | A second card named Postgres, going green. |

## Step 3. Make a secret key (one line)

Paste this into Terminal. It prints one line of 64 letters and numbers. Copy it as the KEY. It is a secret: do not paste it
anywhere but Step 6.

```
openssl rand -hex 32
```

The same line with the spaces marked (2 spaces): `openssl␣rand␣-hex␣32`

## Step 4. Point linkedm.org at the service

| # | You do | The screen shows |
|---|---|---|
| 1 | Click the `Linked-Ministries-` service card, then **Settings**, then **Networking** | A box called "Public Networking". |
| 2 | Click **Custom Domain**, type `linkedm.org`, and if it asks which port, type `8080` | Railway shows a DNS record to add: a name, a type (CNAME, or ALIAS or A for a bare domain) and a value. |
| 3 | Open the place where linkedm.org's DNS is managed (where the domain was bought) and add exactly the record Railway shows | The record is listed. Railway's box says "Waiting for DNS". It can take from a few minutes to a few hours. |
| 4 | Come back to Railway later | A green tick beside `linkedm.org`. |

## Step 5. Copy the Google app password

You already made one for the other products. Use the same one: 16 letters, no spaces. Keep it where you keep passwords. Do not
paste it into this chat or any other.

## Step 6. Paste the settings

| # | You do | The screen shows |
|---|---|---|
| 1 | Click the `Linked-Ministries-` service card, then **Variables**, then **Raw Editor** | A big empty text box. |
| 2 | Paste the block below, then replace every part in angle brackets `<...>` (and remove the brackets) | The block with your own values. |
| 3 | Click **Update Variables**, then **Deploy** | The service builds, then turns green. |

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
LEXOS_ENV=production
LEXOS_CSP=enforce
LEXOS_DB_TLS=require
LEXOS_DB_TLS_UNVERIFIED=attested:BenMorton:2026-10-18
LEXOS_INTERNAL_KEY=<the KEY from Step 3>
LEXOS_SMTP_URL=smtps://ben%40benmortongroup.com:<the 16-letter Google app password, no spaces>@smtp.gmail.com:465
LEXOS_MAIL_FROM=ben@benmortongroup.com
LEXOS_PUBLIC_URL=https://linkedm.org
LEXOS_NOTICE_EMAIL=<the address for notices, for example legal@linkedm.org: a real mailbox>
```

What each line is, in plain words:

| Line | What it does |
|---|---|
| `DATABASE_URL` | Points the app at the Postgres card. Leave it exactly as written, with the double curly brackets. |
| `LEXOS_ENV=production` | Turns on the strict rules. |
| `LEXOS_CSP=enforce` | Turns on the browser safety rules. |
| `LEXOS_DB_TLS=require` | The connection to the database is scrambled in transit. |
| `LEXOS_DB_TLS_UNVERIFIED=attested:BenMorton:2026-10-18` | Your name and the date, saying you accept that the database's identity is not checked. The app refuses to start without a named person on a date. |
| `LEXOS_INTERNAL_KEY` | The KEY. 64 letters and numbers. |
| `LEXOS_SMTP_URL` | How sign-in codes and answers are emailed. The `@` in your address is written `%40` here, and only here. The password is your Google app password. |
| `LEXOS_MAIL_FROM` | The address those emails come from. |
| `LEXOS_PUBLIC_URL` | The site's own address, starting `https://`, with nothing after `.org`. |
| `LEXOS_NOTICE_EMAIL` | The address printed on the terms and the privacy page for a takedown notice or a request to delete. It must be a mailbox someone reads. Leave the line out and the page shows the `LEXOS_MAIL_FROM` address instead, which is your own. |

**Do not add** `LEXOS_DEV_CODES`. The server refuses to start with it: it prints sign-in codes in the log.

## Step 7. Check it

| # | You do | The screen shows |
|---|---|---|
| 1 | Open <https://linkedm.org/api/health> | Exactly `{"status":"ok","service":"Linked Ministries"}` and nothing else. |
| 2 | Open <https://linkedm.org/> | A pale page: "Ministries helping ministries.", the gold line under the name, "This board is new" and "Nothing is on the board yet", and at the bottom the line about the nonprofit corporation, the line about 911 and 988, and the links to Terms and Privacy. |
| 3 | Open <https://linkedm.org/join>, type your email, click **Send me a code** | "A code is on its way." and, in your inbox, a message with a six-number code. If it says "This site cannot send email right now", the mail settings in Step 6 are wrong: see below. |

If step 1 shows a Railway error page instead, open the service, click **Deployments**, then **View logs**. The app says what is
wrong in words, on a line that starts `Linked Ministries will not start:`, before it stops. Fix that line in Step 6 and click
**Deploy** again.

## Step 8. Make the first steward (one line of SQL, one blank)

A steward is a person at Linked Ministries who reads every new ministry and every new post before it is public. Nothing goes on
the board until a steward approves it. The first steward is made in the database, because nobody can make themselves one.

| # | You do | The screen shows |
|---|---|---|
| 1 | In the project, click the **Postgres** card, then **Data**, then **Query** | An empty box for SQL. |
| 2 | Paste the line below. Replace `EMAIL` with your own email address, in the same place, keeping the two quote marks | The line with your address between the quote marks. |
| 3 | Click **Run** | A one-row result with a long id. That is your steward id. |
| 4 | Open <https://linkedm.org/join> and sign in with that same email (the code comes by email) | A page that says "You are a steward" with a button "Open the page for stewards". |
| 5 | Click **Open the page for stewards** | "Waiting to be read". It is empty until a ministry joins. |

```
select lm.make_steward('EMAIL');
```

The same line with the space marked (1 space): `select␣lm.make_steward('EMAIL');`

To make a second steward later, a steward signs in, opens the page for stewards and types the other person's email (that
person must have signed in once). The last steward cannot be removed.

## Step 8b. Make the first treasurer (one line of SQL, one blank)

A treasurer is a steward who writes down gifts and grants and approves the grants another treasurer proposed. Nothing is taken online
until the giving door is opened, and the door opens only when the Washington registration number and its date are filled in on the
treasury page. Make the first treasurer the same way as the first steward (the person becomes a steward too).

| # | You do | The screen shows |
|---|---|---|
| 1 | In the project, click the **Postgres** card, then **Data**, then **Query** | An empty box for SQL. |
| 2 | Paste the line below. Replace `EMAIL` with the treasurer's own email address, keeping the two quote marks | The line with the address between the quote marks. |
| 3 | Click **Run** | A one-row result with a long id. |
| 4 | That person signs in at <https://linkedm.org/join>, then opens <https://linkedm.org/treasury> | "The treasury", with the totals and the forms. |

```
select lm.make_treasurer('EMAIL');
```

The same line with the space marked (1 space): `select␣lm.make_treasurer('EMAIL');`

A treasurer makes the next one on the treasury page. The last treasurer cannot be removed. A grant always needs two different
treasurers, so make at least two before the first grant.

## Step 8c. Turn on Eden, the writing helper (optional; a key you add yourself)

Eden writes a first draft of an ask or a give, of a ministry's page words, of a grant request letter or of a thank-you, from what the
person types. It is off until you add a key. Without one, the page says "Eden is not set up on this server yet" and offers nothing.
The key is a secret: add it only in Railway's Variables box, never in this chat and never in the repository.

| # | You do | The screen shows |
|---|---|---|
| 1 | Make a key in your account with the company that runs the writing model, and copy it | A long line starting `sk-` |
| 2 | In Railway, click the `Linked-Ministries-` service card, then **Variables**, then **New Variable** | Two boxes: a name and a value |
| 3 | Type the name `ANTHROPIC_API_KEY` in the first box and paste the key in the second | The new line in the list |
| 4 | Click **Deploy** | The service builds, then turns green. On /me, **Ask Eden to help** now opens a box |

What each line is, in plain words:

| Line | What it does |
|---|---|
| `ANTHROPIC_API_KEY` | The key. Type the name exactly as shown, with two underscores. The `O` in the first word is the capital letter O; there is no zero. The server reads the key from here only. |
| `EDEN_MODEL` | Optional. Names a different model. Leave it out and the server uses its own choice. |
| `EDEN_LIMIT_HOUR`, `EDEN_LIMIT_DAY` | Optional. How many times one person may ask Eden in an hour and in a day. Left out, they are 8 and 40. |

Eden's rules are in the server, not on the page: it writes only from what the person typed, never quotes Scripture on its own (a verse is
only ever one from the server's own list), says nothing about taxes, stops and shows 911 and 988 if the words are about danger to life,
and saves and sends nothing. Each call is written down with the person's name, the job and the number of tokens, never a word.

## Step 9. Someone asks you to delete them

A person can do it themselves (My ministry, then Settings, then Your account). If one writes to the notice address instead, make sure it is them, then run this in the Postgres card's Query box. Replace `EMAIL` with their address, in the same place, keeping the quote marks. Nothing is typed twice, and it refuses the last steward.

```
select lm.account_erase((select id from auth.users where lower(email) = lower('EMAIL')));
```

The same line with the spaces marked (8 spaces): `select␣lm.account_erase((select␣id␣from␣auth.users␣where␣lower(email)␣=␣lower('EMAIL')));`

## When something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| "This site cannot send email right now" on the join page | `LEXOS_SMTP_URL` is missing or wrong | Check Step 6. The password must be the 16-letter app password with no spaces. |
| "The message did not go out" | Google refused the email | Make a new app password, replace it in Step 6, click **Deploy**. |
| The log says `will not start` | A setting is missing | Read the line it prints; it names the setting. |
| "I can help" says the network is not set up to send yet | Mail is not configured | Same as the first row. Nothing is sent and nothing is saved until it is. |

## What this does not do

| Not done | Why |
|---|---|
| Payments or donations | The network moves no money, and says so on the front and on the board. |
| AI, tracking, ads | None is built in. Nothing loads from another website. |
| Anything about taxes | The footer says only that the application for 501(c)(3) recognition is "not yet filed". When it is filed, a developer changes one value, `FILING_STATUS` in `server/words.mjs`. |
| Backups | Railway's Postgres box is the only copy. Turn on Railway's backups for the Postgres service when real ministries use it. |

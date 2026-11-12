# The suggested gift

Founder, 2026-11-12: "We will just ask for a donation. But it's not necessary. Suggested donation is 1,000." Asked whether the $1,000
is a payment for the hosted page, the founder ruled: **"It's a gift."**

**It is live** on `/me`, for a ministry's own people, only while Linked Ministries' giving door is open (`WORDS.giftTitle`,
`giftBody`, `giftSame` in `public/js/pure.js`; `tests/browser-giving-test.mjs` holds it). Because it is a gift, nothing depends on
it: every page is free, read the same way, and shown the same way, whether or not a ministry gives. It is never on a public page,
never in the review queue, and never in an email.

## Questions still worth asking a lawyer

| Question for the lawyer | Why it matters |
|---|---|
| Is a "suggested donation" of $1,000 from a ministry that gets a hosted page a gift, or a payment for a service? | If it is a payment for the page, calling it a donation is not true, and a receipt cannot call it a gift. |
| Linked Ministries' 501(c)(3) application is not yet filed (the footer says so). What may a receipt say until the IRS letter comes? | The site never says a gift is deductible until `IRS_LETTER_DATE` is set (`server/words.mjs`). |
| Does asking every ministry for $1,000 count as soliciting under Washington's charitable solicitation rules, and does it change when the Charities Program registration is needed? | The giving door today rests on the Secretary of State registration. |
| If the page is free either way, what words make that clear enough that no ministry feels it must pay? | The founder said the gift is not necessary. A page must never be held back or shown lower for not giving. |
| Is the suggested amount a price under the repository's rule 7 (no prices or packages)? | Rule 7 says a paid tier is the founder's decision and a lawyer's question first. |

## The words on /me

> Your page at linkedm.org is free, and it stays free. If your ministry wants to help keep the network running, the suggested gift is
> $1,000. Any amount helps, and none is needed. A person at Linked Ministries reads every page the same way, whether or not a ministry gives.

Where it is: under the Your public page card on `/me`, once the ministry has a page. Never on a ministry's public page, never in the
review queue, and never in an email.

## What is already true without it

A ministry makes its page from one form, at no cost. A person on the team reads it. The page carries its theme, its pictures, the whole
Bible in its language, and its own Make a donation button to its own Zeffy page as soon as the page is read.

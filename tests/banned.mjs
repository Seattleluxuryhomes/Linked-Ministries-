/* tests/banned.mjs — the things no page of this site may carry, in one place, read by the unit test and the API test.
   Founder, 2026-10-18: no CDN, no tracking, no AI, no money, nothing about taxes, no price, no "compliance" talk, no LinkedIn. */

import { NONPROFIT_LINE } from "../server/words.mjs";

/* the words a person reads: tags and scripts and styles are taken off first */
export function visibleText(html) {
  return String(html).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

export const READ = [
  [/\$/, "a dollar sign (no prices, no money)"],
  [/\bAI\b/, "the letters AI"],
  [/\bA\.I\.\b/, "A.I."],
  [/artificial intelligence|machine learning|chatbot|\bgpt\b|language model/i, "a word about artificial intelligence"],
  [/tax[- ]?deductib|deductib|tax[- ]exempt|tax receipt|\btax(es)?\b/i, "a word about taxes or deductions"],
  [/compliance (score|gauge|audit)|tax audit/i, "a compliance score"],
  [/linkedin/i, "LinkedIn"],
  /* founder, 2026-10-18: a person reads plain words, never the team's working names (the database flags keep them) */
  [/\b(stewards?|treasur(?:y|ers?))\b/i, "the old working names for the team (say: the Linked Ministries team, Review, the money team, Money)"],
  [/\bpricing\b|\bpackages?\b|\bstarter\b|\benterprise\b|\bsubscribe\b|\bper month\b|\bper year\b|\bbuy now\b|\bcheckout\b/i, "a price or a package"],
  [/builder\s?buy\s?box|\bloxo\b|\bbidvoice\b|cross universal/i, "a name that stays behind the front"],
  /* founder, 2026-10-30 ("it should say make a donation"): the button that takes a gift is named Make a donation, and it sits in the top bar of
     every page while the giving door is open, so "donate" and "donation" are no longer banned words; a processor's name still is */
  [/\b(tithe|tithing|paypal|venmo|zelle|cash app)\b/i, "a way to give money"],
  /* founder, 2026-10-18: nothing names another company or product, and nothing is set beside one */
  [/\b(facebook|instagram|tiktok|craigslist|nextdoor|gofundme|eventbrite|mailchimp|whatsapp|slack|zoom|google|indeed|reddit|yelp|amazon|twitter|youtube)\b/i, "another company's name"],
  [/\b(better than|unlike|compared (to|with)|the only (board|network|place|site)|the best|number one|#1|world'?s (first|largest|best))\b/i, "a comparison or a boast"],
  /* nothing says the corporation has a status it does not have yet, or that a gift is anything but a gift */
  [/\b(501\(c\)\(3\)|501c3|nonprofit status|tax-exempt|charitable (status|organization))\b/i, "a claim of nonprofit status (only the footer's own line may say the application is not filed)"],
];

/* the source of a page, and of its script and style files */
export const SOURCE = [
  [/\bcdn\b|cdnjs|jsdelivr|unpkg|googleapis|gstatic|tailwindcss|fontawesome|cloudflare|googletagmanager|google-analytics|gtag\(|analytics|plausible|segment\.com|hotjar|facebook\.net|doubleclick|sentry\.io/i, "a third-party host or a tracker"],
  [/<script(?![^>]*\bsrc=)[^>]*>/i, "an inline script"],
  [/\son[a-z]+\s*=/i, "an event attribute"],
  [/\sstyle\s*=/i, "a style attribute"],
  [/<link[^>]+href="https?:\/\//i, "a stylesheet or icon from another host"],
  [/<script[^>]+src="https?:\/\//i, "a script from another host"],
  [/<(img|iframe|source|video|audio)[^>]+src="https?:\/\//i, "a picture or frame from another host"],
  [/\bred\b|#(?:f00|ff0000|dc2626|ef4444|b91c1c|991b1b)/i, "red"],
];

/** every banned thing found in one page's HTML (the words it reads and its source), as a list of short sentences */
/* founder, 2026-10-18: Linked Ministries takes gifts and makes grants. On a page about money (the giving pages, the front, a ministry's Give card, the
   treasury) a dollar sign, a word about giving and the true statement about the application are allowed. What stays banned everywhere, with no exception
   until the IRS letter is dated (IRS_LETTER_DATE in server/words.mjs): "tax-deductible" and "write-off". */
const MONEY_OK = new Set(["a dollar sign (no prices, no money)", "a word about taxes or deductions", "a way to give money", "a claim of nonprofit status (only the footer's own line may say the application is not filed)"]);
export const NEVER = [[/tax[- ]?deductible|write[- ]?offs?\b|tax[- ]exempt|tax receipt/i, "tax-deductible or write-off (only the IRS's own sentence, and only once IRS_LETTER_DATE is set)"]];
export function checkPage(html, { money = false, irsLetter = false } = {}) {
  const out = [], text = visibleText(html).split(NONPROFIT_LINE).join(" ");   /* the founder's one line about the corporation is the only place that may name the application */
  for (const [re, why] of READ) if (!(money && MONEY_OK.has(why)) && re.test(text)) out.push("reads " + why + ": " + (text.match(re) || [""])[0]);
  if (!irsLetter) for (const [re, why] of NEVER) if (re.test(text)) out.push("reads " + why + ": " + (text.match(re) || [""])[0]);
  for (const [re, why] of SOURCE) { const body = String(html).replace(/<!--[\s\S]*?-->/g, ""); if (re.test(body)) out.push("carries " + why); }
  return out;
}

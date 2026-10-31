/* pages.mjs — the pages a person reads, built on the server. The public pages (the front, the board, one post, the terms and the
   privacy page) are whole HTML with the posts already in them, so they read without a script and a search engine sees them. The
   signed-in pages (join, me, review, money) are a shell and a script. Every word a person typed goes in through e(), which escapes it:
   text is never markup. No inline script, no style attribute, nothing from anyone else's server (every face is in /fonts, every
   picture is drawn here as inline SVG). */
import { verse } from "./scripture.mjs";
import { PRODUCT, CATEGORIES, KIND, KINDS, STATES, categoryLabel, dateWords, CRISIS, NO_MONEY, STAY_SAFE, WORDS, money, methodLabel, receiptCode, GRANT_STATUS } from "../public/js/pure.js";
import { NONPROFIT_LINE, FLAGS, statusLine, deductibleAnswer, FOUNDER } from "./words.mjs";
import { BOARD } from "./board-members.mjs";
import { TERMS, PRIVACY, DRAFT_LINE, LAST_CHANGED } from "./legal.mjs";

const AMP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const e = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => AMP[c]);

/* Linked Ministries' mark: two rings of a chain, one over and one under the other, in gold on ink. Drawn inline (one small file's
   worth), also the favicon (public/img/icon.svg) and the share picture. Two small arcs, cut into ink, make the weave. */
const ARC_TOP = "M21.81 18.42A9.5 9.5 0 0 1 26.56 14.97", ARC_BOTTOM = "M26.19 29.58A9.5 9.5 0 0 1 21.44 33.04";
export const MARK = `<svg class="mark" viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect width="48" height="48" rx="11" fill="#1b2430"/><g stroke="#d97706" stroke-width="3.6"><circle cx="18.5" cy="24" r="9.5"/><circle cx="29.5" cy="24" r="9.5"/></g><g stroke-width="7.5" stroke="#1b2430"><path d="${ARC_TOP}"/><path d="${ARC_BOTTOM}"/></g><g stroke-width="3.6" stroke="#d97706"><path d="${ARC_TOP}"/><path d="${ARC_BOTTOM}"/></g></svg>`;

const ICO_SAFE = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>`;
const ICO_FREE = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/></svg>`;
const ICO_PERSON = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/></svg>`;
const ICO_NOMONEY = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>`;

/* the front's picture: two rings and four posts, as lines. No words and no numbers, so it claims nothing. */
export const ART = `<svg class="art" viewBox="0 0 480 400" fill="none" aria-hidden="true"><g stroke="#d97706" stroke-width="2" stroke-dasharray="2 7" stroke-linecap="round"><path d="M132 114L196 172"/><path d="M348 114L284 172"/><path d="M132 286L196 228"/><path d="M348 286L284 228"/></g><g stroke="#1b2430" stroke-width="2" fill="#ffffff"><rect x="24" y="30" width="150" height="86" rx="14"/><rect x="306" y="30" width="150" height="86" rx="14"/><rect x="24" y="284" width="150" height="86" rx="14"/><rect x="306" y="284" width="150" height="86" rx="14"/></g><g stroke="#d97706" stroke-width="2"><rect x="38" y="44" width="40" height="16" rx="8"/><rect x="320" y="44" width="40" height="16" rx="8"/><rect x="38" y="298" width="40" height="16" rx="8"/><rect x="320" y="298" width="40" height="16" rx="8"/></g><g stroke="#c9bfae" stroke-width="6" stroke-linecap="round"><path d="M38 80h96M38 96h62M320 80h96M320 96h62M38 334h96M38 350h62M320 334h96M320 350h62"/></g><circle cx="212" cy="200" r="44" stroke="#1b2430" stroke-width="9"/><circle cx="268" cy="200" r="44" stroke="#d97706" stroke-width="9"/><path d="M250.1 222A44 44 0 0 1 225.6 241.8" stroke="#ffffff" stroke-width="17"/><path d="M250.1 222A44 44 0 0 1 225.6 241.8" stroke="#1b2430" stroke-width="9"/></svg>`;

/* a quiet picture for a board with nothing on it yet: an empty tray with the two rings above it */
export const ART_EMPTY = `<svg class="art-empty" viewBox="0 0 160 110" fill="none" aria-hidden="true"><path d="M20 70h34l6 12h40l6-12h34v28a8 8 0 0 1-8 8H28a8 8 0 0 1-8-8z" stroke="#1b2430" stroke-width="2.5" stroke-linejoin="round" fill="#ffffff"/><circle cx="68" cy="38" r="22" stroke="#1b2430" stroke-width="5"/><circle cx="92" cy="38" r="22" stroke="#d97706" stroke-width="5"/><path d="M83 57A22 22 0 0 1 72 55" stroke="#ffffff" stroke-width="9"/><path d="M82.5 56.9A22 22 0 0 1 72.7 55.2" stroke="#1b2430" stroke-width="5"/></svg>`;

/* the one name for the button that takes a gift (founder, 2026-10-30: "it should say make a donation"). It shows in the top bar of
   every page, in the footer, on the giving page, the give page and the front, only while the giving door is open. */
export const DONATE = "Make a donation";

export function layout({ title, description, body, script, nav = "", base = "", path = "", noindex = false, notice = "", ogTitle = "", image = "", imageAlt = "", ogType = "website", donate = false }) {
  const t = title ? `${title} · ${PRODUCT.name}` : `${PRODUCT.name}: ministries helping ministries`;
  const desc = description || "A free network where ministries post what they need or what they can give, and other ministries answer.";
  const abs = (p) => (base ? base.replace(/\/+$/, "") + p : p);
  const share = ogTitle || title || `${PRODUCT.name}: ministries helping ministries`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="theme-color" content="#fbf8f3">
<title>${e(t)}</title>
<meta name="description" content="${e(desc)}">
${noindex ? '<meta name="robots" content="noindex,nofollow">\n' : ""}<meta property="og:type" content="${e(ogType)}">
<meta property="og:site_name" content="${e(PRODUCT.name)}">
<meta property="og:title" content="${e(share)}">
<meta property="og:description" content="${e(desc)}">
${base ? `<meta property="og:url" content="${e(abs(path || "/"))}">\n` : ""}<meta property="og:image" content="${e(abs(image || "/img/share.png"))}">
${image ? "" : `<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
`}<meta property="og:image:alt" content="${e(imageAlt || "The Linked Ministries mark, two linked rings, and the words: ministries helping ministries.")}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${e(share)}">
<meta name="twitter:description" content="${e(desc)}">
<meta name="twitter:image" content="${e(abs(image || "/img/share.png"))}">
<link rel="icon" href="/img/icon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Linked M">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="stylesheet" href="/css/lm.css">
</head>
<body>
<a class="skip" href="#main">Skip to the page</a>
<header class="top"><div class="wrap wide">
<a class="lock" href="/" aria-label="${e(PRODUCT.name)}, home">${MARK}<span class="words"><span class="name">${e(PRODUCT.name)}</span><span class="small">${e(PRODUCT.domain)}</span></span></a>
<nav class="nav" aria-label="Main"><a href="/board"${nav === "board" ? ' aria-current="page"' : ""}>Board</a><a href="/giving"${nav === "giving" ? ' aria-current="page"' : ""}>Giving</a><a href="/me"${nav === "me" ? ' aria-current="page"' : ""}>My ministry</a>${donate ? `<a class="btn small donate" href="/give"${nav === "give" ? ' aria-current="page"' : ""}>${e(DONATE)}</a>` : ""}<a class="btn small${donate ? " ghost" : ""}" href="/join"${nav === "join" ? ' aria-current="page"' : ""}>Join the network</a></nav>
</div></header>
<main id="main" tabindex="-1">
${body}
</main>
<footer class="foot"><div class="wrap wide">
<div class="foot-grid">
<div class="foot-words">
${verse("jas_1_27","small")}
<p class="line">${e(NONPROFIT_LINE)}</p>
<p>${e(CRISIS)}</p>
</div>
<p class="links"><a href="/board">Board</a> <a href="/giving">Giving</a> ${donate ? `<a href="/give">${e(DONATE)}</a> ` : ""}<a href="/join">Join the network</a> <a href="/terms">Terms</a> <a href="/privacy">Privacy</a> <a href="${e(PRODUCT.da.url)}" rel="noopener">${e(PRODUCT.da.name)}</a></p>
</div>
</div></footer>
<script type="module" src="/js/pwa.js"></script>
<script type="module" src="/js/orb.js"></script>
${script ? `<script type="module" src="${e(script)}"></script>` : ""}
</body>
</html>
`;
}

/* ---- one post, as a card ---------------------------------------------------------------------------------------------------- */
export function postCard(p, { button = true, link = true, heading = "h3" } = {}) {
  const k = KIND[p.kind] || KIND.ask;
  const place = p.city !== p.ministry_city || p.state !== p.ministry_state ? `<p class="place"><span class="label">Where</span> ${e(p.city)}, ${e(p.state)}</p>` : "";
  const report = `<a class="reportlink" href="/board/${e(p.id)}#report" data-report="${e(p.id)}">${e(WORDS.report)}</a>`;
  return `<article class="post card lift" id="post-${e(p.id)}" data-post="${e(p.id)}" data-kind="${e(p.kind)}">
<div class="meta"><span class="tag ${e(p.kind)}">${e(k.label)}</span><span class="cat">${e(categoryLabel(p.category))}</span></div>
<${heading} class="post-title">${link ? `<a href="/board/${e(p.id)}">${e(p.title)}</a>` : e(p.title)}</${heading}>
<p class="who">${p.page_slug ? `<a href="/m/${e(p.page_slug)}">${e(p.ministry)}</a>` : e(p.ministry)} <span class="dot" aria-hidden="true">·</span> ${e(p.ministry_city)}, ${e(p.ministry_state)}</p>
${place}
<p class="words">${e(p.body)}</p>
<p class="when">Posted ${e(dateWords(p.posted_at))} <span class="dot" aria-hidden="true">·</span> Open until ${e(dateWords(p.open_until))}</p>
<div class="foot-of-card">
${button ? `<div class="actions"><a class="btn" href="/board/${e(p.id)}#answer" data-answer="${e(p.id)}" data-kind="${e(p.kind)}" data-ministry="${e(p.ministry)}">${e(k.button)}</a>${report}</div>
<div class="answer-slot" id="slot-${e(p.id)}"></div>
<div class="report-slot" id="report-${e(p.id)}"></div>` : `<div class="actions">${report}</div>`}
<p class="safe">${ICO_SAFE}<span>${e(STAY_SAFE)}</span></p>
</div>
</article>`;
}

/* ---- an empty board, made to look chosen ------------------------------------------------------------------------------------------ */
function emptyBoard({ filtered, compact = false }) {
  if (filtered) return `<div class="empty card"><h2>${e(WORDS.emptyFiltered)}</h2><p>${e(WORDS.boardEmpty)}</p><p><a class="btn ghost" href="/board">${e(WORDS.filterClear)}</a></p></div>`;
  return `<div class="empty card${compact ? " compact" : ""}">${ART_EMPTY}<h2>${e(WORDS.emptyTitle)}</h2><p>${e(WORDS.boardEmptyNone)}</p><p class="quiet">${e(WORDS.emptyMore)}</p><p class="row center"><a class="btn" href="/join">Join the network</a>${compact ? "" : `<a class="btn ghost" href="/">What is this?</a>`}</p></div>`;
}

/* ---- the front ------------------------------------------------------------------------------------------------------------------ */
/* the two pictures in the hero are screenshots of this site, taken by tools/make-front-shots.mjs from the running app (a sample ministry) */
export const FRONT_IMG = { ministry: { src: "/img/front-ministry.png", w: 780, h: 1400 }, post: { src: "/img/front-post.png", w: 716, h: 944 } };

export function frontPage({ latest, base = "", notice = "", giving = { open: false }, board = BOARD, flags = FLAGS }) {
  const cards = latest.length ? latest.map((p) => postCard(p, { button: false })).join("\n") : emptyBoard({ filtered: false, compact: true });
  const f = FRONT_IMG;
  const people = (board || []).length ? `<section class="band alt" id="directors"><div class="wrap wide"><h2>Our board of directors</h2><p class="lead">The board votes on every grant. The vote is written down, by name.</p><ul class="people-list">${board.map((m) => `<li class="card"><strong>${e(m.name)}</strong>${m.role ? `<span class="quiet">${e(m.role)}</span>` : ""}</li>`).join("")}</ul></div></section>` : "";
  const faq = [
    ["Is it free?", ["Yes. Joining, posting and answering are free. Nothing is sold here."]],
    ["Who reads my post?", ["A person on the Linked Ministries team reads it. They are real people. Nothing goes up until one of them has read it."]],
    ["Does money change hands?", ["On the board, no. The board moves no money between ministries.", "Linked Ministries may take gifts. Its board may use them to fund an ask. Every grant is shown on the giving page."]],
    ["Can my ministry get a page?", ["Yes. After a person on the Linked Ministries team reads your ministry, you fill in one form. You get a page at linkedm.org with your own address. A person on the team reads the page before it goes up."]],
    ["How do gifts work?", ["A person on the money team writes each gift down and gives it a numbered receipt. Two people on the money team handle each grant, and the board votes by name.", "Gifts online open after the state registration is filed. Until then, no gift is taken here."]],
    ["Is my gift deductible?", deductibleAnswer(flags)],
  ];
  const body = `<section class="hero"><div class="wrap wide hero-grid">
<div class="hero-words">
<p class="eyebrow rise">A free network</p>
<h1 class="rise">Ministries helping ministries.</h1>
<p class="lead rise">Linked Ministries is a place where a ministry says what it needs, or what it can give. Another ministry answers. A person at Linked Ministries reads every post before it goes up.</p>
${verse("gal_6_2","rise")}
<p class="cta rise">${giving && giving.open ? `<a class="btn donate" href="/give">${e(DONATE)}</a> ` : ""}<a class="btn${giving && giving.open ? " ghost" : ""}" href="/board">See the board</a> <a class="btn ghost" href="/join">Join the network</a></p>
<ul class="chips rise" aria-label="What to know">
<li>${ICO_FREE}<span>Free to use</span></li>
<li>${ICO_PERSON}<span>Read by a person</span></li>
<li>${ICO_NOMONEY}<span>No money on the board</span></li>
</ul>
</div>
<div class="hero-art phones rise">
<figure class="phone"><div class="frame"><img src="${f.ministry.src}" width="${f.ministry.w}" height="${f.ministry.h}" alt="A ministry's own page, on a phone: its name, one line about it, and a picture of tables set for a meal." decoding="async"></div><figcaption>A ministry's own page</figcaption></figure>
<figure class="phone"><div class="frame"><img src="${f.post.src}" width="${f.post.w}" height="${f.post.h}" alt="A post on the board, on a phone: an ask for ten folding tables, with a button to answer it." decoding="async"></div><figcaption>A post on the board</figcaption></figure>
<p class="sample">Screenshots of this site, with a sample ministry.</p>
</div>
</div></section>
<section class="band" id="who"><div class="wrap wide">
<h2>Who we are</h2>
<div class="who-grid"><div><p class="lead">${e(statusLine(flags))}</p><p>It was started by ${e(FOUNDER)}.</p></div>
<div class="card"><p class="label">Its three works</p><ul class="plain"><li><strong>The network.</strong> A free board where ministries ask and give.</li><li><strong>${e(PRODUCT.da.name)}.</strong> A free 24-week program for faith and recovery.</li><li><strong>Housing.</strong> Sober-living housing for people in recovery. It is planned, and it is not open yet.</li></ul></div></div>
${verse("prov_19_17")}
</div></section>
<section class="band alt"><div class="wrap wide">
<h2>How it works</h2>
${verse("acts_2_44_45")}
<ol class="three steps">
<li class="card lift"><span class="num" aria-hidden="true">1</span><p class="label">Ask or give</p><p>Post what you need, like food, a van, or teachers. Or post what you can give, like chairs, beds, or time.</p></li>
<li class="card lift"><span class="num" aria-hidden="true">2</span><p class="label">A person reads it</p><p>A person at Linked Ministries reads each new ministry and each new post. Then it goes on the board.</p></li>
<li class="card lift"><span class="num" aria-hidden="true">3</span><p class="label">Another ministry answers</p><p>One button sends one email to the ministry that posted. You work out the rest together.</p></li>
</ol>
<p class="note">${e(NO_MONEY)}</p>
</div></section>
<section class="band"><div class="wrap wide">
<h2>What we run</h2>
${verse("ps_68_5_6")}
<div class="three">
<div class="card lift"><p class="label">Now</p><h3>${e(PRODUCT.da.name)}</h3><p>A free, 24-week program of discipleship and recovery.</p><p><a href="${e(PRODUCT.da.url)}" rel="noopener">${e(PRODUCT.da.url.replace("https://", ""))}</a></p></div>
<div class="card lift"><p class="label">Now</p><h3>Help getting online</h3><p>A ministry can make its own page at linkedm.org from one form. It is free. A person at Linked Ministries reads it before it goes up. We also help with an email address and a way to take donations. A ministry gives what it can.</p><p><a href="/take-donations">How your ministry can take donations</a></p></div>
<div class="card lift"><p class="label">Planned</p><h3>Sober-living housing</h3><p>We plan to open housing for people in recovery. It is not open yet, and nothing is taking applications.</p>${verse("isa_58_7","tight")}</div>
</div>
</div></section>
<section class="band alt"><div class="wrap wide">
<h2>Giving</h2>
${verse("cor2_9_7")}
<div class="three">
<div class="card"><p class="label">How it works</p><h3>Gifts come in. Grants go out.</h3><p>People give to Linked Ministries. The board picks where the money goes. It can go to a ministry's ask. It can go to housing for people in recovery. It can go to the free program. The board votes. The vote is written down.</p></div>
<div class="card"><p class="label">What you can see</p><h3>Every grant, published.</h3><p>Who got it, how much, what for, and the day the board said yes. Every gift gets a numbered receipt. No one person can move money alone.</p></div>
<div class="card"><p class="label">Today</p>${giving && giving.open ? `<h3>Gifts online are open.</h3><p>The board says the registration is filed. Gifts online go through Zeffy, and Zeffy emails the receipt. Every grant is shown on the giving page.</p><p><a class="btn donate" href="/give">${e(DONATE)}</a></p>` : `<h3>Not taking gifts online yet.</h3><p>Linked Ministries is ${flags.FORMED ? "a Washington nonprofit" : "forming as a Washington nonprofit"}. Online giving opens after the state registration is filed. <a href="/giving">We will say there when it does.</a></p>`}<p><a class="btn ghost small" href="/giving">Where the money went</a></p></div>
</div>
</div></section>
${people}
<section class="band"><div class="wrap wide">
<div class="row between head"><h2>Latest on the board</h2><a href="/board">See the whole board</a></div>
${verse("matt_25_40")}
<div class="posts">
${cards}
</div>
${latest.length ? `<p class="note">${e("To answer a post, open the board.")}</p>` : ""}
</div></section>
<section class="band alt" id="questions"><div class="wrap wide">
<h2>Questions</h2>
<div class="faq">${faq.map(([q, a]) => `<div class="card"><h3>${e(q)}</h3>${a.map((t) => `<p>${e(t)}</p>`).join("")}</div>`).join("\n")}</div>
</div></section>
${notice ? `<section class="band" id="contact"><div class="wrap wide"><div class="card cta-card"><div><h2>Contact</h2><p>Write to us. A person at Linked Ministries reads every message.</p></div><p class="row"><a class="btn ghost" href="mailto:${e(notice)}">${e(notice)}</a></p></div></div></section>` : ""}
<section class="band${notice ? " alt" : ""}"><div class="wrap wide">
<div class="card cta-card"><div><h2>Join the network</h2><p>It is free. Sign in with your email, tell us about your ministry, and post your first ask or give.</p></div><p class="row"><a class="btn" href="/join">Join the network</a><a class="btn ghost" href="/board">See the board</a></p></div>
</div></section>`;
  return layout({ body, description: "Linked Ministries is a free network where ministries post what they need or what they can give, and other ministries answer.", nav: "", base, path: "/", notice, donate: !!(giving && giving.open) });
}

/* ---- the board ------------------------------------------------------------------------------------------------------------------ */
function options(list, value, first) {
  return `<option value="">${e(first)}</option>` + list.map(([v, l]) => `<option value="${e(v)}"${v === value ? " selected" : ""}>${e(l)}</option>`).join("");
}
export function pageHref(f, page) {
  const u = new URLSearchParams();
  for (const k of ["kind", "category", "state", "city", "q"]) if (f[k]) u.set(k, f[k]);
  if (page > 1) u.set("page", String(page));
  const s = u.toString();
  return "/board" + (s ? "?" + s : "");
}
export function boardPage({ result, base = "", notice = "" }) {
  const { posts, total, page, pages, filters: f } = result;
  const filtered = !!(f.kind || f.category || f.state || f.city || f.q);
  const list = posts.length ? posts.map((p) => postCard(p)).join("\n") : emptyBoard({ filtered });
  const pager = pages > 1 ? `<nav class="pager" aria-label="More posts">${page > 1 ? `<a class="btn ghost" href="${e(pageHref(f, page - 1))}">Newer</a>` : ""}<span class="muted">Page ${page} of ${pages}</span>${page < pages ? `<a class="btn ghost" href="${e(pageHref(f, page + 1))}">Older</a>` : ""}</nav>` : "";
  const body = `<div class="wrap wide">
<div class="pagehead"><h1 class="rise">The board</h1>
<p class="lead rise">Every post here was read by a person at Linked Ministries. Pick one and answer it.</p></div>
<p class="note">${e(NO_MONEY)}</p>
<form class="filters card" method="get" action="/board" role="search">
<div class="field search"><label for="f-q">${e(WORDS.filterSearch)}</label><div class="searchrow"><input id="f-q" name="q" type="search" maxlength="120" value="${e(f.q)}" autocomplete="off"><button class="btn" type="submit">${e(WORDS.filterGo)}</button></div></div>
<div class="grid">
<div class="field"><label for="f-kind">${e(WORDS.filterKind)}</label><select id="f-kind" name="kind">${options(KINDS.map((k) => [k, KIND[k].plural]), f.kind, "Asks and gives")}</select></div>
<div class="field"><label for="f-cat">${e(WORDS.filterCategory)}</label><select id="f-cat" name="category">${options(CATEGORIES, f.category, "Anything")}</select></div>
<div class="field"><label for="f-state">${e(WORDS.filterState)}</label><select id="f-state" name="state">${options(STATES.map(([c, n]) => [c, `${n} (${c})`]), f.state, "Any state")}</select></div>
<div class="field"><label for="f-city">${e(WORDS.filterCity)}</label><input id="f-city" name="city" type="text" maxlength="80" value="${e(f.city)}" autocomplete="off"></div>
</div>
${filtered ? `<p class="row"><a class="btn ghost small" href="/board">${e(WORDS.filterClear)}</a></p>` : ""}
</form>
<p class="count" aria-live="polite">${total === 1 ? "1 post" : `${total} posts`}${filtered ? " match" : ""}</p>
<div class="posts" id="posts">
${list}
</div>
${pager}
</div>`;
  return layout({ title: "The board", body, script: "/js/board.js", nav: "board", base, path: "/board", description: "Asks and gives from ministries: housing, food, clothing, rides, volunteers, equipment, furniture, teaching and prayer." });
}

export function postPage({ post, base = "", notice = "" }) {
  const body = `<div class="wrap">
<p class="back"><a href="/board">Back to the board</a></p>
${postCard(post, { link: false, heading: "h1" })}
</div>`;
  return layout({ title: post.title, body, script: "/js/board.js", nav: "board", base, path: "/board/" + post.id, ogTitle: `${post.title} · ${post.ministry}`, description: `${KIND[post.kind].label} from ${post.ministry}: ${post.title}` });
}

export function missingPostPage({ base = "" } = {}) {
  return layout({ title: "Not on the board", nav: "board", base, noindex: true, body: `<div class="wrap"><div class="empty card">${ART_EMPTY}<h1>That post is not on the board</h1><p>It may be closed, or past its day. Look at the board for what is open now.</p><p class="row center"><a class="btn" href="/board">See the board</a></p></div></div>` });
}

/* ---- the signed-in pages: a shell, and a script that builds the rest from the API ------------------------------------------------ */
export function shellPage({ title, script, nav, lead, base = "", width = "narrow" }) {
  const body = `<div class="wrap ${e(width)}">
<div id="app" class="stack" aria-live="polite">
<h1>${e(title)}</h1>
${lead ? `<p class="lead">${e(lead)}</p>` : ""}
<noscript><p class="note">${e(WORDS.noJs)}</p></noscript>
</div>
</div>`;
  return layout({ title, body, script, nav, base, noindex: true });
}

export function notFoundPage({ base = "" } = {}) {
  return layout({ title: "Not found", base, noindex: true, body: `<div class="wrap"><div class="empty card">${ART_EMPTY}<h1>That page was not found</h1><p>Check the address, or start again from the first page.</p><p class="row center"><a class="btn" href="/">Go to the first page</a><a class="btn ghost" href="/board">See the board</a></p></div></div>` });
}

/* ---- the terms and the privacy page: drafts a lawyer has not read, and they say so at the top ------------------------------------- */
function legalPage(doc, { notice = "", base = "", path }) {
  const to = notice ? `<a href="mailto:${e(notice)}">${e(notice)}</a>` : e("the address on any email we send you");
  const fill = (s) => e(s).replace(/\{notice\}/g, to);
  const sections = doc.sections.map(([h, items]) => `<section><h2>${e(h)}</h2>\n${items.map((it) => Array.isArray(it) ? `<ul>${it.slice(1).map((li) => `<li>${fill(li)}</li>`).join("")}</ul>` : `<p>${fill(it)}</p>`).join("\n")}\n</section>`).join("\n");
  const body = `<div class="wrap prose">
<p class="draft">${e(DRAFT_LINE)}</p>
<h1>${e(doc.title)}</h1>
<p class="lead">${e(doc.lead)}</p>
<p class="quiet">Last changed ${e(dateWords(LAST_CHANGED))}</p>
${sections}
<p class="row"><a class="btn ghost" href="/">Back to the first page</a></p>
</div>`;
  return layout({ title: doc.title, body, base, path, description: doc.lead });
}
export const termsPage = (o = {}) => legalPage(TERMS, { ...o, path: "/terms" });
export const privacyPage = (o = {}) => legalPage(PRIVACY, { ...o, path: "/privacy" });

/* ---- a ministry's own page, at /m/<slug>: built whole on the server from the copy a steward read ------------------------------------------- */
const telHref = (p) => "tel:" + String(p).replace(/[^0-9+]/g, "");
export function ministryPage({ page, base = "", notice = "", giving = { open: false }, preview = false }) {
  const c = page.live || {}, name = page.name, place = `${page.city}, ${page.state}`;
  const photos = (c.photos || []).map((ph) => `<figure class="mphoto"><img src="/photos/${e(ph.id)}" alt="${e(ph.alt || "A picture from " + name)}" width="800" height="600" loading="lazy" decoding="async"></figure>`).join("");
  const meets = (c.meets || []).length ? `<section class="card mcard" aria-labelledby="m-meet"><h2 id="m-meet">When and where we meet</h2><ul class="meets">${c.meets.map((r) => `<li><strong>${e(r.day)}</strong><span class="when-at">${e(r.time)}</span><span class="where-at">${e(r.place)}</span></li>`).join("")}</ul></section>` : "";
  const reach = [c.email ? `<dt>Email</dt><dd><a href="mailto:${e(c.email)}">${e(c.email)}</a></dd>` : "", c.phone ? `<dt>Phone</dt><dd><a href="${e(telHref(c.phone))}">${e(c.phone)}</a></dd>` : "", c.website ? `<dt>Website</dt><dd><a href="${e(c.website)}" rel="noopener nofollow">${e(c.website.replace(/^https?:\/\//, ""))}</a></dd>` : ""].join("");
  const reachCard = reach ? `<section class="card mcard" aria-labelledby="m-reach"><h2 id="m-reach">How to reach us</h2><dl class="kv">${reach}</dl></section>` : "";
  const canGive = !!(giving && giving.open && c.give_url);
  const giveCard = canGive ? `<section class="card mcard give" aria-labelledby="m-give"><h2 id="m-give">${e(DONATE)} to ${e(name)}</h2><p>This link is ${e(name)}'s own. It goes to their own donation page. Linked Ministries does not collect or see a donation made there.</p><p><a class="btn donate" href="${e(c.give_url)}" rel="noopener nofollow">${e(DONATE)} to ${e(name)}</a></p></section>` : "";
  const read = preview ? `<p class="note">This is how your page will look. Only your ministry can see this. It is not public until a person at Linked Ministries reads it.</p>`
    : `<p class="quiet mread">A person at Linked Ministries read this page on ${e(dateWords(page.live_at))}. Linked Ministries does not check or vouch for any ministry. ${notice ? `Something wrong? Write to <a href="mailto:${e(notice)}">${e(notice)}</a>.` : ""}</p>`;
  const body = `<article class="mpage">
<header class="mhero"><div class="wrap wide">
${preview ? read : ""}<p class="eyebrow">A ministry on Linked Ministries</p>
<h1>${e(name)}</h1>
<p class="lead">${e(c.tagline)}</p>
<p class="place">${e(place)}</p>
<p class="cta">${canGive ? `<a class="btn donate" href="#m-give">${e(DONATE)} to ${e(name)}</a>` : ""}${c.website ? `<a class="btn ghost" href="${e(c.website)}" rel="noopener nofollow">Visit our website</a>` : ""}</p>
</div></header>
<div class="wrap wide mgrid">
${photos ? `<div class="mphotos${(c.photos || []).length === 1 ? " one" : ""}">${photos}</div>` : ""}
<div class="mmain"><section class="card mcard" aria-labelledby="m-about"><h2 id="m-about">About us</h2><p class="words">${e(c.about)}</p></section></div>
<div class="mside">${meets}${reachCard}${giveCard}</div>
<div class="mfull">${c.verse ? verse(c.verse) : ""}</div>
<div class="mfull">${preview ? "" : read}
<p class="row mlinks"><a class="btn ghost" href="/board">See the board</a><a class="btn ghost" href="/giving">Where the money went</a></p></div>
</div>
</article>`;
  const first = (c.photos || [])[0];
  const desc = `${c.tagline} ${place}.`.slice(0, 200);
  return layout({ title: name, body, base, path: "/m/" + page.slug, noindex: preview, ogType: "profile", donate: !!(giving && giving.open), ogTitle: `${name} · ${place}`, description: desc,
    image: first ? "/photos/" + first.id : "", imageAlt: first ? (first.alt || "A picture from " + name) : "", notice });
}

/* ---- giving: where the money went, and the door ---------------------------------------------------------------------------------------------------------- */
const MON = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"], MON_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/* the last twelve months as bars, drawn here from the rows: gifts in (gold) and grants approved (slate). The numbers are in the table under it. */
export function givingChart(months) {
  const W = 600, H = 250, L = 8, B = 34, T = 14, plotH = H - B - T, slot = (W - L * 2) / months.length, bw = Math.min(18, slot / 2 - 2);
  const max = Math.max(0, ...months.map((m) => Math.max(Number(m.gifts_cents), Number(m.grants_cents))));
  const h = (c) => (max ? Math.max(Number(c) > 0 ? 2 : 0, Math.round((Number(c) / max) * plotH)) : 0);
  const bars = months.map((m, i) => {
    const x = L + i * slot + slot / 2, gh = h(m.gifts_cents), rh = h(m.grants_cents), mi = Number(m.month.slice(5)) - 1;
    return `<g><rect x="${(x - bw - 1).toFixed(1)}" y="${T + plotH - gh}" width="${bw.toFixed(1)}" height="${gh}" rx="2" fill="#d97706"/><rect x="${(x + 1).toFixed(1)}" y="${T + plotH - rh}" width="${bw.toFixed(1)}" height="${rh}" rx="2" fill="#566170"/><text x="${x.toFixed(1)}" y="${H - 14}" text-anchor="middle" font-size="15" fill="#464f5c">${MON[mi]}</text>${mi === 0 || i === 0 ? `<text x="${x.toFixed(1)}" y="${H - 1}" text-anchor="middle" font-size="12" fill="#566170">${e(m.month.slice(0, 4))}</text>` : ""}</g>`;
  }).join("");
  const label = `Bar chart of the last twelve months. Gifts in, and grants approved, in dollars. ${max ? "The tallest bar is " + money(max) + "." : "There are none yet."}`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${e(label)}"><title>${e(label)}</title><line x1="${L}" y1="${T + plotH}" x2="${W - L}" y2="${T + plotH}" stroke="#c9bfae" stroke-width="1.5"/>${bars}</svg>`;
}

function monthRows(months) {
  return months.map((m) => `<tr><th scope="row">${e(MON_FULL[Number(m.month.slice(5)) - 1])} ${e(m.month.slice(0, 4))}</th><td class="cash">${e(money(m.gifts_cents))}</td><td class="cash">${e(money(m.grants_cents))}</td></tr>`).join("");
}

export function givingPage({ giving, base = "", notice = "", flags = FLAGS }) {
  const g = giving, closed = !g.door_open, reg = g.registration_number && g.registration_date;
  const doorCard = closed
    ? `<div class="card door closed"><p class="label">Gifts online</p><h2>Not yet.</h2><p>Linked Ministries is not taking gifts online yet.</p><p>${reg ? `Its registration is on file, but the door is not open.` : "Washington wants a charity to register before it asks for gifts. Linked Ministries has not finished that registration. The door opens when it has."}</p>${reg ? "" : `<p class="quiet">There is no Give button until then.</p>`}</div>`
    : `<div class="card door open"><p class="label">Gifts online</p><h2>The door is open.</h2><p>Gifts online go through Zeffy, and Zeffy emails the receipt. A person on the money team writes each gift down here too, so the sums on this page add up. Every grant is voted on by the board and shown on this page.</p><p><a class="btn donate" href="/give">${e(DONATE)}</a></p></div>`;
  const regCard = reg ? `<p class="quiet">Washington state registration ${e(g.registration_number)}, dated ${e(dateWords(g.registration_date))}.</p>` : "";
  const grants = g.grants.length ? g.grants.map((x) => `<article class="card grant"><div class="row between"><h3>${x.page_slug ? `<a href="/m/${e(x.page_slug)}">${e(x.recipient_name)}</a>` : e(x.recipient_name)}</h3><p class="amt">${e(money(x.amount_cents))}</p></div>
<p>${e(x.purpose)}</p>
<p class="when">The board voted yes on ${e(dateWords(x.voted_on))}: ${x.yes} yes${x.abstain ? `, ${x.abstain} abstained` : ""}${x.no ? `, ${x.no} no` : ""}. Record: ${e(x.doc_ref)}.</p>
<p class="status${x.status === "paid" ? " public" : ""}">${x.status === "paid" ? `Paid on ${e(dateWords(x.paid_on))}.` : e(GRANT_STATUS.approved)}</p></article>`).join("\n")
    : `<div class="card empty compact"><h3>No grants yet</h3><p>When the board votes yes on a grant, it is shown here: who got it, how much, what for, and the day of the vote.</p></div>`;
  const body = `<div class="wrap wide">
<div class="pagehead"><p class="eyebrow">Giving</p><h1>Where the money went</h1>
<p class="lead">Every gift is written down. Every grant is voted on by the board and shown here. These numbers are added up from the record, not typed.</p></div>
<div class="giving-top">
${doorCard}
<div class="card"><p class="label">What is true today</p><p>${e(statusLine(flags))}</p>${regCard}<p class="quiet">${g.form990_url ? `<a href="${e(g.form990_url)}" rel="noopener nofollow">Read the Form 990</a>` : "When Linked Ministries files a Form 990, the link is here."}</p></div>
</div>
<section aria-labelledby="g-totals"><h2 id="g-totals">The totals</h2>
<div class="three totals">
<div class="card"><p class="label">Gifts received</p><p class="big">${e(money(g.money_cents))}</p><p class="quiet">${g.money_count} ${g.money_count === 1 ? "gift" : "gifts"}. No donor names are shown.</p></div>
<div class="card"><p class="label">Granted by the board</p><p class="big">${e(money(g.granted_cents))}</p><p class="quiet">${g.granted_count} ${g.granted_count === 1 ? "grant" : "grants"}.</p></div>
<div class="card"><p class="label">Of that, paid</p><p class="big">${e(money(g.paid_cents))}</p><p class="quiet">The rest is approved and waits to be paid.</p></div>
</div>
${g.in_kind_count ? `<p class="note">${g.in_kind_count} ${g.in_kind_count === 1 ? "gift" : "gifts"} of goods or services, worth ${e(money(g.in_kind_cents))}, are not counted as money above.</p>` : ""}
</section>
<section aria-labelledby="g-chart"><h2 id="g-chart">The last twelve months</h2>
<div class="card chartcard">${givingChart(g.months)}<p class="legend"><svg class="sw" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="3" fill="#d97706"/></svg> Gifts in <svg class="sw" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="3" fill="#566170"/></svg> Grants approved</p>
<table class="months"><caption class="sr">Gifts in and grants approved, by month</caption><thead><tr><th scope="col">Month</th><th scope="col" class="cash">Gifts in</th><th scope="col" class="cash">Grants approved</th></tr></thead><tbody>${monthRows(g.months)}</tbody></table></div>
</section>
${verse("cor2_9_7")}
<section aria-labelledby="g-grants"><h2 id="g-grants">Every grant</h2>
<div class="grants">${grants}</div></section>
<section aria-labelledby="g-safe"><div class="card"><h2 id="g-safe">How this is kept safe</h2><ul class="plain">
<li>A gift is written down once, with the next receipt number. It is never changed. A mistake is fixed by a new row.</li>
<li>One person on the money team proposes a grant. A different person on the team approves it, after the board votes, by name.</li>
<li>A grant is never more than the gifts that came in.</li>
<li>The board moves no money between ministries. Linked Ministries may fund an ask from its gifts when its board says yes.</li></ul>
${notice ? `<p>Questions? Write to <a href="mailto:${e(notice)}">${e(notice)}</a>.</p>` : ""}</div></section>
</div>`;
  return layout({ title: "Where the money went", body, nav: "giving", base, path: "/giving", donate: !closed, description: "Every gift Linked Ministries receives is written down, and every grant is voted on and shown here, with the amounts added up from the record." });
}

/* the Give button's page. Gifts online go through Zeffy (founder, 2026-10-18). With the door open and a Zeffy form set (ZEFFY_GIVE_URL) it
   sends a person there and says what happens; with no form set it says so, and offers nothing that would only look like it works. */
export function givePage({ open, base = "", notice = "", zeffy = "" }) {
  const ready = open && zeffy;
  const body = `<div class="wrap prose"><p class="back"><a href="/giving">Back to where the money went</a></p>
<h1>${ready ? DONATE + " to Linked Ministries" : open ? "Giving online is not connected yet" : "Not taking gifts online yet"}</h1>
<div class="card">${ready ? `<p>Gifts online go through Zeffy. Zeffy takes the gift and emails your receipt. Keep that email.</p><p>Zeffy may ask you for a tip for Zeffy itself. It is up to you. You can set it to $0. The tip is not part of the gift.</p><p>A person on the money team writes each gift down, and every grant is shown on <a href="/giving">the giving page</a>.</p><p class="row"><a class="btn donate big" href="${e(zeffy)}" rel="noopener">${e(DONATE)}</a></p><p class="quiet">The button opens Zeffy's page for Linked Ministries.</p>`
    : open ? `<p>The payment service is not connected yet. Nothing can be sent or saved on this page, so there is no form here.</p><p>The board will say on <a href="/giving">the giving page</a> when it is.</p>` : `<p>Linked Ministries is not taking gifts online yet. The giving page says why.</p>`}
${notice ? `<p>To ask about giving another way, <a href="mailto:${e(notice)}">write to us</a>.</p>` : ""}
<p class="row"><a class="btn" href="/giving">Where the money went</a><a class="btn ghost" href="/board">See the board</a></p></div></div>`;
  return layout({ title: DONATE, body, nav: "give", base, path: "/give", noindex: true, donate: !!open });
}

/* how a ministry on the network takes donations of its own (founder, 2026-10-30: "how do we set it up so that the other ministries can
   collect donations as well, and maybe it's just a link to that site"). It is a link: the ministry makes a free Zeffy page and puts that
   link on its Linked Ministries page. Nothing here takes a donation, and Linked Ministries never touches the ministry's money. */
export function takeDonationsPage({ base = "", notice = "", donate = false } = {}) {
  const steps = [
    ["Get an EIN", "The EIN is the number the IRS gives a group. It is free. You apply online and get it the same day.", "https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number", "Apply for an EIN at irs.gov"],
    ["Open a bank account in the ministry's name", "Take the EIN and your papers to a bank. The account must be in the ministry's name, not a person's.", "", ""],
    ["Make a free Zeffy page", "Zeffy is a donation service with no fee for the ministry. Sign up with the EIN and connect the bank account. Zeffy makes a donation page for you.", "https://www.zeffy.com", "Sign up at zeffy.com"],
    ["Copy the link to your Zeffy page", "In Zeffy, open your donation form and copy its link. It starts with https://www.zeffy.com.", "", ""],
    ["Paste the link on your Linked Ministries page", "Sign in, open your ministry, and paste the link in the box called Your donation link. Save.", "/me", "Open your ministry"],
    ["Your page shows a Make a donation button", "People who find your ministry on linkedm.org can press it. The money goes to Zeffy, then to your bank. Linked Ministries never touches it.", "", ""],
  ];
  const body = `<div class="wrap prose"><p class="back"><a href="/">Back to the first page</a></p>
<p class="eyebrow">For ministries on the network</p>
<h1>How your ministry can take donations</h1>
<p class="lead">Six steps. Most take a day. The donation page is yours. The bank account is yours. The money never passes through Linked Ministries.</p>
<ol class="steps">${steps.map(([h3, p, href, words], i) => `<li class="card"><p class="label">Step ${i + 1}</p><h2>${e(h3)}</h2><p>${e(p)}</p>${href ? `<p><a class="btn ghost small" href="${e(href)}"${href.startsWith("http") ? ' rel="noopener"' : ""}>${e(words)}</a></p>` : ""}</li>`).join("\n")}</ol>
<div class="card"><h2>Need a hand?</h2><p>A person at Linked Ministries will walk through these steps with you.${notice ? ` Write to <a href="mailto:${e(notice)}">${e(notice)}</a>.` : ""}</p>
<p class="quiet">Zeffy may ask a donor for a tip for Zeffy itself. The donor can set it to $0. The tip is not part of the donation.</p></div>
<p class="row"><a class="btn" href="/join">Join the network</a><a class="btn ghost" href="/giving">Where the money went</a></p></div>`;
  return layout({ title: "How your ministry can take donations", body, base, path: "/take-donations", notice, donate, description: "Six steps for a ministry on the network to take donations of its own: an EIN, a bank account, a free Zeffy page, and the link on its Linked Ministries page." });
}

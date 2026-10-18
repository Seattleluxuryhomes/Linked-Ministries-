/* pages.mjs — the pages a person reads, built on the server. The public pages (the front, the board, one post, the terms and the
   privacy page) are whole HTML with the posts already in them, so they read without a script and a search engine sees them. The
   signed-in pages (join, me, steward) are a shell and a script. Every word a person typed goes in through e(), which escapes it:
   text is never markup. No inline script, no style attribute, nothing from anyone else's server (every face is in /fonts, every
   picture is drawn here as inline SVG). */
import { PRODUCT, CATEGORIES, KIND, KINDS, STATES, categoryLabel, dateWords, CRISIS, NO_MONEY, STAY_SAFE, WORDS } from "../public/js/pure.js";
import { NONPROFIT_LINE } from "./words.mjs";
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

export function layout({ title, description, body, script, nav = "", base = "", path = "", noindex = false, notice = "", ogTitle = "" }) {
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
${noindex ? '<meta name="robots" content="noindex,nofollow">\n' : ""}<meta property="og:type" content="website">
<meta property="og:site_name" content="${e(PRODUCT.name)}">
<meta property="og:title" content="${e(share)}">
<meta property="og:description" content="${e(desc)}">
${base ? `<meta property="og:url" content="${e(abs(path || "/"))}">\n` : ""}<meta property="og:image" content="${e(abs("/img/share.png"))}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="The Linked Ministries mark, two linked rings, and the words: ministries helping ministries.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${e(share)}">
<meta name="twitter:description" content="${e(desc)}">
<meta name="twitter:image" content="${e(abs("/img/share.png"))}">
<link rel="icon" href="/img/icon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="stylesheet" href="/css/lm.css">
</head>
<body>
<a class="skip" href="#main">Skip to the page</a>
<header class="top"><div class="wrap wide">
<a class="lock" href="/" aria-label="${e(PRODUCT.name)}, home">${MARK}<span class="words"><span class="name">${e(PRODUCT.name)}</span><span class="small">${e(PRODUCT.domain)}</span></span></a>
<nav class="nav" aria-label="Main"><a href="/board"${nav === "board" ? ' aria-current="page"' : ""}>Board</a><a href="/me"${nav === "me" ? ' aria-current="page"' : ""}>My ministry</a><a class="btn small" href="/join"${nav === "join" ? ' aria-current="page"' : ""}>Join the network</a></nav>
</div></header>
<main id="main" tabindex="-1">
${body}
</main>
<footer class="foot"><div class="wrap wide">
<div class="foot-grid">
<div class="foot-words">
<p class="line">${e(NONPROFIT_LINE)}</p>
<p>${e(CRISIS)}</p>
</div>
<p class="links"><a href="/board">Board</a> <a href="/join">Join the network</a> <a href="/terms">Terms</a> <a href="/privacy">Privacy</a> <a href="${e(PRODUCT.da.url)}" rel="noopener">${e(PRODUCT.da.name)}</a></p>
</div>
</div></footer>
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
<p class="who">${e(p.ministry)} <span class="dot" aria-hidden="true">·</span> ${e(p.ministry_city)}, ${e(p.ministry_state)}</p>
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
export function frontPage({ latest, base = "", notice = "" }) {
  const cards = latest.length ? latest.map((p) => postCard(p, { button: false })).join("\n") : emptyBoard({ filtered: false, compact: true });
  const body = `<section class="hero"><div class="wrap wide hero-grid">
<div class="hero-words">
<p class="eyebrow rise">A free network</p>
<h1 class="rise">Ministries helping ministries.</h1>
<p class="lead rise">Linked Ministries is a place where a ministry says what it needs, or what it can give. Another ministry answers. A person at Linked Ministries reads every post before it goes up.</p>
<p class="cta rise"><a class="btn" href="/board">See the board</a> <a class="btn ghost" href="/join">Join the network</a></p>
<ul class="chips rise" aria-label="What to know">
<li>${ICO_FREE}<span>Free to use</span></li>
<li>${ICO_PERSON}<span>Read by a person</span></li>
<li>${ICO_NOMONEY}<span>No money moves</span></li>
</ul>
</div>
<div class="hero-art rise" aria-hidden="true">${ART}</div>
</div></section>
<section class="band"><div class="wrap wide">
<h2>How it works</h2>
<ol class="three steps">
<li class="card lift"><span class="num" aria-hidden="true">1</span><p class="label">Ask or give</p><p>Post what you need, like food, a van, or teachers. Or post what you can give, like chairs, beds, or time.</p></li>
<li class="card lift"><span class="num" aria-hidden="true">2</span><p class="label">A person reads it</p><p>A steward at Linked Ministries reads each new ministry and each new post. Then it goes on the board.</p></li>
<li class="card lift"><span class="num" aria-hidden="true">3</span><p class="label">Another ministry answers</p><p>One button sends one email to the ministry that posted. You work out the rest together.</p></li>
</ol>
<p class="note">${e(NO_MONEY)}</p>
</div></section>
<section class="band alt"><div class="wrap wide">
<h2>What we run</h2>
<div class="three">
<div class="card lift"><p class="label">Now</p><h3>${e(PRODUCT.da.name)}</h3><p>A free, 24-week program of discipleship and recovery.</p><p><a href="${e(PRODUCT.da.url)}" rel="noopener">${e(PRODUCT.da.url.replace("https://", ""))}</a></p></div>
<div class="card lift"><p class="label">Now</p><h3>Help getting online</h3><p>We help a ministry get a simple website, an email address and a way to take gifts. It is free. A ministry gives what it can. Ask on the board.</p></div>
<div class="card lift"><p class="label">Planned</p><h3>Sober-living housing</h3><p>We plan to open housing for people in recovery. It is not open yet, and nothing is taking applications.</p></div>
</div>
</div></section>
<section class="band"><div class="wrap wide">
<div class="row between head"><h2>Latest on the board</h2><a href="/board">See the whole board</a></div>
<div class="posts">
${cards}
</div>
${latest.length ? `<p class="note">${e("To answer a post, open the board.")}</p>` : ""}
</div></section>
<section class="band alt"><div class="wrap wide">
<div class="card cta-card"><div><h2>Join the network</h2><p>It is free. Sign in with your email, tell us about your ministry, and post your first ask or give.</p></div><p class="row"><a class="btn" href="/join">Join the network</a><a class="btn ghost" href="/board">See the board</a></p></div>
</div></section>`;
  return layout({ body, description: "Linked Ministries is a free network where ministries post what they need or what they can give, and other ministries answer.", nav: "", base, path: "/", notice });
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
export function shellPage({ title, script, nav, lead, base = "" }) {
  const body = `<div class="wrap narrow">
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

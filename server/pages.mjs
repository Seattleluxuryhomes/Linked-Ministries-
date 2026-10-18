/* pages.mjs — the pages a person reads, built on the server. The public pages (the front, the board, one post) are whole
   HTML with the posts already in them, so they read without a script and a search engine sees them. The signed-in pages
   (join, me, steward) are a shell and a script. Every word a person typed goes in through e(), which escapes it: text is
   never markup. No inline script, no style attribute, nothing from anyone else's server (every face is in /fonts). */
import { PRODUCT, CATEGORIES, KIND, KINDS, STATES, categoryLabel, dateWords, CRISIS, NO_MONEY, WORDS } from "../public/js/pure.js";
import { NONPROFIT_LINE } from "./words.mjs";

const AMP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const e = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => AMP[c]);

/* Linked Ministries' own mark: two links of a chain in the page ink, in a gold-lined tile. Drawn inline, no file to fetch. */
export const MARK = `<svg class="mark" viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="2" y="2" width="44" height="44" rx="12" stroke="#D97706" stroke-width="2.5"/><g transform="translate(9 9) scale(1.25)" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></g></svg>`;

export function layout({ title, description, body, script, nav = "" }) {
  const t = title ? `${title} · ${PRODUCT.name}` : `${PRODUCT.name}: ministries helping ministries`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${e(t)}</title>
<meta name="description" content="${e(description || "A free network where ministries post what they need or what they can give, and other ministries answer.")}">
<link rel="icon" href="/img/icon.svg" type="image/svg+xml">
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
<p class="line">${e(NONPROFIT_LINE)}</p>
<p>${e(CRISIS)}</p>
<p class="links"><a href="/board">Board</a> <a href="/join">Join the network</a> <a href="${e(PRODUCT.da.url)}" rel="noopener">${e(PRODUCT.da.name)}</a></p>
</div></footer>
${script ? `<script type="module" src="${e(script)}"></script>` : ""}
</body>
</html>
`;
}

/* ---- one post, as a card ---------------------------------------------------------------------------------------------------- */
export function postCard(p, { button = true, link = true } = {}) {
  const k = KIND[p.kind] || KIND.ask;
  const place = p.city !== p.ministry_city || p.state !== p.ministry_state ? `<p class="place"><span class="label">Where</span> ${e(p.city)}, ${e(p.state)}</p>` : "";
  return `<article class="post card" id="post-${e(p.id)}" data-post="${e(p.id)}" data-kind="${e(p.kind)}">
<div class="meta"><span class="tag ${e(p.kind)}">${e(k.label)}</span><span class="cat">${e(categoryLabel(p.category))}</span></div>
<h3 class="post-title">${link ? `<a href="/board/${e(p.id)}">${e(p.title)}</a>` : e(p.title)}</h3>
<p class="who">${e(p.ministry)} <span class="dot" aria-hidden="true">·</span> ${e(p.ministry_city)}, ${e(p.ministry_state)}</p>
${place}
<p class="words">${e(p.body)}</p>
<p class="when">Posted ${e(dateWords(p.posted_at))} <span class="dot" aria-hidden="true">·</span> Open until ${e(dateWords(p.open_until))}</p>
${button ? `<div class="actions"><a class="btn" href="/board/${e(p.id)}#answer" data-answer="${e(p.id)}" data-kind="${e(p.kind)}" data-ministry="${e(p.ministry)}">${e(k.button)}</a></div>
<div class="answer-slot" id="slot-${e(p.id)}"></div>` : ""}
</article>`;
}

/* ---- the front ------------------------------------------------------------------------------------------------------------------ */
export function frontPage({ latest }) {
  const cards = latest.length ? latest.map((p) => postCard(p, { button: false })).join("\n") : `<div class="card"><p>${e(WORDS.boardEmptyNone)}</p></div>`;
  const body = `<section class="hero"><div class="wrap wide">
<p class="eyebrow">A free network</p>
<h1>Ministries helping ministries.</h1>
<p class="lead">Linked Ministries is a place where a ministry says what it needs, or what it can give. Another ministry answers. A person at Linked Ministries reads every post before it goes up.</p>
<p class="cta"><a class="btn" href="/board">See the board</a> <a class="btn ghost" href="/join">Join the network</a></p>
</div></section>
<section class="band"><div class="wrap wide">
<h2>How it works</h2>
<div class="three">
<div class="card"><p class="label">1. Ask or give</p><p>Post what you need, like food, a van, or teachers. Or post what you can give, like chairs, beds, or time.</p></div>
<div class="card"><p class="label">2. A person reads it</p><p>A steward at Linked Ministries reads each new ministry and each new post. Then it goes on the board.</p></div>
<div class="card"><p class="label">3. Another ministry answers</p><p>One button sends one email to the ministry that posted. You work out the rest together.</p></div>
</div>
<p class="note">${e(NO_MONEY)}</p>
</div></section>
<section class="band alt"><div class="wrap wide">
<h2>What we run</h2>
<div class="two">
<div class="card"><p class="label">Now</p><h3>${e(PRODUCT.da.name)}</h3><p>A free, 24-week program of discipleship and recovery.</p><p><a href="${e(PRODUCT.da.url)}" rel="noopener">${e(PRODUCT.da.url.replace("https://", ""))}</a></p></div>
<div class="card"><p class="label">Planned</p><h3>Sober-living housing</h3><p>We plan to open housing for people in recovery. It is not open yet, and nothing is taking applications.</p></div>
</div>
</div></section>
<section class="band"><div class="wrap wide">
<div class="row between"><h2>Latest on the board</h2><a href="/board">See the whole board</a></div>
<div class="posts">
${cards}
</div>
<p class="note">${e("To answer a post, open the board.")}</p>
</div></section>
<section class="band alt"><div class="wrap wide">
<div class="card cta-card"><h2>Join the network</h2><p>It is free. Sign in with your email, tell us about your ministry, and post your first ask or give.</p><p><a class="btn" href="/join">Join the network</a></p></div>
</div></section>`;
  return layout({ body, description: "Linked Ministries is a free network where ministries post what they need or what they can give, and other ministries answer.", nav: "" });
}

/* ---- the board ------------------------------------------------------------------------------------------------------------------ */
function options(list, value, first) {
  return `<option value="">${e(first)}</option>` + list.map(([v, l]) => `<option value="${e(v)}"${v === value ? " selected" : ""}>${e(l)}</option>`).join("");
}
function pageHref(f, page) {
  const u = new URLSearchParams();
  for (const k of ["kind", "category", "state", "city", "q"]) if (f[k]) u.set(k, f[k]);
  if (page > 1) u.set("page", String(page));
  const s = u.toString();
  return "/board" + (s ? "?" + s : "");
}
export function boardPage({ result }) {
  const { posts, total, page, pages, filters: f } = result;
  const filtered = !!(f.kind || f.category || f.state || f.city || f.q);
  const list = posts.length ? posts.map((p) => postCard(p)).join("\n") : `<div class="card"><p>${e(filtered ? WORDS.boardEmpty : WORDS.boardEmptyNone)}</p></div>`;
  const pager = pages > 1 ? `<nav class="pager" aria-label="More posts">${page > 1 ? `<a class="btn ghost" href="${e(pageHref(f, page - 1))}">Newer</a>` : ""}<span class="muted">Page ${page} of ${pages}</span>${page < pages ? `<a class="btn ghost" href="${e(pageHref(f, page + 1))}">Older</a>` : ""}</nav>` : "";
  const body = `<div class="wrap wide">
<h1>The board</h1>
<p class="lead">Every post here was read by a person at Linked Ministries. Pick one and answer it.</p>
<p class="note">${e(NO_MONEY)}</p>
<form class="filters card" method="get" action="/board" role="search">
<div class="grid">
<div class="field"><label for="f-kind">${e(WORDS.filterKind)}</label><select id="f-kind" name="kind">${options(KINDS.map((k) => [k, KIND[k].plural]), f.kind, "Asks and gives")}</select></div>
<div class="field"><label for="f-cat">${e(WORDS.filterCategory)}</label><select id="f-cat" name="category">${options(CATEGORIES, f.category, "Anything")}</select></div>
<div class="field"><label for="f-state">${e(WORDS.filterState)}</label><select id="f-state" name="state">${options(STATES.map(([c, n]) => [c, `${n} (${c})`]), f.state, "Any state")}</select></div>
<div class="field"><label for="f-city">${e(WORDS.filterCity)}</label><input id="f-city" name="city" type="text" maxlength="80" value="${e(f.city)}" autocomplete="off"></div>
<div class="field wide"><label for="f-q">${e(WORDS.filterSearch)}</label><input id="f-q" name="q" type="search" maxlength="120" value="${e(f.q)}" autocomplete="off"></div>
</div>
<p class="row"><button class="btn" type="submit">${e(WORDS.filterGo)}</button>${filtered ? `<a class="btn ghost" href="/board">${e(WORDS.filterClear)}</a>` : ""}</p>
</form>
<p class="count" aria-live="polite">${total === 1 ? "1 post" : `${total} posts`}${filtered ? " match" : ""}</p>
<div class="posts" id="posts">
${list}
</div>
${pager}
</div>`;
  return layout({ title: "The board", body, script: "/js/board.js", nav: "board", description: "Asks and gives from ministries: housing, food, clothing, rides, volunteers, equipment, furniture, teaching and prayer." });
}

export function postPage({ post }) {
  const body = `<div class="wrap">
<p><a href="/board">Back to the board</a></p>
${postCard(post, { link: false })}
</div>`;
  return layout({ title: post.title, body, script: "/js/board.js", nav: "board", description: `${KIND[post.kind].label} from ${post.ministry}: ${post.title}` });
}

export function missingPostPage() {
  return layout({ title: "Not on the board", nav: "board", body: `<div class="wrap"><div class="card"><h1>That post is not on the board</h1><p>It may be closed, or past its day. Look at the board for what is open now.</p><p><a class="btn" href="/board">See the board</a></p></div></div>` });
}

/* ---- the signed-in pages: a shell, and a script that builds the rest from the API ------------------------------------------------ */
export function shellPage({ title, script, nav, lead }) {
  const body = `<div class="wrap">
<div id="app" class="stack" aria-live="polite">
<h1>${e(title)}</h1>
${lead ? `<p class="lead">${e(lead)}</p>` : ""}
<noscript><p class="note">${e(WORDS.noJs)}</p></noscript>
</div>
</div>`;
  return layout({ title, body, script, nav });
}

export function notFoundPage() {
  return layout({ title: "Not found", body: `<div class="wrap"><div class="card"><h1>That page was not found</h1><p>Check the address, or start again from the first page.</p><p><a class="btn" href="/">Go to the first page</a></p></div></div>` });
}

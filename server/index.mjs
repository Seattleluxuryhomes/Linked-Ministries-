/* index.mjs — Linked Ministries: one service. The pages, the API and the board, on any Postgres 16, with row-level security
   doing the refusing (shaped on Behavioral Health's server/index.mjs; origin in commons.json). */
import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { guardOrExit } from "./config.mjs";
import { pool, migrate, asAdmin, asUser, ROOT } from "./db.mjs";
import { securityHeaders, sameOriginLock } from "./headers.mjs";
import { startSignIn, verifyCode, sessionUser, revokeSession, whoami } from "./auth.mjs";
import { mount, dayLimits } from "./api.mjs";
import { emailConfigured } from "./mail.mjs";
import { keyIsSet } from "./eden-engine.mjs";
import { refusal } from "./words.mjs";
import { boardQuery, boardPost } from "./board.mjs";
import { publicPage, publicPageList, photo, myPage, givingPublic, givingDoor } from "./site.mjs";
import { frontPage, boardPage, postPage, missingPostPage, shellPage, notFoundPage, termsPage, privacyPage, ministryPage, givingPage, givePage } from "./pages.mjs";
import { noticeEmail } from "../lib/email.mjs";
import { zeffyGiveUrl } from "../public/js/pure.js";
import { PRODUCT, CATEGORIES, STATES } from "../public/js/pure.js";

const PUBLIC = path.join(ROOT, "public");
const COOKIE = "lm_session";
const MAX_AGE = 30 * 86400;

export function buildApp({ env = process.env } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  const https = /^https:/i.test(String(env.LEXOS_PUBLIC_URL || ""));
  app.use(securityHeaders(env));
  app.use(sameOriginLock());

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  /* a cookie that cannot be read (a broken %-sequence, no "=") is ignored, never an error: it is the browser's, and anyone can send one */
  const cookies = (req) => { const out = {}; for (const p of String(req.headers.cookie || "").split(/;\s*/)) { const i = p.indexOf("="); if (i < 1) continue; try { out[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1)); } catch (e) { /* skip it */ } } return out; };
  const setSession = (res, token) => res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${https ? "; Secure" : ""}`);
  const clearSession = (res) => res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${https ? "; Secure" : ""}`);
  const publicBase = (req) => String(env.LEXOS_PUBLIC_URL || "").replace(/\/+$/, "") || `${req.protocol}://${req.get("host")}`;
  const ip = (req) => String(req.ip || "unknown");

  /* ---- the public health answer says two words and nothing else (the detail is the operator's, behind a key) ---------------- */
  app.get("/api/health", async (req, res) => {
    res.set("cache-control", "no-store");
    let ok = false, timer;
    try { await Promise.race([pool.query("select 1"), new Promise((_, no) => { timer = setTimeout(() => no(new Error("slow")), 4000); })]); ok = true; } catch (e) { ok = false; } finally { clearTimeout(timer); }
    res.status(ok ? 200 : 503).json(ok ? { status: "ok", service: PRODUCT.service } : { status: "down" });
  });
  app.get("/api/health/detail", wrap(async (req, res) => {
    const want = String(env.KPI_READ_TOKEN || ""), got = String(req.get("authorization") || "").replace(/^Bearer /, "");
    const a = crypto.createHash("sha256").update(want).digest(), b = crypto.createHash("sha256").update(got).digest();
    if (want.length < 16 || !crypto.timingSafeEqual(a, b)) return res.status(401).end();
    const d = await asAdmin(async (c) => ({
      migrations: (await c.query("select count(*)::int as n from public.lm_migrations")).rows[0].n,
      ministries: (await c.query("select count(*)::int as n from lm.ministries")).rows[0].n,
      ministries_waiting: (await c.query("select count(*)::int as n from lm.ministries where status = 'waiting'")).rows[0].n,
      posts_waiting: (await c.query("select count(*)::int as n from lm.posts where status = 'waiting'")).rows[0].n,
      stewards: (await c.query("select count(*)::int as n from lm.people where steward")).rows[0].n,
    }));
    res.set("cache-control", "no-store").json({ ...d, mail: emailConfigured(), eden: keyIsSet(env) });
  }));

  /* ---- the counts Eden reads (the founder's console): counts only, the operator's key or a 404 ------------------------------- */
  app.get("/api/kpi", wrap(async (req, res) => {
    res.set("cache-control", "no-store");
    const want = String(env.KPI_READ_TOKEN || "").trim();
    if (want.length < 16) return res.status(404).json({ error: "not_found" });
    const m = /^Bearer[ ]+(\S+)$/i.exec(String(req.get("authorization") || "").trim()), got = m ? m[1] : "";
    if (!crypto.timingSafeEqual(crypto.createHash("sha256").update(want).digest(), crypto.createHash("sha256").update(got).digest()) || !got) return res.status(401).json({ error: "unauthorized" });
    const D = /^\d{4}-\d{2}-\d{2}$/, one = (v, end) => { const t = String(v || "").trim(); if (!t) return null; const x = D.test(t) ? Date.parse(t + "T00:00:00Z") + (end ? 86400000 : 0) : Date.parse(t); return Number.isFinite(x) ? x : NaN; };
    const to0 = one(req.query.to, true), from0 = one(req.query.from, false);
    if (Number.isNaN(to0) || Number.isNaN(from0)) return res.status(400).json({ error: "bad_period" });
    const to = new Date(to0 ?? Date.now()), from = new Date(from0 ?? to.getTime() - 30 * 86400000);
    if (from >= to) return res.status(400).json({ error: "bad_period" });
    const d = await asAdmin(async (c) => {
      const n = async (q, p = []) => Number((await c.query(q, p)).rows[0].n) || 0;
      return {
        joined: await n("select count(*)::int as n from lm.ministries where created_at >= $1 and created_at < $2", [from, to]),
        approved: await n("select count(*)::int as n from lm.ministries where status = 'public' and reviewed_at >= $1 and reviewed_at < $2", [from, to]),
        posts: await n("select count(*)::int as n from lm.posts where created_at >= $1 and created_at < $2", [from, to]),
        answers: await n("select count(*)::int as n from lm.answers where sent_at >= $1 and sent_at < $2", [from, to]),
        public_now: await n("select count(*)::int as n from lm.ministries where status = 'public'"),
        waiting_now: await n("select count(*)::int as n from lm.ministries where status = 'waiting'"),
        people_now: await n("select count(*)::int as n from lm.people"),
        gifts: await n("select count(*)::int as n from lm.gifts where corrects_id is null and received_on >= $1::date and received_on < $2::date", [from, to]),
        gift_cents: await n("select coalesce(sum(amount_cents), 0)::bigint as n from lm.gifts where received_on >= $1::date and received_on < $2::date", [from, to]),
      };
    });
    const f = (step, count, source) => ({ step, count, source, grade: "Known" });
    const k = (id, label, value, source, unit = "count") => ({ id, label, value, unit, source, grade: "Known", note: "" });
    res.json({
      product: "linked-ministries", at: new Date().toISOString(), period: { from: from.toISOString(), to: to.toISOString() },
      funnel: [f("leads", d.joined, "ministries that joined in the period (lm.ministries.created_at)"), f("booked", d.approved, "ministries a steward made public in the period (reviewed_at)"), f("posts", d.posts, "posts written in the period"), f("answers", d.answers, "answers given in the period")],
      kpis: [k("ministries_public", "Ministries on the board", d.public_now, "public ministries now"), k("ministries_waiting", "Waiting for review", d.waiting_now, "ministries waiting for a steward now"), k("people", "People", d.people_now, "people on the board now"), k("gifts", "Gifts received", d.gifts, "gifts in the ledger received in the period, corrections not counted twice")],
      revenue: { recorded_cents: Math.max(0, d.gift_cents), source: "the giving ledger: gifts received in the period, corrections included, recorded by a person", grade: "Known" },
      notes: ["Revenue here is gifts to Linked Ministries recorded in its ledger; the board moves no money between ministries.", "No visit counter, no tracking."],
    });
  }));

  /* ---- who is signed in -------------------------------------------------------------------------------------------------- */
  app.use("/api", wrap(async (req, res, next) => {
    const t = cookies(req)[COOKIE];
    if (t) { try { req.user = await sessionUser(t); req.token = t; } catch (e) { req.user = null; } }
    next();
  }));
  app.use("/api", express.json({ limit: "64kb" }));
  app.use("/api", (err, req, res, next) => (err && err.type && /entity/.test(err.type) ? res.status(err.status || 400).json({ error: "bad_body", words: "That was too big or could not be read." }) : next(err)));

  /* ---- what any page needs to know, with no sign-in -------------------------------------------------------------------------- */
  app.get("/api/product", (req, res) => { res.set("cache-control", "public, max-age=60"); res.json({ name: PRODUCT.name, mail: emailConfigured(), categories: CATEGORIES.map(([id, label]) => ({ id, label })), states: STATES.map(([code, name]) => ({ code, name })), limits: dayLimits() }); });

  /* the giving record, read by anyone: sums of the rows, every approved and paid grant, never a donor */
  app.get("/api/giving", wrap(async (req, res) => { res.set("cache-control", "no-cache").json(await givingPublic()); }));

  /* ---- the board, read by anyone: the database hands back public posts only ---------------------------------------------------- */
  app.get("/api/board", wrap(async (req, res) => {
    const r = await boardQuery(req.query);
    res.set("cache-control", "no-cache").json({ posts: r.posts, total: r.total, page: r.page, pages: r.pages });
  }));
  app.get("/api/board/:id", wrap(async (req, res) => {
    const p = await boardPost(req.params.id);
    if (!p) return res.status(404).json({ error: "not_found", words: "That post is not on the board." });
    res.set("cache-control", "no-cache").json({ post: p });
  }));

  /* ---- sign in by a code, by email ------------------------------------------------------------------------------------------ */
  app.post("/api/auth/start", wrap(async (req, res) => {
    const r = await startSignIn({ to: (req.body || {}).to, ip: ip(req), env });
    res.status(r.ok ? 200 : r.reason === "too_many" ? 429 : 400).json(r.ok ? r : { ...r, words: r.reason === "too_many" ? "That is a lot of tries. Wait a few minutes and try again." : "Type an email address." });
  }));
  app.post("/api/auth/verify", wrap(async (req, res) => {
    const r = await verifyCode({ to: (req.body || {}).to, code: (req.body || {}).code, ip: ip(req), ua: req.get("user-agent") });
    if (!r.ok) return res.status(r.reason === "too_many" ? 429 : 401).json({ ok: false, reason: r.reason, words: r.words || (r.reason === "too_many" ? "That is a lot of tries. Wait a few minutes and try again." : "That code did not work. Check the newest message, or ask for a new code.") });
    setSession(res, r.token);
    const me = await whoami(r.user);
    res.json({ ok: true, has_ministry: !!me.ministry, landing: me.ministry ? "/me" : "/join" });
  }));
  app.post("/api/auth/signout", wrap(async (req, res) => { await revokeSession(cookies(req)[COOKIE]); clearSession(res); res.json({ ok: true }); }));
  /* delete my account: the database does all of it in one transaction (lm.account_delete) and says whether the ministry left with the person */
  app.post("/api/me/delete", wrap(async (req, res) => {
    if (!req.user) throw Object.assign(new Error("unauthenticated"), { status: 401, words: "Please sign in." });
    if ((req.body || {}).confirm !== true) throw Object.assign(new Error("confirm_needed"), { status: 400, words: "Press the button to say you are sure." });
    const r = (await asUser(req.user.id, async (c) => (await c.query("select lm.account_delete() as r")).rows[0])).r;
    clearSession(res);
    res.json({ ok: true, ministry_left: !!r.ministry_left, words: "Your account is deleted." });
  }));

  /* ---- the signed-in API ------------------------------------------------------------------------------------------------- */
  mount(app, { wrap, publicBase, env });
  app.use("/api", (req, res) => res.status(404).json({ error: "not_found", words: "That was not found." }));
  app.use((err, req, res, next) => {
    const r = refusal(err);
    if (r.status >= 500) console.error("error: " + req.method + " " + req.path.slice(0, 80) + " " + String(err && (err.code || err.message)).slice(0, 120));
    if (req.path.startsWith("/api")) return res.status(r.status).json(r.body);
    res.status(r.status).type("text/plain").send(r.body.words);
  });

  /* ---- the pages ----------------------------------------------------------------------------------------------------------- */
  const html = (res, status, body) => res.status(status).type("html").send(body);
  /* every page carries the Make a donation button while the giving door is open, so the door is read for every page */
  const where = async (req) => ({ base: String(env.LEXOS_PUBLIC_URL || "").replace(/\/+$/, ""), notice: noticeEmail(env), zeffy: zeffyGiveUrl(env.ZEFFY_GIVE_URL), donate: await givingDoor().catch(() => false) });
  app.get("/", wrap(async (req, res) => { const r = await boardQuery({}, { limit: 6 }); res.set("cache-control", "no-cache"); html(res, 200, frontPage({ latest: r.posts, giving: { open: await givingDoor() }, ...(await where(req)) })); }));
  app.get("/board", wrap(async (req, res) => { const r = await boardQuery(req.query); res.set("cache-control", "no-cache"); html(res, 200, boardPage({ result: r, ...(await where(req)) })); }));
  app.get("/board/:id", wrap(async (req, res) => { const p = await boardPost(req.params.id); res.set("cache-control", "no-cache"); p ? html(res, 200, postPage({ post: p, ...(await where(req)) })) : html(res, 404, missingPostPage(await where(req))); }));
  /* a ministry's own page. The public sees the copy a person on the team read; a ministry's own people see their draft as a preview (never indexed). */
  app.get("/m/:slug", wrap(async (req, res) => {
    const pg = await publicPage(req.params.slug);
    res.set("cache-control", "no-cache");
    if (pg) return html(res, 200, ministryPage({ page: pg, ...(await where(req)), giving: { open: await givingDoor() } }));
    const t = cookies(req)[COOKIE]; let u = null; if (t) { try { u = await sessionUser(t); } catch (e) { u = null; } }
    if (u) {
      const mine = await myPage(u.id);
      if (mine && mine.exists && mine.slug === String(req.params.slug).toLowerCase()) {
        res.set("cache-control", "private, no-store");
        return html(res, 200, ministryPage({ page: { slug: mine.slug, name: mine.ministry.name, city: mine.ministry.city, state: mine.ministry.state, live: mine.draft, live_at: null }, ...(await where(req)), giving: { open: false }, preview: true }));
      }
    }
    html(res, 404, notFoundPage(await where(req)));
  }));
  /* a picture: public while the page a person on the team read names it; otherwise only to the ministry's own people, or a team member reading it */
  app.get("/photos/:id", wrap(async (req, res) => {
    const t = cookies(req)[COOKIE];
    const ph = await photo(req.params.id, null) || (t ? await (async () => { try { const u = await sessionUser(t); return u ? photo(req.params.id, u.id) : null; } catch (e) { return null; } })() : null);
    if (!ph) return res.status(404).type("text/plain").send("That picture was not found.");
    res.set({ "content-type": ph.content_type, "cache-control": ph.is_public ? "public, max-age=300" : "private, no-store", "content-length": String(ph.bytes.length), "content-disposition": "inline" }).end(ph.bytes);
  }));
  /* where the money went: the record, added up from its rows by the database for the public role. No donor is in it. */
  app.get("/giving", wrap(async (req, res) => { res.set("cache-control", "no-cache"); html(res, 200, givingPage({ giving: await givingPublic(), ...(await where(req)) })); }));
  /* the Give button: no payment service is connected, so this page says so and has no form */
  app.get("/give", wrap(async (req, res) => { res.set("cache-control", "no-cache"); html(res, 200, givePage({ open: await givingDoor(), ...(await where(req)) })); }));
  app.get("/terms", wrap(async (req, res) => { res.set("cache-control", "public, max-age=300"); html(res, 200, termsPage(await where(req))); }));
  app.get("/privacy", wrap(async (req, res) => { res.set("cache-control", "public, max-age=300"); html(res, 200, privacyPage(await where(req))); }));
  app.get("/join", wrap(async (req, res) => html(res, 200, shellPage({ title: "Join the network", script: "/js/join.js", nav: "join", ...(await where(req)) }))));
  app.get("/me", wrap(async (req, res) => html(res, 200, shellPage({ title: "Your ministry", script: "/js/me.js", nav: "me", ...(await where(req)) }))));
  /* Review and Money are the team's two pages. /steward and /treasury were their first names: they answer with a permanent redirect so no link, bookmark or installed shortcut breaks. */
  app.get("/money", wrap(async (req, res) => html(res, 200, shellPage({ title: "Money", script: "/js/treasury.js", nav: "", width: "mid", ...(await where(req)) }))));
  app.get("/review", wrap(async (req, res) => html(res, 200, shellPage({ title: "Review", script: "/js/steward.js", nav: "", width: "mid", ...(await where(req)) }))));
  app.get("/treasury", (req, res) => res.redirect(301, "/money"));
  app.get("/steward", (req, res) => res.redirect(301, "/review"));
  /* the front, the board, the terms and the privacy page are the public pages; the signed-in pages and the API are kept out of search */
  app.get("/robots.txt", (req, res) => res.type("text/plain").send(["User-agent: *", "Disallow: /me", "Disallow: /review", "Disallow: /money", "Disallow: /steward", "Disallow: /treasury", "Disallow: /join", "Disallow: /api", "Allow: /", "", `Sitemap: ${publicBase(req)}/sitemap.xml`, ""].join("\n")));
  /* only what the public may read: the front, the board, the two legal pages, and each open post that a person read. Never a draft, a waiting post, a closed one or a post of a ministry nobody has read. */
  app.get("/sitemap.xml", wrap(async (req, res) => {
    const b = publicBase(req), r = await boardQuery({}, { limit: 500 });
    const pg = await publicPageList();
    const urls = [["/", null], ["/board", null], ["/giving", null], ["/terms", null], ["/privacy", null], ...pg.map((p) => ["/m/" + p.slug, p.live_at]), ...r.posts.map((p) => ["/board/" + p.id, p.posted_at])];
    res.type("application/xml").set("cache-control", "public, max-age=300").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, d]) => `<url><loc>${b}${u}</loc>${d ? `<lastmod>${d}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>\n`);
  }));
  app.get("/favicon.ico", (req, res) => res.type("image/x-icon").set("cache-control", "public, max-age=86400").sendFile(path.join(PUBLIC, "favicon.ico")));
  app.use(express.static(PUBLIC, { index: false, maxAge: "5m", setHeaders: (res, p) => { if (/\.(woff2)$/.test(p)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); else if (/[\\/]sw\.js$/.test(p)) res.setHeader("Cache-Control", "no-cache"); else if (/\.webmanifest$/.test(p)) res.type("application/manifest+json"); } }));
  app.use(wrap(async (req, res) => html(res, 404, notFoundPage(await where(req)))));
  return app;
}

/* ---- boot ---------------------------------------------------------------------------------------------------------------------- */
if (import.meta.url === `file://${process.argv[1]}`) {
  guardOrExit(process.env);
  await migrate();
  const app = buildApp();
  const port = Number(process.env.PORT) || 8080;
  const srv = app.listen(port, () => console.log(`Linked Ministries listening on :${port}`));
  const tick = () => pool.query("select rl.reap(); select app.reap()").catch((e) => console.error("reaper: " + String(e && e.code || "error")));
  setInterval(tick, 3600 * 1000).unref();
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { srv.close(() => pool.end().finally(() => process.exit(0))); setTimeout(() => process.exit(0), 5000).unref(); });
}

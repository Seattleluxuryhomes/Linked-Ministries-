/* headers.mjs — security headers (adapted from Behavioral Health's server/headers.mjs; origin in commons.json).
   The pages here carry no inline script and no inline style attribute and load nothing from anyone else (every face is
   self-hosted; no font host, no analytics, no third-party script), so the policy is the strictest one that works:
   script-src 'self' (no 'unsafe-inline', no 'unsafe-eval', and therefore no nonce to forget), style-src 'self'.
   The service worker (public/sw.js, D-290's pattern) is allowed by one line, worker-src 'self': this site's own file and no other,
   no blob, no data. Nothing else is loosened.
   That is stricter than a nonce: a nonce lets one inline script run, and this policy lets none. Referrer-Policy: no-referrer
   keeps a page address from travelling to another site. */

export const POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
];

export function cspMode(env = process.env) {
  const m = String(env.LEXOS_CSP || "enforce").trim().toLowerCase();
  return ["off", "report-only", "enforce"].includes(m) ? m : "enforce";
}

export const NOINDEX = ["/me", "/review", "/money", "/donations", "/steward", "/treasury", "/join", "/api"];

export function securityHeaders(env = process.env) {
  const mode = cspMode(env);
  const https = /^https:/i.test(String(env.LEXOS_PUBLIC_URL || ""));
  const policy = POLICY.join("; ") + (https ? "; upgrade-insecure-requests" : "");
  return function headers(req, res, next) {
    if (mode !== "off") res.setHeader(mode === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", policy);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    /* HSTS without includeSubDomains or preload: the host may be a shared *.up.railway.app apex */
    if (https) res.setHeader("Strict-Transport-Security", "max-age=31536000");
    if (NOINDEX.some((p) => req.path === p || req.path.startsWith(p + "/"))) res.setHeader("X-Robots-Tag", "noindex, nofollow");
    /* what a signed-in person's page and data say is never cached by a shared cache or kept by the back button */
    if (req.path.startsWith("/api") || req.path.startsWith("/me") || req.path.startsWith("/review") || req.path.startsWith("/money") || req.path.startsWith("/steward") || req.path.startsWith("/treasury") || req.path.startsWith("/join")) res.setHeader("Cache-Control", "no-store");
    next();
  };
}

/* the same-origin lock for anything that changes state: a request under /api that arrives with an Origin (or a Referer) from
   another site is refused before any handler runs. The cookie is SameSite=Lax, which is the first lock; this is the second. */
export function sameOriginLock() {
  const STATE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  return function lock(req, res, next) {
    if (!STATE.has(req.method) || !req.path.startsWith("/api")) return next();
    let from = req.get("origin");
    if (!from) { const ref = req.get("referer"); if (ref) { try { from = new URL(ref).origin; } catch (e) { from = "invalid"; } } }
    if (!from) return next();
    const proto = req.secure ? "https" : req.protocol;
    if (from === `${proto}://${req.get("host")}`) return next();
    res.status(403).json({ error: "cross_origin", words: "This request came from another website. Linked Ministries only accepts changes from its own pages." });
  };
}

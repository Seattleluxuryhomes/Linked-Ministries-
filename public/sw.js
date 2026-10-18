/* Linked Ministries: the service worker. It makes the site installable and says the truth when the phone is offline.
   Copied in shape from Cross Universal's lexos/pwa/sw.js (D-290), with the same rule: the worker keeps nothing that matters.
   It keeps ONLY the shell: the stylesheet, the six faces, the mark and the offline page. It never touches /api/, a signed-in
   page (/me, /steward, /treasury, /join), a picture of a ministry, a form or any request that is not a plain GET, and it never
   stores a page. A page that cannot load is answered by one plain page that says the phone is offline and that nothing was sent. */
const CACHE = "lm-shell-v1";
const SHELL = [
  "/offline.html",
  "/css/lm.css",
  "/img/icon.svg",
  "/fonts/fraunces-latin-500-normal.woff2",
  "/fonts/fraunces-latin-600-normal.woff2",
  "/fonts/plus-jakarta-sans-latin-400-normal.woff2",
  "/fonts/plus-jakarta-sans-latin-500-normal.woff2",
  "/fonts/plus-jakarta-sans-latin-600-normal.woff2",
  "/fonts/plus-jakarta-sans-latin-700-normal.woff2",
];
/* whatever begins like this is never read from, or written to, the device */
const NEVER = ["/api", "/me", "/steward", "/treasury", "/join", "/photos"];
const never = (path) => NEVER.some((p) => path === p || path.startsWith(p + "/"));

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;                                   /* a write is never touched */
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                    /* someone else's address is never touched */
  if (never(url.pathname)) {
    /* a signed-in page that cannot load gets the offline page and nothing of its own; the record is never answered from the device */
    if (req.mode === "navigate" && !url.pathname.startsWith("/api")) e.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }
  if (req.mode === "navigate") {                                      /* a page: always the network; offline, the truth */
    e.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }
  if (!SHELL.includes(url.pathname)) return;                          /* anything that is not the shell goes straight to the network */
  if (url.pathname.startsWith("/fonts/")) {                           /* a face never changes under its name: the device's copy first */
    e.respondWith(caches.match(url.pathname).then((hit) => hit || fetch(req)));
    return;
  }
  /* the stylesheet, the mark and the offline page: the network first, so a new release shows at once; the device's copy only when offline */
  e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(url.pathname, copy)).catch(() => {}); } return res; }).catch(() => caches.match(url.pathname)));
});

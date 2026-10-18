/* pwa.js: registers the service worker (public/sw.js) on every page. The worker keeps only the shell (the stylesheet, the faces, the
   mark and the offline page) and never a page, a form or anything under /api. Nothing here shows a message: a worker that cannot
   start only means the site works as it always did. */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {}); });
}

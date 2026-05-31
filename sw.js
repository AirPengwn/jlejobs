/* Service worker: network-first for same-origin GETs (fresh data when online,
   cached fallback when offline). Cross-origin requests (Leaflet, Greenhouse/Ashby,
   JSONBin) are left untouched so they behave normally. */
const CACHE = "jle-cache-v1.7.0";
const CORE = [
  "./", "./index.html",
  "./assets/css/styles.css", "./assets/js/app.js",
  "./assets/data/version.js", "./assets/data/sync-config.js", "./assets/data/jobs.js",
  "./assets/data/bio.js", "./assets/data/resume.js", "./assets/data/resume-variants.js",
  "./assets/data/grow.js", "./assets/img/stickman.jpg", "./manifest.webmanifest"
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== location.origin) return; // ignore cross-origin
  e.respondWith(
    fetch(req)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
  );
});

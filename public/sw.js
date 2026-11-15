// SOSpesAI service worker: works offline after the first visit.
// Pages: network first, falling back to the cache. Everything else: cache first, refreshed in the background.
// License: MIT.
const CACHE = "sospesai-v2";
const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./geometries/human_body.glb",
  "./data/observations.json",
  "./data/baselines.json",
  "./data/mars_link.json",
  "./data/condition_cards.json",
  "./data/inventory.json",
  "./data/capabilities.json",
  "./data/regions.json",
  "./data/learn.json",
  "./data/scenarios.json",
  "./data/profiles.json",
  "./data/radiation.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  // The sensor lab (public/lab/) is a separate static page: the browser serves it, and it never replaces the cached app shell.
  if (new URL(req.url).pathname.includes("/lab/")) return;
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("./index.html", copy)); return res; })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })
        .catch(() => hit);
      return hit || net;
    }),
  );
});

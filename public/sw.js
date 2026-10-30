// Service worker shaped like a typical asset cache: activates immediately, claims open pages, and
// answers cacheable GETs (assets from the asset origin, versioned `?v=` URLs, the context call) from
// a Cache Storage cache, filling it from the network. Everything else falls through to the network.
const CACHE = "repro-cache-1";
const ASSET_HOSTS = ["localhost:4301"];
const CACHE_PATHS = ["/api/context"];

const cacheable = (request) => {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  return ASSET_HOSTS.includes(url.host) || CACHE_PATHS.includes(url.pathname) || url.searchParams.has("v");
};

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  if (!cacheable(event.request)) return;
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(event.request).then(
        (hit) =>
          hit ||
          fetch(event.request).then((res) => {
            if (res.ok) cache.put(event.request, res.clone());
            return res;
          })
      )
    )
  );
});

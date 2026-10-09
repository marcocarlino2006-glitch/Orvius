/*
  Orvius technician app: keeps its pages and scripts on the phone so a tech
  with no signal can still open today's jobs. Job data itself is saved by the
  page and always shown with the time it was saved; this only serves the shell.
*/
const PAGES = "orvius-tech-pages-v1";
const ASSETS = "orvius-tech-assets-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith("orvius-tech-") && key !== PAGES && key !== ASSETS) await caches.delete(key);
      await self.clients.claim();
    })(),
  ),
);

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) (await caches.open(ASSETS)).put(request, res.clone());
  return res;
}

async function networkFirst(request) {
  const key = request.url.split("?")[0];
  try {
    const res = await fetch(request);
    if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) (await caches.open(PAGES)).put(key, res.clone());
    return res;
  } catch (error) {
    const hit = await caches.match(key);
    if (hit) return hit;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/")) return event.respondWith(cacheFirst(request));
  if (url.pathname.startsWith("/tech/") && !url.searchParams.has("_rsc") && request.headers.get("RSC") !== "1") event.respondWith(networkFirst(request));
});

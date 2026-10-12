/* Crewbrain service worker.
 * Every path is relative to the registration scope, so the app works under any sub-path (e.g. /crewbrain/).
 * Bump VERSION whenever the app shell changes. */
const VERSION = "v2-2026-10-12-chat";
const SHELL_CACHE = `crewbrain-shell-${VERSION}`;
const RUNTIME_CACHE = `crewbrain-runtime-${VERSION}`;
const API_CACHE = `crewbrain-api-${VERSION}`;
const FONT_CACHE = "crewbrain-fonts-v1";
const KEEP = new Set([SHELL_CACHE, RUNTIME_CACHE, API_CACHE, FONT_CACHE]);

const SHELL = [
  "./",
  "index.html",
  "a.html",
  "demo.html",
  "offline.html",
  "app.css",
  "common.js",
  "owner.js",
  "owner-cards.js",
  "agent.js",
  "voice.js",
  "pwa.js",
  "manifest.webmanifest",
  "icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-192.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon-180.png",
  "icons/favicon-32.png",
  "icons/favicon.svg",
];

const NAV_TIMEOUT_MS = 3000;
const scopeURL = () => new URL(self.registration.scope);
const abs = (p) => new URL(p, self.registration.scope).href;

// Path relative to the scope, e.g. "api/agents/x/history" (no leading slash).
function relPath(url) {
  const scopePath = scopeURL().pathname;
  return url.pathname.startsWith(scopePath) ? url.pathname.slice(scopePath.length) : null;
}

const API_GET_PATTERNS = [
  /^api\/me$/,
  /^api\/brain$/,
  /^api\/agents$/,
  /^api\/inbox$/,
  /^api\/creator\/log$/,
  /^api\/agents\/[^/]+\/public$/,
  /^api\/agents\/[^/]+\/history$/,
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Cache each file on its own so one missing file never breaks the install.
    await Promise.all(SHELL.map(async (p) => {
      try {
        const res = await fetch(new Request(abs(p), { cache: "reload", credentials: "same-origin" }));
        if (res.ok) await cache.put(abs(p), res);
      } catch (_) { /* ignore */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const hadOld = names.some((n) => n.startsWith("crewbrain-") && !KEEP.has(n));
    await Promise.all(names.filter((n) => n.startsWith("crewbrain-") && !KEEP.has(n)).map((n) => caches.delete(n)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) { /* ignore */ }
    }
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of clients) c.postMessage({ type: "crewbrain:sw-activated", version: VERSION, updated: hadOld });
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "crewbrain:skip-waiting") self.skipWaiting();
  if (event.data && event.data.type === "crewbrain:version" && event.source) {
    event.source.postMessage({ type: "crewbrain:version", version: VERSION });
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never touch POST/PUT/DELETE
  const url = new URL(req.url);

  // Google Fonts: cache-first-ish (stale-while-revalidate) in a long-lived cache.
  if (url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(event, req, FONT_CACHE));
    return;
  }
  if (url.origin !== self.location.origin) return;

  const rel = relPath(url);
  if (rel === null) return; // outside our scope

  if (rel.startsWith("api/")) {
    if (rel.startsWith("api/voice/")) return; // never cache voice
    if (API_GET_PATTERNS.some((re) => re.test(rel))) event.respondWith(apiNetworkFirst(req));
    return; // other API GETs: straight to network
  }

  if (req.mode === "navigate") {
    event.respondWith(navigationNetworkFirst(event, req));
    return;
  }

  if (rel === "sw.js") return;
  event.respondWith(staleWhileRevalidate(event, req, RUNTIME_CACHE));
});

async function navigationNetworkFirst(event, req) {
  const cache = await caches.open(SHELL_CACHE);
  const network = (async () => {
    const preload = await event.preloadResponse;
    const res = preload || await fetch(req);
    if (res && res.ok && res.type === "basic") {
      // Store under the URL without the hash; query kept (a.html?id=… also matches via ignoreSearch below).
      cache.put(req.url.split("#")[0], res.clone()).catch(() => {});
    }
    return res;
  })();
  event.waitUntil(network.catch(() => {}));

  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), NAV_TIMEOUT_MS); });
  try {
    const res = await Promise.race([network, timeout]);
    clearTimeout(timer);
    if (res) return res;
  } catch (_) {
    clearTimeout(timer);
  }
  const cached = await cachedNavigation(req);
  if (cached) return cached;
  // Slow network and nothing cached: keep waiting for the network, else offline page.
  try { return await network; } catch (_) { /* fall through */ }
  return (await caches.match(abs("offline.html"))) ||
    new Response("<h1>You're offline</h1>", { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function cachedNavigation(req) {
  const url = new URL(req.url);
  url.hash = "";
  const exact = await caches.match(url.href);
  if (exact) return exact;
  const rel = relPath(url) || "";
  // Same page with a different query (a.html?id=other) still gives the shell.
  const loose = await caches.match(url.href, { ignoreSearch: true });
  if (loose) return loose;
  if (rel === "" || rel === "index.html") {
    return (await caches.match(abs("index.html"))) || (await caches.match(abs("./")));
  }
  return null;
}

async function staleWhileRevalidate(event, req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = (await cache.match(req)) || (await caches.match(req, { ignoreSearch: true }));
  const network = fetch(req).then((res) => {
    if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()).catch(() => {});
    return res;
  });
  if (cached) {
    event.waitUntil(network.catch(() => {}));
    return cached;
  }
  try {
    return await network;
  } catch (_) {
    return new Response("", { status: 504, statusText: "Offline" });
  }
}

async function apiNetworkFirst(req) {
  const cache = await caches.open(API_CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (_) {
    const cached = await cache.match(req);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set("X-Crewbrain-Offline", "1");
      const body = await cached.blob();
      return new Response(body, { status: cached.status, statusText: cached.statusText, headers });
    }
    return new Response(JSON.stringify({ error: "offline", offline: true }), {
      status: 503,
      headers: { "Content-Type": "application/json", "X-Crewbrain-Offline": "1" },
    });
  }
}

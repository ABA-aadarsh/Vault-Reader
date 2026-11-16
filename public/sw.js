/**
 * Service worker (module). Caching policy lives in `sw-policy.js`.
 */

import {
  CACHE_PREFIX,
  SHELL_CACHE,
  RUNTIME_CACHE,
  BOOKS_CACHE,
  PRECACHE_URLS,
  MAX_RUNTIME_ENTRIES,
  assetUrlsFromHtml,
  classifyRequest,
  isCacheableResponse,
  isNavigationRequest,
  navigationFallbackPaths,
  stripHash,
} from "./sw-policy.js";

const DOCUMENT_REQUEST_INIT = {
  headers: { accept: "text/html,application/xhtml+xml" },
};

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith(CACHE_PREFIX) &&
              key !== SHELL_CACHE &&
              key !== RUNTIME_CACHE &&
              key !== BOOKS_CACHE,
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data ?? {};

  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (data.type === "WARM_ROUTE" && typeof data.url === "string") {
    const assets = Array.isArray(data.assets)
      ? data.assets.filter((asset) => typeof asset === "string")
      : [];
    event.waitUntil(warmRoute(data.url, assets));
    return;
  }

  if (data.type === "REMOVE_BOOK_ROUTE" && typeof data.url === "string") {
    event.waitUntil(unwarmRoute(data.url));
  }
});

/** Cache a book route and its chunks so a downloaded book opens offline. */
async function warmRoute(path, extraAssets = []) {
  try {
    const response = await fetch(
      new Request(path, { ...DOCUMENT_REQUEST_INIT, cache: "reload" }),
    );
    if (!isCacheableResponse(response, { ignoreNoStore: true })) {
      console.warn("[SW] warmRoute: uncacheable response", path, response.status);
      return;
    }

    const html = await response.clone().text();
    const cache = await caches.open(BOOKS_CACHE);

    // Stored under the plain URL; navigation fallback matches with `ignoreVary`.
    await cache.put(new Request(path), response);

    const assets = new Set([...assetUrlsFromHtml(html), ...extraAssets]);
    await Promise.allSettled(
      [...assets].map(async (url) => {
        if (await cache.match(url)) return;
        const assetResponse = await fetch(url);
        if (!isCacheableResponse(assetResponse, { ignoreNoStore: true })) return;
        await cache.put(new Request(url), assetResponse);
      }),
    );

    if (!(await cache.match(new Request(path), { ignoreVary: true }))) {
      console.warn("[SW] warmRoute: route did not stay cached", path);
    }
  } catch (error) {
    console.warn("[SW] warmRoute failed", path, error);
  }
}

/** Drop a book's cached route; its chunks may be shared with other routes. */
async function unwarmRoute(path) {
  try {
    const cache = await caches.open(BOOKS_CACHE);
    const target = new URL(path, self.location.origin).href;
    const keys = await cache.keys();
    await Promise.all(
      keys.filter((key) => key.url === target).map((key) => cache.delete(key)),
    );
  } catch (error) {
    console.warn("[SW] unwarmRoute failed", path, error);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const strategy = classifyRequest(request, self.location.origin);

  if (strategy === "network-only") return;

  if (isNavigationRequest(request)) {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (strategy === "cache-first") {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (isCacheableResponse(response, { ignoreNoStore: true })) {
      await putInRuntime(request, response.clone());
    }
    return response;
  } catch {
    return offlineUnavailable(request);
  }
}

async function networkFirst(request) {
  const sameOrigin = new URL(request.url).origin === self.location.origin;

  try {
    const response = await fetch(request);
    if (isCacheableResponse(response, { ignoreNoStore: sameOrigin })) {
      await putInRuntime(request, response.clone());
    }
    return response;
  } catch {
    // No `ignoreVary`: an RSC payload must never be served as a document.
    const cached = await caches.match(request);
    if (cached) return cached;

    if (request.mode === "navigate") return handleNavigation(request);
    return offlineUnavailable(request);
  }
}

async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    if (isCacheableResponse(response, { ignoreNoStore: true })) {
      await putInRuntime(request, response.clone());
    }
    return response;
  } catch {
    // Safe here: only document-shaped fetches are stored under these URLs.
    const exact = await caches.match(request, { ignoreVary: true });
    if (exact) return exact;

    let pathname = "/";
    try {
      pathname = new URL(request.url).pathname;
    } catch {
      // Keep the default.
    }

    for (const fallbackPath of navigationFallbackPaths(pathname)) {
      const cached = await caches.match(fallbackPath, { ignoreVary: true });
      if (cached) return cached;
    }

    return offlineUnavailable(request);
  }
}

async function putInRuntime(request, response) {
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(new Request(stripHash(request.url)), response);
    await trimCache(cache);
  } catch (error) {
    console.warn("[SW] cache write failed", request.url, error);
  }
}

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_RUNTIME_ENTRIES) return;
  const excess = keys.length - MAX_RUNTIME_ENTRIES;
  for (const key of keys.slice(0, excess)) {
    await cache.delete(key);
  }
}

function offlineUnavailable(request) {
  if (request.mode === "navigate") {
    return new Response(
      "<!doctype html><meta charset=\"utf-8\"><title>Offline</title><p>You are offline.</p>",
      { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
  return new Response("Offline — resource not available", {
    status: 503,
    statusText: "Offline",
  });
}

async function precache() {
  const cache = await caches.open(SHELL_CACHE);

  // One bad URL must not abort install.
  await Promise.allSettled(
    PRECACHE_URLS.map(async (url) => {
      if (await cache.match(url)) return;

      const response = await fetch(new Request(url, { ...DOCUMENT_REQUEST_INIT, cache: "reload" }));
      if (!isCacheableResponse(response, { ignoreNoStore: true })) {
        console.warn("[SW] precache: uncacheable response", url, response.status);
        return;
      }

      // Clone first: `cache.put` consumes the body.
      const bodyCopy = response.clone();
      await cache.put(new Request(url), response);

      // A document without its chunks is a blank page offline.
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html")) return;

      const html = await bodyCopy.text();
      await Promise.allSettled(
        assetUrlsFromHtml(html).map(async (assetUrl) => {
          if (await cache.match(assetUrl)) return;
          const assetResponse = await fetch(assetUrl);
          if (!isCacheableResponse(assetResponse, { ignoreNoStore: true })) return;
          await cache.put(new Request(assetUrl), assetResponse);
        }),
      );
    }),
  );
}

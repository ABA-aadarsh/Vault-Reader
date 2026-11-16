/** Caching policy shared by public/sw.js and tests/sw-policy.test.ts. */

/** Bump per release — clears all older vault-* caches on activate. */
export const CACHE_VERSION = "v3";

export const CACHE_PREFIX = "vault-";
export const SHELL_CACHE = `${CACHE_PREFIX}shell-${CACHE_VERSION}`;
export const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-${CACHE_VERSION}`;
/** Warmed book routes. Never trimmed, so a download stays openable offline. */
export const BOOKS_CACHE = `${CACHE_PREFIX}books-${CACHE_VERSION}`;

export const PRECACHE_URLS = [
  "/",
  "/dashboard",
  "/signin",
  "/signup",
  "/offline",
  "/logo.png",
  "/placeholder.jpeg",
];

export const MAX_RUNTIME_ENTRIES = 100;

const CACHE_FIRST_EXTENSIONS = [
  ".woff2",
  ".woff",
  ".ttf",
  ".css",
  ".js",
  ".mjs",
  ".png",
  ".jpg",
  ".jpeg",
  ".svg",
  ".ico",
  ".webp",
  ".avif",
];

export function isSupabaseHost(hostname) {
  return (
    hostname === "supabase.co" ||
    hostname.endsWith(".supabase.co") ||
    hostname.endsWith(".supabase.in")
  );
}

export function isNavigationRequest(request) {
  return request.mode === "navigate";
}

/**
 * Header-only RSC requests share the document URL, so only the `?_rsc=` marker
 * is safe to cache as its own entry.
 */
export function isRscRequest(request, url) {
  if (url.searchParams.has("_rsc")) return true;
  const header = request.headers?.get?.("RSC");
  if (header === "1") return true;
  return request.headers?.get?.("Next-Router-Prefetch") === "1";
}

export function isCacheFirstPath(pathname) {
  if (pathname.startsWith("/_next/static/")) return true;
  if (pathname.startsWith("/_next/image")) return true;
  const lower = pathname.toLowerCase();
  return CACHE_FIRST_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function navigationFallbackPaths(pathname) {
  const paths = [];
  if (pathname.startsWith("/dashboard")) paths.push("/dashboard");
  if (pathname !== "/") paths.push("/");
  paths.push("/offline");
  return paths;
}

export function classifyRequest(request, origin) {
  if (request.method !== "GET") return "network-only";

  const url = new URL(request.url);

  if (url.origin !== origin) {
    return isSupabaseHost(url.hostname) ? "network-only" : "network-first";
  }

  if (url.pathname.startsWith("/api/")) return "network-only";

  if (isNavigationRequest(request)) return "network-first";

  if (isRscRequest(request, url)) {
    return url.searchParams.has("_rsc") ? "network-first" : "network-only";
  }

  if (isCacheFirstPath(url.pathname)) return "cache-first";

  return "network-first";
}

/**
 * `ignoreNoStore` is for responses we cache deliberately (app documents, warmed
 * routes): Next sends dynamic pages as `no-store`, which is about HTTP caches,
 * not about our own offline copy.
 */
export function isCacheableResponse(response, { ignoreNoStore = false } = {}) {
  if (!response) return false;
  if (typeof response.status === "number" && response.status !== 200) return false;
  if (response.type === "opaque" || response.type === "opaqueredirect") return false;
  if (ignoreNoStore) return true;
  const cacheControl = response.headers?.get?.("cache-control") ?? "";
  if (/no-store/i.test(cacheControl)) return false;
  return true;
}

export function stripHash(url) {
  const index = url.indexOf("#");
  return index === -1 ? url : url.slice(0, index);
}

/** Extract `_next/static` URLs from a rendered document, to warm a route offline. */
export function assetUrlsFromHtml(html) {
  const urls = new Set();
  const pattern = /(?:src|href)="(\/_next\/static\/[^"?#]+)/g;
  for (const match of html.matchAll(pattern)) {
    urls.add(match[1]);
  }
  return [...urls];
}

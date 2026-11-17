import { describe, it, expect } from "vitest";

import {
  assetUrlsFromHtml,
  classifyRequest,
  isCacheableResponse,
  isCacheFirstPath,
  isRscRequest,
  isSupabaseHost,
  navigationFallbackPaths,
  BOOKS_CACHE,
  SHELL_CACHE,
  RUNTIME_CACHE,
  PRECACHE_URLS,
} from "../public/sw-policy.js";

const ORIGIN = "https://vault.example";

interface RequestLikeOptions {
  method?: string;
  mode?: string;
  headers?: Record<string, string>;
}

function makeRequest(
  path: string,
  { method = "GET", mode = "cors", headers = {} }: RequestLikeOptions = {},
) {
  const lower = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));

  return {
    method,
    url: path.startsWith("http") ? path : `${ORIGIN}${path}`,
    mode,
    headers: {
      get: (name: string) => lower.get(name.toLowerCase()) ?? null,
    },
  };
}

function makeResponse(overrides: Partial<{ status: number; type: string; cacheControl: string }> = {}) {
  const { status = 200, type = "basic", cacheControl } = overrides;
  return {
    status,
    type,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "cache-control" ? (cacheControl ?? null) : null,
    },
  };
}

describe("sw-policy — cache naming", () => {
  it("separates shell, runtime and book caches and includes the version", () => {
    expect(SHELL_CACHE).toMatch(/^vault-shell-v\d+$/);
    expect(RUNTIME_CACHE).toMatch(/^vault-runtime-v\d+$/);
    expect(BOOKS_CACHE).toMatch(/^vault-books-v\d+$/);
    expect(new Set([SHELL_CACHE, RUNTIME_CACHE, BOOKS_CACHE]).size).toBe(3);
  });

  it("precaches the app shell entry points", () => {
    expect(PRECACHE_URLS).toEqual(
      expect.arrayContaining(["/", "/library", "/offline", "/logo.png", "/placeholder.jpeg"]),
    );
  });
});

describe("sw-policy — classifyRequest", () => {
  it("serves build assets cache-first", () => {
    expect(classifyRequest(makeRequest("/_next/static/chunks/main-abc.js"), ORIGIN)).toBe("cache-first");
    expect(classifyRequest(makeRequest("/_next/static/media/pdf.worker.min.abc.mjs"), ORIGIN)).toBe("cache-first");
    expect(classifyRequest(makeRequest("/_next/static/css/app.css"), ORIGIN)).toBe("cache-first");
  });

  it("serves same-origin static files cache-first", () => {
    expect(classifyRequest(makeRequest("/logo.png"), ORIGIN)).toBe("cache-first");
    expect(classifyRequest(makeRequest("/placeholder.jpeg"), ORIGIN)).toBe("cache-first");
    expect(classifyRequest(makeRequest("/fonts/geist.woff2"), ORIGIN)).toBe("cache-first");
  });

  it("treats navigations as network-first", () => {
    expect(classifyRequest(makeRequest("/library", { mode: "navigate" }), ORIGIN)).toBe("network-first");
    expect(
      classifyRequest(makeRequest("/library/book/f1", { mode: "navigate" }), ORIGIN),
    ).toBe("network-first");
  });

  it("caches RSC payloads that carry the _rsc marker", () => {
    expect(classifyRequest(makeRequest("/library?_rsc=1abc"), ORIGIN)).toBe("network-first");
  });

  it("never caches header-only RSC requests (URL collides with the document)", () => {
    expect(
      classifyRequest(makeRequest("/library", { headers: { RSC: "1" } }), ORIGIN),
    ).toBe("network-only");
    expect(
      classifyRequest(makeRequest("/library", { headers: { "Next-Router-Prefetch": "1" } }), ORIGIN),
    ).toBe("network-only");
  });

  it("never caches Supabase traffic", () => {
    expect(
      classifyRequest(makeRequest("https://xyzcompany.supabase.co/rest/v1/books"), ORIGIN),
    ).toBe("network-only");
    expect(
      classifyRequest(makeRequest("https://xyzcompany.supabase.co/storage/v1/object/sign/x"), ORIGIN),
    ).toBe("network-only");
    expect(classifyRequest(makeRequest("https://xyzcompany.supabase.in/rest/v1/books"), ORIGIN)).toBe(
      "network-only",
    );
  });

  it("never caches our own API routes", () => {
    expect(classifyRequest(makeRequest("/api/health"), ORIGIN)).toBe("network-only");
  });

  it("never caches non-GET requests", () => {
    expect(classifyRequest(makeRequest("/library", { method: "POST" }), ORIGIN)).toBe("network-only");
    expect(classifyRequest(makeRequest("/library", { method: "DELETE" }), ORIGIN)).toBe("network-only");
  });

  it("falls back to network-first for everything else", () => {
    expect(classifyRequest(makeRequest("/library"), ORIGIN)).toBe("network-first");
    expect(
      classifyRequest(makeRequest("https://covers.openlibrary.org/b/id/1-L.jpg"), ORIGIN),
    ).toBe("network-first");
  });
});

describe("sw-policy — navigation fallbacks", () => {
  it("falls back to /library for library routes", () => {
    expect(navigationFallbackPaths("/library/book/f1")).toEqual(["/library", "/", "/offline"]);
  });

  it("skips /library for non-library routes", () => {
    expect(navigationFallbackPaths("/signin")).toEqual(["/", "/offline"]);
  });

  it("does not duplicate / and always ends at /offline", () => {
    expect(navigationFallbackPaths("/")).toEqual(["/offline"]);
    expect(navigationFallbackPaths("/library")[0]).toBe("/library");
    expect(navigationFallbackPaths("/library").at(-1)).toBe("/offline");
  });
});

describe("sw-policy — response cacheability", () => {
  it("caches only complete same-origin-ish responses", () => {
    expect(isCacheableResponse(makeResponse())).toBe(true);
    expect(isCacheableResponse(makeResponse({ status: 404 }))).toBe(false);
    expect(isCacheableResponse(makeResponse({ status: 206 }))).toBe(false);
    expect(isCacheableResponse(makeResponse({ type: "opaque" }))).toBe(false);
    expect(isCacheableResponse(makeResponse({ cacheControl: "public, no-store" }))).toBe(false);
    expect(isCacheableResponse(makeResponse({ cacheControl: "max-age=0, must-revalidate" }))).toBe(true);
  });

  // Next renders dynamic routes with `no-store`; a warmed book route must still
  // be cached, since this is our offline copy rather than an HTTP cache entry.
  it("caches no-store responses when the caller opted in", () => {
    const dynamicDocument = makeResponse({
      cacheControl: "private, no-cache, no-store, max-age=0, must-revalidate",
    });

    expect(isCacheableResponse(dynamicDocument)).toBe(false);
    expect(isCacheableResponse(dynamicDocument, { ignoreNoStore: true })).toBe(true);
  });

  it("still rejects incomplete responses when no-store is ignored", () => {
    expect(isCacheableResponse(makeResponse({ status: 500 }), { ignoreNoStore: true })).toBe(false);
    expect(isCacheableResponse(makeResponse({ type: "opaque" }), { ignoreNoStore: true })).toBe(false);
  });
});

describe("sw-policy — helpers", () => {
  it("detects cache-first paths from extensions", () => {
    expect(isCacheFirstPath("/_next/static/chunks/x.js")).toBe(true);
    expect(isCacheFirstPath("/covers/cover.PNG")).toBe(true);
    expect(isCacheFirstPath("/library")).toBe(false);
  });

  it("detects supabase hosts", () => {
    expect(isSupabaseHost("abc.supabase.co")).toBe(true);
    expect(isSupabaseHost("supabase.co")).toBe(true);
    expect(isSupabaseHost("notsupabase.co")).toBe(false);
  });

  it("detects RSC requests", () => {
    expect(isRscRequest(makeRequest("/library?_rsc=9"), new URL(`${ORIGIN}/library?_rsc=9`))).toBe(true);
    expect(isRscRequest(makeRequest("/library"), new URL(`${ORIGIN}/library`))).toBe(false);
  });

  it("extracts build assets from rendered HTML", () => {
    const html = `<!doctype html><html><head>
      <link rel="stylesheet" href="/_next/static/css/app-1.css"/>
      <script src="/_next/static/chunks/main-1.js" async></script>
    </head><body>
      <script src="/_next/static/chunks/page-1.js?ts=1"></script>
      <img src="/logo.png"/>
      <script src="https://cdn.example/x.js"></script>
    </body></html>`;

    expect(assetUrlsFromHtml(html)).toEqual([
      "/_next/static/css/app-1.css",
      "/_next/static/chunks/main-1.js",
      "/_next/static/chunks/page-1.js",
    ]);
  });
});

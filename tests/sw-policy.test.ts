import { describe, it, expect } from "vitest";

import {
  assetUrlsFromHtml,
  classifyRequest,
  isCacheableResponse,
  isCacheFirstPath,
  isRscRequest,
  isSupabaseHost,
  navigationFallbackPaths,
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
  it("separates shell and runtime caches and includes the version", () => {
    expect(SHELL_CACHE).toMatch(/^vault-shell-v\d+$/);
    expect(RUNTIME_CACHE).toMatch(/^vault-runtime-v\d+$/);
    expect(SHELL_CACHE).not.toBe(RUNTIME_CACHE);
  });

  it("precaches the app shell entry points", () => {
    expect(PRECACHE_URLS).toEqual(
      expect.arrayContaining(["/", "/dashboard", "/offline", "/logo.png", "/placeholder.jpeg"]),
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
    expect(classifyRequest(makeRequest("/dashboard", { mode: "navigate" }), ORIGIN)).toBe("network-first");
    expect(
      classifyRequest(makeRequest("/dashboard/book/f1", { mode: "navigate" }), ORIGIN),
    ).toBe("network-first");
  });

  it("caches RSC payloads that carry the _rsc marker", () => {
    expect(classifyRequest(makeRequest("/dashboard?_rsc=1abc"), ORIGIN)).toBe("network-first");
  });

  it("never caches header-only RSC requests (URL collides with the document)", () => {
    expect(
      classifyRequest(makeRequest("/dashboard", { headers: { RSC: "1" } }), ORIGIN),
    ).toBe("network-only");
    expect(
      classifyRequest(makeRequest("/dashboard", { headers: { "Next-Router-Prefetch": "1" } }), ORIGIN),
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
    expect(classifyRequest(makeRequest("/dashboard", { method: "POST" }), ORIGIN)).toBe("network-only");
    expect(classifyRequest(makeRequest("/dashboard", { method: "DELETE" }), ORIGIN)).toBe("network-only");
  });

  it("falls back to network-first for everything else", () => {
    expect(classifyRequest(makeRequest("/dashboard"), ORIGIN)).toBe("network-first");
    expect(
      classifyRequest(makeRequest("https://covers.openlibrary.org/b/id/1-L.jpg"), ORIGIN),
    ).toBe("network-first");
  });
});

describe("sw-policy — navigation fallbacks", () => {
  it("falls back to /dashboard for dashboard routes", () => {
    expect(navigationFallbackPaths("/dashboard/book/f1")).toEqual(["/dashboard", "/", "/offline"]);
  });

  it("skips /dashboard for non-dashboard routes", () => {
    expect(navigationFallbackPaths("/signin")).toEqual(["/", "/offline"]);
  });

  it("does not duplicate / and always ends at /offline", () => {
    expect(navigationFallbackPaths("/")).toEqual(["/offline"]);
    expect(navigationFallbackPaths("/dashboard")[0]).toBe("/dashboard");
    expect(navigationFallbackPaths("/dashboard").at(-1)).toBe("/offline");
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
});

describe("sw-policy — helpers", () => {
  it("detects cache-first paths from extensions", () => {
    expect(isCacheFirstPath("/_next/static/chunks/x.js")).toBe(true);
    expect(isCacheFirstPath("/covers/cover.PNG")).toBe(true);
    expect(isCacheFirstPath("/dashboard")).toBe(false);
  });

  it("detects supabase hosts", () => {
    expect(isSupabaseHost("abc.supabase.co")).toBe(true);
    expect(isSupabaseHost("supabase.co")).toBe(true);
    expect(isSupabaseHost("notsupabase.co")).toBe(false);
  });

  it("detects RSC requests", () => {
    expect(isRscRequest(makeRequest("/dashboard?_rsc=9"), new URL(`${ORIGIN}/dashboard?_rsc=9`))).toBe(true);
    expect(isRscRequest(makeRequest("/dashboard"), new URL(`${ORIGIN}/dashboard`))).toBe(false);
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

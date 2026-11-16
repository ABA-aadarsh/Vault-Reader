import { describe, it, expect, afterEach, vi } from "vitest";

import {
  getIsOnline,
  getNetworkAvailable,
  reportReachable,
  reportUnreachable,
  resetConnectivityForTests,
  subscribe,
} from "@/lib/connectivity";
import { isNetworkError } from "@/lib/network-error";

afterEach(() => {
  resetConnectivityForTests(true);
});

describe("connectivity — two-signal online state", () => {
  it("is online when the platform says so and no request has failed", () => {
    resetConnectivityForTests(true);
    expect(getIsOnline()).toBe(true);
    expect(getNetworkAvailable()).toBe(true);
  });

  it("goes offline after a network failure even though navigator.onLine is true", () => {
    resetConnectivityForTests(true);

    reportUnreachable();

    expect(getIsOnline()).toBe(false);
    // Retry loops must still be allowed to try — otherwise a failed cycle would
    // wedge the engine into never retrying.
    expect(getNetworkAvailable()).toBe(true);
  });

  it("comes back online on a successful request", () => {
    resetConnectivityForTests(true);
    reportUnreachable();

    reportReachable();

    expect(getIsOnline()).toBe(true);
  });

  it("trusts an explicit navigator-offline signal above everything else", () => {
    resetConnectivityForTests(false);

    expect(getIsOnline()).toBe(false);
    expect(getNetworkAvailable()).toBe(false);
  });

  it("notifies subscribers only when the answer changes", () => {
    resetConnectivityForTests(true);
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    reportUnreachable();
    reportUnreachable();
    expect(listener).toHaveBeenCalledTimes(1);

    reportReachable();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    reportUnreachable();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("isNetworkError", () => {
  it("recognises the browser-specific fetch failures", () => {
    // Chrome / Edge
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    // Firefox
    expect(
      isNetworkError(new TypeError("NetworkError when attempting to fetch resource.")),
    ).toBe(true);
    // Safari
    expect(isNetworkError(new TypeError("Load failed"))).toBe(true);
    // Supabase wraps the message with a pull prefix
    expect(
      isNetworkError(new Error("Failed to pull books: TypeError: NetworkError when attempting to fetch resource.")),
    ).toBe(true);
  });

  it("recognises a DOMException NetworkError by name", () => {
    expect(isNetworkError(new DOMException("nope", "NetworkError"))).toBe(true);
  });

  it("leaves real application errors alone", () => {
    expect(isNetworkError(new Error("Failed to pull books: Object not found"))).toBe(false);
    expect(isNetworkError(new Error("CAS conflict"))).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});

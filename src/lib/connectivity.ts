/**
 * Connectivity from two signals: `navigator.onLine` (fast, but lies behind
 * virtual adapters) and real request outcomes. `getIsOnline()` is the UI
 * answer; `getNetworkAvailable()` only trusts the platform so a failed cycle
 * never stops retries.
 */

type Listener = () => void;

const canReadNavigator = typeof navigator !== "undefined";

// Only an explicit `false` counts as offline: Node exposes a navigator without `onLine`.
let navigatorOnline = canReadNavigator ? navigator.onLine !== false : true;

let unreachable = false;

let bound = false;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

function syncFromNavigator(): void {
  if (!canReadNavigator) return;
  const current = navigator.onLine !== false;
  if (current !== navigatorOnline) {
    navigatorOnline = current;
    notify();
  }
}

function bind(): void {
  if (bound || typeof window === "undefined") return;
  bound = true;

  window.addEventListener("online", () => {
    navigatorOnline = true;
    unreachable = false;
    notify();
  });

  window.addEventListener("offline", () => {
    navigatorOnline = false;
    notify();
  });

  // Some platforms never fire `online`; re-read when the tab wakes up.
  window.addEventListener("focus", syncFromNavigator);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncFromNavigator();
  });
}

export function getIsOnline(): boolean {
  bind();
  return Boolean(navigatorOnline && !unreachable);
}

export function getNetworkAvailable(): boolean {
  bind();
  return Boolean(navigatorOnline);
}

export function reportReachable(): void {
  if (unreachable || !navigatorOnline) {
    unreachable = false;
    navigatorOnline = true;
    notify();
  }
}

export function reportUnreachable(): void {
  if (!unreachable) {
    unreachable = true;
    notify();
  }
}

export function subscribe(listener: Listener): () => void {
  bind();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetConnectivityForTests(online = true): void {
  navigatorOnline = online;
  unreachable = false;
  listeners.clear();
}

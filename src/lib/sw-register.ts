/**
 * Registers the service worker in production only. In dev it unregisters any
 * existing worker and clears `vault-*` caches.
 */

import { toast } from "sonner";

const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000;

const UPDATE_TOAST_ID = "sw-update-available";

let reloading = false;

export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  if (process.env.NODE_ENV !== "production") {
    void unregisterInDevelopment();
    return;
  }

  // Reload once the new worker takes control, so one page never mixes two builds.
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  }

  navigator.serviceWorker
    .register("/sw.js", { scope: "/", type: "module" })
    .then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        notifyUpdateAvailable(registration.waiting);
      }

      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;

        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            notifyUpdateAvailable(installing);
          }
        });
      });

      registration.update().catch((error) => {
        console.warn("[SW] Initial update check failed:", error);
      });

      window.setInterval(() => {
        registration.update().catch((error) => {
          console.warn("[SW] Update check failed:", error);
        });
      }, UPDATE_CHECK_INTERVAL_MS);

      window.addEventListener("focus", () => {
        registration.update().catch(() => undefined);
      });
    })
    .catch((error) => {
      console.error("[SW] Registration failed:", error);
    });
}

function notifyUpdateAvailable(worker: ServiceWorker): void {
  toast("New version available", {
    id: UPDATE_TOAST_ID,
    description: "Reload to apply the update.",
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: "Reload",
      onClick: () => {
        worker.postMessage({ type: "SKIP_WAITING" });
        // Fallback if `controllerchange` never fires.
        window.setTimeout(() => {
          if (!reloading) {
            reloading = true;
            window.location.reload();
          }
        }, 1000);
      },
    },
  });
}

async function unregisterInDevelopment(): Promise<void> {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));

    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith("vault-")).map((key) => caches.delete(key)),
      );
    }
  } catch (error) {
    console.warn("[SW] Dev cleanup failed:", error);
  }
}

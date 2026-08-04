import { getDb } from "@/lib/dexie/db";
import { pushOutbox } from "@/features/sync/push";
import { pullFromCloud } from "@/features/sync/pull";
import { planCoverDownloads } from "@/features/sync/filePlanner";
import { getPendingCount } from "@/lib/outbox";
import AuthAPI from "@/features/supabase/auth/auth.service";

const INTERVAL_MS = 60_000;
const DEBOUNCE_MS = 500;

export type SyncEngineStatus = "idle" | "syncing" | "paused" | "error";

export interface SyncState {
  status: SyncEngineStatus;
  pendingCount: number;
  conflictCount: number;
  lastSyncedAt: number | null;
  lastError: string | null;
}

interface LastCycleMetrics {
  at: number;
  durationMs: number;
  pushed: number;
  pulled: number;
  failed: number;
}

type Listener = () => void;

class SyncEngine {
  private running = false;
  private pending = false;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  private boundOnline: () => void;
  private boundOffline: () => void;
  private boundVisibility: () => void;
  private boundFocus: () => void;

  private state: SyncState = {
    status: "idle",
    pendingCount: 0,
    conflictCount: 0,
    lastSyncedAt: null,
    lastError: null,
  };

  private listeners = new Set<Listener>();

  constructor() {
    this.boundOnline = this.handleOnline.bind(this);
    this.boundOffline = this.handleOffline.bind(this);
    this.boundVisibility = this.handleVisibility.bind(this);
    this.boundFocus = this.handleFocus.bind(this);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): SyncState {
    return this.state;
  }

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private setState(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;

    window.addEventListener("online", this.boundOnline);
    window.addEventListener("offline", this.boundOffline);
    document.addEventListener("visibilitychange", this.boundVisibility);
    window.addEventListener("focus", this.boundFocus);

    if (!document.hidden) {
      this.startInterval();
    }

    this.refreshPendingCount();
    this.runCycle();
  }

  destroy() {
    if (!this.initialized) return;
    this.initialized = false;

    window.removeEventListener("online", this.boundOnline);
    window.removeEventListener("offline", this.boundOffline);
    document.removeEventListener("visibilitychange", this.boundVisibility);
    window.removeEventListener("focus", this.boundFocus);

    this.stopInterval();
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }

    this.setState({ status: "idle" });
  }

  scheduleSync() {
    if (!this.initialized) return;
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      this.runCycle();
    }, DEBOUNCE_MS);
  }

  async runCycle(): Promise<void> {
    if (this.running) {
      this.pending = true;
      return;
    }

    this.running = true;
    this.setState({ status: "syncing" });

    const startedAt = Date.now();

    try {
      if (!navigator.onLine) {
        this.setState({ status: "idle" });
        return;
      }

      const user = await AuthAPI.getCurrentUser();
      if (!user) {
        this.setState({ status: "paused", lastError: "No authenticated user" });
        return;
      }

      const db = getDb();

      const pushResult = await pushOutbox(db, user.id);

      if (pushResult.paused) {
        this.setState({
          status: "paused",
          lastError: "Authentication required — sync paused",
        });
        return;
      }

      const pullResult = await pullFromCloud(db, user.id);
      await planCoverDownloads(db, user.id);

      const totalPulled = pullResult.books + pullResult.notes;
      const durationMs = Date.now() - startedAt;

      const metrics: LastCycleMetrics = {
        at: Date.now(),
        durationMs,
        pushed: pushResult.pushed,
        pulled: totalPulled,
        failed: pushResult.failed,
      };

      await db.syncState.put({ key: "lastCycle", value: metrics });

      const hasMore = pullResult.hasMoreBooks || pullResult.hasMoreNotes;
      const madeProgress = pullResult.books > 0 || pullResult.notes > 0;

      this.setState({
        status: pushResult.failed > 0 ? "error" : "idle",
        lastSyncedAt: Date.now(),
        lastError: pushResult.failed > 0 ? `${pushResult.failed} item(s) failed` : null,
      });

      await this.refreshPendingCount();

      if (hasMore && madeProgress) {
        this.pending = true;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[SyncEngine] Cycle failed:", message);
      this.setState({
        status: "error",
        lastError: message,
      });
    } finally {
      this.running = false;

      if (this.pending) {
        this.pending = false;
        this.runCycle();
      }
    }
  }

  private async refreshPendingCount() {
    try {
      const db = getDb();
      const count = await getPendingCount(db);
      const conflictCount = await db.conflicts.where("status").equals("open").count();
      this.setState({ pendingCount: count, conflictCount });
    } catch {
      // DB may not be open yet
    }
  }

  private handleOnline() {
    this.scheduleSync();
  }

  private handleOffline() {
    if (this.state.status !== "error") {
      this.setState({ status: "idle" });
    }
  }

  private handleVisibility() {
    if (document.hidden) {
      this.stopInterval();
    } else {
      this.runCycle();
      this.startInterval();
    }
  }

  private handleFocus() {
    if (!document.hidden) {
      this.scheduleSync();
    }
  }

  private startInterval() {
    this.stopInterval();
    this.intervalTimer = setInterval(() => {
      this.runCycle();
    }, INTERVAL_MS);
  }

  private stopInterval() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }
}

export const engine = new SyncEngine();

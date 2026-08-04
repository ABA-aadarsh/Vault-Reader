"use client";

import { useSyncExternalStore } from "react";
import { engine, type SyncState } from "./SyncEngine";

function getSnapshot(): SyncState {
  return engine.getState();
}

function getServerSnapshot(): SyncState {
  return {
    status: "idle",
    pendingCount: 0,
    conflictCount: 0,
    lastSyncedAt: null,
    lastError: null,
  };
}

export function useSyncStatus(): SyncState {
  return useSyncExternalStore(engine.subscribe.bind(engine), getSnapshot, getServerSnapshot);
}

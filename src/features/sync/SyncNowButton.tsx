"use client";

import { useSyncStatus } from "./useSyncStatus";
import { engine } from "./SyncEngine";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SyncNowButton() {
  const { status } = useSyncStatus();
  const isOffline = typeof navigator !== "undefined" ? !navigator.onLine : false;
  const isSyncing = status === "syncing";
  const isPaused = status === "paused";

  const handleClick = () => {
    if (isSyncing || isOffline) return;
    engine.runCycle();
  };

  const disabled = isSyncing || isOffline || isPaused;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      disabled={disabled}
      className="h-7 px-2 text-xs text-muted-foreground gap-1.5"
      title={isOffline ? "Offline" : isPaused ? "Re-authenticate to sync" : isSyncing ? "Syncing..." : "Sync now"}
    >
      <RefreshCw className={`w-3 h-3 ${isSyncing ? "animate-spin" : ""}`} />
      <span>Sync now</span>
    </Button>
  );
}

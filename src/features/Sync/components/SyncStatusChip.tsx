"use client";

import { useSyncStatus } from "../hooks/useSyncStatus";
import { WifiOff, RefreshCw, AlertTriangle, Cloud, CheckCircle2, LogIn } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online-status";

export function SyncStatusChip() {
  const { status, pendingCount, conflictCount, lastError } = useSyncStatus();
  const isOnline = useOnlineStatus();
  const isOffline = !isOnline;

  let label: string;
  let icon: React.ReactNode;
  let className: string;
  let clickable = false;

  // Offline outranks "error": a connectivity failure is not a sync bug.
  if (conflictCount > 0) {
    label = `Conflicts(${conflictCount})`;
    icon = <AlertTriangle className="w-3 h-3" />;
    className = "bg-amber-500/10 text-amber-600 border-amber-500/20 cursor-pointer hover:bg-amber-500/20 transition-colors";
    clickable = true;
  } else if (isOffline) {
    label = pendingCount > 0 ? `Offline · ${pendingCount} queued` : "Offline";
    icon = <WifiOff className="w-3 h-3" />;
    className = "bg-muted text-muted-foreground border-border";
  } else if (status === "error") {
    label = "Error";
    icon = <AlertTriangle className="w-3 h-3" />;
    className = "bg-destructive/10 text-destructive border-destructive/20";
  } else if (status === "syncing") {
    label = "Syncing";
    icon = <RefreshCw className="w-3 h-3 animate-spin" />;
    className = "bg-primary/10 text-primary border-primary/20";
  } else if (status === "paused") {
    label = "Re-auth required";
    icon = <LogIn className="w-3 h-3" />;
    className = "bg-amber-500/10 text-amber-600 border-amber-500/20";
  } else if (pendingCount > 0) {
    label = `Pending(${pendingCount})`;
    icon = <Cloud className="w-3 h-3" />;
    className = "bg-primary/10 text-primary border-primary/20";
  } else {
    label = "Synced";
    icon = <CheckCircle2 className="w-3 h-3" />;
    className = "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
  }

  function handleClick() {
    if (clickable) {
      window.dispatchEvent(new CustomEvent("open-conflict-inbox"));
    }
  }

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border ${className}`}
      onClick={handleClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={lastError ?? undefined}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}

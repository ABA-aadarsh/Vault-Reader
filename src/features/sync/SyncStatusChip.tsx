"use client";

import { useSyncStatus } from "./useSyncStatus";
import { WifiOff, RefreshCw, AlertTriangle, Cloud, CheckCircle2, LogIn } from "lucide-react";

export function SyncStatusChip() {
  const { status, pendingCount, conflictCount } = useSyncStatus();
  const isOffline = typeof navigator !== "undefined" ? !navigator.onLine : false;

  let label: string;
  let icon: React.ReactNode;
  let className: string;

  if (status === "error") {
    label = "Error";
    icon = <AlertTriangle className="w-3 h-3" />;
    className = "bg-destructive/10 text-destructive border-destructive/20";
  } else if (conflictCount > 0) {
    label = `Conflicts(${conflictCount})`;
    icon = <AlertTriangle className="w-3 h-3" />;
    className = "bg-amber-500/10 text-amber-600 border-amber-500/20";
  } else if (status === "syncing") {
    label = "Syncing";
    icon = <RefreshCw className="w-3 h-3 animate-spin" />;
    className = "bg-primary/10 text-primary border-primary/20";
  } else if (pendingCount > 0) {
    label = `Pending(${pendingCount})`;
    icon = <Cloud className="w-3 h-3" />;
    className = "bg-primary/10 text-primary border-primary/20";
  } else if (status === "paused") {
    label = "Re-auth required";
    icon = <LogIn className="w-3 h-3" />;
    className = "bg-amber-500/10 text-amber-600 border-amber-500/20";
  } else if (isOffline) {
    label = "Offline";
    icon = <WifiOff className="w-3 h-3" />;
    className = "bg-muted text-muted-foreground border-border";
  } else {
    label = "Synced";
    icon = <CheckCircle2 className="w-3 h-3" />;
    className = "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
  }

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border ${className}`}>
      {icon}
      <span>{label}</span>
    </div>
  );
}

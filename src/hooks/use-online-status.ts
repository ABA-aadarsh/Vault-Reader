"use client";

import { useSyncExternalStore } from "react";
import { getIsOnline, subscribe } from "@/lib/connectivity";

// Assume online on the server so hydration is stable.
const getServerSnapshot = (): boolean => true;

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getIsOnline, getServerSnapshot);
}

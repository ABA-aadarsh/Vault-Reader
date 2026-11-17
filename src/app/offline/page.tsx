"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { WifiOff, RotateCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Served by the service worker when a navigation is in neither network nor
 * cache. Must stay prerenderable: no auth, no data fetching, no route params.
 */
export default function OfflinePage() {
  const [online, setOnline] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center text-foreground">
      <WifiOff className="h-12 w-12 text-muted-foreground" />

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">You&apos;re offline</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          This page wasn&apos;t saved for offline use. Your library, notes and
          downloaded books still work — open the app to keep reading.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={() => window.location.reload()} className="cursor-pointer">
          <RotateCw className="mr-2 h-4 w-4" />
          Try again
        </Button>
        <Link href="/library" className={buttonVariants({ variant: "outline" })}>
          Open library
        </Link>
      </div>

      <p className="text-xs text-muted-foreground">
        {online ? "You're back online." : "Waiting for a connection…"}
      </p>
    </div>
  );
}

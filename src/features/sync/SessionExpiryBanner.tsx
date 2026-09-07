"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/features/supabase";
import { useAuth } from "@/features/supabase/auth/components/RequireAuth";

export function SessionExpiryBanner() {
  const router = useRouter();
  const { fromCache, sessionExpired } = useAuth();
  const [signingIn, setSigningIn] = useState(false);

  if (!fromCache && !sessionExpired) return null;

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        return;
      }
    } catch {
      // ignore — fall through to sign-in
    }
    router.push("/signin");
  };

  return (
    <div className="bg-amber-500 text-amber-50 flex items-center justify-between gap-3 px-4 py-2 text-sm">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>Session expired — sign in to sync &amp; download PDFs</span>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleSignIn}
        disabled={signingIn}
        className="shrink-0"
      >
        {signingIn ? "Checking..." : "Sign in"}
      </Button>
    </div>
  );
}

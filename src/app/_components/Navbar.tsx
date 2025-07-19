"use client";

import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";

export const Navbar = () => {
  return (
    <header className="w-full border-b border-border bg-background text-foreground">
      <div className="max-w-6xl mx-auto h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Logo / App Name */}
        <Link href="/" className="text-lg font-semibold tracking-tight hover:opacity-90 transition-opacity">
          Vault Reader
        </Link>

        {/* Navigation Links */}
        <nav className="flex items-center gap-2 text-sm font-medium">
          <Link href="/signin" className="px-3 py-1.5 rounded-md hover:bg-muted transition-colors">
            Sign In
          </Link>
          <Link href="/signup" className={buttonVariants({ variant: "default" })}>
            Sign Up
          </Link>
        </nav>
      </div>
    </header>
  );
};

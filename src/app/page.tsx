import Link from "next/link";
import { Navbar } from "../components/shared/Navbar";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground font-sans flex flex-col scroll-smooth">
      <Navbar />

      {/* Header / Hero Section */}
      <section className="flex flex-1 items-center justify-center px-6 py-20">
        <div className="max-w-3xl text-center space-y-6">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">Your Personal Library. Anywhere.</h1>
          <p className="text-lg md:text-xl text-muted-foreground">
            A cross-platform, offline-first book management system that syncs automatically and just works — simple, fast, and
            distraction-free.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
            <Link href={"/signup"} className={buttonVariants({ variant: "default", size: "lg", className: "py-8 text-xl" })}>
              Getting Started
            </Link>
            <Link href={"#features"} className={buttonVariants({ variant: "secondary", size: "lg", className: "py-8 text-xl" })}>
              Explore Features
            </Link>
          </div>
        </div>
      </section>

      {/* Preview / Screenshot */}
      <section className="px-6 mt-8 flex justify-center">
        <div className="w-full max-w-5xl rounded-lg overflow-hidden bg-card shadow-md border border-border">
          <div className="aspect-video flex items-center justify-center text-muted-foreground text-sm sm:text-base bg-muted/30">
            App Preview Placeholder
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="px-6 mt-20 max-w-5xl mx-auto grid gap-12 sm:grid-cols-3 text-center scroll-mt-8">
        <div>
          <h3 className="text-lg font-medium mb-2 text-foreground">Offline-First</h3>
          <p className="text-muted-foreground text-sm">Manage sessions without needing an internet connection. Syncs later.</p>
        </div>
        <div>
          <h3 className="text-lg font-medium mb-2 text-foreground">Cross-Platform</h3>
          <p className="text-muted-foreground text-sm">Available on web, desktop, and mobile. Your data, wherever you are.</p>
        </div>
        <div>
          <h3 className="text-lg font-medium mb-2 text-foreground">Minimal Design</h3>
          <p className="text-muted-foreground text-sm">Clean, distraction-free interface. Inspired by GNOME’s Adwaita style.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-24 border-t border-border bg-card/50">
        <div className="max-w-5xl mx-auto px-6 py-12">
          <div className="grid gap-10 sm:grid-cols-3">
            {/* Brand */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded overflow-hidden bg-secondary relative flex-shrink-0">
                  <span className="flex items-center justify-center h-full w-full text-[10px] font-semibold text-foreground/70">
                    V
                  </span>
                </span>
                <span className="font-semibold">Vault Reader</span>
              </div>
              <p className="text-sm text-muted-foreground max-w-xs">
                A cross-platform, offline-first book management system that syncs automatically and just works.
              </p>
            </div>

            {/* Quick Links */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Quick Links</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href={"/signup"} className="hover:text-foreground transition-colors">
                    Getting Started
                  </Link>
                </li>
                <li>
                  <Link href={"/signin"} className="hover:text-foreground transition-colors">
                    Sign In
                  </Link>
                </li>
                <li>
                  <Link href={"#features"} className="hover:text-foreground transition-colors">
                    Features
                  </Link>
                </li>
              </ul>
            </div>

            {/* Features */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Features</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>Offline-First</li>
                <li>Cross-Platform</li>
                <li>Minimal Design</li>
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-border text-center text-sm text-muted-foreground">
            Made with <span>❤</span> for readers. Fully open-source.
          </div>
        </div>
      </footer>
    </main>
  );
}

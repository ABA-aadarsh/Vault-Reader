import Link from "next/link";
import { Navbar } from "./_components/Navbar";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground font-sans flex flex-col">
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
            <Link href={"/started"} className={buttonVariants({ variant: "default", size: "lg", className: "py-8 text-xl" })}>
              Getting Started
            </Link>
            <Link href={"/started"} className={buttonVariants({ variant: "secondary", size: "lg", className: "py-8 text-xl" })}>
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
      <section className="px-6 mt-20 max-w-5xl mx-auto grid gap-12 sm:grid-cols-3 text-center">
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
      <footer className="mt-24 mb-12 text-center text-sm text-muted-foreground">
        Made with ❤️ for readers. Fully open-source.
      </footer>
    </main>
  );
}

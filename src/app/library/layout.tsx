"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "../../components/shared/SidebarContainer";
import { SearchLauncherProvider, SearchLauncher } from "@/features/Search";

import { RequireAuth, useAuth, SessionExpiryBanner } from "@/features/Auth";
import { BookAddProvider, RecentlyDeletedSheet } from "@/features/Books";
import { UserDbProvider } from "@/data/dexie";
import { ConflictInbox } from "@/features/Sync";

function LibraryContent({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // The reader has its own page-thumbnail rail in place of the app sidebar.
  const isReader = useSelectedLayoutSegment() === "book";

  return (
    <UserDbProvider userId={user.id}>
      <SessionExpiryBanner />
      <SearchLauncherProvider>
        <BookAddProvider>
          <SidebarProvider>
            {!isReader && <AppSidebar />}
            <SidebarInset className="min-w-0 overflow-hidden">
              <main className="min-w-0 flex-1 overflow-hidden">
                {children}
              </main>
            </SidebarInset>
          </SidebarProvider>
        </BookAddProvider>
        <SearchLauncher />
        <ConflictInbox />
        <RecentlyDeletedSheet />
      </SearchLauncherProvider>
    </UserDbProvider>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <RequireAuth>
      <LibraryContent>{children}</LibraryContent>
    </RequireAuth>
  );
}


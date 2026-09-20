"use client";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "../../components/shared/SidebarContainer";
import { SearchLauncherProvider, SearchLauncher } from "@/features/Search";
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css'

import { RequireAuth, useAuth, SessionExpiryBanner } from "@/features/Auth";
import { BookAddProvider, RecentlyDeletedSheet } from "@/features/Books";
import { UserDbProvider } from "@/data/dexie";
import { ConflictInbox } from "@/features/Sync";

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  return (
    <UserDbProvider userId={user.id}>
      <SessionExpiryBanner />
      <SearchLauncherProvider>
        <BookAddProvider>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <main className="flex-1">
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
      <DashboardContent>{children}</DashboardContent>
    </RequireAuth>
  );
}


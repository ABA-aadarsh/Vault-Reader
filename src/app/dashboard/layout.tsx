"use client";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "../../components/shared/SidebarContainer";
import { SearchLauncherProvider } from "@/features/Search/provider/SearchLauncherProvider";
import { SearchLauncher } from "@/features/Search/components/SearchLauncher";
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css'

import {RequireAuth, useAuth} from "@/features/supabase/auth/components/RequireAuth";
import { BookAddProvider } from "@/features/Books/provider/BookDropAddProvider";
import { UserDbProvider } from "@/lib/dexie/db";
import { ConflictInbox } from "@/features/sync/ConflictInbox";
import { RecentlyDeletedSheet } from "@/features/Books/_components/RecentlyDeletedSheet";
import { SessionExpiryBanner } from "@/features/sync/SessionExpiryBanner";

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

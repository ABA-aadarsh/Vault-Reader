"use client";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "../../components/shared/SidebarContainer";
import { SearchLauncherProvider } from "@/features/Search/provider/SearchLauncherProvider";
import { SearchLauncher } from "@/features/Search/components/SearchLauncher";
// Import CSS files for React-PDF
//@ts-ignore
import 'react-pdf/dist/Page/AnnotationLayer.css';
//@ts-ignore
import 'react-pdf/dist/Page/TextLayer.css'

import {RequireAuth, useAuth} from "@/features/supabase/auth/components/RequireAuth";
import { BookAddProvider } from "@/features/Books/provider/BookDropAddProvider";
import { UserDbProvider } from "@/lib/dexie/db";

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  return (
    <UserDbProvider userId={user.id}>
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

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./_components/SidebarContainer";
import { SearchLauncherProvider } from "@/features/Search/provider/SearchLauncherProvider";
import { SearchLauncher } from "@/features/Search/components/SearchLauncher";
import RequireAuth from "@/features/auth/RequireAuth";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <RequireAuth>
       <SearchLauncherProvider>
      <SidebarProvider>
        <main>
          <AppSidebar />
          {children}
        </main>
      </SidebarProvider>
      <SearchLauncher/>
    </SearchLauncherProvider>
    </RequireAuth>
   
  );
}

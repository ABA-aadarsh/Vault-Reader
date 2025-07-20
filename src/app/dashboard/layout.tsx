import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./_components/SidebarContainer";
import { SearchLauncherProvider } from "@/features/Search/provider/SearchLauncherProvider";
import { SearchLauncher } from "@/features/Search/components/SearchLauncher";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SearchLauncherProvider>
      <SidebarProvider>
        <main>
          <AppSidebar />
          {children}
        </main>
      </SidebarProvider>
      <SearchLauncher/>
    </SearchLauncherProvider>
  );
}

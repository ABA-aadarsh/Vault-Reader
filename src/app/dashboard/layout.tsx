import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "./_components/SidebarContainer";
import { SearchLauncherProvider } from "@/features/Search/provider/SearchLauncherProvider";
import { SearchLauncher } from "@/features/Search/components/SearchLauncher";
// Import CSS files for React-PDF
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SearchLauncherProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <main className="flex-1">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
      <SearchLauncher />
    </SearchLauncherProvider>
  );
}
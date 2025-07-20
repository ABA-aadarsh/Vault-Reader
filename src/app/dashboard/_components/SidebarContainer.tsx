"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button, buttonVariants } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Image from "next/image";
import { PanelLeftClose, Search, Star} from "lucide-react";
import { useSearchLauncher } from "@/features/Search/provider/SearchLauncherProvider";

const mockPdfs = [
  { id: "1", title: "Compiler Design.pdf", isFavorite: true },
  { id: "2", title: "Introduction to AI.pdf", isFavorite: false },
  { id: "3", title: "Computer Networks.pdf", isFavorite: true },
  { id: "4", title: "Microprocessors.pdf", isFavorite: false },
  { id: "5", title: "Data Mining.pdf", isFavorite: false },
];

export function AppSidebar() {
  const {toggleSidebar} = useSidebar()
  const {onOpen: onSearchLauncherOpen} = useSearchLauncher()
  return (
    <Sidebar className="min-h-screen border-r border-border bg-card text-foreground flex flex-col">
      {/* Header with logo and close button */}
      <SidebarHeader className="flex items-center flex-row justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-secondary rounded overflow-hidden relative">
            <Image
              src="/logo.png"
              alt="V"
              className="object-cover"
              fill
            />
          </div>
          <span className="font-semibold text-lg">Vault Reader</span>
        </div>
        <Button size="icon" variant="ghost" className="text-muted-foreground cursor-pointer"
          onClick={toggleSidebar}
        >
          <PanelLeftClose size={20} />
        </Button>
      </SidebarHeader>

      {/* Content */}
      <SidebarContent className="flex-1 p-4">
        {/* Search */}
        <div className="mb-4">
          <Button onClick={onSearchLauncherOpen} asChild>
            <div className={buttonVariants({
              variant: "secondary",
              size: "lg",
              className: "w-full !justify-between !px-2"
            })}>
              <div className="flex items-center gap-2">
                <Search/>
                <span>Search</span>
              </div>
              <div className="hidden sm:flex items-center justify-end gap-1 text-xs text-muted-foreground">
                <kbd className="px-2 py-1 bg-muted/50 rounded text-[10px] font-mono">
                  Ctrl
                </kbd>
                <kbd className="px-2 py-1 bg-muted/50 rounded text-[10px] font-mono">K</kbd>
              </div>
            </div>
          </Button>
        </div>

        <ScrollArea className="space-y-6">
          {/* Recent Group */}
          <SidebarGroup>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Recent</h3>
            <ul className="space-y-1 text-sm">
              {mockPdfs.slice(0, 3).map((pdf) => (
                <li
                  key={pdf.id}
                  className="hover:bg-muted px-2 py-1 rounded flex justify-between items-center"
                >
                  {pdf.title}
                  {pdf.isFavorite && <Star size={14} className="text-yellow-400" />}
                </li>
              ))}
            </ul>
          </SidebarGroup>

          {/* All PDFs Group */}
          <SidebarGroup>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">All PDFs</h3>
            <ul className="space-y-1 text-sm">
              {mockPdfs.map((pdf) => (
                <li
                  key={pdf.id}
                  className="hover:bg-muted px-2 py-1 rounded flex justify-between items-center"
                >
                  {pdf.title}
                  {pdf.isFavorite && <Star size={14} className="text-yellow-400" />}
                </li>
              ))}
            </ul>
          </SidebarGroup>
        </ScrollArea>
      </SidebarContent>

      {/* Footer Avatar */}
      <SidebarFooter className="border-t border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar className="w-9 h-9">
            <AvatarImage src="/user.png" alt="User" />
            <AvatarFallback>AA</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-sm font-medium">Aadarsh</span>
            <span className="text-xs text-muted-foreground">Settings</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

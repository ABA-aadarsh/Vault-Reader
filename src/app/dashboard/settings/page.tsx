"use client";
import React, { useState, useEffect } from "react";
import { LogOut, Palette, Check, RefreshCcw, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/features/supabase/auth/components/RequireAuth";
import { useDb } from "@/lib/dexie/db";
import AuthAPI from "@/features/supabase/auth/auth.service";
import { useRouter } from "next/navigation";
import {
  getProgressSyncEnabled,
  setProgressSyncEnabled,
} from "@/lib/settings";
import { useSyncStatus } from "@/features/sync/useSyncStatus";

interface Tab {
  id: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>("sync");
  const [selectedTheme, setSelectedTheme] = useState("system");
  const [progressSync, setProgressSync] = useState(false);
  const [loadingProgressSync, setLoadingProgressSync] = useState(true);
  const { user } = useAuth();
  const db = useDb();
  const router = useRouter();
  const { status, pendingCount, conflictCount } = useSyncStatus();

  // Load progress sync setting from DB
  useEffect(() => {
    (async () => {
      const val = await getProgressSyncEnabled(db);
      setProgressSync(val);
      setLoadingProgressSync(false);
    })();
  }, [db]);

  const handleProgressSyncToggle = async (enabled: boolean) => {
    setProgressSync(enabled);
    await setProgressSyncEnabled(db, enabled);
  };

  const handleLogout = async () => {
    await AuthAPI.signout();
    router.replace("/signin");
  };

  const tabs: Tab[] = [
    { id: "sync", label: "Sync", icon: RefreshCcw },
    { id: "account", label: "Account", icon: LogOut },
    { id: "appearance", label: "Appearance", icon: Palette },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-card-foreground/10 bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
              <p className="text-muted-foreground">Manage your sync and account preferences</p>
            </div>
            <Button variant="destructive" onClick={handleLogout} size="sm" className="cursor-pointer rounded-sm">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Navigation */}
          <aside className="w-full lg:w-64 flex-shrink-0">
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <Button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    variant={isActive ? "secondary" : "ghost"}
                    className={`w-full justify-start h-11 px-3 cursor-pointer ${
                      isActive
                        ? "bg-secondary text-secondary-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    }`}
                  >
                    <Icon className="w-4 h-4 mr-3" />
                    {tab.label}
                  </Button>
                );
              })}
            </nav>
          </aside>

          {/* Main Content */}
          <div className="flex-1 space-y-6">

            {/* ── Sync Tab ────────────────────────────────────── */}
            {activeTab === "sync" && (
              <div className="space-y-6">
                {/* Sync status */}
                <Card className="border-accent">
                  <CardHeader className="pb-3">
                    <CardTitle>Sync Status</CardTitle>
                    <CardDescription>Current sync engine state</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {status === "syncing" ? (
                          <RefreshCcw className="w-4 h-4 animate-spin text-blue-600" />
                        ) : status === "error" ? (
                          <WifiOff className="w-4 h-4 text-red-600" />
                        ) : status === "paused" ? (
                          <WifiOff className="w-4 h-4 text-amber-600" />
                        ) : (
                          <Wifi className="w-4 h-4 text-green-600" />
                        )}
                        <span className="text-sm font-medium">
                          {status === "syncing"
                            ? "Syncing"
                            : status === "error"
                              ? "Error"
                              : status === "paused"
                                ? "Paused"
                                : "Up to date"}
                        </span>
                      </div>
                      {pendingCount > 0 && (
                        <span className="text-xs bg-muted px-2 py-0.5 rounded">
                          {pendingCount} pending
                        </span>
                      )}
                      {conflictCount > 0 && (
                        <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded">
                          {conflictCount} conflict{conflictCount > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Progress sync */}
                <Card className="border-accent">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Sync Reading Progress</CardTitle>
                        <CardDescription>
                          Sync your reading position across devices. When off, progress stays on this device.
                        </CardDescription>
                      </div>
                      <Switch
                        checked={progressSync}
                        onCheckedChange={handleProgressSyncToggle}
                        disabled={loadingProgressSync}
                      />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {progressSync
                        ? "Reading progress is syncing. Your page position will be shared across devices."
                        : "Reading progress is local-only. Each device tracks its own position."}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── Account Tab ─────────────────────────────────── */}
            {activeTab === "account" && (
              <Card className="border-accent">
                <CardHeader>
                  <CardTitle>Account</CardTitle>
                  <CardDescription>Manage your account settings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <Label>Email</Label>
                    <div className="px-3 py-2 bg-muted/50 border border-card-foreground/10 rounded-md text-sm">
                      {user.email ?? "Not available"}
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <Label>Danger zone</Label>
                    <Button
                      variant="destructive"
                      onClick={handleLogout}
                      className="cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign out
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      This will sign you out of your account. Your local data is preserved.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Appearance Tab ──────────────────────────────── */}
            {activeTab === "appearance" && (
              <Card className="border-accent">
                <CardHeader>
                  <CardTitle>Appearance</CardTitle>
                  <CardDescription>
                    Customize the look and feel of your interface
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <Label>Theme</Label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { id: "light", label: "Light", desc: "Light mode" },
                        { id: "system", label: "System", desc: "System preference" },
                        { id: "dark", label: "Dark", desc: "Dark mode" },
                      ].map((theme) => (
                        <Button
                          key={theme.id}
                          variant={selectedTheme === theme.id ? "default" : "outline"}
                          className={`h-auto p-4 flex-col gap-2 cursor-pointer ${
                            selectedTheme !== theme.id ? "border-card-foreground/10" : ""
                          }`}
                          onClick={() => setSelectedTheme(theme.id)}
                        >
                          <div className="w-full aspect-video bg-muted border border-card-foreground/10 rounded-sm" />
                          <div className="text-center">
                            <div className="text-sm font-medium">{theme.label}</div>
                            {selectedTheme === theme.id && (
                              <Check className="w-4 h-4 mx-auto mt-1" />
                            )}
                          </div>
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default SettingsPage;

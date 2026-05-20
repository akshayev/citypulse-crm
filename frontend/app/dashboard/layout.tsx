"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useKanbanStore } from "@/store/kanban-store";
import {
  LayoutDashboard,
  Flame,
  Settings,
  LogOut,
  Menu,
  X,
  Search,
  Zap,
  BarChart3,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Dashboard Layout — Sidebar + Topbar + Content Area
 * Source: 06-UI-UX-Guidelines.md (glassmorphic sidebar)
 *
 * NOTE: The inner shell is wrapped in <Suspense> because it uses
 * useSearchParams(), which requires a Suspense boundary for
 * Next.js static generation (Vercel build) to succeed.
 */

// ─── Inner shell (uses useSearchParams — must be inside Suspense) ─────────────
function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { sidebarOpen, toggleSidebar, searchQuery, setSearchQuery } =
    useKanbanStore();
  const [user, setUser] = useState<{ email?: string; full_name?: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUser({
          email: data.user.email,
          full_name: data.user.user_metadata?.full_name,
        });
      }
    });
  }, []);

  // Sync initial URL search param to store
  useEffect(() => {
    const q = searchParams.get("q");
    if (q !== null && q !== searchQuery) {
      setSearchQuery(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchQuery]);

  // Sync store search query to URL (with debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      const currentQ = searchParams.get("q") || "";
      if (searchQuery !== currentQ) {
        const params = new URLSearchParams(searchParams.toString());
        if (searchQuery) {
          params.set("q", searchQuery);
        } else {
          params.delete("q");
        }
        router.replace(`${pathname}?${params.toString()}`);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, pathname, router, searchParams]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const navItems = [
    { label: "Pipeline", icon: LayoutDashboard, href: "/dashboard" },
    { label: "Analytics", icon: BarChart3, href: "/dashboard/analytics" },
    { label: "Settings", icon: Settings, href: "/dashboard/settings" },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-20 md:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* ====== SIDEBAR ====== */}
      <aside
        className={cn(
          "fixed md:static inset-y-0 left-0 glass-card rounded-none border-r border-glass-border flex flex-col transition-all duration-300 shrink-0 z-30",
          sidebarOpen ? "translate-x-0 w-64" : "-translate-x-full md:translate-x-0 w-64 md:w-16"
        )}
      >
        {/* Logo */}
        <div className="p-4 flex items-center gap-3 border-b border-glass-border">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent to-accent-light flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-white" />
          </div>
          {sidebarOpen && (
            <div className="animate-fade-in">
              <h2 className="text-sm font-bold text-text-primary">CityPulse</h2>
              <p className="text-xs text-text-muted">AI CRM</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:bg-glass-hover hover:text-text-primary transition-all no-underline"
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {sidebarOpen && (
                <span className="animate-fade-in">{item.label}</span>
              )}
            </Link>
          ))}
        </nav>

        {/* User Info */}
        <div className="p-3 border-t border-glass-border">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-accent">
                {user?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || "?"}
              </span>
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0 animate-fade-in">
                <p className="text-xs font-medium text-text-primary truncate">
                  {user?.full_name || "User"}
                </p>
                <p className="text-xs text-text-muted truncate">{user?.email}</p>
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-text-muted hover:text-danger hover:bg-danger/5 transition-all w-full"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {sidebarOpen && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* ====== MAIN CONTENT AREA ====== */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-14 glass-card rounded-none border-b border-glass-border flex items-center justify-between px-4 shrink-0 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-lg hover:bg-glass-hover transition-colors"
            >
              {sidebarOpen ? (
                <X className="w-4 h-4 text-text-secondary" />
              ) : (
                <Menu className="w-4 h-4 text-text-secondary" />
              )}
            </button>
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-text-primary">
                Pipeline
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
              <input
                type="text"
                placeholder="Search leads..."
                className="glass-input pl-9 pr-4 py-1.5 text-xs w-48"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-4">{children}</main>
      </div>
    </div>
  );
}

// ─── Outer layout — wraps shell in Suspense for Next.js SSG ──────────────────
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        </div>
      }
    >
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  );
}

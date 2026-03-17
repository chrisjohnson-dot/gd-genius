import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  CalendarClock,
  ClipboardList,
  Cog,
  History,
  ListChecks,
  LogOut,
  MapPin,
  Moon,
  PackageSearch,
  Stethoscope,
  Sun,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { Skeleton } from "./ui/skeleton";

const navItems = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/allocate", label: "Run Allocation Tool", icon: PackageSearch },
  { href: "/history", label: "Run History", icon: History },
  { href: "/audit", label: "Audit Log", icon: ClipboardList },
];

const configItems = [
  { href: "/settings", label: "API Settings", icon: Cog },
  { href: "/locations", label: "Location Config", icon: MapPin },
  { href: "/rules", label: "Allocation Rules", icon: ListChecks },
  { href: "/schedule", label: "Auto-Run Schedule", icon: CalendarClock },
  { href: "/diagnostics", label: "API Diagnostics", icon: Stethoscope },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();

  if (loading) {
    return (
      <div className="flex h-screen bg-background">
        <div className="w-64 bg-sidebar p-4 flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full bg-sidebar-accent/50" />
          ))}
        </div>
        <div className="flex-1 p-8">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3 mb-6">
            <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663425420251/K5ogkLhSXtccCnqH4Vm3fs/gdlogo-transparent_3a5013eb.png" alt="Go Direct" className="h-12 w-auto" />
            <h1 className="text-2xl font-bold text-foreground">GD Allocation Wizard</h1>
          </div>
          <p className="text-muted-foreground">Sign in to access the allocation dashboard.</p>
          <Button asChild>
            <a href={getLoginUrl()}>Sign In</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-60 bg-sidebar text-sidebar-foreground flex flex-col shrink-0">
        {/* Logo */}
        <div className="p-4 flex items-center gap-2.5 border-b border-sidebar-border">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663425420251/K5ogkLhSXtccCnqH4Vm3fs/gdlogo-transparent_3a5013eb.png"
            alt="Go Direct"
            className="h-8 w-auto shrink-0"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-sidebar-foreground leading-tight truncate">
              GD Allocation Wizard
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <p className="text-xs font-medium text-sidebar-foreground/40 uppercase tracking-wider px-2 mb-2">
            Operations
          </p>
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors",
                location === href
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          ))}

          <Separator className="my-3 bg-sidebar-border" />

          <p className="text-xs font-medium text-sidebar-foreground/40 uppercase tracking-wider px-2 mb-2">
            Configuration
          </p>
          {configItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors",
                location === href
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-sidebar-border space-y-2">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs text-sidebar-foreground/60 truncate">{user?.name ?? user?.email}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent text-xs"
            onClick={logout}
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

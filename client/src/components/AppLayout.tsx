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
import { Skeleton } from "./ui/skeleton";

const navItems = [
  { href: "/",          label: "Dashboard",          icon: BarChart3 },
  { href: "/allocate",  label: "Run Allocation Tool", icon: PackageSearch },
  { href: "/history",   label: "Run History",         icon: History },
  { href: "/audit",     label: "Audit Log",           icon: ClipboardList },
];

const configItems = [
  { href: "/settings",    label: "API Settings",       icon: Cog },
  { href: "/locations",   label: "Location Config",    icon: MapPin },
  { href: "/rules",       label: "Allocation Rules",   icon: ListChecks },
  { href: "/schedule",    label: "Auto-Run Schedule",  icon: CalendarClock },
  { href: "/diagnostics", label: "API Diagnostics",    icon: Stethoscope },
];

const GD_LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663425420251/K5ogkLhSXtccCnqH4Vm3fs/gdlogo-transparent_3a5013eb.png";

function NavItem({ href, label, icon: Icon, active }: { href: string; label: string; icon: React.ElementType; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "relative flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[13.5px] font-medium transition-all duration-150",
        active
          ? "bg-[rgba(59,130,246,0.12)] text-white"
          : "text-[#94a3b8] hover:bg-[#1a1d2e] hover:text-[#e2e8f0]"
      )}
    >
      {active && <span className="nav-active-indicator" />}
      <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "opacity-100" : "opacity-70")} />
      <span>{label}</span>
    </Link>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();

  if (loading) {
    return (
      <div className="flex h-screen" style={{ background: "#f3f4f6" }}>
        <div className="w-[260px] shrink-0" style={{ background: "#0f111a" }}>
          <div className="p-4 space-y-3 mt-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full opacity-20" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-8 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3 mb-6">
            <img src={GD_LOGO} alt="Go Direct" className="h-12 w-auto" />
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">GD Wizard</h1>
          </div>
          <p className="text-muted-foreground">Sign in to access the allocation dashboard.</p>
          <Button asChild size="lg" className="shadow-md">
            <a href={getLoginUrl()}>Sign In</a>
          </Button>
        </div>
      </div>
    );
  }

  const initials = user?.name
    ? user.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
    : (user?.email?.[0] ?? "U").toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#f3f4f6" }}>
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className="w-[260px] shrink-0 flex flex-col"
        style={{ background: "#0f111a", position: "relative" }}
      >
        {/* Brand */}
        <div className="px-4 pt-4 pb-3.5 flex flex-col gap-1.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <img src={GD_LOGO} alt="Go Direct" className="h-8 w-auto shrink-0" />
            <span className="text-white font-bold text-[15px] tracking-tight leading-tight">
              GD Wizard
            </span>
          </div>

        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-6">
          {/* Operations section */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#94a3b8]/50 px-2 mb-2">
              Operations
            </p>
            <div className="space-y-0.5">
              {navItems.map(item => (
                <NavItem key={item.href} {...item} active={location === item.href} />
              ))}
            </div>
          </div>

          {/* Configuration section */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#94a3b8]/50 px-2 mb-2">
              Configuration
            </p>
            <div className="space-y-0.5">
              {configItems.map(item => (
                <NavItem key={item.href} {...item} active={location === item.href} />
              ))}
            </div>
          </div>
        </nav>

        {/* Footer — user card */}
        <div className="p-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-[10px] hover:bg-[#1a1d2e] transition-colors cursor-default">
            {/* Avatar with gradient */}
            <div
              className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center text-white font-bold text-[13px] shrink-0"
              style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-[#e2e8f0] truncate leading-tight">
                {user?.name ?? user?.email ?? "User"}
              </p>
              <p className="text-[11px] text-[#94a3b8] truncate mt-0.5">
                {user?.role === "admin" ? "Administrator" : "Operator"}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={toggleTheme}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-white/10 transition-colors"
                title="Toggle theme"
              >
                {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={logout}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-white/10 transition-colors"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

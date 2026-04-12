import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import {
  BarChart3,
  CalendarClock,
  ClipboardList,
  Cog,
  FileBarChart2,
  FileSearch,
  FolderOpen,
  History,
  Image,
  ListChecks,
  LogOut,
  MapPin,
  Moon,
  PackageCheck,
  PackageSearch,
  RotateCcw,
  ScanBarcode,
  ScrollText,
  Ship,
  ShieldCheck,
  Stethoscope,
  Sun,
  Timer,
  Truck,
  Truck as TruckIcon,
  Users,
  Zap,
  Inbox,
  ConciergeBell,
  Tag,
  FileText,
  Activity,
  QrCode,
  TrendingUp,
  Package,
  Printer,
  ShieldAlert,
  Boxes,
  Wand2,
  UserCog,
  Receipt,
  AlertTriangle,
  CalendarDays,
  Monitor,
  Building2,
  BarChart2,
  BookOpen,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { useKiosk } from "@/contexts/KioskContext";

const dashboardItems = [
  { href: "/",                 label: "Open Orders — B2B", icon: FolderOpen, badge: true },
  { href: "/open-orders-d2c", label: "Open Orders — D2C", icon: FolderOpen },
  { href: "/sla-performance",  label: "SLA Performance",   icon: TrendingUp },
  { href: "/exceptions",       label: "Requires Attention",  icon: AlertTriangle, exceptionsBadge: true },
  { href: "/live-ops",           label: "Live Ops View",      icon: Monitor },
  { href: "/workload",             label: "Workload Planning",  icon: BarChart2, workloadBadge: true },
];

const receivingItems = [
  { href: "/receiving",                label: "Receiving Dashboard", icon: Inbox },
  { href: "/receiving/put-away",       label: "Run Put Away Wizard", icon: ConciergeBell },
  { href: "/receiving/put-away/list",  label: "Put Away List",       icon: ClipboardList },
];

const allocationItems = [
  { href: "/allocate",  label: "Run Allocation Wizard",   icon: PackageSearch },
  { href: "/history",   label: "Run History",           icon: History },
  { href: "/audit",     label: "Audit Log",             icon: ClipboardList },
];

const smallParcelItems = [
  { href: "/small-parcel", label: "Pack & Ship", icon: Package },
  { href: "/small-parcel/rate-wizard", label: "Rate Wizard", icon: Wand2 },
  { href: "/small-parcel/history", label: "Labels Printed", icon: ScrollText },
  { href: "/small-parcel/audit-log", label: "Audit Log", icon: ClipboardList },
];

const packagingItems = [
  { href: "/small-parcel/package-sizes", label: "Package Sizes", icon: Package },
  { href: "/small-parcel/packaging",     label: "Inventory",     icon: Boxes },
];

const ltlItems = [
  { href: "/ltl/warehouse-pull",  label: "Item Pull Control",       icon: ScanBarcode },
  { href: "/ltl/live-board",      label: "Live Board",              icon: Activity },
  { href: "/ltl/pull-manager",    label: "Pull Manager",            icon: BarChart2 },
  { href: "/ltl/associates",      label: "Associates",              icon: Users },
  { href: "/qc/scanner",          label: "QC Scanner",              icon: ScanBarcode },
  { href: "/qc/production-line",  label: "Production Line Scans",   icon: Activity },
  { href: "/qc/scan-label",       label: "QC Scan & Label",         icon: Tag },
  { href: "/qc/qr-scan-history",  label: "K18QR Scanning",          icon: QrCode },
  { href: "/qc/label-files",      label: "Label Files",             icon: FileText },
  { href: "/qc/audit",            label: "Audit Log",               icon: ClipboardList },
];

const shippingItems = [
  { href: "/shipping",         label: "Shipping Dashboard", icon: Ship },
  { href: "/shipping/history", label: "Shipping History",   icon: ScrollText },
];

const returnsItems = [
  { href: "/returns",         label: "Returns Dashboard", icon: RotateCcw },
  { href: "/returns/process", label: "Process Returns",   icon: ScanBarcode },
];

const purchaseOrderItems = [
  { href: "/purchase-orders", label: "Purchase Orders", icon: Receipt },
];

const auditItems = [
  { href: "/audit/production-documents", label: "Production Documents", icon: FileSearch },
  { href: "/audit/images",               label: "Images",               icon: Image },
  { href: "/audit/shipping-documents",   label: "Shipping Documents",   icon: Truck },
];

const configItems = [
  { href: "/settings",                   label: "API Settings",       icon: Cog },
  { href: "/locations",                  label: "Location Config",    icon: MapPin },
  { href: "/rules",                      label: "Allocation Rules",   icon: ListChecks },
  { href: "/schedule",                   label: "Auto-Run Allocation",  icon: CalendarClock },
  { href: "/diagnostics",                label: "API Diagnostics",    icon: Stethoscope },
  { href: "/shipping-integration",       label: "Shipping Integration", icon: Truck },
  { href: "/client-visibility",          label: "Client Visibility",  icon: Users },
  { href: "/receiving/put-away/priority", label: "Put Away Config",    icon: ConciergeBell },
  { href: "/config/wh-location",          label: "WH Location Config",  icon: MapPin },
  { href: "/config/label-scan",            label: "Scan and Label Settings", icon: ScanBarcode },
  { href: "/small-parcel/high-value-skus", label: "High-Value SKUs",   icon: ShieldAlert },
  { href: "/small-parcel/supervisor-pins", label: "Supervisor PINs",   icon: ShieldCheck },
  { href: "/small-parcel/printer-settings", label: "Printer Settings", icon: Printer },
  { href: "/small-parcel/customer-shipping-rules", label: "Customer Shipping Rules", icon: UserCog },
];

const GD_LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663425420251/K5ogkLhSXtccCnqH4Vm3fs/gdgenius-logo_87bc3961.png";

// ─── Simple count badge (for Requires Attention) ─────────────────────────────

function SimpleCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
      {count > 99 ? "99+" : count}
    </span>
  );
}

// ─── Attention badge with hover popover ──────────────────────────────────────

function AttentionBadge({
  count,
  overdueCount,
  zeroBidCount,
  verificationIssues,
}: {
  count: number;
  overdueCount: number;
  zeroBidCount: number;
  verificationIssues: number;
}) {
  const [hovered, setHovered] = useState(false);
  if (count <= 0) return null;

  return (
    <span className="relative ml-auto shrink-0" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {/* Badge pill */}
      <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none cursor-default">
        {count > 99 ? "99+" : count}
      </span>

      {/* Hover popover */}
      {hovered && (
        <div
          className="absolute right-0 top-6 z-50 w-[190px] rounded-xl shadow-xl border border-white/10 overflow-hidden"
          style={{ background: "#252830" }}
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-white/10">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">Needs Attention</p>
          </div>
          {/* Rows */}
          <div className="px-3 py-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[#cbd5e1]">Overdue orders</span>
              <span className={cn(
                "text-[12px] font-bold tabular-nums",
                overdueCount > 0 ? "text-red-400" : "text-[#64748b]"
              )}>
                {overdueCount}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[#cbd5e1]">Zero-bid orders</span>
              <span className={cn(
                "text-[12px] font-bold tabular-nums",
                zeroBidCount > 0 ? "text-orange-400" : "text-[#64748b]"
              )}>
                {zeroBidCount}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[#cbd5e1]">Verif. issues</span>
              <span className={cn(
                "text-[12px] font-bold tabular-nums",
                verificationIssues > 0 ? "text-red-400" : "text-[#64748b]"
              )}>
                {verificationIssues}
              </span>
            </div>
          </div>
          {/* Footer */}
          <div className="px-3 py-1.5 border-t border-white/10">
            <p className="text-[10px] text-[#64748b]">Click Open Orders to review</p>
          </div>
        </div>
      )}
    </span>
  );
}

// ─── NavItem ──────────────────────────────────────────────────────────────────

function WorkloadCriticalDot({ warehouses }: { warehouses: string[] }) {
  const [hovered, setHovered] = useState(false);
  if (warehouses.length === 0) return null;
  return (
    <span
      className="relative ml-auto shrink-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Pulsing red dot */}
      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse block" />

      {/* Hover popover */}
      {hovered && (
        <div
          className="absolute right-0 top-5 z-50 w-[200px] rounded-xl shadow-xl border border-white/10 overflow-hidden"
          style={{ background: "#252830" }}
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-white/10">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">
              Critical Pace
            </p>
          </div>
          {/* Warehouse list */}
          <div className="px-3 py-2 space-y-1.5">
            {warehouses.map((name) => (
              <div key={name} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                <span className="text-[12px] text-[#cbd5e1] truncate">{name}</span>
              </div>
            ))}
          </div>
          {/* Footer */}
          <div className="px-3 py-1.5 border-t border-white/10">
            <p className="text-[10px] text-[#64748b]">Click to review workload</p>
          </div>
        </div>
      )}
    </span>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  badgeData,
  exceptionCount,
  workloadCount,
  workloadWarehouses,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  badgeData?: { total: number; overdueCount: number; zeroBidCount: number; verificationIssues: number };
  exceptionCount?: number;
  workloadCount?: number;
  workloadWarehouses?: string[];
}) {
  return (
    <Link
      href={href}
      className={cn(
        "relative flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[13.5px] font-medium transition-all duration-150",
        active
          ? "bg-[rgba(59,130,246,0.12)] text-white"
          : "text-[#94a3b8] hover:bg-[#252830] hover:text-[#e2e8f0]"
      )}
    >
      {active && <span className="nav-active-indicator" />}
      <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "opacity-100" : "opacity-70")} />
      <span className="flex-1 truncate">{label}</span>
      {badgeData && (
        <AttentionBadge
          count={badgeData.total}
          overdueCount={badgeData.overdueCount}
          zeroBidCount={badgeData.zeroBidCount}
          verificationIssues={badgeData.verificationIssues}
        />
      )}
      {exceptionCount !== undefined && exceptionCount > 0 && <SimpleCountBadge count={exceptionCount} />}
      {workloadWarehouses !== undefined && <WorkloadCriticalDot warehouses={workloadWarehouses} />}
    </Link>
  );
}

// ─── AppLayout ────────────────────────────────────────────────────────────────

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location] = useLocation();
  const { isKiosk } = useKiosk();
  const { theme, toggleTheme } = useTheme();
  const navRef = useRef<HTMLElement>(null);
  const savedNavScroll = useRef(0);

  // ── Collapsible sidebar sections with localStorage persistence ──────────────
  // Helper: read a boolean from localStorage, falling back to `fallback` when
  // the key is absent (first visit) or the stored value is not a valid boolean.
  function readStoredBool(key: string, fallback: boolean): boolean {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return raw === "true";
    } catch {
      return fallback;
    }
  }

  const isOnConfigRoute = configItems.some((item) => location === item.href);
  const [configOpen, setConfigOpen] = useState(() => readStoredBool("sidebar:configOpen", isOnConfigRoute));
  useEffect(() => { try { localStorage.setItem("sidebar:configOpen", String(configOpen)); } catch { /* ignore */ } }, [configOpen]);
  useEffect(() => { if (isOnConfigRoute) setConfigOpen(true); }, [isOnConfigRoute]);



  // Save nav scroll position before navigation, restore after
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    // Restore saved scroll position after location change
    nav.scrollTop = savedNavScroll.current;
  }, [location]);

  function handleNavScroll() {
    if (navRef.current) {
      savedNavScroll.current = navRef.current.scrollTop;
    }
  }

  // Poll the attention count every 60 seconds so the badge stays fresh
  const { data: attentionData } = trpc.pickSchedule.attentionCount.useQuery(undefined, {
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const attentionBadge = attentionData
    ? { total: attentionData.total, overdueCount: attentionData.overdueCount, zeroBidCount: attentionData.zeroBidCount, verificationIssues: attentionData.verificationIssues ?? 0 }
    : undefined;

  // Poll exceptions count every 60 seconds for the Requires Attention badge
  const { data: exceptionsCountData } = trpc.exceptions.counts.useQuery(undefined, {
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const exceptionsCount = exceptionsCountData?.total ?? 0;

  // Poll workload summaries every 60 seconds for the Workload Planning red dot
  const { data: workloadSummaries } = trpc.workload.getWarehouseSummaries.useQuery(
    { window: "1h", shiftHours: 8 },
    { refetchInterval: 60_000, staleTime: 30_000 }
  );
  const workloadCriticalWarehouses: string[] = (workloadSummaries ?? [])
    .filter((s: { paceStatus: string }) => s.paceStatus === "red")
    .map((s: { warehouseId: string }) => s.warehouseId);
  const workloadCriticalCount = workloadCriticalWarehouses.length;

  if (loading) {
    return (
      <div className="flex h-screen" style={{ background: "#f3f4f6" }}>
        <div className="w-[260px] shrink-0" style={{ background: "#1b1c21" }}>
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
            <img src={GD_LOGO} alt="GD Genius" className="h-28 w-auto" />
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
      {/* ── Sidebar ─────────────────────────────────────────────────────────────────── */}
      <aside
        className="w-[260px] shrink-0 flex flex-col h-full"
        style={{ background: "#1b1c21", position: "relative", display: isKiosk ? "none" : undefined }}
      >
        {/* Brand */}
        <div className="pl-2 pr-4 pt-4 pb-3.5 border-b border-white/[0.06]">
          <img src={GD_LOGO} alt="GD Genius" className="h-[115px] w-auto" />
        </div>

        {/* Navigation */}
        <nav ref={navRef} onScroll={handleNavScroll} className="flex-1 px-3 py-4 overflow-y-auto space-y-6">
          {/* Dashboard section */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#94a3b8]/50 px-2 mb-2">
              Dashboard
            </p>
            <div className="space-y-0.5">
              {dashboardItems.map(item => (
                <NavItem
                  key={item.href}
                  {...item}
                  active={location === item.href}
                  badgeData={item.badge ? attentionBadge : undefined}
                  exceptionCount={item.exceptionsBadge ? exceptionsCount : undefined}
                  workloadCount={(item as any).workloadBadge ? workloadCriticalCount : undefined}
                  workloadWarehouses={(item as any).workloadBadge ? workloadCriticalWarehouses : undefined}
                />
              ))}
            </div>
          </div>

          {/* Receiving section */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#94a3b8]/50 px-2 mb-2">
              Receiving
            </p>
            <div className="space-y-0.5">
              {receivingItems.map(item => (
                <NavItem key={item.href} {...item} active={location === item.href} />
              ))}
            </div>
          </div>

          {/* Allocation section */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#94a3b8]/50 px-2 mb-2">
              Allocation
            </p>
            <div className="space-y-0.5">
              {allocationItems.map(item => (
                <NavItem key={item.href} {...item} active={location === item.href} />
              ))}
            </div>
          </div>

          {/* Small Parcel section — always expanded */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#94a3b8]/50 px-2 mb-1">Small Parcel</p>
            <div className="space-y-0.5">
              {smallParcelItems.map(item => (
                <NavItem key={item.href} {...item} active={location === item.href} />
              ))}
            </div>
          </div>

          {/* QC section — always expanded */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#94a3b8]/50 px-2 mb-1">LTL</p>
            <div className="space-y-0.5">
              {ltlItems.map(item => (
                <NavItem key={item.href} {...item} active={location === item.href} />
              ))}
            </div>
          </div>

          {/* Shipping section — always expanded */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#94a3b8]/50 px-2 mb-1">Shipping</p>
            <div className="space-y-0.5">
              {shippingItems.map(item => (
                <NavItem key={item.href} {...item} active={location === item.href} />
              ))}
            </div>
          </div>

          {/* Returns section — always expanded */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#94a3b8]/50 px-2 mb-1">Returns</p>
            <div className="space-y-0.5">
              {returnsItems.map(item => (
                <NavItem key={item.href} {...item} active={location === item.href} />
              ))}
            </div>
          </div>

          {/* Purchase Orders section — between Returns and Packaging */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#94a3b8]/50 px-2 mb-1">Billing</p>
            <div className="space-y-0.5">
              {purchaseOrderItems.map(item => (
                <NavItem key={item.href} {...item} active={location === item.href} />
              ))}
            </div>
          </div>

          {/* Packaging section — between Billing and Audit */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#94a3b8]/50 px-2 mb-1">Packaging</p>
            <div className="space-y-0.5">
              {packagingItems.map(item => (
                <NavItem key={item.href} {...item} active={location === item.href} />
              ))}
            </div>
          </div>

          {/* Audit section — always expanded */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#94a3b8]/50 px-2 mb-1">Audit</p>
            <div className="space-y-0.5">
              {auditItems.map(item => (
                <NavItem key={item.href} {...item} active={location === item.href} />
              ))}
            </div>
          </div>

          {/* Configuration section — collapsible */}
          <div>
            <button
              onClick={() => setConfigOpen((o) => !o)}
              className="w-full flex items-center justify-between px-2 mb-1 group"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#94a3b8]/50 group-hover:text-[#94a3b8]/80 transition-colors">
                Configuration
              </p>
              <svg
                className={`w-3 h-3 text-[#94a3b8]/40 group-hover:text-[#94a3b8]/70 transition-transform duration-200 ${
                  configOpen ? "rotate-180" : "rotate-0"
                }`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {configOpen && (
              <div className="space-y-0.5">
                {configItems.map(item => (
                  <NavItem key={item.href} {...item} active={location === item.href} />
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* Footer — user card */}
        <div className="p-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-[10px] hover:bg-[#252830] transition-colors cursor-default">
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

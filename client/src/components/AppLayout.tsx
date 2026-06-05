import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useTheme } from "@/contexts/ThemeContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
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
  Camera,
  Wifi,
  CheckSquare,
  Scale,
  LayoutDashboard,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { useKiosk } from "@/contexts/KioskContext";

const dashboardItems = [
  { href: "/",                 label: "Open Orders — B2B", icon: FolderOpen },
  { href: "/open-orders-d2c", label: "Open Orders — D2C", icon: FolderOpen },
  { href: "/sla-performance",  label: "SLA Performance",   icon: TrendingUp },
  { href: "/exceptions",       label: "Requires Attention",  icon: AlertTriangle, exceptionsBadge: true },
  { href: "/live-ops",           label: "Live Ops View",      icon: Monitor },
  { href: "/workload",             label: "Workload Planning",  icon: BarChart2, workloadBadge: true },
  { href: "/order-drop-cadence",   label: "Order Drop Cadence", icon: BarChart3 },
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
  { href: "/qc/scanner",          label: "QC Scanner",              icon: ScanBarcode },
  { href: "/qc/history",           label: "QC Session History",      icon: History },
  { href: "/weight-approval",       label: "Weight Approval",          icon: Scale },
  { href: "/manager",               label: "Manager Dashboard",        icon: LayoutDashboard },
  { href: "/shipping/clerk",         label: "Shipping Clerk",           icon: Truck },
  { href: "/qc/production-line",  label: "Production Line Scans",   icon: Activity },
  { href: "/qc/scan-label",       label: "QC Scan & Label",         icon: Tag },
  { href: "/qc/qr-scan-history",  label: "K18QR Scanning",          icon: QrCode },
  { href: "/qc/label-files",      label: "Label Files",             icon: FileText },
  { href: "/qc/audit",            label: "Audit Log",               icon: ClipboardList },
];

const shippingItems = [
  { href: "/shipping",                label: "Shipping Dashboard",   icon: Ship },
  { href: "/shipping/confirm",        label: "Shipping Quotes",     icon: CheckSquare },
  { href: "/shipping/history",        label: "Shipping History",     icon: ScrollText },
  { href: "/shipping/appointments",   label: "Appointments",         icon: CalendarDays },
  { href: "/shipping/carrier-pickup", label: "Carrier Pickup",       icon: Truck },
  { href: "/shipping/dock-manager",   label: "Dock Manager",         icon: Building2 },
  { href: "/edi-monitor",             label: "EDI 945 Monitor",      icon: Wifi },
];

const returnsItems = [
  { href: "/returns",              label: "Returns Dashboard", icon: RotateCcw },
  { href: "/returns/process",      label: "Process Returns",   icon: ScanBarcode },
  { href: "/returns/scan-station", label: "Scan Station",       icon: Camera },
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
  { href: "/rules",                      label: "Allocation Rules",        icon: ListChecks },
  { href: "/ltl/associates",             label: "Associates",              icon: Users },
  { href: "/settings",                   label: "API Settings & Diagnostics", icon: Cog },
  { href: "/schedule",                   label: "Auto-Run Allocation",     icon: CalendarClock },
  { href: "/client-visibility",          label: "Client Visibility",       icon: Users },
  { href: "/small-parcel/customer-shipping-rules", label: "Customer Shipping Rules", icon: UserCog },
  { href: "/small-parcel/high-value-skus", label: "High-Value SKUs",       icon: ShieldAlert },
  { href: "/locations",                  label: "Location Config",         icon: MapPin },
  { href: "/small-parcel/printer-settings", label: "Printer Settings",    icon: Printer },
  { href: "/receiving/put-away/priority", label: "Put Away Config",        icon: ConciergeBell },
  { href: "/config/label-scan",            label: "Scan and Label Settings", icon: ScanBarcode },
  { href: "/shipping-integration",        label: "Shipping Integration",   icon: Truck },
];

const GD_LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663425420251/K5ogkLhSXtccCnqH4Vm3fs/gdgenius-logo_87bc3961.png";

// ─── Shared Login Gate ───────────────────────────────────────────────────────

function SharedLoginGate() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [badgeScanBuffer, setBadgeScanBuffer] = useState("");
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const sharedLoginMutation = trpc.auth.sharedLogin.useMutation({
    onSuccess: () => { utils.auth.me.invalidate(); },
    onError: (err) => { setError(err.message || "Invalid username or password"); },
  });

  const teamLoginMutation = trpc.auth.teamLogin.useMutation({
    onSuccess: (data) => {
      utils.auth.me.invalidate();
      if (data.role === "qc_operator") setTimeout(() => navigate("/qc/scanner"), 100);
    },
    onError: (err) => { setError(err.message || "Invalid username or password"); },
  });

  const badgeLoginMutation = trpc.auth.badgeLogin.useMutation({
    onSuccess: () => { utils.auth.me.invalidate(); },
    onError: () => { setError("Badge not recognised. Please log in manually."); },
  });

  // Detect badge scan: USB scanner sends all chars rapidly then Enter
  // Badge tokens start with 'GDLOGIN-'
  useEffect(() => {
    let buffer = "";
    let lastKeyTime = 0;
    const handleKey = (e: KeyboardEvent) => {
      const now = Date.now();
      // Reset buffer if gap > 200ms (human typing)
      if (now - lastKeyTime > 200) buffer = "";
      lastKeyTime = now;
      if (e.key === "Enter") {
        if (buffer.startsWith("GDLOGIN-") && buffer.length > 10) {
          e.preventDefault();
          badgeLoginMutation.mutate({ token: buffer });
        }
        buffer = "";
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    // Try team login first; if it fails fall back to shared login
    teamLoginMutation.mutate(
      { username: username.trim(), password },
      {
        onError: () => {
          // Not a team account — try shared login
          sharedLoginMutation.mutate({ username: username.trim(), password, rememberMe });
        },
      }
    );
  };

  const isPending = sharedLoginMutation.isPending || teamLoginMutation.isPending;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: "#191C21" }}>
      {/* Logo — large for kiosk display */}
      <div className="mb-10">
        <img src={GD_LOGO} alt="GD Genius" className="h-48 w-auto" style={{ filter: 'drop-shadow(0 4px 24px rgba(0,0,0,0.5))' }} />
      </div>

      {/* Kiosk login card */}
      <div className="w-full max-w-xl bg-[#1E2530] rounded-3xl shadow-2xl p-10 space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white tracking-tight">Welcome</h1>
          <p className="text-lg text-gray-400 mt-2">Sign in or scan your badge to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xl font-semibold text-gray-300">Username</label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border-2 border-gray-600 bg-[#252B35] rounded-xl px-5 py-4 text-2xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
              placeholder="Enter username"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-xl font-semibold text-gray-300">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-2 border-gray-600 bg-[#252B35] rounded-xl px-5 py-4 text-2xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
              placeholder="Enter password"
              required
            />
          </div>
          {error && (
            <div className="bg-red-900/40 border border-red-500 rounded-xl px-5 py-4">
              <p className="text-xl text-red-300 font-medium">{error}</p>
            </div>
          )}
          <Button
            type="submit"
            className="w-full h-16 text-2xl font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
            disabled={isPending}
          >
            {isPending ? "Signing in..." : "Sign In"}
          </Button>
        </form>
      </div>
    </div>
  );
}

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

  // ── Collapsible state for all other sections ──────────────────────────────
  const isOnDashboardRoute = dashboardItems.some((i) => location === i.href);
  const isOnReceivingRoute = receivingItems.some((i) => location === i.href);
  const isOnAllocationRoute = allocationItems.some((i) => location === i.href);
  const isOnSmallParcelRoute = smallParcelItems.some((i) => location === i.href);
  const isOnLtlRoute = ltlItems.some((i) => location === i.href);
  const isOnShippingRoute = shippingItems.some((i) => location === i.href);
  const isOnReturnsRoute = returnsItems.some((i) => location === i.href);
  const isOnBillingRoute = purchaseOrderItems.some((i) => location === i.href);
  const isOnPackagingRoute = packagingItems.some((i) => location === i.href);
  const isOnAuditRoute = auditItems.some((i) => location === i.href);

  const [dashboardOpen, setDashboardOpen] = useState(() => readStoredBool("sidebar:dashboardOpen", true));
  const [receivingOpen, setReceivingOpen] = useState(() => readStoredBool("sidebar:receivingOpen", true));
  const [allocationOpen, setAllocationOpen] = useState(() => readStoredBool("sidebar:allocationOpen", true));
  const [smallParcelOpen, setSmallParcelOpen] = useState(() => readStoredBool("sidebar:smallParcelOpen", true));
  const [ltlOpen, setLtlOpen] = useState(() => readStoredBool("sidebar:ltlOpen", true));
  const [shippingOpen, setShippingOpen] = useState(() => readStoredBool("sidebar:shippingOpen", true));
  const [returnsOpen, setReturnsOpen] = useState(() => readStoredBool("sidebar:returnsOpen", true));
  const [billingOpen, setBillingOpen] = useState(() => readStoredBool("sidebar:billingOpen", true));
  const [packagingOpen, setPackagingOpen] = useState(() => readStoredBool("sidebar:packagingOpen", true));
  const [auditOpen, setAuditOpen] = useState(() => readStoredBool("sidebar:auditOpen", true));

  useEffect(() => { try { localStorage.setItem("sidebar:dashboardOpen", String(dashboardOpen)); } catch { /* ignore */ } }, [dashboardOpen]);
  useEffect(() => { try { localStorage.setItem("sidebar:receivingOpen", String(receivingOpen)); } catch { /* ignore */ } }, [receivingOpen]);
  useEffect(() => { try { localStorage.setItem("sidebar:allocationOpen", String(allocationOpen)); } catch { /* ignore */ } }, [allocationOpen]);
  useEffect(() => { try { localStorage.setItem("sidebar:smallParcelOpen", String(smallParcelOpen)); } catch { /* ignore */ } }, [smallParcelOpen]);
  useEffect(() => { try { localStorage.setItem("sidebar:ltlOpen", String(ltlOpen)); } catch { /* ignore */ } }, [ltlOpen]);
  useEffect(() => { try { localStorage.setItem("sidebar:shippingOpen", String(shippingOpen)); } catch { /* ignore */ } }, [shippingOpen]);
  useEffect(() => { try { localStorage.setItem("sidebar:returnsOpen", String(returnsOpen)); } catch { /* ignore */ } }, [returnsOpen]);
  useEffect(() => { try { localStorage.setItem("sidebar:billingOpen", String(billingOpen)); } catch { /* ignore */ } }, [billingOpen]);
  useEffect(() => { try { localStorage.setItem("sidebar:packagingOpen", String(packagingOpen)); } catch { /* ignore */ } }, [packagingOpen]);
  useEffect(() => { try { localStorage.setItem("sidebar:auditOpen", String(auditOpen)); } catch { /* ignore */ } }, [auditOpen]);

  // Auto-expand section when navigating to a route within it
  useEffect(() => { if (isOnDashboardRoute) setDashboardOpen(true); }, [isOnDashboardRoute]);
  useEffect(() => { if (isOnReceivingRoute) setReceivingOpen(true); }, [isOnReceivingRoute]);
  useEffect(() => { if (isOnAllocationRoute) setAllocationOpen(true); }, [isOnAllocationRoute]);
  useEffect(() => { if (isOnSmallParcelRoute) setSmallParcelOpen(true); }, [isOnSmallParcelRoute]);
  useEffect(() => { if (isOnLtlRoute) setLtlOpen(true); }, [isOnLtlRoute]);
  useEffect(() => { if (isOnShippingRoute) setShippingOpen(true); }, [isOnShippingRoute]);
  useEffect(() => { if (isOnReturnsRoute) setReturnsOpen(true); }, [isOnReturnsRoute]);
  useEffect(() => { if (isOnBillingRoute) setBillingOpen(true); }, [isOnBillingRoute]);
  useEffect(() => { if (isOnPackagingRoute) setPackagingOpen(true); }, [isOnPackagingRoute]);
  useEffect(() => { if (isOnAuditRoute) setAuditOpen(true); }, [isOnAuditRoute]);



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

  // ── Warehouse selector ───────────────────────────────────────────────────────
  const { selectedFacilityId, setSelectedFacilityId, facilities, setFacilities } = useWarehouse();
  const { data: knownFacilities } = trpc.pickSchedule.listKnownFacilities.useQuery(undefined, {
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
  // Sync the fetched list into context so other pages can read it without re-fetching
  useEffect(() => {
    if (knownFacilities && knownFacilities.length > 0) {
      setFacilities(knownFacilities);
    }
  }, [knownFacilities]);

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
    return <SharedLoginGate />;
  }

  const initials = user?.name
    ? user.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
    : (user?.email?.[0] ?? "U").toUpperCase();

  // Dock operators only see Carrier Pickup in the sidebar
  const isDockOperator = user?.loginMethod?.startsWith("team:") && user.loginMethod.split(":")[1] === "dock_operator";

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#f3f4f6" }}>
      {/* ── Sidebar ─────────────────────────────────────────────────────────────────── */}
      <aside
        className="w-[260px] shrink-0 flex flex-col h-full"
        style={{ background: "#1b1c21", position: "relative", display: isKiosk ? "none" : undefined }}
      >
        {/* Brand + Warehouse Selector */}
        <div className="pl-2 pr-3 pt-2 pb-2.5 border-b border-white/[0.06]">
          <img src={GD_LOGO} alt="GD Genius" className="h-[117px] w-auto" />
          {/* Warehouse selector buttons */}
          {(knownFacilities ?? facilities).length > 0 && (
            <div className="-mt-1">
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setSelectedFacilityId(null)}
                  className={`text-[10px] font-medium px-2.5 py-0.5 rounded-full transition-colors ${
                    selectedFacilityId === null
                      ? "bg-[#22c55e] text-white"
                      : "bg-white/[0.07] text-[#94a3b8] hover:bg-white/[0.12] hover:text-[#e2e8f0]"
                  }`}
                >
                  All
                </button>
                {(knownFacilities ?? facilities).map((f) => (
                  <button
                    key={f.facilityId}
                    onClick={() => setSelectedFacilityId(f.facilityId)}
                    className={`text-[10px] font-medium px-2.5 py-0.5 rounded-full transition-colors ${
                      selectedFacilityId === f.facilityId
                        ? "bg-[#22c55e] text-white"
                        : "bg-white/[0.07] text-[#94a3b8] hover:bg-white/[0.12] hover:text-[#e2e8f0]"
                    }`}
                  >
                    {f.facilityName.split("-")[0].trim()}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav ref={navRef} onScroll={handleNavScroll} className="flex-1 px-3 py-4 overflow-y-auto space-y-6">
          {/* Dock Operator: simplified nav — Carrier Pickup only */}
          {isDockOperator ? (
            <div className="space-y-2 pt-2">
              <NavItem
                href="/shipping/carrier-pickup"
                label="Carrier Pickup"
                icon={Truck}
                active={location === "/shipping/carrier-pickup"}
              />
            </div>
          ) : (<>
          {/* Dashboard section */}
          <div>
            <button onClick={() => setDashboardOpen((o) => !o)} className="w-full flex items-center justify-between px-2 mb-1 group">
              <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#94a3b8]/50 group-hover:text-[#94a3b8]/80 transition-colors">Dashboard</p>
              <svg className={`w-3 h-3 text-[#94a3b8]/40 group-hover:text-[#94a3b8]/70 transition-transform duration-200 ${dashboardOpen ? "rotate-180" : "rotate-0"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {dashboardOpen && (
              <div className="space-y-0.5">
                {dashboardItems.map(item => (
                  <NavItem
                    key={item.href}
                    {...item}
                    active={location === item.href}
                    exceptionCount={item.exceptionsBadge ? exceptionsCount : undefined}
                    workloadCount={(item as any).workloadBadge ? workloadCriticalCount : undefined}
                    workloadWarehouses={(item as any).workloadBadge ? workloadCriticalWarehouses : undefined}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Receiving section */}
          <div>
            <button onClick={() => setReceivingOpen((o) => !o)} className="w-full flex items-center justify-between px-2 mb-1 group">
              <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#94a3b8]/50 group-hover:text-[#94a3b8]/80 transition-colors">Receiving</p>
              <svg className={`w-3 h-3 text-[#94a3b8]/40 group-hover:text-[#94a3b8]/70 transition-transform duration-200 ${receivingOpen ? "rotate-180" : "rotate-0"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {receivingOpen && (
              <div className="space-y-0.5">
                {receivingItems.map(item => (
                  <NavItem key={item.href} {...item} active={location === item.href} />
                ))}
              </div>
            )}
          </div>

          {/* Allocation section */}
          <div>
            <button onClick={() => setAllocationOpen((o) => !o)} className="w-full flex items-center justify-between px-2 mb-1 group">
              <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#94a3b8]/50 group-hover:text-[#94a3b8]/80 transition-colors">Allocation</p>
              <svg className={`w-3 h-3 text-[#94a3b8]/40 group-hover:text-[#94a3b8]/70 transition-transform duration-200 ${allocationOpen ? "rotate-180" : "rotate-0"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {allocationOpen && (
              <div className="space-y-0.5">
                {allocationItems.map(item => (
                  <NavItem key={item.href} {...item} active={location === item.href} />
                ))}
              </div>
            )}
          </div>

          {/* Small Parcel section */}
          <div>
            <button onClick={() => setSmallParcelOpen((o) => !o)} className="w-full flex items-center justify-between px-2 mb-1 group">
              <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#94a3b8]/50 group-hover:text-[#94a3b8]/80 transition-colors">Small Parcel</p>
              <svg className={`w-3 h-3 text-[#94a3b8]/40 group-hover:text-[#94a3b8]/70 transition-transform duration-200 ${smallParcelOpen ? "rotate-180" : "rotate-0"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {smallParcelOpen && (
              <div className="space-y-0.5">
                {smallParcelItems.map(item => (
                  <NavItem key={item.href} {...item} active={location === item.href} />
                ))}
              </div>
            )}
          </div>

          {/* LTL section */}
          <div>
            <button onClick={() => setLtlOpen((o) => !o)} className="w-full flex items-center justify-between px-2 mb-1 group">
              <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#94a3b8]/50 group-hover:text-[#94a3b8]/80 transition-colors">LTL</p>
              <svg className={`w-3 h-3 text-[#94a3b8]/40 group-hover:text-[#94a3b8]/70 transition-transform duration-200 ${ltlOpen ? "rotate-180" : "rotate-0"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {ltlOpen && (
              <div className="space-y-0.5">
                {ltlItems.map(item => (
                  <NavItem key={item.href} {...item} active={location === item.href} />
                ))}
              </div>
            )}
          </div>

          {/* Shipping section */}
          <div>
            <button onClick={() => setShippingOpen((o) => !o)} className="w-full flex items-center justify-between px-2 mb-1 group">
              <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#94a3b8]/50 group-hover:text-[#94a3b8]/80 transition-colors">Shipping</p>
              <svg className={`w-3 h-3 text-[#94a3b8]/40 group-hover:text-[#94a3b8]/70 transition-transform duration-200 ${shippingOpen ? "rotate-180" : "rotate-0"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {shippingOpen && (
              <div className="space-y-0.5">
                {shippingItems.map(item => (
                  <NavItem key={item.href} {...item} active={location === item.href} />
                ))}
              </div>
            )}
          </div>

          {/* Returns section */}
          <div>
            <button onClick={() => setReturnsOpen((o) => !o)} className="w-full flex items-center justify-between px-2 mb-1 group">
              <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#94a3b8]/50 group-hover:text-[#94a3b8]/80 transition-colors">Returns</p>
              <svg className={`w-3 h-3 text-[#94a3b8]/40 group-hover:text-[#94a3b8]/70 transition-transform duration-200 ${returnsOpen ? "rotate-180" : "rotate-0"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {returnsOpen && (
              <div className="space-y-0.5">
                {returnsItems.map(item => (
                  <NavItem key={item.href} {...item} active={location === item.href} />
                ))}
              </div>
            )}
          </div>

          {/* Billing section */}
          <div>
            <button onClick={() => setBillingOpen((o) => !o)} className="w-full flex items-center justify-between px-2 mb-1 group">
              <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#94a3b8]/50 group-hover:text-[#94a3b8]/80 transition-colors">Billing</p>
              <svg className={`w-3 h-3 text-[#94a3b8]/40 group-hover:text-[#94a3b8]/70 transition-transform duration-200 ${billingOpen ? "rotate-180" : "rotate-0"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {billingOpen && (
              <div className="space-y-0.5">
                {purchaseOrderItems.map(item => (
                  <NavItem key={item.href} {...item} active={location === item.href} />
                ))}
              </div>
            )}
          </div>

          {/* Packaging section */}
          <div>
            <button onClick={() => setPackagingOpen((o) => !o)} className="w-full flex items-center justify-between px-2 mb-1 group">
              <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#94a3b8]/50 group-hover:text-[#94a3b8]/80 transition-colors">Packaging</p>
              <svg className={`w-3 h-3 text-[#94a3b8]/40 group-hover:text-[#94a3b8]/70 transition-transform duration-200 ${packagingOpen ? "rotate-180" : "rotate-0"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {packagingOpen && (
              <div className="space-y-0.5">
                {packagingItems.map(item => (
                  <NavItem key={item.href} {...item} active={location === item.href} />
                ))}
              </div>
            )}
          </div>

          {/* Audit section */}
          <div>
            <button onClick={() => setAuditOpen((o) => !o)} className="w-full flex items-center justify-between px-2 mb-1 group">
              <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#94a3b8]/50 group-hover:text-[#94a3b8]/80 transition-colors">Audit</p>
              <svg className={`w-3 h-3 text-[#94a3b8]/40 group-hover:text-[#94a3b8]/70 transition-transform duration-200 ${auditOpen ? "rotate-180" : "rotate-0"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {auditOpen && (
              <div className="space-y-0.5">
                {auditItems.map(item => (
                  <NavItem key={item.href} {...item} active={location === item.href} />
                ))}
              </div>
            )}
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
          </>)}
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
      <main className="flex-1 overflow-y-auto flex flex-col">
        {children}
      </main>

    </div>
  );
}

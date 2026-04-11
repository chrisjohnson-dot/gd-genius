import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Package,
  ClipboardList,
  History,
  Settings,
  Truck,
  Scan,
  BarChart3,
  ShoppingCart,
  RotateCcw,
  Inbox,
  MapPin,
  FileText,
  Layers,
  Zap,
  Search,
  ArrowRight,
} from "lucide-react";

// ─── Static page index ────────────────────────────────────────────────────────
interface PageEntry {
  title: string;
  path: string;
  group: string;
  keywords?: string;
  icon: React.ReactNode;
}

const PAGES: PageEntry[] = [
  // Dashboard
  { title: "Home — Overview", path: "/", group: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" />, keywords: "home overview dashboard" },
  { title: "Open Orders — B2B", path: "/open-orders", group: "Dashboard", icon: <Inbox className="h-4 w-4" />, keywords: "b2b orders open" },
  { title: "Open Orders — D2C", path: "/open-orders-d2c", group: "Dashboard", icon: <Inbox className="h-4 w-4" />, keywords: "d2c orders open direct to consumer" },
  { title: "SLA Performance", path: "/sla-performance", group: "Dashboard", icon: <BarChart3 className="h-4 w-4" />, keywords: "sla performance metrics" },

  // Allocation
  { title: "Run Allocation Wizard", path: "/allocate", group: "Allocation", icon: <Zap className="h-4 w-4" />, keywords: "allocate run wizard" },
  { title: "Run History", path: "/history", group: "Allocation", icon: <History className="h-4 w-4" />, keywords: "allocation history runs" },
  { title: "Allocation Rules", path: "/rules", group: "Allocation", icon: <ClipboardList className="h-4 w-4" />, keywords: "allocation rules config" },
  { title: "Client Visibility", path: "/client-visibility", group: "Allocation", icon: <Layers className="h-4 w-4" />, keywords: "client visibility filter" },

  // Receiving
  { title: "Receiving Dashboard", path: "/receiving", group: "Receiving", icon: <Package className="h-4 w-4" />, keywords: "receiving inbound" },
  { title: "Run Put Away Wizard", path: "/receiving/put-away", group: "Receiving", icon: <MapPin className="h-4 w-4" />, keywords: "put away putaway wizard" },
  { title: "Put Away List", path: "/receiving/put-away/list", group: "Receiving", icon: <ClipboardList className="h-4 w-4" />, keywords: "put away list" },
  { title: "Pallet Capture", path: "/receiving/pallet-capture", group: "Receiving", icon: <Layers className="h-4 w-4" />, keywords: "pallet capture receive" },
  { title: "Purchase Orders", path: "/purchase-orders", group: "Receiving", icon: <ShoppingCart className="h-4 w-4" />, keywords: "purchase orders po" },

  // QC
  { title: "QC Scanner", path: "/qc/scanner", group: "QC", icon: <Scan className="h-4 w-4" />, keywords: "qc scanner quality control" },
  { title: "QC Reports", path: "/qc/reports", group: "QC", icon: <BarChart3 className="h-4 w-4" />, keywords: "qc reports quality" },
  { title: "Flagged Scans", path: "/qc/flagged", group: "QC", icon: <FileText className="h-4 w-4" />, keywords: "flagged scans qc" },
  { title: "Production Line", path: "/qc/production-line", group: "QC", icon: <Layers className="h-4 w-4" />, keywords: "production line qc" },
  { title: "Scan Label", path: "/qc/scan-label", group: "QC", icon: <Scan className="h-4 w-4" />, keywords: "scan label qc" },

  // Shipping
  { title: "Shipping Dashboard", path: "/shipping", group: "Shipping", icon: <Truck className="h-4 w-4" />, keywords: "shipping dashboard" },
  { title: "Ship Orders", path: "/shipping/orders", group: "Shipping", icon: <Truck className="h-4 w-4" />, keywords: "ship orders shipping" },
  { title: "Shipping History", path: "/shipping/history", group: "Shipping", icon: <History className="h-4 w-4" />, keywords: "shipping history" },
  { title: "Pallet Scanner", path: "/shipping/pallet-scan", group: "Shipping", icon: <Scan className="h-4 w-4" />, keywords: "pallet scan shipping" },

  // Small Parcel
  { title: "Small Parcel — Rate Wizard", path: "/small-parcel/rate-wizard", group: "Small Parcel", icon: <Zap className="h-4 w-4" />, keywords: "small parcel rate wizard fedex" },
  { title: "Small Parcel — History", path: "/small-parcel/history", group: "Small Parcel", icon: <History className="h-4 w-4" />, keywords: "small parcel history labels" },
  { title: "Small Parcel — Audit Log", path: "/small-parcel/audit-log", group: "Small Parcel", icon: <FileText className="h-4 w-4" />, keywords: "small parcel audit log" },
  { title: "Small Parcel — Settings", path: "/small-parcel/settings", group: "Small Parcel", icon: <Settings className="h-4 w-4" />, keywords: "small parcel settings" },
  { title: "Packaging Inventory", path: "/small-parcel/packaging", group: "Small Parcel", icon: <Package className="h-4 w-4" />, keywords: "packaging inventory boxes" },

  // Returns
  { title: "Returns Dashboard", path: "/returns", group: "Returns", icon: <RotateCcw className="h-4 w-4" />, keywords: "returns dashboard rma" },
  { title: "Process Returns", path: "/returns/process", group: "Returns", icon: <RotateCcw className="h-4 w-4" />, keywords: "process returns rma" },

  // Settings
  { title: "Settings", path: "/settings", group: "Settings", icon: <Settings className="h-4 w-4" />, keywords: "settings config" },
  { title: "Location Config", path: "/locations", group: "Settings", icon: <MapPin className="h-4 w-4" />, keywords: "location config warehouse" },
  { title: "Schedule Settings", path: "/schedule", group: "Settings", icon: <ClipboardList className="h-4 w-4" />, keywords: "schedule settings automation" },
  { title: "Audit Log", path: "/audit", group: "Settings", icon: <FileText className="h-4 w-4" />, keywords: "audit log history" },
  { title: "Diagnostics", path: "/diagnostics", group: "Settings", icon: <Search className="h-4 w-4" />, keywords: "diagnostics debug" },
];

const RECENT_PAGES_KEY = "gd_genius_recent_pages";
const MAX_RECENT = 5;

function getRecentPages(): PageEntry[] {
  try {
    const stored = localStorage.getItem(RECENT_PAGES_KEY);
    if (!stored) return [];
    const paths: string[] = JSON.parse(stored);
    return paths
      .map((p) => PAGES.find((pg) => pg.path === p))
      .filter(Boolean) as PageEntry[];
  } catch {
    return [];
  }
}

function addRecentPage(path: string) {
  try {
    const stored = localStorage.getItem(RECENT_PAGES_KEY);
    const paths: string[] = stored ? JSON.parse(stored) : [];
    const updated = [path, ...paths.filter((p) => p !== path)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(updated));
  } catch {}
}

// ─── Component ────────────────────────────────────────────────────────────────
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, navigate] = useLocation();
  const [recentPages, setRecentPages] = useState<PageEntry[]>([]);

  // Refresh recent pages when opening
  useEffect(() => {
    if (open) {
      setRecentPages(getRecentPages());
    }
  }, [open]);

  // Global keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelect = useCallback(
    (path: string) => {
      addRecentPage(path);
      setOpen(false);
      setQuery("");
      navigate(path);
    },
    [navigate]
  );

  // Filter pages by query
  const filteredPages = query.trim()
    ? PAGES.filter((p) => {
        const q = query.toLowerCase();
        return (
          p.title.toLowerCase().includes(q) ||
          p.group.toLowerCase().includes(q) ||
          (p.keywords ?? "").toLowerCase().includes(q)
        );
      })
    : [];

  // Group filtered pages
  const grouped = filteredPages.reduce<Record<string, PageEntry[]>>((acc, p) => {
    if (!acc[p.group]) acc[p.group] = [];
    acc[p.group].push(p);
    return acc;
  }, {});

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <CommandInput
        placeholder="Search pages, orders, clients…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
            <Search className="h-8 w-8 opacity-40" />
            <p className="text-sm">No results for &ldquo;{query}&rdquo;</p>
          </div>
        </CommandEmpty>

        {/* Recent pages (shown when no query) */}
        {!query.trim() && recentPages.length > 0 && (
          <>
            <CommandGroup heading="Recent">
              {recentPages.map((page) => (
                <CommandItem
                  key={`recent-${page.path}`}
                  value={`recent-${page.path}`}
                  onSelect={() => handleSelect(page.path)}
                  className="flex items-center gap-2"
                >
                  <span className="text-muted-foreground">{page.icon}</span>
                  <span>{page.title}</span>
                  <ArrowRight className="ml-auto h-3 w-3 text-muted-foreground opacity-50" />
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* All pages (shown when no query) */}
        {!query.trim() && (
          <CommandGroup heading="All Pages">
            {PAGES.map((page) => (
              <CommandItem
                key={page.path}
                value={page.path + " " + page.title + " " + (page.keywords ?? "")}
                onSelect={() => handleSelect(page.path)}
                className="flex items-center gap-2"
              >
                <span className="text-muted-foreground">{page.icon}</span>
                <span>{page.title}</span>
                <span className="ml-auto text-xs text-muted-foreground">{page.group}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Filtered results grouped by section */}
        {query.trim() &&
          Object.entries(grouped).map(([group, pages]) => (
            <CommandGroup key={group} heading={group}>
              {pages.map((page) => (
                <CommandItem
                  key={page.path}
                  value={page.path + " " + page.title + " " + (page.keywords ?? "")}
                  onSelect={() => handleSelect(page.path)}
                  className="flex items-center gap-2"
                >
                  <span className="text-muted-foreground">{page.icon}</span>
                  <span>{page.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
      </CommandList>

      {/* Footer hint */}
      <div className="border-t border-border px-3 py-2 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span><kbd className="font-mono bg-muted px-1 rounded text-[10px]">↑↓</kbd> navigate</span>
        <span><kbd className="font-mono bg-muted px-1 rounded text-[10px]">↵</kbd> open</span>
        <span><kbd className="font-mono bg-muted px-1 rounded text-[10px]">Esc</kbd> close</span>
        <span className="ml-auto"><kbd className="font-mono bg-muted px-1 rounded text-[10px]">⌘K</kbd> toggle</span>
      </div>
    </CommandDialog>
  );
}

/**
 * Open Orders — D2C
 *
 * This page is a channel-filtered view of the order dashboard showing only
 * clients whose orderChannel is "d2c" or "both" in Client Visibility settings.
 *
 * It reuses all of the same components as the B2B (Home) page, but queries
 * pickSchedule.listByChannel with channel="d2c" and labels itself accordingly.
 */
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  MessageSquare,
  Package,
  PackageSearch,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Users,
  Warehouse,
  X,
  Truck,
  FlaskConical,
  ClipboardCheck,
  ShipIcon,
  ChevronRight,
  ChevronLeft,
  UserCheck,
  Maximize2,
  Minimize2,
  ArrowLeft,
  BellOff,
  TrendingUp,
  AlertCircle,
  CalendarPlus,
  CalendarX,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { FileDown, FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Re-export the same types and components from Home ────────────────────────
// Rather than duplicating 1900 lines, we import the internal sub-components
// directly from Home.tsx. The page component itself is a thin wrapper that
// passes channel="d2c" to the query.

// Because Home.tsx exports only the default export, we build a minimal but
// functionally equivalent page here that mirrors the Home page structure
// but uses the D2C channel filter and appropriate labels.

type LifecycleStatus = "unallocated" | "allocated" | "picking" | "qc" | "qc_complete" | "ship_ready";

const LIFECYCLE_CONFIG: Record<LifecycleStatus, { label: string; bg: string; border: string; text: string }> = {
  unallocated: { label: "Unallocated", bg: "#fef3c7", border: "#fde68a", text: "#92400e" },
  allocated:   { label: "Allocated",   bg: "#dbeafe", border: "#bfdbfe", text: "#1e40af" },
  picking:     { label: "Picking",     bg: "#ede9fe", border: "#ddd6fe", text: "#5b21b6" },
  qc:          { label: "QC",          bg: "#fce7f3", border: "#fbcfe8", text: "#9d174d" },
  qc_complete: { label: "QC Complete", bg: "#d1fae5", border: "#a7f3d0", text: "#065f46" },
  ship_ready:  { label: "Ship Ready",  bg: "#dcfce7", border: "#bbf7d0", text: "#14532d" },
};

interface TrackedOrder {
  extensivOrderId: number;
  referenceNum: string | null;
  poNum: string | null;
  clientId: number;
  clientName: string;
  facilityId: number;
  facilityName: string | null;
  shipToName: string | null;
  shipToCity: string | null;
  totalPieces: number | null;
  skuCount: number | null;
  lifecycleStatus: LifecycleStatus;
  assignedAssociate: string | null;
  requiredShipDate: string | null;
  creationDate: string | null;
  firstSeenAt: Date | string;
  allocatedAt: Date | string | null;
  shipwellStatus: string | null;
  shipwellBidCount: number | null;
  shipwellQuotingStartedAt: Date | string | null;
  shipwellZeroBidNotifiedAt: Date | string | null;
  shipwellPoUrl: string | null;
  shipwellShipmentUrl: string | null;
  slaExtensionDays: number | null;
}

interface FacilityGroup {
  facilityId: number;
  facilityName: string;
  orders: TrackedOrder[];
}

interface LaneThresholdEntry {
  stage: LifecycleStatus;
  warningHours: number;
  criticalHours: number;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function OpenOrdersD2C() {
  const { data, isLoading, refetch, isFetching } = trpc.pickSchedule.listByChannel.useQuery({ channel: "d2c" });
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);

  const syncNow = trpc.pickSchedule.syncNow.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      setTimeout(() => refetch(), 3000);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const orders: TrackedOrder[] = (data?.orders ?? []) as TrackedOrder[];
  const lastSyncAt = data?.lastSyncAt ? new Date(data.lastSyncAt as string | Date) : null;
  const syncRunning = data?.syncRunning ?? false;

  // Group by facility
  const facilities: FacilityGroup[] = useMemo(() => {
    const map = new Map<number, FacilityGroup>();
    for (const o of orders) {
      const fid = o.facilityId;
      if (!map.has(fid)) {
        map.set(fid, {
          facilityId: fid,
          facilityName: o.facilityName ?? `Warehouse ${fid}`,
          orders: [],
        });
      }
      map.get(fid)!.orders.push(o);
    }
    return Array.from(map.values()).sort((a, b) => a.facilityName.localeCompare(b.facilityName));
  }, [orders]);

  // Global KPIs
  const kpis = useMemo(() => {
    const c: Record<LifecycleStatus, number> = { unallocated: 0, allocated: 0, picking: 0, qc: 0, qc_complete: 0, ship_ready: 0 };
    for (const o of orders) c[o.lifecycleStatus]++;
    return c;
  }, [orders]);

  const selectedFacility = selectedFacilityId !== null
    ? facilities.find((f) => f.facilityId === selectedFacilityId) ?? null
    : null;

  const [pendingClientFilter, setPendingClientFilter] = useState<string>("all");

  const handleBackToGrid = () => {
    setSelectedFacilityId(null);
    setPendingClientFilter("all");
  };

  return (
    <div className="p-5 space-y-4 page-enter">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {selectedFacility && (
            <button
              onClick={handleBackToGrid}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              All Warehouses
            </button>
          )}
          <div>
            <p className="page-breadcrumb">
              {selectedFacility ? `Open Orders — D2C › ${selectedFacility.facilityName}` : "Overview"}
            </p>
            <h1 className="page-title">
              {selectedFacility ? selectedFacility.facilityName : "Open Orders — D2C"}
            </h1>
            {lastSyncAt && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Last synced {lastSyncAt.toLocaleString()}
                {syncRunning && <span className="ml-2 text-amber-500 font-medium animate-pulse">· Syncing…</span>}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncNow.mutate()}
            disabled={syncNow.isPending || syncRunning}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncNow.isPending || syncRunning ? "animate-spin" : ""}`} />
            Sync Now
          </Button>
          <Button asChild className="shadow-sm" style={{ background: "#7c3aed" }}>
            <Link href="/allocate" className="flex items-center gap-2">
              <PackageSearch className="h-4 w-4" />
              Run Allocation Tool
            </Link>
          </Button>
        </div>
      </div>

      {/* D2C channel badge */}
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 border border-purple-200 text-purple-700 text-xs font-semibold">
        <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
        Showing D2C channel orders only — configure channels in{" "}
        <Link href="/client-visibility" className="underline hover:text-purple-900">Client Visibility</Link>
      </div>

      {/* Global KPI bar */}
      {!selectedFacility && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {(Object.entries(LIFECYCLE_CONFIG) as [LifecycleStatus, typeof LIFECYCLE_CONFIG[LifecycleStatus]][]).map(([status, cfg]) => (
            <div
              key={status}
              className="rounded-xl px-3 py-2.5 text-center border"
              style={{ background: cfg.bg, borderColor: cfg.border }}
            >
              <p className="text-[22px] font-extrabold tracking-tight leading-none" style={{ color: cfg.text }}>
                {isLoading ? "—" : kpis[status]}
              </p>
              <p className="text-[9px] mt-1 font-semibold uppercase tracking-[0.04em] truncate" style={{ color: cfg.text }}>
                {cfg.label}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="h-36 bg-muted animate-pulse" />
              <div className="p-5 space-y-3">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="h-10 bg-muted rounded-xl animate-pulse" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No orders yet */}
      {!isLoading && orders.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <Warehouse className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No D2C orders tracked yet.</p>
          <p className="text-xs mt-1 opacity-70">
            Assign clients to the <strong>D2C</strong> or <strong>Both</strong> channel in{" "}
            <Link href="/client-visibility" className="text-primary hover:underline">Client Visibility</Link>{" "}
            to see their orders here.
          </p>
        </div>
      )}

      {/* Facility list — simplified table view for D2C */}
      {!isLoading && !selectedFacility && facilities.length > 0 && (
        <div className="space-y-4">
          {facilities.map((f) => (
            <div key={f.facilityId} className="bg-card border border-border rounded-2xl overflow-hidden">
              {/* Facility header */}
              <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Warehouse className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">{f.facilityName}</span>
                  <span className="text-xs text-muted-foreground">({f.orders.length} orders)</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setSelectedFacilityId(f.facilityId)}
                >
                  Expand →
                </Button>
              </div>
              {/* Order summary table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Client</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Reference</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Ship To</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Pieces</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Req. Ship</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {f.orders.slice(0, 10).map((o) => {
                      const cfg = LIFECYCLE_CONFIG[o.lifecycleStatus];
                      return (
                        <tr key={o.extensivOrderId} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2 font-medium text-xs">{o.clientName}</td>
                          <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                            {o.referenceNum ?? `#${o.extensivOrderId}`}
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">
                            {o.shipToName ?? o.shipToCity ?? "—"}
                          </td>
                          <td className="px-4 py-2 text-right text-xs tabular-nums">{o.totalPieces ?? "—"}</td>
                          <td className="px-4 py-2">
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold"
                              style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}
                            >
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">
                            {o.requiredShipDate
                              ? new Date(o.requiredShipDate).toLocaleDateString()
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {f.orders.length > 10 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-2 text-center text-xs text-muted-foreground">
                          <button
                            onClick={() => setSelectedFacilityId(f.facilityId)}
                            className="text-primary hover:underline"
                          >
                            + {f.orders.length - 10} more orders — click Expand to see all
                          </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drill-down: single facility expanded — show all orders */}
      {!isLoading && selectedFacility && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-3">
            <button
              onClick={handleBackToGrid}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <span className="font-semibold text-sm">{selectedFacility.facilityName}</span>
            <span className="text-xs text-muted-foreground">({selectedFacility.orders.length} orders)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Client</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Reference</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Ship To</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Pieces</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Req. Ship</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {selectedFacility.orders.map((o) => {
                  const cfg = LIFECYCLE_CONFIG[o.lifecycleStatus];
                  return (
                    <tr key={o.extensivOrderId} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2 font-medium text-xs">{o.clientName}</td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                        {o.referenceNum ?? `#${o.extensivOrderId}`}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {o.shipToName ?? o.shipToCity ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-right text-xs tabular-nums">{o.totalPieces ?? "—"}</td>
                      <td className="px-4 py-2">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold"
                          style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}
                        >
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {o.requiredShipDate
                          ? new Date(o.requiredShipDate).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  RefreshCw, Search, AlertTriangle, Timer, CheckCircle2,
  Package, MapPin, Calendar, Clock, Flame,
  TrendingUp, Gavel, Truck, ChevronDown, ChevronUp,
  DollarSign, Zap, Loader2, X,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function daysInOutbound(shipReadyAt: Date | string | null): number {
  if (!shipReadyAt) return 0;
  const start = new Date(shipReadyAt);
  const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((todayMidnight.getTime() - startMidnight.getTime()) / 86_400_000));
}

function isOverdue(order: UnconfirmedOrder): boolean {
  if (order.requiredShipDate) {
    const req = new Date(order.requiredShipDate);
    req.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (req < today) return true;
  }
  return daysInOutbound(order.shipReadyAt) >= 4;
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((d.getTime() - now.getTime()) / 86400000);
}

/** Returns a human-readable elapsed time string and a stale flag (>2h) */
function fmtElapsed(ts: Date | string | null | undefined): { label: string; stale: boolean; ms: number } {
  if (!ts) return { label: "—", stale: false, ms: 0 };
  const date = new Date(ts);
  if (isNaN(date.getTime())) return { label: "—", stale: false, ms: 0 };
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);
  let label: string;
  if (diffMin < 1) label = "Just now";
  else if (diffMin < 60) label = `${diffMin}m ago`;
  else if (diffHr < 24) label = `${diffHr}h ${diffMin % 60}m ago`;
  else label = `${diffDay}d ago`;
  return { label, stale: diffMs > 2 * 3_600_000, ms: diffMs };
}

/** Running clock string for quote age (hh:mm:ss) */
function fmtRunningClock(ts: Date | string | null | undefined, now: number): string {
  if (!ts) return "—";
  const date = new Date(ts);
  if (isNaN(date.getTime())) return "—";
  const diffMs = Math.max(0, now - date.getTime());
  const totalSec = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function shipwellStatusLabel(status: string | null | undefined): { label: string; cls: string } {
  const s = (status ?? '').toLowerCase();
  if (s === 'quoting' || s.includes('quot')) return { label: 'Quoting', cls: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/30' };
  if (s === 'tendered' || s.includes('tender')) return { label: 'Tendered', cls: 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-500/15 dark:text-purple-400 dark:border-purple-500/30' };
  if (s === 'carrier_confirmed' || s.includes('confirm')) return { label: 'Confirmed', cls: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30' };
  if (s === 'in_transit' || s.includes('transit') || s.includes('picked_up')) return { label: 'In Transit', cls: 'bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-400 dark:border-teal-500/30' };
  // Newly pushed orders may have status 'pending', 'new', 'unknown', or similar before Shipwell transitions them
  if (s === 'pending' || s === 'new' || s === 'draft') return { label: 'Pending', cls: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30' };
  if (s === 'unknown' || s === '') return { label: 'Pending', cls: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30' };
  // Fallback: show the raw status capitalised
  return { label: status ? status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Pending', cls: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30' };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type UnconfirmedOrder = {
  id: number;
  extensivOrderId: number;
  referenceNum: string | null;
  clientName: string;
  shipToName: string | null;
  shipToCity: string | null;
  requiredShipDate: string | null;
  shipReadyAt: Date | string | null;
  shipwellStatus: string | null;
  shipwellBidCount: number | null;
  shipwellOrderId: string | null;
  shipwellPoUrl: string | null;
  shipwellShipmentId?: string | null;
  palletCount: number | null;
  outboundLocation: string | null;
  facilityId: number | null;
  facilityName: string | null;
  shipwellStatusUpdatedAt: Date | string | null;
  shipwellQuotingStartedAt: Date | string | null;
  shipwellLastBidAt: Date | string | null;
};

type FilterStatus = "all" | "overdue" | "quoting" | "tendered" | "not_sent" | "stale";

// ─── Rates Panel ──────────────────────────────────────────────────────────────

function RatesPanel({ order }: { order: UnconfirmedOrder }) {
  const utils = trpc.useUtils();

  const { data: rates = [], isLoading } = trpc.shipwell.getRates.useQuery(
    { extensivOrderId: order.extensivOrderId },
    { enabled: true },
  );

  const [selectingId, setSelectingId] = useState<number | null>(null);

  const tenderMutation = trpc.shipwell.tenderShipment.useMutation({
    onSuccess: () => {
      utils.shipwell.getRates.invalidate({ extensivOrderId: order.extensivOrderId });
      utils.shipwell.listUnconfirmed.invalidate();
      toast.success("Carrier rate selected and shipment tendered.");
      setSelectingId(null);
    },
    onError: (err) => {
      toast.error(`Failed to tender shipment: ${err.message}`);
      setSelectingId(null);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-5 px-6 text-sm text-muted-foreground">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        Loading rates from Shipwell…
      </div>
    );
  }

  if (rates.length === 0) {
    return (
      <div className="py-5 px-6 text-sm text-muted-foreground italic">
        No carrier rates available yet. Rates will appear here once Shipwell returns bids.
      </div>
    );
  }

  const selectedRate = rates.find((r) => r.isSelected);
  const cheapestId = rates.reduce((a, b) => (a.totalRateCents <= b.totalRateCents ? a : b)).id;

  return (
    <div className="px-4 pb-4 pt-2 bg-muted/5">
      {/* Sub-header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <DollarSign className="h-3.5 w-3.5" />
          {rates.length} Carrier Rate{rates.length !== 1 ? "s" : ""} from Shipwell
          {rates.some((r) => r.isMock) && (
            <span className="rounded bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300 font-medium normal-case tracking-normal">
              MOCK DATA
            </span>
          )}
        </div>
        {selectedRate && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Selected: {selectedRate.carrierName}
          </div>
        )}
      </div>

      {/* Rates table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/60 border-b border-border">
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Carrier</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Service Level</th>
              <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground">Transit Days</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Est. Delivery</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Total Rate</th>
              <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground w-28">Action</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((rate, idx) => {
              const isCheapest = rate.id === cheapestId;
              const isSelected = rate.isSelected;
              const isPending = selectingId === rate.id;

              return (
                <tr
                  key={rate.id}
                  className={cn(
                    "border-b border-border last:border-0 transition-colors",
                    isSelected
                      ? "bg-emerald-50 dark:bg-emerald-950/20"
                      : idx % 2 === 0
                      ? "bg-background"
                      : "bg-muted/10",
                  )}
                >
                  {/* Carrier */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                      <div>
                        <div className="font-medium text-foreground text-xs">{rate.carrierName}</div>
                        {rate.carrierScac && (
                          <div className="text-[10px] text-muted-foreground font-mono">{rate.carrierScac}</div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Service Level */}
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {rate.serviceLevel ?? "—"}
                  </td>

                  {/* Transit Days */}
                  <td className="px-3 py-2.5 text-center">
                    {rate.transitDays != null ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium">
                        <Truck className="h-3 w-3 text-muted-foreground" />
                        {rate.transitDays}d
                      </span>
                    ) : "—"}
                  </td>

                  {/* Est. Delivery */}
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {rate.estimatedDelivery ?? "—"}
                  </td>

                  {/* Rate */}
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {isCheapest && !isSelected && (
                        <span className="rounded bg-emerald-100 dark:bg-emerald-900/30 px-1 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                          BEST
                        </span>
                      )}
                      <span className={cn(
                        "font-semibold tabular-nums text-sm",
                        isSelected ? "text-emerald-700 dark:text-emerald-400" : "text-foreground"
                      )}>
                        {formatCents(rate.totalRateCents)}
                      </span>
                    </div>
                  </td>

                  {/* Action */}
                  <td className="px-3 py-2.5 text-center">
                    {isSelected ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Selected
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-3 text-xs"
                        disabled={isPending || tenderMutation.isPending}
                        onClick={() => {
                          setSelectingId(rate.id);
                          tenderMutation.mutate({
                            extensivOrderId: order.extensivOrderId,
                            rateId: rate.id,
                          });
                        }}
                      >
                        {isPending ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          "Select Rate"
                        )}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedRate?.selectedAt && (
        <div className="mt-1.5 text-[11px] text-muted-foreground">
          Selected by {selectedRate.selectedBy ?? "unknown"} · {fmtElapsed(selectedRate.selectedAt).label}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ConfirmShipping() {
  const { selectedFacilityId, selectedFacilityName } = useWarehouse();
  const [activeTab, setActiveTab] = useState<"live" | "local">("live");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [refreshingIds, setRefreshingIds] = useState<Set<number>>(new Set());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [liveExpandedId, setLiveExpandedId] = useState<string | null>(null);
  const [tenderingBidId, setTenderingBidId] = useState<string | null>(null);
  const [confirmTender, setConfirmTender] = useState<{ bidId: string; shipmentId: string; carrierName: string; rate: number | null } | null>(null);

  const utils = trpc.useUtils();

  const tenderLiveBidMutation = trpc.shipwell.tenderLiveBid.useMutation({
    onSuccess: () => {
      toast.success("Carrier tendered successfully");
      setConfirmTender(null);
      setTenderingBidId(null);
      utils.shipwell.listOutstandingQuotes.invalidate();
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to tender carrier");
      setTenderingBidId(null);
    },
  });
  // Live quotes directly from Shipwell API
  const { data: liveData, isLoading: liveLoading, refetch: liveRefetch } = trpc.shipwell.listOutstandingQuotes.useQuery(
    undefined,
    { refetchInterval: 60_000 }
  );
  const liveShipments = liveData?.shipments ?? [];
  const liveError = liveData?.error ?? null;
  // Facility filter for Live Quotes tab
  const [liveFacilityFilter, setLiveFacilityFilter] = useState<string>("all");
  const [liveCustomerFilter, setLiveCustomerFilter] = useState<string>("all");
  const [liveStatusFilter, setLiveStatusFilter] = useState<string>("all");
  const [liveSearchText, setLiveSearchText] = useState<string>("");
  const [liveDateFrom, setLiveDateFrom] = useState<string>("");
  const [liveDateTo, setLiveDateTo] = useState<string>("");

  const liveFacilityOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [];
    for (const s of liveShipments) {
      const city = (s as any).originCity ?? "";
      const state = (s as any).originState ?? "";
      const key = city && state ? `${city}, ${state}` : city || state || "Unknown";
      if (key && !seen.has(key)) {
        seen.add(key);
        opts.push({ value: key, label: key });
      }
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [liveShipments]);

  const liveCustomerOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [];
    for (const s of liveShipments) {
      const name = (s as any).gdClientName ?? (s as any).customerName ?? "";
      if (name && !seen.has(name)) {
        seen.add(name);
        opts.push({ value: name, label: name });
      }
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [liveShipments]);

  const liveStatusOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const s of liveShipments) {
      const st = (s as any).status ?? "unknown";
      seen.add(st);
    }
    return Array.from(seen).sort();
  }, [liveShipments]);

  const filteredLiveShipments = useMemo(() => {
    return (liveShipments as any[]).filter((s) => {
      // Auto-filter by selected warehouse facility (from sidebar pill)
      if (selectedFacilityId != null) {
        if ((s.gdFacilityId ?? null) !== selectedFacilityId) return false;
      }
      // Manual facility filter (origin city/state dropdown)
      if (liveFacilityFilter !== "all") {
        const city = s.originCity ?? "";
        const state = s.originState ?? "";
        const key = city && state ? `${city}, ${state}` : city || state || "Unknown";
        if (key !== liveFacilityFilter) return false;
      }
      // GD Customer
      if (liveCustomerFilter !== "all") {
        const name = s.gdClientName ?? s.customerName ?? "";
        if (name !== liveCustomerFilter) return false;
      }
      // Status
      if (liveStatusFilter !== "all") {
        if ((s.status ?? "unknown") !== liveStatusFilter) return false;
      }
      // Free-text search (reference, customer, shipment ID)
      if (liveSearchText.trim()) {
        const q = liveSearchText.trim().toLowerCase();
        const haystack = [
          s.shipmentId ?? "",
          s.referenceId ?? "",
          s.customerReferenceNumber ?? "",
          s.gdClientName ?? "",
          s.customerName ?? "",
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      // Date Sent range
      if (liveDateFrom) {
        const sent = s.sentToShipwellAt ? new Date(s.sentToShipwellAt) : null;
        if (!sent || sent < new Date(liveDateFrom)) return false;
      }
      if (liveDateTo) {
        const sent = s.sentToShipwellAt ? new Date(s.sentToShipwellAt) : null;
        // Include the full end day
        const endOfDay = new Date(liveDateTo);
        endOfDay.setHours(23, 59, 59, 999);
        if (!sent || sent > endOfDay) return false;
      }
      return true;
    });
  }, [liveShipments, liveFacilityFilter, liveCustomerFilter, liveStatusFilter, liveSearchText, liveDateFrom, liveDateTo]);
  // Live clock tick (every second for running quote age)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { data: orders = [], isLoading, refetch } = trpc.shipwell.listUnconfirmed.useQuery(
    undefined,
    { refetchInterval: 60_000 }
  );

  const refreshAllStaleMutation = trpc.shipwell.refreshAllStale.useMutation({
    onSuccess: (data) => {
      toast.success(`Refreshed ${data.refreshed} stale order${data.refreshed !== 1 ? 's' : ''}${data.failed > 0 ? ` (${data.failed} failed)` : ''}.`);
      setIsRefreshingAll(false);
      void refetch();
    },
    onError: (err) => {
      toast.error(`Bulk refresh failed: ${err.message}`);
      setIsRefreshingAll(false);
    },
  });

  const refreshStatusMutation = trpc.shipwell.refreshOrderStatus.useMutation({
    onSuccess: (data, variables) => {
      const newStatus = data.shipwellStatus ?? "unknown";
      const bidInfo = data.shipwellBidCount != null
        ? ` · ${data.shipwellBidCount} bid${data.shipwellBidCount !== 1 ? "s" : ""}`
        : "";
      toast.success(`Status updated: ${newStatus}${bidInfo}`);
      setRefreshingIds((prev) => { const s = new Set(prev); s.delete(variables.extensivOrderId); return s; });
      void refetch();
    },
    onError: (err, variables) => {
      toast.error(`Refresh failed: ${err.message}`);
      setRefreshingIds((prev) => { const s = new Set(prev); s.delete(variables.extensivOrderId); return s; });
    },
  });

  // Stale = quoting for >2h without a confirmed rate
  const isStaleQuote = useCallback((order: UnconfirmedOrder): boolean => {
    if (order.shipwellStatus !== "quoting") return false;
    if (!order.shipwellQuotingStartedAt) return false;
    return (now - new Date(order.shipwellQuotingStartedAt).getTime()) > 2 * 3_600_000;
  }, [now]);

  // Facility-scoped orders for Local Tracking tab
  const facilityOrders = useMemo(() => {
    if (selectedFacilityId == null) return orders;
    return orders.filter((o) => o.facilityId === selectedFacilityId);
  }, [orders, selectedFacilityId]);

  // KPI counts
  const totalCount = facilityOrders.length;
  const overdueCount = useMemo(() => facilityOrders.filter(isOverdue).length, [facilityOrders]);
  const quotingCount = useMemo(() => facilityOrders.filter((o) => o.shipwellStatus === "quoting").length, [facilityOrders]);
  const notSentCount = useMemo(() => facilityOrders.filter((o) => !o.shipwellStatus).length, [facilityOrders]);
  const tenderedCount = useMemo(() => facilityOrders.filter((o) => o.shipwellStatus === "tendered").length, [facilityOrders]);
  const staleCount = useMemo(() => facilityOrders.filter(isStaleQuote).length, [facilityOrders, isStaleQuote]);

  // Filtered + sorted list
  const filtered = useMemo(() => {
    let list = [...facilityOrders];
    if (filterStatus === "overdue") list = list.filter(isOverdue);
    else if (filterStatus === "quoting") list = list.filter((o) => o.shipwellStatus === "quoting");
    else if (filterStatus === "tendered") list = list.filter((o) => o.shipwellStatus === "tendered");
    else if (filterStatus === "not_sent") list = list.filter((o) => !o.shipwellStatus);
    else if (filterStatus === "stale") list = list.filter(isStaleQuote);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (o) =>
          (o.referenceNum ?? "").toLowerCase().includes(q) ||
          o.clientName.toLowerCase().includes(q) ||
          (o.shipToName ?? "").toLowerCase().includes(q) ||
          (o.shipToCity ?? "").toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      const aOver = isOverdue(a) ? 2 : isStaleQuote(a) ? 1 : 0;
      const bOver = isOverdue(b) ? 2 : isStaleQuote(b) ? 1 : 0;
      if (bOver !== aOver) return bOver - aOver;
      return daysInOutbound(b.shipReadyAt) - daysInOutbound(a.shipReadyAt);
    });
    return list;
  }, [orders, filterStatus, search, isStaleQuote]);

  const filterButtons: { key: FilterStatus; label: string; count: number; urgent?: boolean }[] = [
    { key: "all", label: "All", count: totalCount },
    { key: "overdue", label: "Overdue", count: overdueCount },
    { key: "stale", label: "Needs Attention", count: staleCount, urgent: true },
    { key: "quoting", label: "Quoting", count: quotingCount },
    { key: "tendered", label: "Tendered", count: tenderedCount },
    { key: "not_sent", label: "Not Sent", count: notSentCount },
  ];

  return (
    <div className="p-6 max-w-[1500px] mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Shipping Quotes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review outstanding Shipwell rates and select a carrier for each order.
          </p>
        </div>
        {staleCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 px-4 py-2.5 text-sm text-red-700 dark:text-red-400">
            <Flame className="h-4 w-4 shrink-0" />
            <span className="font-semibold">{staleCount} order{staleCount !== 1 ? 's' : ''}</span>
            <span>waiting on quotes for over 2 hours — action required</span>
            <Button
              size="sm"
              variant="outline"
              className="ml-2 h-7 px-3 text-xs border-red-400 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 bg-transparent"
              disabled={isRefreshingAll}
              onClick={() => {
                setIsRefreshingAll(true);
                refreshAllStaleMutation.mutate();
              }}
            >
              {isRefreshingAll ? (
                <RefreshCw className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Zap className="h-3 w-3 mr-1" />
              )}
              Refresh All Stale
            </Button>
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 mb-6 border-b border-border">
        <button
          onClick={() => setActiveTab("live")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === "live"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Live Quotes from Shipwell
          {liveShipments.length > 0 && (
            <span className="ml-2 rounded-full bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
              {liveShipments.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("local")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === "local"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Local Tracking
          {facilityOrders.length > 0 && (
            <span className="ml-2 rounded-full bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
              {facilityOrders.length}
            </span>
          )}
        </button>
      </div>

      {/* ── LIVE QUOTES TAB ── */}
      {activeTab === "live" && (
        <div>
          {/* ── Filter bar ── */}
          <div className="mb-4 space-y-2">
            {/* Row 1: search + refresh */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={liveSearchText}
                  onChange={(e) => setLiveSearchText(e.target.value)}
                  placeholder="Search reference, customer, shipment ID…"
                  className="h-8 pl-8 text-xs"
                />
                {liveSearchText && (
                  <button onClick={() => setLiveSearchText("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => void liveRefetch()} disabled={liveLoading}>
                <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", liveLoading && "animate-spin")} />
                Refresh
              </Button>
              {/* Clear all filters */}
              {(liveCustomerFilter !== "all" || liveStatusFilter !== "all" || liveFacilityFilter !== "all" || liveSearchText || liveDateFrom || liveDateTo) && (
                <Button size="sm" variant="ghost" className="text-xs text-muted-foreground h-8 px-2" onClick={() => {
                  setLiveCustomerFilter("all"); setLiveStatusFilter("all"); setLiveFacilityFilter("all");
                  setLiveSearchText(""); setLiveDateFrom(""); setLiveDateTo("");
                }}>
                  <X className="h-3 w-3 mr-1" /> Clear filters
                </Button>
              )}
            </div>
            {/* Row 2: dropdowns + date range */}
            <div className="flex flex-wrap items-center gap-2">
              {/* GD Customer */}
              {liveCustomerOptions.length > 0 && (
                <select
                  value={liveCustomerFilter}
                  onChange={(e) => setLiveCustomerFilter(e.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="all">All Customers</option>
                  {liveCustomerOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              )}
              {/* Status */}
              {liveStatusOptions.length > 0 && (
                <select
                  value={liveStatusFilter}
                  onChange={(e) => setLiveStatusFilter(e.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="all">All Statuses</option>
                  {liveStatusOptions.map((st) => {
                    const { label } = shipwellStatusLabel(st);
                    return <option key={st} value={st}>{label}</option>;
                  })}
                </select>
              )}
              {/* Facility (origin) */}
              {liveFacilityOptions.length > 0 && (
                <select
                  value={liveFacilityFilter}
                  onChange={(e) => setLiveFacilityFilter(e.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="all">All Facilities</option>
                  {liveFacilityOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              )}
              {/* Date Sent range */}
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Sent from</span>
                <input
                  type="date"
                  value={liveDateFrom}
                  onChange={(e) => setLiveDateFrom(e.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <input
                  type="date"
                  value={liveDateTo}
                  onChange={(e) => setLiveDateTo(e.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex items-center gap-2 ml-auto">
                {selectedFacilityId != null && selectedFacilityName && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[10px] font-semibold">
                    <MapPin className="h-2.5 w-2.5" />
                    {selectedFacilityName}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {filteredLiveShipments.length} of {liveShipments.length} shipment{liveShipments.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>
          {liveError && (
            <div className="mb-4 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
              <AlertTriangle className="inline h-4 w-4 mr-1.5" />
              Shipwell API error: {liveError}
            </div>
          )}
          {liveLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Fetching live quotes from Shipwell…
            </div>
          ) : filteredLiveShipments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <div className="text-sm font-medium">No active shipments</div>
              <div className="text-xs">No active shipments found in Shipwell (delivered and cancelled are excluded).</div>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Date Sent</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Shipwell ID</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Reference</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">GD Customer</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Origin → Destination</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Pickup Date</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Bids</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLiveShipments.map((s: any, idx: number) => {
                    const isExpanded = liveExpandedId === (s.shipmentId ?? s.id);
                    const bids: any[] = s.bids ?? [];
                    return (
                      <React.Fragment key={s.shipmentId ?? s.id ?? idx}>
                        <tr
                          key={`live-${s.shipmentId ?? s.id}`}
                          className={cn(
                            "border-b border-border transition-colors cursor-pointer",
                            isExpanded ? "bg-primary/5" : idx % 2 === 0 ? "bg-background hover:bg-muted/30" : "bg-muted/10 hover:bg-muted/30"
                          )}
                          onClick={() => setLiveExpandedId(isExpanded ? null : (s.shipmentId ?? s.id))}
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            {s.sentToShipwellAt ? (
                              <div className="flex flex-col">
                                <span className="text-xs font-medium">{new Date(s.sentToShipwellAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                <span className="text-[11px] text-muted-foreground">{new Date(s.sentToShipwellAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs text-muted-foreground">{(s.shipmentId ?? s.id)?.slice(0, 8)}…</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono font-semibold text-xs">{s.referenceId ?? s.customerReferenceNumber ?? "—"}</span>
                          </td>
                          <td className="px-4 py-3">
                            {s.gdClientName ? (
                              <div className="flex flex-col">
                                <span className="text-xs font-semibold">{s.gdClientName}</span>
                                {s.customerName && s.customerName !== s.gdClientName && (
                                  <span className="text-[11px] text-muted-foreground">{s.customerName}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs">{s.customerName ?? "—"}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span>{s.originCity ?? "?"}{s.originState ? `, ${s.originState}` : ""}</span>
                              <span className="mx-1">→</span>
                              <span>{s.destCity ?? "?"}{s.destState ? `, ${s.destState}` : ""}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs">{s.pickupDate ? new Date(s.pickupDate).toLocaleDateString() : "—"}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {bids.length > 0 ? (
                              <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                                {bids.length}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {(() => { const sl = shipwellStatusLabel(s.status); return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${sl.cls}`}>{sl.label}</span>; })()}
                          </td>
                          <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm" variant="ghost" className="h-7 w-7 p-0"
                              title={isExpanded ? "Collapse bids" : "View carrier bids"}
                              onClick={() => setLiveExpandedId(isExpanded ? null : (s.shipmentId ?? s.id))}
                            >
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </Button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-b border-border">
                            <td colSpan={9} className="p-0">
                              <div className="px-4 pb-4 pt-2 bg-muted/5">
                                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                                  <DollarSign className="h-3.5 w-3.5" />
                                  {bids.length} Carrier Bid{bids.length !== 1 ? "s" : ""} from Shipwell
                                </div>
                                {bids.length === 0 ? (
                                  <p className="text-sm text-muted-foreground italic">No bids received yet.</p>
                                ) : (
                                  <div className="rounded-lg border border-border overflow-hidden">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="bg-muted/60 border-b border-border">
                                          <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Contact</th>
                                          <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">MC# / DOT#</th>
                                          <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Bid Amount</th>
                                          <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Available</th>
                                          <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Distance</th>
                                          <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Notes</th>
                                          <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground">Action</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {bids.map((bid: any, bidIdx: number) => (
                                          <tr key={bid.id ?? bidIdx} className={cn("border-b border-border last:border-0", bidIdx % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                                            <td className="px-3 py-2.5">
                                              <div className="font-medium text-foreground text-xs">{bid.contactName ?? "—"}</div>
                                              {bid.createdByUser && bid.createdByUser !== bid.contactName && (
                                                <div className="text-[10px] text-muted-foreground">via {bid.createdByUser}</div>
                                              )}
                                            </td>
                                            <td className="px-3 py-2.5 font-mono text-[10px] text-muted-foreground">
                                              {bid.mcNumber ? <div>MC: {bid.mcNumber}</div> : null}
                                              {bid.usdotNumber ? <div>DOT: {bid.usdotNumber}</div> : null}
                                              {!bid.mcNumber && !bid.usdotNumber ? "—" : null}
                                            </td>
                                            <td className="px-3 py-2.5 text-right">
                                              <span className="font-semibold text-xs text-emerald-700 dark:text-emerald-400">
                                                {bid.bidAmount != null
                                                  ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(bid.bidAmount)
                                                  : "—"}
                                              </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-xs text-muted-foreground">
                                              {bid.availableDate
                                                ? new Date(bid.availableDate).toLocaleDateString()
                                                : "—"}
                                            </td>
                                            <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">
                                              {bid.distanceMiles != null ? `${Number(bid.distanceMiles).toFixed(0)} mi` : "—"}
                                            </td>
                                            <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[160px] truncate">
                                              {bid.notes ?? "—"}
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                              <Button
                                                size="sm"
                                                variant="default"
                                                className="h-6 px-2 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white"
                                                disabled={tenderingBidId === bid.id}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  const rate = bid.bidAmount ?? null;
                                                  const carrier = bid.contactName ?? "Unknown Carrier";
                                                  setConfirmTender({ bidId: bid.id, shipmentId: s.shipmentId ?? s.id, carrierName: carrier, rate });
                                                }}
                                              >
                                                {tenderingBidId === bid.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Tender"}
                                              </Button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TENDER CONFIRMATION DIALOG (Live Quotes) ── */}
      {confirmTender && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold mb-1">Confirm Tender</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Tender <span className="font-semibold text-foreground">{confirmTender.carrierName}</span>
              {confirmTender.rate != null && (
                <> at <span className="font-semibold text-foreground">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(confirmTender.rate)}</span></>
              )}?
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setConfirmTender(null)} disabled={tenderLiveBidMutation.isPending}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={tenderLiveBidMutation.isPending}
                onClick={() => {
                  setTenderingBidId(confirmTender.bidId);
                  tenderLiveBidMutation.mutate({
                    bidId: confirmTender.bidId,
                    shipwellShipmentId: confirmTender.shipmentId,
                    carrierName: confirmTender.carrierName,
                    totalCharge: confirmTender.rate ?? undefined,
                  });
                }}
              >
                {tenderLiveBidMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirm Tender"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── LOCAL TRACKING TAB ── */}
      {activeTab === "local" && (
        <div>

      {/* KPI tiles */}
      <div className="grid grid-cols-6 gap-3 mb-6">
        {[
          { key: "all" as FilterStatus, label: "Unconfirmed", value: totalCount, icon: TrendingUp, color: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300" },
          { key: "overdue" as FilterStatus, label: "Overdue", value: overdueCount, icon: AlertTriangle, color: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
          { key: "stale" as FilterStatus, label: "Needs Attention", value: staleCount, icon: Flame, color: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" },
          { key: "quoting" as FilterStatus, label: "Quoting", value: quotingCount, icon: Gavel, color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" },
          { key: "tendered" as FilterStatus, label: "Tendered", value: tenderedCount, icon: Timer, color: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" },
          { key: "not_sent" as FilterStatus, label: "Not Sent", value: notSentCount, icon: Package, color: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300" },
        ].map(({ key, label, value, icon: Icon, color }) => (
          <button
            key={key}
            onClick={() => setFilterStatus(filterStatus === key ? "all" : key)}
            className={cn(
              "flex flex-col gap-1 rounded-lg border p-4 text-left transition-all bg-card hover:bg-accent/50",
              filterStatus === key && "ring-2 ring-primary",
              key === "stale" && value > 0 && "border-orange-300 dark:border-orange-700"
            )}
          >
            <div className="flex items-center gap-2">
              <div className={cn("rounded-md p-1.5", color)}>
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <span className={cn("text-2xl font-bold", key === "stale" && value > 0 ? "text-orange-600 dark:text-orange-400" : "")}>{value}</span>
          </button>
        ))}
      </div>

      {/* Search + filter bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-9 text-sm"
            placeholder="Search order, client, ship-to…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {filterButtons.map((fb) => (
            <button
              key={fb.key}
              onClick={() => setFilterStatus(fb.key)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors border",
                filterStatus === fb.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : fb.urgent && fb.count > 0
                  ? "bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-700 hover:bg-orange-100"
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              )}
            >
              {fb.label}
              <span className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                filterStatus === fb.key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                {fb.count}
              </span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {selectedFacilityId != null && selectedFacilityName && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[10px] font-semibold">
              <MapPin className="h-2.5 w-2.5" />
              {selectedFacilityName}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {filtered.length} order{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Orders table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading orders…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <div className="text-sm font-medium">All orders confirmed</div>
          <div className="text-xs">No unconfirmed orders match your current filters.</div>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Order Ref</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Ship To</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Required Ship</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Pallets</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Bids</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Quote Age</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Last Bid</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order: UnconfirmedOrder, idx: number) => {
                const overdue = isOverdue(order);
                const stale = isStaleQuote(order);
                const daysLeft = daysUntil(order.requiredShipDate);
                const isExpanded = expandedId === order.id;
                const isRefreshing = refreshingIds.has(order.extensivOrderId);
                const { label: statusLabel, cls: statusCls } = shipwellStatusLabel(order.shipwellStatus);
                const quoteAge = fmtRunningClock(order.shipwellQuotingStartedAt, now);
                const quoteAgeMs = order.shipwellQuotingStartedAt
                  ? now - new Date(order.shipwellQuotingStartedAt).getTime()
                  : 0;
                const { label: lastBidLabel } = fmtElapsed(order.shipwellLastBidAt);

                return (
                  <>
                    <tr
                      key={`row-${order.id}`}
                      className={cn(
                        "border-b border-border transition-colors cursor-pointer",
                        isExpanded
                          ? "bg-primary/5"
                          : stale
                          ? "bg-orange-50/50 dark:bg-orange-950/10 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                          : idx % 2 === 0
                          ? "bg-background hover:bg-muted/30"
                          : "bg-muted/10 hover:bg-muted/30",
                      )}
                      onClick={() => setExpandedId(isExpanded ? null : order.id)}
                    >
                      {/* Order Ref */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {overdue && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                          {!overdue && stale && <Flame className="h-3.5 w-3.5 text-orange-500 shrink-0" />}
                          <span className={cn(
                            "font-mono font-semibold text-xs",
                            overdue ? "text-red-600 dark:text-red-400" : stale ? "text-orange-600 dark:text-orange-400" : "text-foreground"
                          )}>
                            {order.referenceNum ?? `#${order.extensivOrderId}`}
                          </span>
                        </div>
                        {order.facilityName && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">{order.facilityName}</div>
                        )}
                      </td>

                      {/* Client */}
                      <td className="px-4 py-3">
                        <span className="font-medium text-foreground text-xs">{order.clientName}</span>
                      </td>

                      {/* Ship To */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="text-xs">{order.shipToName ?? "—"}</span>
                        </div>
                        {order.shipToCity && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">{order.shipToCity}</div>
                        )}
                      </td>

                      {/* Required Ship Date */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Calendar className={cn("h-3.5 w-3.5 shrink-0", overdue ? "text-red-500" : "text-muted-foreground")} />
                          <span className={cn("text-xs font-medium", overdue ? "text-red-600 dark:text-red-400" : "text-foreground")}>
                            {order.requiredShipDate ?? "—"}
                          </span>
                        </div>
                        {daysLeft !== null && (
                          <div className={cn("text-[10px] mt-0.5", overdue ? "text-red-500" : daysLeft <= 1 ? "text-amber-600" : "text-muted-foreground")}>
                            {overdue
                              ? `${Math.abs(daysLeft)}d overdue`
                              : daysLeft === 0
                              ? "Due today"
                              : `${daysLeft}d left`}
                          </div>
                        )}
                      </td>

                      {/* Pallets */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1 text-xs">
                          <Package className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium">{order.palletCount ?? "—"}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                          statusCls
                        )}>
                          {statusLabel}
                        </span>
                      </td>

                      {/* Bids — shows "$N" pill */}
                      <td className="px-4 py-3 text-center">
                        {order.shipwellBidCount != null && order.shipwellBidCount > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                            {order.shipwellBidCount}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Quote Age — running clock since quoting started */}
                      <td className="px-4 py-3">
                        {order.shipwellQuotingStartedAt ? (
                          <div
                            className={cn(
                              "flex items-center gap-1 text-xs font-mono",
                              quoteAgeMs > 2 * 3_600_000
                                ? "text-orange-600 dark:text-orange-400 font-semibold"
                                : "text-foreground"
                            )}
                            title={`Quoting started: ${new Date(order.shipwellQuotingStartedAt).toLocaleString()}`}
                          >
                            {quoteAgeMs > 2 * 3_600_000 && <Flame className="h-3 w-3 shrink-0" />}
                            {quoteAge}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Last Bid Received */}
                      <td className="px-4 py-3">
                        {order.shipwellLastBidAt ? (
                          <div
                            className="flex items-center gap-1 text-xs text-muted-foreground"
                            title={`Last bid: ${new Date(order.shipwellLastBidAt).toLocaleString()}`}
                          >
                            <Clock className="h-3 w-3 shrink-0" />
                            {lastBidLabel}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          {order.shipwellOrderId && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              title="Refresh Shipwell status"
                              disabled={isRefreshing}
                              onClick={() => {
                                setRefreshingIds((prev) => new Set(prev).add(order.extensivOrderId));
                                refreshStatusMutation.mutate({ extensivOrderId: order.extensivOrderId });
                              }}
                            >
                              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            title={isExpanded ? "Collapse rates" : "View carrier rates"}
                            onClick={() => setExpandedId(isExpanded ? null : order.id)}
                          >
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded rates panel */}
                    {isExpanded && (
                      <tr key={`rates-${order.id}`} className="border-b border-border">
                        <td colSpan={10} className="p-0">
                          <RatesPanel order={order} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Mock data notice */}
      <div className="mt-4 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-300">
        <strong>Note:</strong> Orders labelled "MOCK DATA" are test records seeded for UI review. Real orders will appear here once they reach Ship Ready status and are sent to Shipwell during QC pack-out.
      </div>
        </div>
      )}
    </div>
  );
}

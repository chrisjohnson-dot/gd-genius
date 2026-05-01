import { useState, useMemo } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CheckSquare, RefreshCw, Search, AlertTriangle, Timer, CheckCircle2,
  ExternalLink, Send, Package, MapPin, Calendar, Clock, Loader2,
  TrendingUp, Gavel, Truck, Filter, RotateCw,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns calendar days elapsed since shipReadyAt (midnight-to-midnight). */
function daysInOutbound(shipReadyAt: Date | string | null): number {
  if (!shipReadyAt) return 0;
  const start = new Date(shipReadyAt);
  const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((todayMidnight.getTime() - startMidnight.getTime()) / 86_400_000));
}

/** Returns true if the order is overdue (past requiredShipDate OR 4+ calendar days in outbound). */
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

function daysBadgeClass(days: number) {
  if (days >= 8) return "bg-red-100 text-red-700 border-red-300 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30";
  if (days >= 4) return "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-500/15 dark:text-yellow-400 dark:border-yellow-500/30";
  return "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30";
}

function daysBadgeIcon(days: number) {
  if (days >= 8) return <AlertTriangle className="h-3 w-3" />;
  if (days >= 4) return <Timer className="h-3 w-3" />;
  return <CheckCircle2 className="h-3 w-3" />;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function shipwellStatusLabel(status: string | null | undefined): { label: string; cls: string } {
  switch (status) {
    case "quoting":
      return { label: "Quoting", cls: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/30" };
    case "tendered":
      return { label: "Tendered", cls: "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-500/15 dark:text-purple-400 dark:border-purple-500/30" };
    case "carrier_confirmed":
      return { label: "Confirmed", cls: "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30" };
    case "in_transit":
      return { label: "In Transit", cls: "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-400 dark:border-teal-500/30" };
    default:
      return { label: "Not Sent", cls: "bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-500/15 dark:text-zinc-400 dark:border-zinc-500/30" };
  }
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
  palletCount: number | null;
  outboundLocation: string | null;
  facilityName: string | null;
};

type FilterStatus = "all" | "overdue" | "quoting" | "tendered" | "not_sent";

// ─── KPI Tile ─────────────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  icon: Icon,
  colorClass,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  colorClass: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col gap-1 rounded-lg border p-4 text-left transition-all",
        "bg-card hover:bg-accent/50",
        active && "ring-2 ring-primary",
        onClick ? "cursor-pointer" : "cursor-default"
      )}
    >
      <div className="flex items-center gap-2">
        <div className={cn("rounded-md p-1.5", colorClass)}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className="text-2xl font-bold">{value}</span>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ConfirmShipping() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [sendingIds, setSendingIds] = useState<Set<number>>(new Set());
  // Track which rows are currently refreshing their Shipwell status
  const [refreshingIds, setRefreshingIds] = useState<Set<number>>(new Set());

  const utils = trpc.useUtils();

  const { data: orders = [], isLoading, refetch, isFetching } = trpc.shipwell.listUnconfirmed.useQuery(
    undefined,
    { refetchInterval: 60_000 }
  );

  const sendOrderMutation = trpc.shipwell.sendOrder.useMutation({
    onSuccess: (_data, variables) => {
      toast.success("Order sent to Shipwell successfully.");
      setSendingIds((prev) => { const s = new Set(prev); s.delete(variables.extensivOrderId); return s; });
      void refetch();
    },
    onError: (err, variables) => {
      toast.error(`Failed to send order: ${err.message}`);
      setSendingIds((prev) => { const s = new Set(prev); s.delete(variables.extensivOrderId); return s; });
    },
  });

  const refreshStatusMutation = trpc.shipwell.refreshOrderStatus.useMutation({
    onSuccess: (data, variables) => {
      const newStatus = data.shipwellStatus ?? "unknown";
      const bidInfo = data.shipwellBidCount !== null && data.shipwellBidCount !== undefined
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

  // ── KPI counts ──
  const totalCount = orders.length;
  const overdueCount = useMemo(() => orders.filter(isOverdue).length, [orders]);
  const quotingCount = useMemo(() => orders.filter((o) => o.shipwellStatus === "quoting").length, [orders]);
  const notSentCount = useMemo(() => orders.filter((o) => !o.shipwellStatus).length, [orders]);
  const tenderedCount = useMemo(() => orders.filter((o) => o.shipwellStatus === "tendered").length, [orders]);

  // ── Filtered list ──
  const filtered = useMemo(() => {
    let list = [...orders];

    if (filterStatus === "overdue") list = list.filter(isOverdue);
    else if (filterStatus === "quoting") list = list.filter((o) => o.shipwellStatus === "quoting");
    else if (filterStatus === "tendered") list = list.filter((o) => o.shipwellStatus === "tendered");
    else if (filterStatus === "not_sent") list = list.filter((o) => !o.shipwellStatus);

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

    // Sort: overdue first, then by days in outbound descending
    list.sort((a, b) => {
      const aOver = isOverdue(a) ? 1 : 0;
      const bOver = isOverdue(b) ? 1 : 0;
      if (bOver !== aOver) return bOver - aOver;
      return daysInOutbound(b.shipReadyAt) - daysInOutbound(a.shipReadyAt);
    });

    return list;
  }, [orders, filterStatus, search]);

  function handleSendToShipwell(order: UnconfirmedOrder) {
    setSendingIds((prev) => new Set(prev).add(order.extensivOrderId));
    sendOrderMutation.mutate({ extensivOrderId: order.extensivOrderId });
  }

  function handleRefreshStatus(order: UnconfirmedOrder) {
    if (!order.shipwellOrderId) {
      toast.warning("Order has not been sent to Shipwell yet — nothing to refresh.");
      return;
    }
    setRefreshingIds((prev) => new Set(prev).add(order.extensivOrderId));
    refreshStatusMutation.mutate({ extensivOrderId: order.extensivOrderId });
  }

  function handleMarkConfirmed(order: UnconfirmedOrder) {
    toast.info(`Mark Confirmed for order ${order.referenceNum ?? order.extensivOrderId} — coming soon.`);
  }

  const filterButtons: { key: FilterStatus; label: string; count: number }[] = [
    { key: "all", label: "All", count: totalCount },
    { key: "overdue", label: "Overdue", count: overdueCount },
    { key: "quoting", label: "Quoting", count: quotingCount },
    { key: "tendered", label: "Tendered", count: tenderedCount },
    { key: "not_sent", label: "Not Sent", count: notSentCount },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-0.5">
            Shipping
          </p>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CheckSquare className="h-6 w-6 text-primary" />
            Confirm Shipping
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ship-ready orders awaiting carrier confirmation in Shipwell
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* ── KPI Tiles ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiTile
          label="Unconfirmed"
          value={totalCount}
          icon={CheckSquare}
          colorClass="bg-zinc-100 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-400"
          active={filterStatus === "all"}
          onClick={() => setFilterStatus("all")}
        />
        <KpiTile
          label="Overdue"
          value={overdueCount}
          icon={AlertTriangle}
          colorClass={overdueCount > 0 ? "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-500/20 dark:text-zinc-500"}
          active={filterStatus === "overdue"}
          onClick={() => setFilterStatus("overdue")}
        />
        <KpiTile
          label="Quoting"
          value={quotingCount}
          icon={Gavel}
          colorClass="bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
          active={filterStatus === "quoting"}
          onClick={() => setFilterStatus("quoting")}
        />
        <KpiTile
          label="Tendered"
          value={tenderedCount}
          icon={TrendingUp}
          colorClass="bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400"
          active={filterStatus === "tendered"}
          onClick={() => setFilterStatus("tendered")}
        />
        <KpiTile
          label="Not Sent"
          value={notSentCount}
          icon={Send}
          colorClass="bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400"
          active={filterStatus === "not_sent"}
          onClick={() => setFilterStatus("not_sent")}
        />
      </div>

      {/* ── Filter Bar ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search order ref, client, ship-to…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {filterButtons.map((btn) => (
            <button
              key={btn.key}
              onClick={() => setFilterStatus(btn.key)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                filterStatus === btn.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:bg-accent hover:text-foreground"
              )}
            >
              {btn.label}
              <span className={cn(
                "inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold min-w-[18px]",
                filterStatus === btn.key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                {btn.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading unconfirmed orders…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <p className="text-lg font-semibold text-foreground">
            {orders.length === 0 ? "All orders confirmed!" : "No orders match this filter."}
          </p>
          <p className="text-sm">
            {orders.length === 0
              ? "There are no ship-ready orders awaiting carrier confirmation."
              : "Try adjusting your search or filter."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Order Ref</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Ship To</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Req. Ship Date</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Days Out</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Shipwell Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Bids / Rates</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Pallets</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Location</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((order) => {
                  const days = daysInOutbound(order.shipReadyAt);
                  const overdue = isOverdue(order);
                  const { label: swLabel, cls: swCls } = shipwellStatusLabel(order.shipwellStatus);
                  const isSending = sendingIds.has(order.extensivOrderId);
                  const isRefreshing = refreshingIds.has(order.extensivOrderId);
                  const hasBids = (order.shipwellBidCount ?? 0) > 0;
                  // Show refresh button only for orders already in Shipwell
                  const canRefresh = !!order.shipwellOrderId;

                  return (
                    <tr
                      key={order.id}
                      className={cn(
                        "hover:bg-muted/30 transition-colors",
                        overdue && "bg-red-500/5"
                      )}
                    >
                      {/* Order Ref */}
                      <td className="px-4 py-3 font-mono text-xs font-semibold">
                        <div className="flex items-center gap-1.5">
                          {overdue && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                          <span className={cn(overdue && "text-red-600 dark:text-red-400")}>
                            {order.referenceNum ?? `#${order.extensivOrderId}`}
                          </span>
                        </div>
                      </td>

                      {/* Client */}
                      <td className="px-4 py-3 font-medium">{order.clientName}</td>

                      {/* Ship To */}
                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span>{[order.shipToName, order.shipToCity].filter(Boolean).join(", ") || "—"}</span>
                        </div>
                      </td>

                      {/* Required Ship Date */}
                      <td className="px-4 py-3">
                        {order.requiredShipDate ? (
                          <span className={cn(
                            "flex items-center gap-1",
                            (() => {
                              const req = new Date(order.requiredShipDate);
                              req.setHours(0, 0, 0, 0);
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              return req < today ? "text-red-600 dark:text-red-400 font-semibold" : "";
                            })()
                          )}>
                            <Calendar className="h-3 w-3 shrink-0" />
                            {fmtDate(order.requiredShipDate)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Days in Outbound */}
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border",
                          daysBadgeClass(days)
                        )}>
                          {daysBadgeIcon(days)}
                          {days === 0 ? "Today" : days === 1 ? "1 day" : `${days} days`}
                        </span>
                      </td>

                      {/* Shipwell Status — with inline refresh spinner when refreshing */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border",
                            swCls
                          )}>
                            {isRefreshing ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : null}
                            {swLabel}
                          </span>
                        </div>
                      </td>

                      {/* Bids / Rates */}
                      <td className="px-4 py-3">
                        {order.shipwellStatus === "quoting" ? (
                          <span className={cn(
                            "inline-flex items-center gap-1 text-xs font-semibold",
                            hasBids ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                          )}>
                            <Gavel className="h-3.5 w-3.5" />
                            {hasBids ? `${order.shipwellBidCount} bid${(order.shipwellBidCount ?? 0) > 1 ? "s" : ""}` : "No bids yet"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>

                      {/* Pallets */}
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Package className="h-3.5 w-3.5" />
                          {order.palletCount ?? "—"}
                        </span>
                      </td>

                      {/* Location */}
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {order.outboundLocation ?? "—"}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View in Shipwell */}
                          {order.shipwellPoUrl && (
                            <a
                              href={order.shipwellPoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs">
                                <Truck className="h-3.5 w-3.5" />
                                Shipwell
                              </Button>
                            </a>
                          )}

                          {/* Refresh Shipwell Status — only if order has been sent to Shipwell */}
                          {canRefresh && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 gap-1 text-xs"
                              disabled={isRefreshing || isSending}
                              onClick={() => handleRefreshStatus(order)}
                              title="Refresh status and bid count from Shipwell API"
                            >
                              {isRefreshing ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCw className="h-3.5 w-3.5" />
                              )}
                              {isRefreshing ? "Refreshing…" : "Refresh Status"}
                            </Button>
                          )}

                          {/* Send to Shipwell — only if not yet sent */}
                          {!order.shipwellOrderId && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 gap-1 text-xs"
                              disabled={isSending}
                              onClick={() => handleSendToShipwell(order)}
                            >
                              {isSending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              )}
                              {isSending ? "Sending…" : "Send to Shipwell"}
                            </Button>
                          )}

                          {/* Mark Confirmed — placeholder */}
                          <Button
                            variant="default"
                            size="sm"
                            className="h-7 px-2 gap-1 text-xs"
                            onClick={() => handleMarkConfirmed(order)}
                          >
                            <CheckSquare className="h-3.5 w-3.5" />
                            Confirm
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer row count */}
          <div className="border-t px-4 py-2 bg-muted/20 text-xs text-muted-foreground flex items-center justify-between">
            <span>
              Showing <strong>{filtered.length}</strong> of <strong>{totalCount}</strong> unconfirmed order{totalCount !== 1 ? "s" : ""}
            </span>
            {overdueCount > 0 && (
              <span className="flex items-center gap-1 text-red-500 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                {overdueCount} overdue
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Placeholder note ── */}
      <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground bg-muted/20">
        <strong className="text-foreground">Notes:</strong>{" "}
        <em>Refresh Status</em> polls the Shipwell API in real-time to update the status and bid count for that order — it is available for any order already sent to Shipwell.
        The <em>Confirm</em> button is a placeholder — it will update the order's Shipwell status to{" "}
        <code>carrier_confirmed</code> once the workflow is finalised.
      </div>
    </div>
  );
}

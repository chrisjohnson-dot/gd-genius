import AppLayout from "@/components/AppLayout";
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
  MessageSquare,
  Package,
  PackageSearch,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
  Warehouse,
  X,
  Truck,
  FlaskConical,
  ClipboardCheck,
  ShipIcon,
  ChevronRight,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

// ─── Lifecycle status config ──────────────────────────────────────────────────
type LifecycleStatus = "unallocated" | "allocated" | "picking" | "qc" | "qc_complete" | "ship_ready";

const LIFECYCLE_CONFIG: Record<
  LifecycleStatus,
  { label: string; bg: string; text: string; border: string; icon: React.ReactNode; nextStatus: LifecycleStatus | null; nextLabel: string | null }
> = {
  unallocated: {
    label: "Unallocated",
    bg: "#dbeafe", text: "#1d4ed8", border: "#bfdbfe",
    icon: <Package className="h-2.5 w-2.5" />,
    nextStatus: "allocated", nextLabel: "Mark Allocated",
  },
  allocated: {
    label: "Allocated",
    bg: "#e0e7ff", text: "#4338ca", border: "#c7d2fe",
    icon: <ClipboardCheck className="h-2.5 w-2.5" />,
    nextStatus: "picking", nextLabel: "Give to Associate →",
  },
  picking: {
    label: "Picking",
    bg: "#fef3c7", text: "#b45309", border: "#fde68a",
    icon: <Truck className="h-2.5 w-2.5" />,
    nextStatus: "qc", nextLabel: "Start QC →",
  },
  qc: {
    label: "QC",
    bg: "#fce7f3", text: "#be185d", border: "#fbcfe8",
    icon: <FlaskConical className="h-2.5 w-2.5" />,
    nextStatus: "qc_complete", nextLabel: "QC Complete →",
  },
  qc_complete: {
    label: "QC Complete",
    bg: "#d1fae5", text: "#065f46", border: "#a7f3d0",
    icon: <CheckCircle2 className="h-2.5 w-2.5" />,
    nextStatus: "ship_ready", nextLabel: "Ship Ready →",
  },
  ship_ready: {
    label: "Ship Ready",
    bg: "#dcfce7", text: "#15803d", border: "#bbf7d0",
    icon: <ShipIcon className="h-2.5 w-2.5" />,
    nextStatus: null, nextLabel: null,
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────
type TrackedOrder = {
  id: number;
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
  notes: string | null;
  extensivStatus: number | null;
  creationDate: string | null;
  lifecycleStatus: LifecycleStatus;
  firstSeenAt: string | Date;
  lastSyncedAt: string | Date;
  allocatedAt: string | Date | null;
  pickingAt: string | Date | null;
  qcAt: string | Date | null;
  qcCompleteAt: string | Date | null;
  shipReadyAt: string | Date | null;
};

type FacilityGroup = {
  facilityId: number;
  facilityName: string;
  orders: TrackedOrder[];
};

// ─── Status pill ──────────────────────────────────────────────────────────────
function LifecyclePill({ status }: { status: LifecycleStatus }) {
  const cfg = LIFECYCLE_CONFIG[status];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ─── Advance button ───────────────────────────────────────────────────────────
function AdvanceButton({
  order,
  onAdvanced,
}: {
  order: TrackedOrder;
  onAdvanced: () => void;
}) {
  const cfg = LIFECYCLE_CONFIG[order.lifecycleStatus];
  const utils = trpc.useUtils();

  const updateStatus = trpc.pickSchedule.updateStatus.useMutation({
    onSuccess: () => {
      utils.pickSchedule.list.invalidate();
      onAdvanced();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  if (!cfg.nextStatus) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-[10px] h-6 px-2 font-semibold whitespace-nowrap"
      style={{ color: cfg.text }}
      disabled={updateStatus.isPending}
      onClick={(e) => {
        e.stopPropagation();
        updateStatus.mutate({ extensivOrderId: order.extensivOrderId, status: cfg.nextStatus! });
      }}
    >
      {updateStatus.isPending ? (
        <RefreshCw className="h-3 w-3 animate-spin" />
      ) : (
        <>
          {cfg.nextLabel}
          <ChevronRight className="h-3 w-3 ml-0.5" />
        </>
      )}
    </Button>
  );
}

// ─── Sort helpers ─────────────────────────────────────────────────────────────
type SortKey = "clientName" | "referenceNum" | "ageDays" | "lifecycleStatus" | "totalPieces" | "shipToName" | "shipToCity" | "poNum";
type SortDir = "asc" | "desc";
const STATUS_RANK: Record<LifecycleStatus, number> = {
  unallocated: 0, allocated: 1, picking: 2, qc: 3, qc_complete: 4, ship_ready: 5,
};

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30 inline" />;
  return sortDir === "asc"
    ? <ChevronUp className="h-3 w-3 ml-1 inline" />
    : <ChevronDown className="h-3 w-3 ml-1 inline" />;
}

function getAgeDays(order: TrackedOrder): number {
  const d = order.firstSeenAt ? new Date(order.firstSeenAt) : null;
  if (!d || isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

// ─── Per-warehouse card ───────────────────────────────────────────────────────
function WarehouseCard({
  facility,
  onStatusChanged,
}: {
  facility: FacilityGroup;
  onStatusChanged: () => void;
}) {
  const [search, setSearch]             = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<LifecycleStatus | "all">("all");
  const [sortKey, setSortKey]           = useState<SortKey>("lifecycleStatus");
  const [sortDir, setSortDir]           = useState<SortDir>("asc");
  const [expanded, setExpanded]         = useState(false);
  const [groupByClient, setGroupByClient] = useState(true);

  const clientOptions = useMemo(
    () => Array.from(new Map(facility.orders.map((o) => [o.clientId, o.clientName])).entries()),
    [facility.orders]
  );

  const filteredOrders = useMemo(() => {
    let rows = facility.orders;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (o) =>
          (o.referenceNum ?? "").toLowerCase().includes(q) ||
          o.clientName.toLowerCase().includes(q) ||
          (o.shipToName ?? "").toLowerCase().includes(q) ||
          (o.poNum ?? "").toLowerCase().includes(q) ||
          (o.shipToCity ?? "").toLowerCase().includes(q) ||
          (o.notes ?? "").toLowerCase().includes(q)
      );
    }
    if (clientFilter !== "all") rows = rows.filter((o) => String(o.clientId) === clientFilter);
    if (statusFilter !== "all") rows = rows.filter((o) => o.lifecycleStatus === statusFilter);
    return [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "ageDays")            cmp = getAgeDays(a) - getAgeDays(b);
      else if (sortKey === "lifecycleStatus") cmp = STATUS_RANK[a.lifecycleStatus] - STATUS_RANK[b.lifecycleStatus];
      else if (sortKey === "totalPieces")   cmp = (a.totalPieces ?? 0) - (b.totalPieces ?? 0);
      else cmp = String(a[sortKey as keyof TrackedOrder] ?? "").localeCompare(String(b[sortKey as keyof TrackedOrder] ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [facility.orders, search, clientFilter, statusFilter, sortKey, sortDir]);

  // Group orders by client
  const groupedByClient = useMemo(() => {
    const map = new Map<number, { clientId: number; clientName: string; orders: TrackedOrder[] }>();
    for (const o of filteredOrders) {
      if (!map.has(o.clientId)) map.set(o.clientId, { clientId: o.clientId, clientName: o.clientName, orders: [] });
      map.get(o.clientId)!.orders.push(o);
    }
    return Array.from(map.values()).sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [filteredOrders]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const hasFilters = search || clientFilter !== "all" || statusFilter !== "all";

  function fmtDate(d: string | Date | null | undefined) {
    if (!d) return "—";
    const dt = new Date(d as string);
    if (isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // KPI counts
  const counts = useMemo(() => {
    const c: Record<LifecycleStatus, number> = { unallocated: 0, allocated: 0, picking: 0, qc: 0, qc_complete: 0, ship_ready: 0 };
    for (const o of facility.orders) c[o.lifecycleStatus]++;
    return c;
  }, [facility.orders]);

  const hasUrgent = facility.orders.some((o) => getAgeDays(o) >= 7);
  const hasHigh   = !hasUrgent && facility.orders.some((o) => getAgeDays(o) >= 3);

  const tableHeader = (showClient: boolean) => (
    <thead>
      <tr>
        <th className="w-[120px]">
          <button onClick={() => toggleSort("lifecycleStatus")} className="cursor-pointer select-none flex items-center gap-0.5">
            Status <SortIcon col="lifecycleStatus" sortKey={sortKey} sortDir={sortDir} />
          </button>
        </th>
        <th onClick={() => toggleSort("referenceNum")} className="cursor-pointer select-none">
          TX # <SortIcon col="referenceNum" sortKey={sortKey} sortDir={sortDir} />
        </th>
        <th onClick={() => toggleSort("poNum")} className="cursor-pointer select-none">
          PO # <SortIcon col="poNum" sortKey={sortKey} sortDir={sortDir} />
        </th>
        {showClient && (
          <th onClick={() => toggleSort("clientName")} className="cursor-pointer select-none">
            Client <SortIcon col="clientName" sortKey={sortKey} sortDir={sortDir} />
          </th>
        )}
        <th onClick={() => toggleSort("shipToName")} className="cursor-pointer select-none">
          Ship To <SortIcon col="shipToName" sortKey={sortKey} sortDir={sortDir} />
        </th>
        <th onClick={() => toggleSort("shipToCity")} className="cursor-pointer select-none">
          City <SortIcon col="shipToCity" sortKey={sortKey} sortDir={sortDir} />
        </th>
        <th onClick={() => toggleSort("ageDays")} className="cursor-pointer select-none text-right">
          Age <SortIcon col="ageDays" sortKey={sortKey} sortDir={sortDir} />
        </th>
        <th onClick={() => toggleSort("totalPieces")} className="cursor-pointer select-none text-right">
          Pcs <SortIcon col="totalPieces" sortKey={sortKey} sortDir={sortDir} />
        </th>
        <th className="text-right">SKUs</th>
        <th className="w-8"></th>
        <th className="w-[130px]"></th>
      </tr>
    </thead>
  );

  const orderRow = (o: TrackedOrder, showClient: boolean) => {
    const age = getAgeDays(o);
    const isUrgent = age >= 7;
    const isHigh   = age >= 3 && age < 7;
    return (
      <tr
        key={o.extensivOrderId}
        style={
          isUrgent
            ? { background: "rgba(239,68,68,0.04)", borderLeft: "3px solid #ef4444" }
            : isHigh
            ? { background: "rgba(245,158,11,0.04)", borderLeft: "3px solid #f59e0b" }
            : { borderLeft: "3px solid transparent" }
        }
      >
        <td className="py-1.5">
          <LifecyclePill status={o.lifecycleStatus} />
        </td>
        <td className="font-semibold text-foreground text-xs">
          {o.referenceNum || `#${o.extensivOrderId}`}
        </td>
        <td className="text-muted-foreground text-xs font-mono">
          {o.poNum ?? "—"}
        </td>
        {showClient && (
          <td className="text-muted-foreground text-xs">{o.clientName}</td>
        )}
        <td className="text-muted-foreground text-xs max-w-[140px] truncate" title={o.shipToName ?? ""}>
          {o.shipToName ?? "—"}
        </td>
        <td className="text-muted-foreground text-xs">
          {o.shipToCity ?? "—"}
        </td>
        <td className="text-muted-foreground text-xs text-right">
          {age === 0 ? "Today" : `${age}d`}
        </td>
        <td className="text-muted-foreground text-xs text-right">
          {(o.totalPieces ?? 0) > 0 ? (o.totalPieces ?? 0).toLocaleString() : "—"}
        </td>
        <td className="text-muted-foreground text-xs text-right">
          {(o.skuCount ?? 0) > 0 ? o.skuCount : "—"}
        </td>
        <td className="text-center">
          {o.notes ? (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <MessageSquare className="h-3.5 w-3.5 text-blue-400 cursor-default inline" />
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[220px] text-xs">
                  {o.notes}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </td>
        <td className="text-right">
          <AdvanceButton order={o} onAdvanced={onStatusChanged} />
        </td>
      </tr>
    );
  };

  return (
    <div
      className="bg-card rounded-2xl overflow-hidden"
      style={{
        border: hasUrgent ? "2px solid #ef4444" : hasHigh ? "2px solid #f59e0b" : "1px solid hsl(var(--border))",
        boxShadow: hasUrgent
          ? "0 0 0 1px rgba(239,68,68,0.15), 0 4px 16px rgba(239,68,68,0.10)"
          : hasHigh
          ? "0 0 0 1px rgba(245,158,11,0.15), 0 4px 16px rgba(245,158,11,0.10)"
          : undefined,
      }}
    >
      {/* Warehouse header */}
      <div
        className="px-6 py-5 cursor-pointer select-none bg-card border-b border-border"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Warehouse className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">{facility.facilityName}</h3>
                {hasHigh && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                    <AlertTriangle className="h-2.5 w-2.5" /> HIGH
                  </span>
                )}
                {hasUrgent && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                    <ShieldAlert className="h-2.5 w-2.5" /> URGENT
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {facility.orders.length} order{facility.orders.length !== 1 ? "s" : ""} · {clientOptions.length} client{clientOptions.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="text-muted-foreground">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>

        {/* Lifecycle KPI row */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {(Object.entries(LIFECYCLE_CONFIG) as [LifecycleStatus, typeof LIFECYCLE_CONFIG[LifecycleStatus]][]).map(([status, cfg]) => (
            <div
              key={status}
              className="rounded-xl px-3 py-2.5 text-center border cursor-pointer transition-opacity"
              style={{ background: cfg.bg, borderColor: cfg.border, opacity: statusFilter === status ? 1 : statusFilter === "all" ? 1 : 0.45 }}
              onClick={(e) => {
                e.stopPropagation();
                setStatusFilter((f) => (f === status ? "all" : status));
                if (!expanded) setExpanded(true);
              }}
            >
              <p className="text-[18px] font-extrabold leading-none" style={{ color: cfg.text }}>{counts[status]}</p>
              <p className="text-[9px] mt-1 font-medium uppercase tracking-wide" style={{ color: cfg.text }}>{cfg.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Collapsible order table */}
      {expanded && (
        <>
          {/* Filters row */}
          <div className="px-5 py-2.5 border-b border-border flex flex-wrap items-center gap-2 bg-muted/10">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search order, client, PO, city…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-8 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 w-52"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="py-1.5 px-2.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">All Clients</option>
              {clientOptions.map(([id, name]) => (
                <option key={id} value={String(id)}>{name}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as LifecycleStatus | "all")}
              className="py-1.5 px-2.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">All Statuses</option>
              {(Object.entries(LIFECYCLE_CONFIG) as [LifecycleStatus, typeof LIFECYCLE_CONFIG[LifecycleStatus]][]).map(([s, c]) => (
                <option key={s} value={s}>{c.label}</option>
              ))}
            </select>

            {/* Group by client toggle */}
            <button
              onClick={(e) => { e.stopPropagation(); setGroupByClient((g) => !g); }}
              className={`py-1.5 px-2.5 text-xs rounded-lg border transition-colors flex items-center gap-1.5 ${
                groupByClient
                  ? "bg-primary/10 border-primary/30 text-primary font-semibold"
                  : "border-border bg-background text-muted-foreground"
              }`}
            >
              <Users className="h-3 w-3" />
              Group by Client
            </button>

            {hasFilters && (
              <button
                onClick={() => { setSearch(""); setClientFilter("all"); setStatusFilter("all"); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}

            <span className="text-xs text-muted-foreground ml-auto">
              {hasFilters ? `${filteredOrders.length} of ${facility.orders.length}` : facility.orders.length} orders
            </span>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              {facility.orders.length === 0 ? (
                <p className="text-sm font-medium">No orders tracked yet. Sync will run shortly.</p>
              ) : (
                <>
                  <p className="text-sm font-medium">No orders match your filters.</p>
                  <button
                    onClick={() => { setSearch(""); setClientFilter("all"); setStatusFilter("all"); }}
                    className="text-xs text-primary hover:underline mt-1"
                  >
                    Clear filters
                  </button>
                </>
              )}
            </div>
          ) : groupByClient ? (
            /* ── Grouped by client ── */
            <div className="overflow-x-auto">
              <table className="w-full data-table">
                {tableHeader(false)}
                <tbody>
                  {groupedByClient.map((group) => {
                    const groupPieces = group.orders.reduce((s, o) => s + (o.totalPieces ?? 0), 0);
                    return [
                      <tr
                        key={`hdr-${group.clientId}`}
                        style={{ background: "#111827", borderLeft: "3px solid #374151" }}
                      >
                        <td colSpan={2} className="py-2 px-3">
                          <span className="text-[11px] font-bold text-white uppercase tracking-wider">{group.clientName}</span>
                        </td>
                        <td className="py-2 px-3 text-[10px] text-gray-400 font-medium">PO #</td>
                        <td className="py-2 px-3 text-[10px] text-gray-400 font-medium">Ship To</td>
                        <td className="py-2 px-3 text-[10px] text-gray-400 font-medium">City</td>
                        <td className="py-2 px-3 text-[10px] text-gray-400 font-medium text-right">Age</td>
                        <td className="py-2 px-3 text-[10px] text-gray-400 font-medium text-right">
                          {groupPieces > 0 ? groupPieces.toLocaleString() : ""}
                        </td>
                        <td className="py-2 px-3 text-[10px] text-gray-400 font-medium text-right">{group.orders.length} ord</td>
                        <td colSpan={2}></td>
                      </tr>,
                      ...group.orders.map((o) => orderRow(o, false)),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* ── Flat table ── */
            <div className="overflow-x-auto">
              <table className="w-full data-table">
                {tableHeader(true)}
                <tbody>
                  {filteredOrders.map((o) => orderRow(o, true))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const { data, isLoading, refetch, isFetching } = trpc.pickSchedule.list.useQuery({});

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

  return (
    <AppLayout>
      <div className="p-7 space-y-6 page-enter">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="page-breadcrumb">Overview</p>
            <h1 className="page-title">Pick Schedule</h1>
            {lastSyncAt && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Last synced {lastSyncAt.toLocaleString()}
                {syncRunning && <span className="ml-2 text-amber-500 font-medium animate-pulse">· Syncing…</span>}
              </p>
            )}
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
            <Button asChild className="shadow-sm">
              <Link href="/allocate" className="flex items-center gap-2">
                <PackageSearch className="h-4 w-4" />
                Run Allocation Tool
              </Link>
            </Button>
          </div>
        </div>

        {/* Global KPI bar — lifecycle stages */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {(Object.entries(LIFECYCLE_CONFIG) as [LifecycleStatus, typeof LIFECYCLE_CONFIG[LifecycleStatus]][]).map(([status, cfg]) => (
            <div
              key={status}
              className="rounded-2xl px-4 py-3 text-center border"
              style={{ background: cfg.bg, borderColor: cfg.border }}
            >
              <p className="text-[28px] font-extrabold tracking-tight leading-none" style={{ color: cfg.text }}>
                {isLoading ? "—" : kpis[status]}
              </p>
              <p className="text-[10px] mt-1.5 font-semibold uppercase tracking-wide" style={{ color: cfg.text }}>
                {cfg.label}
              </p>
            </div>
          ))}
        </div>

        {/* Loading skeletons */}
        {isLoading && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
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
            <p className="text-sm font-medium">No orders tracked yet.</p>
            <p className="text-xs mt-1 opacity-70">
              Click <strong>Sync Now</strong> to pull open orders from Extensiv, or wait for the hourly auto-sync.
              Make sure an Extensiv connection is configured in{" "}
              <Link href="/settings" className="text-primary hover:underline">API Settings</Link>.
            </p>
          </div>
        )}

        {/* Warehouse cards */}
        {!isLoading && facilities.length > 0 && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {facilities.map((f) => (
              <WarehouseCard key={f.facilityId} facility={f} onStatusChanged={() => refetch()} />
            ))}
          </div>
        )}

        {/* Recent Allocation Runs */}
        {!isLoading && <RecentRunsSection />}
      </div>
    </AppLayout>
  );
}

// ─── Recent runs mini-table ───────────────────────────────────────────────────
function RecentRunsSection() {
  const { data: runs, isLoading } = trpc.allocation.history.useQuery({ limit: 5 });
  if (isLoading || !runs || runs.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <h3 className="text-[15px] font-bold">Recent Allocation Runs</h3>
        <Link href="/history">
          <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 text-xs font-medium">
            View All →
          </Button>
        </Link>
      </div>
      <table className="w-full data-table">
        <thead>
          <tr>
            <th>Client</th>
            <th>Date</th>
            <th>Allocated</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td className="font-semibold text-foreground">
                {run.customerName ?? `Customer ${run.customerId}`}
              </td>
              <td className="text-muted-foreground text-xs">
                {new Date(run.createdAt).toLocaleString()}
              </td>
              <td className="text-muted-foreground">
                {run.allocatedCount}/{run.orderCount} allocated
              </td>
              <td>
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
                  style={{
                    background: run.status === "confirmed" ? "#d1fae5" : run.status === "cancelled" ? "#fee2e2" : "#dbeafe",
                    color: run.status === "confirmed" ? "#059669" : run.status === "cancelled" ? "#ef4444" : "#1d4ed8",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: run.status === "confirmed" ? "#059669" : run.status === "cancelled" ? "#ef4444" : "#3b82f6" }}
                  />
                  {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                </span>
              </td>
              <td className="text-right">
                <Link href={`/history/${run.id}`}>
                  <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 text-xs">
                    View
                  </Button>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
  ChevronDown,
  ChevronUp,
  PackageSearch,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────
type OrderRow = {
  orderId: number;
  referenceNum: string;
  poNum: string | null;
  clientId: number;
  clientName: string;
  facilityId: number;
  facilityName: string;
  creationDate: string;
  ageDays: number;
  priority: "urgent" | "high" | "normal";
  lineCount: number;
  shipToName: string | null;
  configId: number;
  orderStatus: number;
};

type FacilityGroup = {
  facilityId: number;
  facilityName: string;
  orders: OrderRow[];
  total: number;
  urgent: number;
  high: number;
  normal: number;
  byClient: Array<{ clientId: number; clientName: string; count: number; urgent: number }>;
};

type StatusTab = "all" | "unallocated" | "in_production" | "ship_ready" | "out_of_sla";

// ─── Priority pill ────────────────────────────────────────────────────────────
function PriorityPill({ priority }: { priority: "urgent" | "high" | "normal" }) {
  const map = {
    urgent: { bg: "#fee2e2", text: "#ef4444", dot: "#ef4444", label: "Urgent" },
    high:   { bg: "#fef3c7", text: "#d97706", dot: "#f59e0b", label: "High" },
    normal: { bg: "#d1fae5", text: "#059669", dot: "#059669", label: "Normal" },
  };
  const s = map[priority];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
      style={{ background: s.bg, color: s.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

// ─── Sort helpers ─────────────────────────────────────────────────────────────
type SortKey = "clientName" | "referenceNum" | "ageDays" | "priority" | "lineCount" | "shipToName";
type SortDir = "asc" | "desc";
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2 };

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30 inline" />;
  return sortDir === "asc"
    ? <ChevronUp className="h-3 w-3 ml-1 inline" />
    : <ChevronDown className="h-3 w-3 ml-1 inline" />;
}

// ─── Per-warehouse card ───────────────────────────────────────────────────────
function WarehouseCard({ facility, statusTab }: { facility: FacilityGroup; statusTab: StatusTab }) {
  const [search, setSearch]             = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [sortKey, setSortKey]           = useState<SortKey>("ageDays");
  const [sortDir, setSortDir]           = useState<SortDir>("desc");
  const [expanded, setExpanded]         = useState(false);

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
          o.referenceNum.toLowerCase().includes(q) ||
          o.clientName.toLowerCase().includes(q) ||
          (o.shipToName ?? "").toLowerCase().includes(q) ||
          (o.poNum ?? "").toLowerCase().includes(q)
      );
    }
    if (clientFilter !== "all") rows = rows.filter((o) => String(o.clientId) === clientFilter);
    if (statusTab === "unallocated")   rows = rows.filter((o) => o.orderStatus === 0);
    else if (statusTab === "in_production") rows = rows.filter((o) => o.orderStatus === 1);
    else if (statusTab === "ship_ready")    rows = rows.filter((o) => o.orderStatus === 2);
    else if (statusTab === "out_of_sla")    rows = rows.filter((o) => o.ageDays >= 7);
    return [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "ageDays")       cmp = a.ageDays - b.ageDays;
      else if (sortKey === "priority") cmp = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      else if (sortKey === "lineCount") cmp = a.lineCount - b.lineCount;
      else cmp = String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [facility.orders, search, clientFilter, statusTab, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const hasFilters = search || clientFilter !== "all";

  return (
    <div
      className="bg-card rounded-2xl overflow-hidden"
      style={{
        border:
          facility.urgent > 0
            ? "2px solid #ef4444"
            : facility.high > 0
            ? "2px solid #f59e0b"
            : "1px solid hsl(var(--border))",
        boxShadow:
          facility.urgent > 0
            ? "0 0 0 1px rgba(239,68,68,0.15), 0 4px 16px rgba(239,68,68,0.10)"
            : facility.high > 0
            ? "0 0 0 1px rgba(245,158,11,0.15), 0 4px 16px rgba(245,158,11,0.10)"
            : undefined,
      }}
    >
      {/* Warehouse header — light style */}
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
                {facility.high > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {facility.high} HIGH
                  </span>
                )}
                {facility.urgent > 0 && (
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 cursor-default">
                          <ShieldAlert className="h-2.5 w-2.5" />
                          {facility.urgent} URGENT
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="p-3 min-w-[160px]">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Priority Breakdown</p>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-xs text-red-600 font-semibold">
                              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                              Urgent (&ge;7d)
                            </span>
                            <span className="text-xs font-bold">{facility.urgent}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-xs text-amber-600 font-semibold">
                              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                              High (3–6d)
                            </span>
                            <span className="text-xs font-bold">{facility.high}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                              Normal (&lt;3d)
                            </span>
                            <span className="text-xs font-bold">{facility.normal}</span>
                          </div>
                          <div className="border-t border-border pt-1.5 mt-1 flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Total</span>
                            <span className="text-xs font-bold">{facility.total}</span>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{facility.total} unallocated order{facility.total !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="text-muted-foreground">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-muted/50 rounded-xl px-4 py-3 text-center">
            <p className="text-[22px] font-extrabold text-foreground leading-none">{facility.total}</p>
            <p className="text-[10px] text-muted-foreground mt-1 font-medium uppercase tracking-wide">Total Open</p>
          </div>
          <div className="bg-red-50 rounded-xl px-4 py-3 text-center border border-red-100">
            <p className="text-[22px] font-extrabold text-red-600 leading-none">{facility.urgent}</p>
            <p className="text-[10px] text-red-400 mt-1 font-medium uppercase tracking-wide">Urgent</p>
          </div>
          <div className="bg-amber-50 rounded-xl px-4 py-3 text-center border border-amber-100">
            <p className="text-[22px] font-extrabold text-amber-600 leading-none">{facility.high}</p>
            <p className="text-[10px] text-amber-400 mt-1 font-medium uppercase tracking-wide">High</p>
          </div>
          <div className="bg-blue-50 rounded-xl px-4 py-3 text-center border border-blue-100">
            <p className="text-[22px] font-extrabold text-blue-600 leading-none">{facility.byClient.length}</p>
            <p className="text-[10px] text-blue-400 mt-1 font-medium uppercase tracking-wide">Clients</p>
          </div>
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
                placeholder="Search order, client, ship-to…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-8 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 w-48"
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

            {hasFilters && (
              <button
                onClick={() => { setSearch(""); setClientFilter("all"); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 ml-auto"
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
                <p className="text-sm font-medium">No unallocated orders.</p>
              ) : (
                <>
                  <p className="text-sm font-medium">No orders match your filters.</p>
                  <button
                    onClick={() => { setSearch(""); setClientFilter("all"); }}
                    className="text-xs text-primary hover:underline mt-1"
                  >
                    Clear filters
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full data-table">
                <thead>
                  <tr>
                    <th onClick={() => toggleSort("referenceNum")} className="cursor-pointer select-none">
                      Order # <SortIcon col="referenceNum" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th onClick={() => toggleSort("clientName")} className="cursor-pointer select-none">
                      Client <SortIcon col="clientName" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th onClick={() => toggleSort("shipToName")} className="cursor-pointer select-none">
                      Ship To <SortIcon col="shipToName" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th onClick={() => toggleSort("ageDays")} className="cursor-pointer select-none">
                      Age <SortIcon col="ageDays" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th onClick={() => toggleSort("priority")} className="cursor-pointer select-none">
                      Priority <SortIcon col="priority" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th onClick={() => toggleSort("lineCount")} className="cursor-pointer select-none">
                      Lines <SortIcon col="lineCount" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => {
                    const isUrgent = o.priority === "urgent";
                    const isHigh   = o.priority === "high";
                    return (
                      <tr
                        key={o.orderId}
                        style={
                          isUrgent
                            ? { background: "rgba(239,68,68,0.04)", borderLeft: "3px solid #ef4444" }
                            : isHigh
                            ? { background: "rgba(245,158,11,0.04)", borderLeft: "3px solid #f59e0b" }
                            : undefined
                        }
                      >
                        <td className="font-semibold text-foreground">
                          {o.referenceNum || `#${o.orderId}`}
                          {(isUrgent || isHigh) && (
                            <span className="ml-2 text-[10px]">
                              {isUrgent ? "⚠" : "△"}
                            </span>
                          )}
                        </td>
                        <td className="text-muted-foreground">{o.clientName}</td>
                        <td className="text-muted-foreground text-xs">{o.shipToName ?? "—"}</td>
                        <td className="text-muted-foreground text-xs">
                          {o.ageDays === 0 ? "Today" : `${o.ageDays}d`}
                        </td>
                        <td><PriorityPill priority={o.priority} /></td>
                        <td className="text-muted-foreground text-xs">{o.lineCount}</td>
                        <td className="text-right">
                          <Link href="/allocate">
                            <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 text-xs">
                              Allocate
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
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
  const { data, isLoading, refetch, isFetching } = trpc.allocation.openOrders.useQuery({});
  const [pageStatusTab, setPageStatusTab] = useState<StatusTab>("all");

  const facilities: FacilityGroup[] = (data as { facilities?: FacilityGroup[] })?.facilities ?? [];
  const summary = data?.summary ?? { total: 0, urgent: 0, high: 0, normal: 0, byClient: [] };
  const totalOutOfSla = summary.urgent;

  return (
    <AppLayout>
      <div className="p-7 space-y-6 page-enter">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="page-breadcrumb">Overview</p>
            <h1 className="page-title">Open Orders Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button asChild className="shadow-sm">
              <Link href="/allocate" className="flex items-center gap-2">
                <PackageSearch className="h-4 w-4" />
                Run Allocation Tool
              </Link>
            </Button>
          </div>
        </div>

        {/* Page-level status tabs */}
        <div className="bg-card border border-border rounded-2xl px-6 pt-1 pb-0 flex items-center gap-1 flex-wrap">
          {([
            { key: "all",           label: "All" },
            { key: "unallocated",   label: "Unallocated" },
            { key: "in_production", label: "In Production" },
            { key: "ship_ready",    label: "Ship Ready" },
            { key: "out_of_sla",    label: "Out of SLA" },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPageStatusTab(key)}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                pageStatusTab === key
                  ? key === "out_of_sla"
                    ? "border-red-500 text-red-600"
                    : "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {key === "out_of_sla" && totalOutOfSla > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold">{totalOutOfSla}</span>
              )}
            </button>
          ))}
        </div>

        {/* Global KPI bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="kpi-card">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
              <PackageSearch className="h-3.5 w-3.5" /> Total Open Orders
            </p>
            <p className="text-[28px] font-extrabold tracking-tight leading-none">
              {isLoading ? "—" : summary.total}
            </p>
          </div>
          <div className="kpi-card">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
              <ShieldAlert className="h-3.5 w-3.5 text-red-500" /> Urgent (&ge;7 days)
            </p>
            <p className="text-[28px] font-extrabold tracking-tight leading-none text-red-500">
              {isLoading ? "—" : summary.urgent}
            </p>
          </div>
          <div className="kpi-card">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> High (3–6 days)
            </p>
            <p className="text-[28px] font-extrabold tracking-tight leading-none text-amber-500">
              {isLoading ? "—" : summary.high}
            </p>
          </div>
          <div className="kpi-card">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
              <Users className="h-3.5 w-3.5 text-blue-500" /> Warehouses Active
            </p>
            <p className="text-[28px] font-extrabold tracking-tight leading-none text-blue-500">
              {isLoading ? "—" : facilities.length}
            </p>
          </div>
        </div>

        {/* Loading skeletons */}
        {isLoading && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
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

        {/* No config state */}
        {!isLoading && facilities.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <Warehouse className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No warehouses found.</p>
            <p className="text-xs mt-1 opacity-70">
              Configure an Extensiv connection in{" "}
              <Link href="/settings" className="text-primary hover:underline">API Settings</Link>{" "}
              to see open orders here.
            </p>
          </div>
        )}

        {/* Warehouse cards — 2-column grid on large screens */}
        {!isLoading && facilities.length > 0 && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {facilities.map((f) => (
              <WarehouseCard key={f.facilityId} facility={f} statusTab={pageStatusTab} />
            ))}
          </div>
        )}

        {/* Recent Allocation Runs — compact secondary section */}
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

import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Clock,
  PackageSearch,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";

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

export default function Home() {
  const { data, isLoading, refetch, isFetching } = trpc.allocation.openOrders.useQuery({});

  const [search, setSearch]     = useState("");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [sortKey, setSortKey]   = useState<SortKey>("ageDays");
  const [sortDir, setSortDir]   = useState<SortDir>("desc");

  const orders  = data?.orders  ?? [];
  const summary = data?.summary ?? { total: 0, urgent: 0, high: 0, normal: 0, byClient: [] };

  // Unique clients for filter dropdown
  const clientOptions = useMemo(
    () => Array.from(new Map(orders.map((o) => [o.clientId, o.clientName])).entries()),
    [orders]
  );

  // Filtered + sorted rows
  const filteredOrders = useMemo(() => {
    let rows = orders;
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
    if (clientFilter !== "all") {
      rows = rows.filter((o) => String(o.clientId) === clientFilter);
    }
    if (priorityFilter !== "all") {
      rows = rows.filter((o) => o.priority === priorityFilter);
    }
    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "ageDays")    cmp = a.ageDays - b.ageDays;
      else if (sortKey === "priority") cmp = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      else if (sortKey === "lineCount") cmp = a.lineCount - b.lineCount;
      else cmp = String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [orders, search, clientFilter, priorityFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const hasFilters = search || clientFilter !== "all" || priorityFilter !== "all";

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

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="kpi-card">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
              <PackageSearch className="h-3.5 w-3.5" />
              Total Open Orders
            </p>
            <p className="text-[28px] font-extrabold tracking-tight leading-none">
              {isLoading ? "—" : summary.total}
            </p>
          </div>

          <div className="kpi-card">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
              <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
              Urgent (&ge;7 days)
            </p>
            <p className="text-[28px] font-extrabold tracking-tight leading-none text-red-500">
              {isLoading ? "—" : summary.urgent}
            </p>
          </div>

          <div className="kpi-card">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              High (3–6 days)
            </p>
            <p className="text-[28px] font-extrabold tracking-tight leading-none text-amber-500">
              {isLoading ? "—" : summary.high}
            </p>
          </div>

          <div className="kpi-card">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
              <Users className="h-3.5 w-3.5 text-blue-500" />
              Clients with Open Orders
            </p>
            <p className="text-[28px] font-extrabold tracking-tight leading-none text-blue-500">
              {isLoading ? "—" : summary.byClient.length}
            </p>
          </div>
        </div>

        {/* Open Orders table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {/* Table header / filters */}
          <div className="px-6 py-4 border-b border-border flex flex-wrap items-center gap-3">
            <h3 className="text-[15px] font-bold mr-auto">
              Unallocated Orders
              {!isLoading && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {hasFilters ? `${filteredOrders.length} of ${orders.length}` : orders.length} orders
                </span>
              )}
            </h3>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search order, client, ship-to…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-8 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 w-52"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Client filter */}
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

            {/* Priority filter */}
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="py-1.5 px-2.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
            </select>

            {/* Clear filters */}
            {hasFilters && (
              <button
                onClick={() => { setSearch(""); setClientFilter("all"); setPriorityFilter("all"); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 bg-muted rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <PackageSearch className="h-10 w-10 mx-auto mb-3 opacity-30" />
              {orders.length === 0 ? (
                <>
                  <p className="text-sm font-medium">No open orders found.</p>
                  <p className="text-xs mt-1 opacity-70">
                    All orders are allocated, or no Extensiv connection is configured.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">No orders match your filters.</p>
                  <button
                    onClick={() => { setSearch(""); setClientFilter("all"); setPriorityFilter("all"); }}
                    className="text-xs text-primary hover:underline mt-2"
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
                    <th>
                      <button onClick={() => toggleSort("referenceNum")} className="flex items-center">
                        Order # <SortIcon col="referenceNum" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    <th>
                      <button onClick={() => toggleSort("clientName")} className="flex items-center">
                        Client <SortIcon col="clientName" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    <th>
                      <button onClick={() => toggleSort("shipToName")} className="flex items-center">
                        Ship To <SortIcon col="shipToName" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    <th>
                      <button onClick={() => toggleSort("ageDays")} className="flex items-center">
                        Age <SortIcon col="ageDays" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    <th>
                      <button onClick={() => toggleSort("priority")} className="flex items-center">
                        Priority <SortIcon col="priority" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    <th>
                      <button onClick={() => toggleSort("lineCount")} className="flex items-center">
                        Lines <SortIcon col="lineCount" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr key={order.orderId}>
                      <td className="font-semibold text-foreground">
                        {order.referenceNum || `#${order.orderId}`}
                        {order.poNum && (
                          <span className="block text-xs text-muted-foreground font-normal">
                            PO: {order.poNum}
                          </span>
                        )}
                      </td>
                      <td className="text-muted-foreground">{order.clientName}</td>
                      <td className="text-muted-foreground">{order.shipToName ?? "—"}</td>
                      <td>
                        <span className={`font-semibold ${
                          order.ageDays >= 7 ? "text-red-500" :
                          order.ageDays >= 3 ? "text-amber-500" : "text-muted-foreground"
                        }`}>
                          {order.ageDays === 0 ? "Today" : `${order.ageDays}d`}
                        </span>
                      </td>
                      <td><PriorityPill priority={order.priority} /></td>
                      <td className="text-muted-foreground">{order.lineCount}</td>
                      <td className="text-right">
                        <Link href="/allocate">
                          <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 text-xs">
                            Allocate
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Loading indicator for refresh */}
          {isFetching && !isLoading && (
            <div className="px-6 py-2 border-t border-border text-xs text-muted-foreground flex items-center gap-2">
              <RefreshCw className="h-3 w-3 animate-spin" /> Refreshing…
            </div>
          )}
        </div>

        {/* Recent Allocation Runs — compact secondary section */}
        <RecentRunsSection />
      </div>
    </AppLayout>
  );
}

function RecentRunsSection() {
  const { data: runs, isLoading } = trpc.allocation.history.useQuery({ limit: 5 });

  if (isLoading) return null;
  if (!runs || runs.length === 0) return null;

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

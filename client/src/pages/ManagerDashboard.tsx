import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Scale, Users, AlertTriangle, Package, Activity, RefreshCw,
  CheckCircle2, XCircle, Clock, Edit2, Save, X, ChevronDown, ChevronUp,
  Warehouse, Search
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = "weights" | "mu-cases" | "sku-overrides" | "scan-errors" | "orders" | "health" | "users";

// ─── Tab Button ───────────────────────────────────────────────────────────────
function TabBtn({ id, label, icon: Icon, active, onClick, badge }: {
  id: Tab; label: string; icon: React.ElementType; active: boolean;
  onClick: () => void; badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
        active
          ? "bg-blue-600 text-white shadow-sm"
          : "text-gray-400 hover:text-white hover:bg-white/10"
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
      {badge != null && badge > 0 && (
        <span className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
          {badge}
        </span>
      )}
    </button>
  );
}

// ─── Weight Approvals Section ─────────────────────────────────────────────────
function WeightApprovalsSection() {
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const listQuery = trpc.skuWeight.listWeightRequests.useQuery({ status: filter === "all" ? undefined : filter });
  const reviewMutation = trpc.skuWeight.reviewWeightRequest.useMutation({
    onSuccess: () => { toast.success("Request reviewed"); listQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const requests = listQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(["pending", "approved", "rejected", "all"] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${filter === s ? "bg-blue-600 text-white" : "bg-white/10 text-gray-400 hover:text-white"}`}>
            {s}
          </button>
        ))}
        <Button variant="outline" size="sm" className="ml-auto h-7" onClick={() => listQuery.refetch()}>
          <RefreshCw className={`w-3 h-3 ${listQuery.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {requests.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No {filter === "all" ? "" : filter} weight requests.</div>
      ) : (
        <div className="space-y-2">
          {requests.map((r: any) => (
            <div key={r.id} className="bg-white/5 rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-white">{r.sku}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    r.status === "pending" ? "bg-amber-500/20 text-amber-300" :
                    r.status === "approved" ? "bg-green-500/20 text-green-300" :
                    "bg-red-500/20 text-red-300"
                  }`}>{r.status}</span>
                </div>
                <div className="text-sm text-gray-400 mt-1">
                  {r.cartonWeightLb} lbs · {r.unitsPerCarton} units/carton
                  {r.submittedByName && <> · Submitted by <span className="text-gray-300">{r.submittedByName}</span></>}
                </div>
              </div>
              {r.status === "pending" && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => reviewMutation.mutate({ id: r.id, action: "approve" })}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 border-red-500/50 text-red-400 hover:bg-red-500/10"
                    onClick={() => reviewMutation.mutate({ id: r.id, action: "reject", note: "Rejected by manager" })}>
                    <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MU Case Counts Section ──────────────────────────────────────────────────
function MuCaseCountsSection() {
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const listQuery = trpc.muCaseCount.list.useQuery({ status: filter });
  const reviewMutation = trpc.muCaseCount.review.useMutation({
    onSuccess: () => { toast.success("Case count request reviewed"); listQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const requests = Array.isArray(listQuery.data) ? listQuery.data : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(["pending", "approved", "rejected"] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${filter === s ? "bg-blue-600 text-white" : "bg-white/10 text-gray-400 hover:text-white"}`}>
            {s}
          </button>
        ))}
        <Button variant="outline" size="sm" className="ml-auto h-7" onClick={() => listQuery.refetch()}>
          <RefreshCw className={`w-3 h-3 ${listQuery.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {requests.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No {filter} MU case count requests.</div>
      ) : (
        <div className="space-y-2">
          {requests.map((r: any) => (
            <div key={r.id} className="bg-white/5 rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-white">{r.sku}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    r.status === "pending" ? "bg-amber-500/20 text-amber-300" :
                    r.status === "approved" ? "bg-green-500/20 text-green-300" :
                    "bg-red-500/20 text-red-300"
                  }`}>{r.status}</span>
                </div>
                <div className="text-sm text-gray-400 mt-1">
                  <strong className="text-white">{r.cases_per_mu}</strong> cases per MU
                  {r.submitted_by && <> · Submitted by <span className="text-gray-300">{r.submitted_by}</span></>}
                </div>
              </div>
              {r.status === "pending" && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => reviewMutation.mutate({ id: r.id, action: "approve" })}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 border-red-500/50 text-red-400 hover:bg-red-500/10"
                    onClick={() => reviewMutation.mutate({ id: r.id, action: "reject" })}>
                    <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SKU Weight Overrides Section ─────────────────────────────────────────────
function SkuOverridesSection() {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ cartonWeightLb: string; unitsPerCarton: string }>({ cartonWeightLb: "", unitsPerCarton: "" });

  const listQuery = trpc.skuWeight.listAll.useQuery();
  const upsertMutation = trpc.skuWeight.upsert.useMutation({
    onSuccess: () => { toast.success("Weight override saved"); setEditingId(null); listQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const allOverrides = listQuery.data ?? [];
  const overrides = search ? allOverrides.filter((o: any) => o.sku?.toLowerCase().includes(search.toLowerCase())) : allOverrides;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by SKU..."
            className="w-full bg-white/10 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <Button variant="outline" size="sm" className="h-9" onClick={() => listQuery.refetch()}>
          <RefreshCw className={`w-3.5 h-3.5 ${listQuery.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="rounded-xl overflow-hidden border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/5 text-gray-400 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3">SKU</th>
              <th className="text-left px-4 py-3">Customer</th>
              <th className="text-right px-4 py-3">Carton Weight (lbs)</th>
              <th className="text-right px-4 py-3">Units/Carton</th>
              <th className="text-right px-4 py-3">Per Unit (lbs)</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {overrides.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-500">No overrides found.</td></tr>
            ) : overrides.map((o: any) => (
              <tr key={o.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                <td className="px-4 py-3 font-mono font-semibold text-white">{o.sku}</td>
                <td className="px-4 py-3 text-gray-400">{o.customerName ?? `Customer ${o.customerId}`}</td>
                <td className="px-4 py-3 text-right">
                  {editingId === o.id ? (
                    <input type="number" value={editValues.cartonWeightLb} onChange={(e) => setEditValues(v => ({ ...v, cartonWeightLb: e.target.value }))}
                      className="w-24 bg-white/10 border border-blue-500 rounded px-2 py-1 text-white text-right focus:outline-none" />
                  ) : <span className="text-white">{parseFloat(o.cartonWeightLb).toFixed(2)}</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  {editingId === o.id ? (
                    <input type="number" value={editValues.unitsPerCarton} onChange={(e) => setEditValues(v => ({ ...v, unitsPerCarton: e.target.value }))}
                      className="w-20 bg-white/10 border border-blue-500 rounded px-2 py-1 text-white text-right focus:outline-none" />
                  ) : <span className="text-white">{o.unitsPerCarton}</span>}
                </td>
                <td className="px-4 py-3 text-right text-gray-400">
                  {(parseFloat(o.cartonWeightLb) / o.unitsPerCarton).toFixed(3)}
                </td>
                <td className="px-4 py-3 text-right">
                  {editingId === o.id ? (
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" className="h-7 bg-green-600 hover:bg-green-700 text-white px-2"
                        onClick={() => upsertMutation.mutate({ sku: o.sku, configId: o.configId, customerId: o.customerId, cartonWeightLb: parseFloat(editValues.cartonWeightLb), unitsPerCarton: parseInt(editValues.unitsPerCarton) })}>
                        <Save className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setEditingId(null)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => {
                      setEditingId(o.id);
                      setEditValues({ cartonWeightLb: String(o.cartonWeightLb), unitsPerCarton: String(o.unitsPerCarton) });
                    }}>
                      <Edit2 className="w-3 h-3" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Scan Errors Section ──────────────────────────────────────────────────────
function ScanErrorsSection() {
  const listQuery = trpc.qcScanner.listFlaggedScans.useQuery({ status: "open" });
  const flags = Array.isArray(listQuery.data) ? listQuery.data : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">{flags.length} flagged scan{flags.length !== 1 ? "s" : ""}</p>
        <Button variant="outline" size="sm" className="h-7" onClick={() => listQuery.refetch()}>
          <RefreshCw className={`w-3 h-3 ${listQuery.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {flags.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No flagged scans.</div>
      ) : (
        <div className="space-y-2">
          {flags.map((f: any) => (
            <div key={f.id} className="bg-white/5 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-white">{f.upc ?? "No UPC"}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${f.status === "open" ? "bg-amber-500/20 text-amber-300" : "bg-green-500/20 text-green-300"}`}>
                      {f.status}
                    </span>
                  </div>
                  {f.description && <p className="text-sm text-gray-400 mt-1">{f.description}</p>}
                  <p className="text-xs text-gray-500 mt-1">
                    TX: {f.referenceNumber} · {f.flaggedByName ?? "Unknown"} · {new Date(f.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Orders Section ───────────────────────────────────────────────────────────
function fmtTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
}
function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function fmtDuration(start: string | Date | null | undefined, end: string | Date | null | undefined) {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms <= 0) return null;
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs > 0) return `${hrs}h ${remMins}m`;
  return `${mins}m`;
}

function OrdersSection() {
  const [search, setSearch] = useState("");
  const listQuery = trpc.qcScanner.getSessionHistory.useQuery({ limit: 50, search: search || undefined });
  const sessions = listQuery.data?.sessions ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search TX ID, customer, PO..."
            className="w-full bg-white/10 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
        </div>
        <Button variant="outline" size="sm" className="h-9" onClick={() => listQuery.refetch()}>
          <RefreshCw className={`w-3.5 h-3.5 ${listQuery.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
      <div className="space-y-2">
        {sessions.map((s: any) => {
          const duration = fmtDuration(s.createdAt, s.completedAt);
          return (
            <div key={s.id} className="bg-white/5 rounded-xl p-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-white">TX {s.transactionId}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${s.status === "complete" ? "bg-green-500/20 text-green-300" : "bg-amber-500/20 text-amber-300"}`}>{s.status}</span>
                </div>
                <p className="text-sm text-gray-400 mt-0.5">{s.customerName} · {s.totalScanned}/{s.totalExpected} units</p>
              </div>
              <div className="text-right text-xs text-gray-400 shrink-0 space-y-0.5">
                <div className="text-gray-500">{fmtDate(s.createdAt)}</div>
                <div>
                  <span className="text-gray-500">Start: </span>
                  <span className="text-white">{fmtTime(s.createdAt)}</span>
                </div>
                {s.completedAt && (
                  <div>
                    <span className="text-gray-500">End: </span>
                    <span className="text-white">{fmtTime(s.completedAt)}</span>
                  </div>
                )}
                {duration && (
                  <div className="text-blue-400 font-semibold">⏱ {duration}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── System Health Section ────────────────────────────────────────────────────
function SystemHealthSection() {
  const healthQuery = trpc.auth.me.useQuery();
  const [pingResult, setPingResult] = useState<string | null>(null);

  const testPing = async () => {
    const start = Date.now();
    try {
      await fetch("/api/scheduled/keepalive", { method: "POST" });
      setPingResult(`Server responded in ${Date.now() - start}ms`);
    } catch {
      setPingResult("Server unreachable");
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-green-400" />
            <span className="text-sm font-semibold text-white">Server Status</span>
          </div>
          <p className="text-2xl font-bold text-green-400">Online</p>
          <p className="text-xs text-gray-500 mt-1">Keep-alive ping active every 4 min</p>
        </div>
        <div className="bg-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-white">Current User</span>
          </div>
          <p className="text-lg font-bold text-white">{healthQuery.data?.name ?? "—"}</p>
          <p className="text-xs text-gray-500 mt-1">{healthQuery.data?.loginMethod ?? "—"}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Warehouse className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold text-white">Ping Test</span>
          </div>
          <Button size="sm" className="h-8 mt-1" onClick={testPing}>Test Server</Button>
          {pingResult && <p className="text-xs text-green-400 mt-2">{pingResult}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Users Section ────────────────────────────────────────────────────────────
function UsersSection() {
  const listQuery = trpc.teamAccounts.list.useQuery();
  const accounts = listQuery.data ?? [];

  const roleColor = (role: string) => {
    if (role === "admin") return "bg-purple-500/20 text-purple-300";
    if (role === "qc_operator") return "bg-blue-500/20 text-blue-300";
    if (role === "dock_operator") return "bg-orange-500/20 text-orange-300";
    if (role === "shipping_clerk") return "bg-teal-500/20 text-teal-300";
    return "bg-gray-500/20 text-gray-300";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">{accounts.length} team account{accounts.length !== 1 ? "s" : ""}</p>
        <Button variant="outline" size="sm" className="h-7" onClick={() => listQuery.refetch()}>
          <RefreshCw className={`w-3 h-3 ${listQuery.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
      <div className="rounded-xl overflow-hidden border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/5 text-gray-400 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Username</th>
              <th className="text-left px-4 py-3">Role</th>
              <th className="text-left px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a: any) => (
              <tr key={a.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                <td className="px-4 py-3 font-semibold text-white">{a.name}</td>
                <td className="px-4 py-3 font-mono text-gray-400">{a.username}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${roleColor(a.role)}`}>
                    {a.role.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${a.active ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>
                    {a.active ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function ManagerDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("weights");
  const pendingQuery = trpc.skuWeight.listWeightRequests.useQuery({ status: "pending" });
  const flagsQuery = trpc.qcScanner.listFlaggedScans.useQuery({ status: "open" });
  const pendingCount = pendingQuery.data?.length ?? 0;
  const flagCount = Array.isArray(flagsQuery.data) ? flagsQuery.data.length : 0;

  const muCasesQuery = trpc.muCaseCount.list.useQuery({ status: "pending" });
  const muCasesCount = Array.isArray(muCasesQuery.data) ? muCasesQuery.data.length : 0;

  const tabs: Array<{ id: Tab; label: string; icon: React.ElementType; badge?: number }> = [
    { id: "weights",      label: "Weight Approvals",  icon: Scale,         badge: pendingCount },
    { id: "mu-cases",    label: "MU Case Counts",    icon: Package,       badge: muCasesCount },
    { id: "sku-overrides",label: "SKU Overrides",     icon: Package },
    { id: "scan-errors",  label: "Scan Errors",       icon: AlertTriangle, badge: flagCount },
    { id: "orders",       label: "Orders",            icon: Warehouse },
    { id: "health",       label: "System Health",     icon: Activity },
    { id: "users",        label: "Team Accounts",     icon: Users },
  ];

  return (
    <div className="min-h-screen p-6" style={{ background: "#191C21" }}>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">Manager Dashboard</h1>
          <p className="text-gray-400 mt-1">Manage weights, errors, orders, and team accounts</p>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 flex-wrap bg-white/5 rounded-xl p-1.5">
          {tabs.map((t) => (
            <TabBtn key={t.id} {...t} active={activeTab === t.id} onClick={() => setActiveTab(t.id)} />
          ))}
        </div>

        {/* Content */}
        <div className="bg-white/5 rounded-2xl p-6">
          {activeTab === "weights"       && <WeightApprovalsSection />}
          {activeTab === "mu-cases"      && <MuCaseCountsSection />}
          {activeTab === "sku-overrides" && <SkuOverridesSection />}
          {activeTab === "scan-errors"   && <ScanErrorsSection />}
          {activeTab === "orders"        && <OrdersSection />}
          {activeTab === "health"        && <SystemHealthSection />}
          {activeTab === "users"         && <UsersSection />}
        </div>
      </div>
    </div>
  );
}

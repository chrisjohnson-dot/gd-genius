import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Inbox,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  PackageOpen,
  X,
} from "lucide-react";

// ─── Status helpers ────────────────────────────────────────────────────────

const STATUS_MAP: Record<number, { label: string; color: string; icon: React.ElementType }> = {
  0: { label: "Expected",    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",   icon: Clock },
  1: { label: "In Progress", color: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: PackageOpen },
  2: { label: "Completed",   color: "bg-green-500/10 text-green-400 border-green-500/20", icon: CheckCircle2 },
};

function StatusBadge({ status }: { status: number }) {
  const s = STATUS_MAP[status] ?? { label: `Status ${status}`, color: "bg-muted text-muted-foreground border-border", icon: Clock };
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border", s.color)}>
      <Icon className="h-3 w-3" />
      {s.label}
    </span>
  );
}

function fmt(d?: string) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString(); } catch { return d; }
}

// ─── KPI Card ─────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4 flex items-start gap-3">
      <div className={cn("rounded-xl p-2 shrink-0", accent ?? "bg-muted")}>
        <Icon className="h-5 w-5 text-foreground/70" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold text-foreground tabular-nums leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Detail Slide-over ────────────────────────────────────────────────────

function ReceiverDetailSheet({
  configId,
  transactionId,
  onClose,
}: {
  configId: number;
  transactionId: number | null;
  onClose: () => void;
}) {
  const { data, isLoading } = trpc.receiving.detail.useQuery(
    { configId, transactionId: transactionId! },
    { enabled: transactionId !== null }
  );

  return (
    <Sheet open={transactionId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <PackageOpen className="h-5 w-5 text-muted-foreground" />
            Receiver Detail
          </SheetTitle>
        </SheetHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        )}

        {data && (
          <div className="space-y-5">
            {/* Meta grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Transaction ID", data.readOnly.transactionId],
                ["Status", <StatusBadge key="s" status={data.readOnly.status} />],
                ["Customer", data.readOnly.customerIdentifier.name || "—"],
                ["Warehouse", data.readOnly.facilityIdentifier.name || "—"],
                ["Reference #", data.referenceNum || "—"],
                ["PO #", data.poNum || "—"],
                ["Expected Date", fmt(data.expectedDate)],
                ["Created", fmt(data.readOnly.creationDate)],
                ["Closed", fmt(data.readOnly.closedDate)],
                ["Tracking #", data.trackingNumber || "—"],
              ].map(([label, val]) => (
                <div key={String(label)} className="bg-muted/40 rounded-xl p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
                  <div className="font-medium text-foreground">{val}</div>
                </div>
              ))}
            </div>

            {/* Notes */}
            {data.notes && (
              <div className="bg-muted/40 rounded-xl p-3 text-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Notes</p>
                <p className="text-foreground">{data.notes}</p>
              </div>
            )}

            {/* Line items */}
            <div>
              <p className="text-sm font-semibold text-foreground mb-2">
                Line Items
                <span className="ml-2 text-xs text-muted-foreground font-normal">
                  ({(data.receiveItems ?? []).length} SKUs)
                </span>
              </p>
              {(data.receiveItems ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No line items available</p>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Expected</TableHead>
                        <TableHead className="text-right">Received</TableHead>
                        <TableHead className="text-right">Variance</TableHead>
                        <TableHead>Lot</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data.receiveItems ?? []).map((item) => {
                        const variance = item.receivedQty - item.expectedQty;
                        return (
                          <TableRow key={item.receiverItemId}>
                            <TableCell className="font-mono text-xs">{item.itemIdentifier.sku}</TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">
                              {item.description || "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{item.expectedQty}</TableCell>
                            <TableCell className="text-right tabular-nums">{item.receivedQty}</TableCell>
                            <TableCell className={cn(
                              "text-right tabular-nums font-semibold",
                              variance === 0 ? "text-muted-foreground" :
                              variance > 0 ? "text-blue-400" : "text-red-400"
                            )}>
                              {variance > 0 ? `+${variance}` : variance === 0 ? "—" : variance}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{item.lotNumber || "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

const DATE_PRESETS = [
  { label: "Last 7 days",  days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

function isoDateDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

export default function ReceivingDashboard() {
  // Extensiv config selection
  const { data: configs } = trpc.config.list.useQuery();
  const [configId, setConfigId] = useState<number | null>(null);

  const activeConfigId = configId ?? (configs?.[0]?.id ?? null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [datePreset, setDatePreset] = useState<number>(30);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const createdAfter = isoDateDaysAgo(datePreset);

  // Data queries
  const { data: kpisData, isLoading: kpisLoading, refetch: refetchKpis } = trpc.receiving.kpis.useQuery(
    { configId: activeConfigId!, createdAfter },
    { enabled: activeConfigId !== null, staleTime: 60_000 }
  );

  const { data: listData, isLoading: listLoading, refetch: refetchList } = trpc.receiving.list.useQuery(
    { configId: activeConfigId!, createdAfter, pgsiz: PAGE_SIZE, pgnum: page },
    { enabled: activeConfigId !== null, staleTime: 60_000 }
  );

  const [selectedTxId, setSelectedTxId] = useState<number | null>(null);

  const receivers = listData?.receivers ?? [];
  const totalResults = listData?.totalResults ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));

  // Client-side filter by status and search
  const filtered = useMemo(() => {
    return receivers.filter((r) => {
      if (statusFilter !== "all" && r.readOnly.status !== Number(statusFilter)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          (r.referenceNum ?? "").toLowerCase().includes(q) ||
          (r.poNum ?? "").toLowerCase().includes(q) ||
          r.readOnly.customerIdentifier.name.toLowerCase().includes(q) ||
          (r.trackingNumber ?? "").toLowerCase().includes(q) ||
          String(r.readOnly.transactionId).includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [receivers, statusFilter, searchQuery]);

  function handleRefresh() {
    refetchKpis();
    refetchList();
  }

  const noConfig = activeConfigId === null;

  return (
    <div className="p-5 space-y-5 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="page-breadcrumb">Receiving</p>
          <h1 className="page-title">Receiving Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          {configs && configs.length > 1 && (
            <Select
              value={String(activeConfigId ?? "")}
              onValueChange={(v) => { setConfigId(Number(v)); setPage(1); }}
            >
              <SelectTrigger className="w-44 h-9 text-sm">
                <SelectValue placeholder="Select warehouse" />
              </SelectTrigger>
              <SelectContent>
                {configs.map((c: { id: number; name: string }) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {noConfig ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-24 text-center">
          <Inbox className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-base font-semibold text-foreground">No Extensiv connection configured</p>
          <p className="text-sm text-muted-foreground mt-1">Configure an Extensiv API connection in Settings first.</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Expected"
              value={kpisLoading ? "…" : (kpisData?.expected ?? 0)}
              sub="Awaiting arrival"
              accent="bg-blue-500/10"
              icon={Clock}
            />
            <KpiCard
              label="In Progress"
              value={kpisLoading ? "…" : (kpisData?.inProgress ?? 0)}
              sub="Being received"
              accent="bg-amber-500/10"
              icon={PackageOpen}
            />
            <KpiCard
              label="Completed"
              value={kpisLoading ? "…" : (kpisData?.completed ?? 0)}
              sub={`Last ${datePreset} days`}
              accent="bg-green-500/10"
              icon={CheckCircle2}
            />
            <KpiCard
              label="Discrepancies"
              value={kpisLoading ? "…" : (kpisData?.discrepancies ?? 0)}
              sub="Qty mismatch"
              accent={kpisData?.discrepancies ? "bg-red-500/10" : "bg-muted"}
              icon={AlertTriangle}
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Date preset */}
            <div className="flex rounded-xl border border-border overflow-hidden">
              {DATE_PRESETS.map((p) => (
                <button
                  key={p.days}
                  onClick={() => { setDatePreset(p.days); setPage(1); }}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium transition-colors",
                    datePreset === p.days
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Status filter */}
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="0">Expected</SelectItem>
                <SelectItem value="1">In Progress</SelectItem>
                <SelectItem value="2">Completed</SelectItem>
              </SelectContent>
            </Select>

            {/* Search */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-xs"
                placeholder="Ref #, PO #, customer…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <span className="text-xs text-muted-foreground ml-auto">
              {totalResults > 0 ? `${totalResults} total` : ""}
            </span>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-border overflow-hidden bg-card">
            {listLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
                <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Loading shipments…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Inbox className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-foreground">No receivers found</p>
                <p className="text-xs text-muted-foreground mt-1">Try adjusting the date range or filters.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Txn ID</TableHead>
                    <TableHead>Reference #</TableHead>
                    <TableHead>PO #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Expected Date</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow
                      key={r.readOnly.transactionId}
                      className="cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => setSelectedTxId(r.readOnly.transactionId)}
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {r.readOnly.transactionId}
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        {r.referenceNum || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.poNum || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-sm">{r.readOnly.customerIdentifier.name || "—"}</TableCell>
                      <TableCell className="text-sm">{r.readOnly.facilityIdentifier.name || "—"}</TableCell>
                      <TableCell className="text-sm">{fmt(r.expectedDate)}</TableCell>
                      <TableCell className="text-sm">{fmt(r.readOnly.creationDate)}</TableCell>
                      <TableCell>
                        <StatusBadge status={r.readOnly.status} />
                      </TableCell>
                      <TableCell className="text-sm tabular-nums text-muted-foreground">
                        {(r.receiveItems ?? []).length > 0
                          ? `${(r.receiveItems ?? []).length} SKUs`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={(e) => { e.stopPropagation(); setSelectedTxId(r.readOnly.transactionId); }}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail slide-over */}
      {activeConfigId !== null && (
        <ReceiverDetailSheet
          configId={activeConfigId}
          transactionId={selectedTxId}
          onClose={() => setSelectedTxId(null)}
        />
      )}
    </div>
  );
}

import { useState, useMemo } from "react";
import { useLocation } from "wouter";
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
  AlertTriangle,
  CheckCircle2,
  Clock,
  PackageOpen,
  X,
  ChevronDown,
  ChevronUp,
  Warehouse,
  PlayCircle,
  Loader2,
  ArrowRight,
  ClipboardCheck,
} from "lucide-react";
import { toast } from "sonner";

// ─── Status helpers ────────────────────────────────────────────────────────

const STATUS_MAP: Record<number, { label: string; color: string; icon: React.ElementType }> = {
  0: { label: "Expected",    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",   icon: Clock },
  1: { label: "In Progress", color: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: PackageOpen },
  2: { label: "Completed",   color: "bg-green-500/10 text-green-400 border-green-500/20", icon: CheckCircle2 },
};

function StatusBadge({ status }: { status: number }) {
  const s = STATUS_MAP[status] ?? {
    label: `Status ${status}`,
    color: "bg-muted text-muted-foreground border-border",
    icon: Clock,
  };
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

// ─── Types ─────────────────────────────────────────────────────────────────

type Receiver = {
  readOnly: {
    transactionId: number;
    status: number;
    customerIdentifier: { id: number; name: string };
    facilityIdentifier: { id: number; name: string };
    creationDate: string;
    closedDate?: string;
  };
  referenceNum?: string;
  poNum?: string;
  expectedDate?: string;
  notes?: string;
  trackingNumber?: string;
  receiveItems?: Array<{
    receiverItemId: number;
    itemIdentifier: { sku: string; id: number };
    description?: string;
    expectedQty: number;
    receivedQty: number;
    lotNumber?: string;
    expirationDate?: string;
  }>;
};

// ─── Detail Slide-over ────────────────────────────────────────────────────

function ReceiverDetailSheet({
  configId,
  receiver,
  onClose,
  onStarted,
}: {
  configId: number;
  receiver: Receiver | null;
  onClose: () => void;
  onStarted?: () => void;
}) {
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();

  const { data, isLoading } = trpc.receiving.detail.useQuery(
    { configId, transactionId: receiver?.readOnly.transactionId ?? 0 },
    { enabled: receiver !== null }
  );

  const startReceiptMutation = trpc.receiving.startReceipt.useMutation({
    onSuccess: () => {
      toast.success(
        `Receipt ${receiver?.referenceNum ?? receiver?.readOnly.transactionId} started`,
        { description: "Status updated to In Progress in Extensiv." }
      );
      // Invalidate the receiving list and detail so the dashboard refreshes
      void utils.receiving.list.invalidate();
      void utils.receiving.detail.invalidate();
      void utils.receiving.kpis.invalidate();
      onStarted?.();
      onClose();
    },
    onError: (err) => {
      toast.error("Failed to start receipt", { description: err.message });
    },
  });

  const detail = data ?? receiver;
  const isOpen = receiver !== null;

  function handleStartReceipt() {
    if (!receiver) return;
    startReceiptMutation.mutate({
      configId,
      transactionId: receiver.readOnly.transactionId,
    });
  }

  const completeReceiptMutation = trpc.receiving.completeReceipt.useMutation({
    onSuccess: () => {
      toast.success(
        `Receipt ${receiver?.referenceNum ?? receiver?.readOnly.transactionId} completed`,
        { description: "Status updated to Closed/Complete in Extensiv." }
      );
      void utils.receiving.list.invalidate();
      void utils.receiving.detail.invalidate();
      void utils.receiving.kpis.invalidate();
      onStarted?.();
      onClose();
    },
    onError: (err) => {
      toast.error("Failed to complete receipt", { description: err.message });
    },
  });

  const starting = startReceiptMutation.isPending;
  const completing = completeReceiptMutation.isPending;

  function handleCompleteReceipt() {
    if (!receiver) return;
    completeReceiptMutation.mutate({
      configId,
      transactionId: receiver.readOnly.transactionId,
    });
  }

  const canStart = detail?.readOnly.status === 0; // Expected → can start
  const isInProgress = detail?.readOnly.status === 1; // In Progress → can complete
  const canComplete = isInProgress;
  const canPutAway = detail?.readOnly.status === 0 || detail?.readOnly.status === 1;
  const canConfirmItems = isInProgress; // Confirm items only when In Progress

  function handleConfirmItems() {
    if (!receiver || !detail) return;
    const p = new URLSearchParams({
      configId: String(configId),
      transactionId: String(detail.readOnly.transactionId),
      referenceNum: detail.referenceNum ?? "",
      facilityName: detail.readOnly.facilityIdentifier.name ?? "",
      facilityCode: String(detail.readOnly.facilityIdentifier.id),
    });
    onClose();
    navigate(`/receiving/confirm?${p.toString()}`);
  }

  function handlePutAway() {
    if (!receiver || !detail) return;
    const params = new URLSearchParams({
      configId: String(configId),
      facilityId: String(detail.readOnly.facilityIdentifier.id),
      customerId: String(detail.readOnly.customerIdentifier.id),
      transactionId: String(detail.readOnly.transactionId),
      referenceNum: detail.referenceNum ?? "",
    });
    onClose();
    navigate(`/receiving/put-away?${params.toString()}`);
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto flex flex-col gap-0 p-0">
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="flex items-center gap-2 text-base">
                <PackageOpen className="h-5 w-5 text-muted-foreground" />
                {detail?.referenceNum
                  ? `Receipt — ${detail.referenceNum}`
                  : `Receipt #${detail?.readOnly.transactionId ?? "…"}`}
              </SheetTitle>
              {detail && (
                <p className="text-sm text-muted-foreground mt-1">
                  {detail.readOnly.customerIdentifier.name} &nbsp;·&nbsp; {detail.readOnly.facilityIdentifier.name}
                </p>
              )}
            </div>
            {detail && <StatusBadge status={detail.readOnly.status} />}
          </div>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {isLoading && !detail && (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading details…
            </div>
          )}

          {detail && (
            <>
              {/* Discrepancy summary banner */}
              {(() => {
                const discrepantItems = (detail.receiveItems ?? []).filter(
                  (i) => i.expectedQty > 0 && i.receivedQty !== i.expectedQty
                );
                return discrepantItems.length > 0 ? (
                  <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/10">
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-semibold text-red-400">
                        {discrepantItems.length} quantity discrepanc{discrepantItems.length === 1 ? "y" : "ies"} detected
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {discrepantItems.map((i) => i.itemIdentifier.sku).join(", ")}
                      </p>
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Meta grid */}
              <div className="grid grid-cols-2 gap-2.5 text-sm">
                {[
                  ["Transaction ID", String(detail.readOnly.transactionId)],
                  ["PO #", detail.poNum || "—"],
                  ["Reference #", detail.referenceNum || "—"],
                  ["Tracking #", detail.trackingNumber || "—"],
                  ["Expected Date", fmt(detail.expectedDate)],
                  ["Created", fmt(detail.readOnly.creationDate)],
                ].map(([label, val]) => (
                  <div key={label} className="bg-muted/40 rounded-xl p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
                    <p className="font-medium text-foreground text-sm">{val}</p>
                  </div>
                ))}
              </div>

              {/* Notes */}
              {detail.notes && (
                <div className="bg-muted/40 rounded-xl p-3 text-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Notes</p>
                  <p className="text-foreground">{detail.notes}</p>
                </div>
              )}

              {/* Line items */}
              <div>
                <p className="text-sm font-semibold text-foreground mb-2">
                  Line Items
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    ({(detail.receiveItems ?? []).length} SKUs)
                  </span>
                </p>
                {(detail.receiveItems ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No line items — click Start Receipt to load them from Extensiv.
                  </p>
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
                        {(detail.receiveItems ?? []).map((item) => {
                          const variance = item.receivedQty - item.expectedQty;
                          const isDiscrepant = item.expectedQty > 0 && item.receivedQty !== item.expectedQty;
                          return (
                            <TableRow key={item.receiverItemId} className={isDiscrepant ? "bg-red-500/5 border-l-2 border-l-red-500/50" : ""}>
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
            </>
          )}
        </div>

        {/* Footer — action buttons */}
        {detail && (canStart || canComplete || canPutAway || canConfirmItems) && (
          <div className="px-6 py-4 border-t border-border bg-card space-y-2">
            {canStart && (
              <Button
                className="w-full gap-2 h-10 text-sm font-semibold"
                onClick={handleStartReceipt}
                disabled={starting}
              >
                {starting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PlayCircle className="h-4 w-4" />
                )}
                {starting ? "Starting Receipt…" : "Start Receipt"}
              </Button>
            )}
            {canConfirmItems && (
              <Button
                className="w-full gap-2 h-10 text-sm font-semibold"
                onClick={handleConfirmItems}
              >
                <ClipboardCheck className="h-4 w-4" />
                Confirm Items &amp; Generate MUs
              </Button>
            )}
            {canComplete && (
              <Button
                className="w-full gap-2 h-10 text-sm font-semibold bg-green-600 hover:bg-green-700 text-white"
                onClick={handleCompleteReceipt}
                disabled={completing}
              >
                {completing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {completing ? "Completing Receipt…" : "Complete Receipt"}
              </Button>
            )}
            {canPutAway && (
              <Button
                variant="outline"
                className="w-full gap-2 h-10 text-sm font-semibold bg-primary/5 border-primary/30 text-primary hover:bg-primary/10"
                onClick={handlePutAway}
              >
                <ArrowRight className="h-4 w-4" />
                Put Away Items
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Warehouse Card ────────────────────────────────────────────────────────

function WarehouseCard({
  facilityName,
  facilityId,
  receivers,
  onSelect,
}: {
  facilityName: string;
  facilityId: number;
  receivers: Receiver[];
  onSelect: (r: Receiver) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");

  const openCount = receivers.filter((r) => r.readOnly.status !== 2).length;
  const inProgressCount = receivers.filter((r) => r.readOnly.status === 1).length;

  const filtered = useMemo(() => {
    if (!search.trim()) return receivers;
    const q = search.toLowerCase();
    return receivers.filter(
      (r) =>
        (r.referenceNum ?? "").toLowerCase().includes(q) ||
        (r.poNum ?? "").toLowerCase().includes(q) ||
        r.readOnly.customerIdentifier.name.toLowerCase().includes(q) ||
        String(r.readOnly.transactionId).includes(q)
    );
  }, [receivers, search]);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Warehouse header */}
      <button
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="rounded-xl bg-primary/10 p-2 shrink-0">
          <Warehouse className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm">{facilityName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {openCount} open receipt{openCount !== 1 ? "s" : ""}
            {inProgressCount > 0 && (
              <span className="ml-2 text-amber-400">{inProgressCount} in progress</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {openCount > 0 && (
            <Badge className="bg-primary/15 text-primary border-primary/30 text-xs tabular-nums">
              {openCount}
            </Badge>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Receipt list */}
      {expanded && (
        <div className="border-t border-border">
          {/* Search within warehouse */}
          {receivers.length > 5 && (
            <div className="px-4 py-2.5 border-b border-border/60">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  className="pl-7 h-7 text-xs"
                  placeholder="Search receipts…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              No receipts match your search.
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {filtered.map((r) => {
                const skuCount = (r.receiveItems ?? []).length;
                const discrepancyCount = (r.receiveItems ?? []).filter(
                  (i) => i.expectedQty > 0 && i.receivedQty !== i.expectedQty
                ).length;
                const hasDiscrepancy = discrepancyCount > 0;
                return (
                  <button
                    key={r.readOnly.transactionId}
                    className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors text-left group"
                    onClick={() => onSelect(r)}
                  >
                    {/* Status indicator dot */}
                    <div className={cn(
                      "h-2 w-2 rounded-full shrink-0 mt-0.5",
                      r.readOnly.status === 0 ? "bg-blue-400" :
                      r.readOnly.status === 1 ? "bg-amber-400" : "bg-green-400"
                    )} />

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-foreground">
                          {r.referenceNum || `Txn #${r.readOnly.transactionId}`}
                        </span>
                        {r.poNum && (
                          <span className="text-xs text-muted-foreground">PO: {r.poNum}</span>
                        )}
                        {hasDiscrepancy && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            {discrepancyCount} discrepanc{discrepancyCount === 1 ? "y" : "ies"}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span>{r.readOnly.customerIdentifier.name}</span>
                        {r.expectedDate && <span>Expected {fmt(r.expectedDate)}</span>}
                        {skuCount > 0 && <span>{skuCount} SKU{skuCount !== 1 ? "s" : ""}</span>}
                      </div>
                    </div>

                    {/* Status + arrow */}
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={r.readOnly.status} />
                      <span className="text-muted-foreground group-hover:text-foreground transition-colors text-xs">
                        View →
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

function isoDateDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

export default function ReceivingDashboard() {
  const { data: configs } = trpc.config.list.useQuery();
  const [configId, setConfigId] = useState<number | null>(null);
  const activeConfigId = configId ?? (configs?.[0]?.id ?? null);

  // Load all open receipts (status 0 + 1) from the last 30 days
  const createdAfter = isoDateDaysAgo(30);

  const { data: listData, isLoading, refetch } = trpc.receiving.list.useQuery(
    { configId: activeConfigId!, createdAfter, pgsiz: 500, pgnum: 1 },
    { enabled: activeConfigId !== null, staleTime: 60_000 }
  );

  const [selectedReceiver, setSelectedReceiver] = useState<Receiver | null>(null);
  const [globalSearch, setGlobalSearch] = useState("");

  const allReceivers: Receiver[] = (listData?.receivers ?? []) as Receiver[];

  // Filter to open receipts only (Expected + In Progress) unless search is active
  const displayReceivers = useMemo(() => {
    let list = allReceivers;
    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase();
      list = list.filter(
        (r) =>
          (r.referenceNum ?? "").toLowerCase().includes(q) ||
          (r.poNum ?? "").toLowerCase().includes(q) ||
          r.readOnly.customerIdentifier.name.toLowerCase().includes(q) ||
          r.readOnly.facilityIdentifier.name.toLowerCase().includes(q) ||
          String(r.readOnly.transactionId).includes(q)
      );
    } else {
      // Default: show open receipts only (status 0 = Expected, 1 = In Progress)
      list = list.filter((r) => r.readOnly.status !== 2);
    }
    return list;
  }, [allReceivers, globalSearch]);

  // Group by warehouse (facilityIdentifier)
  const warehouseGroups = useMemo(() => {
    const map = new Map<string, { facilityId: number; facilityName: string; receivers: Receiver[] }>();
    for (const r of displayReceivers) {
      const key = String(r.readOnly.facilityIdentifier.id);
      if (!map.has(key)) {
        map.set(key, {
          facilityId: r.readOnly.facilityIdentifier.id,
          facilityName: r.readOnly.facilityIdentifier.name || `Facility ${r.readOnly.facilityIdentifier.id}`,
          receivers: [],
        });
      }
      map.get(key)!.receivers.push(r);
    }
    // Sort warehouses alphabetically
    return Array.from(map.values()).sort((a, b) =>
      a.facilityName.localeCompare(b.facilityName)
    );
  }, [displayReceivers]);

  // KPI summary from all open receipts
  const openCount = allReceivers.filter((r) => r.readOnly.status === 0).length;
  const inProgressCount = allReceivers.filter((r) => r.readOnly.status === 1).length;
  const discrepancyCount = allReceivers.filter((r) =>
    (r.receiveItems ?? []).some((i) => i.expectedQty > 0 && i.receivedQty !== i.expectedQty)
  ).length;

  const noConfig = activeConfigId === null;

  return (
    <div className="p-5 space-y-5 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="page-breadcrumb">Receiving</p>
          <h1 className="page-title">Receiving Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Open receipts grouped by warehouse.</p>
        </div>
        <div className="flex items-center gap-2">
          {configs && configs.length > 1 && (
            <Select
              value={String(activeConfigId ?? "")}
              onValueChange={(v) => setConfigId(Number(v))}
            >
              <SelectTrigger className="w-44 h-9 text-sm">
                <SelectValue placeholder="Select config" />
              </SelectTrigger>
              <SelectContent>
                {configs.map((c: { id: number; name: string }) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
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
          {/* Summary strip */}
          {!isLoading && allReceivers.length > 0 && (
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <div className="flex items-center gap-1.5 text-blue-400">
                <Clock className="h-4 w-4" />
                <span className="font-semibold tabular-nums">{openCount}</span>
                <span className="text-muted-foreground">expected</span>
              </div>
              <div className="flex items-center gap-1.5 text-amber-400">
                <PackageOpen className="h-4 w-4" />
                <span className="font-semibold tabular-nums">{inProgressCount}</span>
                <span className="text-muted-foreground">in progress</span>
              </div>
              {discrepancyCount > 0 && (
                <div className="flex items-center gap-1.5 text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-semibold tabular-nums">{discrepancyCount}</span>
                  <span className="text-muted-foreground">with discrepancies</span>
                </div>
              )}
              <div className="ml-auto flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-8 h-8 text-xs w-56"
                    placeholder="Search all receipts…"
                    value={globalSearch}
                    onChange={(e) => setGlobalSearch(e.target.value)}
                  />
                  {globalSearch && (
                    <button
                      onClick={() => setGlobalSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading receipts…</span>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && warehouseGroups.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-20 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-400/40 mb-3" />
              <p className="text-sm font-medium text-foreground">
                {globalSearch ? "No receipts match your search." : "No open receipts"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {globalSearch ? "Try a different search term." : "All receipts are completed or none have been created yet."}
              </p>
            </div>
          )}

          {/* Warehouse groups */}
          {!isLoading && warehouseGroups.length > 0 && (
            <div className="space-y-4">
              {warehouseGroups.map((group) => (
                <WarehouseCard
                  key={group.facilityId}
                  facilityName={group.facilityName}
                  facilityId={group.facilityId}
                  receivers={group.receivers}
                  onSelect={setSelectedReceiver}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Detail slide-over */}
      {activeConfigId !== null && (
        <ReceiverDetailSheet
          configId={activeConfigId}
          receiver={selectedReceiver}
          onClose={() => setSelectedReceiver(null)}
          onStarted={() => void refetch()}
        />
      )}
    </div>
  );
}

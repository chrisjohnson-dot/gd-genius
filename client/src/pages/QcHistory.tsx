import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronRight,
  Printer,
  Search,
  RefreshCw,
  Package,
  ClipboardList,
  Calendar,
  User,
  Warehouse,
  Tag,
  Weight,
  Ruler,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type PalletSummary = {
  id: number;
  palletNumber: number;
  palletUpc?: string | null;
  palletType?: string | null;
  items: Array<{ sku: string; qty: number }> | null;
  palletHeightIn?: string | null;
  calculatedWeightLb?: string | null;
  weightOverrideLb?: string | null;
  builtAt?: Date | null;
  photoUrl?: string | null;
};

type SessionRow = {
  id: number;
  referenceNumber: string;
  transactionId?: number | null;
  customerName?: string | null;
  poNumber?: string | null;
  warehouseName?: string | null;
  status: string;
  createdBy?: string | null;
  createdAt: Date;
  completedAt?: Date | null;
  shippedAt?: Date | null;
  pallets: PalletSummary[];
  skuCount: number;
  totalExpected: number;
  totalScanned: number;
  totalCases?: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  scanning: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  complete: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  shipped: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

const PALLET_TYPE_LABELS: Record<string, string> = {
  customer_owned: "Customer",
  gd_owned: "GD",
  chep: "CHEP",
};

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function effectiveWeight(p: PalletSummary): string | null {
  if (p.weightOverrideLb != null) return `${p.weightOverrideLb} lbs (override)`;
  if (p.calculatedWeightLb != null) return `${p.calculatedWeightLb} lbs`;
  return null;
}

// ─── Pallet Card ─────────────────────────────────────────────────────────────

function PalletCard({ pallet, sessionId }: { pallet: PalletSummary; sessionId: number }) {
  const [open, setOpen] = useState(false);
  const items = (pallet.items as Array<{ sku: string; qty: number }> | null) ?? [];
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const weight = effectiveWeight(pallet);
  const isOverride = pallet.weightOverrideLb != null;

  const openGdLabel = () => {
    window.open(`/api/pdf/qc-gd-labels/${sessionId}?type=gd`, "_blank");
  };
  const openSsccLabel = () => {
    window.open(`/api/pdf/qc-gd-labels/${sessionId}?type=sscc`, "_blank");
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Pallet header row */}
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left">
            {open ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
            <Package className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="font-semibold text-sm">Pallet {pallet.palletNumber}</span>
            {pallet.palletType && (
              <Badge variant="outline" className="text-xs">
                {PALLET_TYPE_LABELS[pallet.palletType] ?? pallet.palletType}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground ml-1">
              {items.length} SKU{items.length !== 1 ? "s" : ""} · {totalQty} pcs
            </span>
            {weight && (
              <span className={`text-xs ml-1 ${isOverride ? "text-orange-600 font-medium" : "text-muted-foreground"}`}>
                · {weight}
              </span>
            )}
            {pallet.palletHeightIn && (
              <span className="text-xs text-muted-foreground ml-1">
                · H: {pallet.palletHeightIn}"
              </span>
            )}
            {pallet.palletUpc && (
              <span className="text-xs text-muted-foreground ml-auto font-mono">
                {pallet.palletUpc}
              </span>
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-3 border-t border-border bg-muted/20">
            {/* Dims / weight detail row */}
            <div className="flex flex-wrap gap-4 pt-3 text-xs text-muted-foreground">
              {pallet.palletHeightIn && (
                <span className="flex items-center gap-1">
                  <Ruler className="w-3 h-3" />
                  Dims: 48 × 40 × {pallet.palletHeightIn}"
                </span>
              )}
              {pallet.calculatedWeightLb && (
                <span className="flex items-center gap-1">
                  <Weight className="w-3 h-3" />
                  Calc: {pallet.calculatedWeightLb} lbs
                </span>
              )}
              {pallet.weightOverrideLb && (
                <span className="flex items-center gap-1 text-orange-600 font-medium">
                  <Weight className="w-3 h-3" />
                  Override: {pallet.weightOverrideLb} lbs
                </span>
              )}
              {pallet.builtAt && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Built: {formatDate(pallet.builtAt)}
                </span>
              )}
            </div>

            {/* SKU table */}
            {items.length > 0 && (
              <div className="rounded border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">SKU</th>
                      <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx} className="border-t border-border">
                        <td className="px-3 py-1.5 font-mono">{item.sku}</td>
                        <td className="px-3 py-1.5 text-right font-semibold">{item.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Per-pallet reprint buttons */}
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openGdLabel}>
                <Printer className="w-3 h-3" /> GD Labels
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openSsccLabel}>
                <Printer className="w-3 h-3" /> SSCC Labels
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => window.open(`/api/pdf/qc-gd-labels/${sessionId}?type=both`, "_blank")}
              >
                <Printer className="w-3 h-3" /> Print Both
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ─── Session Row ──────────────────────────────────────────────────────────────

function SessionCard({ session }: { session: SessionRow }) {
  const [open, setOpen] = useState(false);
  const accuracy =
    session.totalExpected > 0
      ? Math.round((session.totalScanned / session.totalExpected) * 100)
      : null;

  return (
    <div className="border border-border rounded-xl overflow-hidden shadow-sm">
      {/* Session header */}
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-start gap-3 px-5 py-4 hover:bg-muted/30 transition-colors text-left">
            <div className="mt-0.5">
              {open ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-1">
              {/* Top line: TX ID + customer + status */}
              <div className="flex flex-wrap items-center gap-2">
                {session.transactionId ? (
                  <span className="font-bold text-sm">TX {session.transactionId}</span>
                ) : (
                  <span className="font-bold text-sm font-mono">{session.referenceNumber}</span>
                )}
                {session.customerName && (
                  <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                    {session.customerName}
                  </span>
                )}
                <Badge className={`text-xs capitalize ${STATUS_COLORS[session.status] ?? ""}`}>
                  {session.status}
                </Badge>
              </div>

              {/* Second line: meta details */}
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                {session.poNumber && (
                  <span className="flex items-center gap-1">
                    <Tag className="w-3 h-3" /> PO: {session.poNumber}
                  </span>
                )}
                {session.warehouseName && (
                  <span className="flex items-center gap-1">
                    <Warehouse className="w-3 h-3" /> {session.warehouseName}
                  </span>
                )}
                {session.createdBy && (
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" /> {session.createdBy}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {formatDate(session.createdAt)}
                </span>
                {session.completedAt && (
                  <span className="flex items-center gap-1 text-green-600">
                    ✓ Completed {formatDate(session.completedAt)}
                  </span>
                )}
              </div>
            </div>

            {/* Right summary pills */}
            <div className="flex items-center gap-3 shrink-0 text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Package className="w-3.5 h-3.5" />
                {session.pallets.length} pallet{session.pallets.length !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <ClipboardList className="w-3.5 h-3.5" />
                {session.skuCount} SKU{session.skuCount !== 1 ? "s" : ""}
              </span>
              {(session.totalCases ?? 0) > 0 && (
                <span className="flex items-center gap-1 font-medium text-blue-600 dark:text-blue-400">
                  {session.totalCases} case{(session.totalCases ?? 0) !== 1 ? "s" : ""}
                </span>
              )}
              {accuracy !== null && (
                <span
                  className={`font-semibold ${
                    accuracy >= 100
                      ? "text-green-600"
                      : accuracy >= 90
                      ? "text-amber-600"
                      : "text-red-600"
                  }`}
                >
                  {accuracy}%
                </span>
              )}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-5 pb-5 border-t border-border space-y-4 bg-muted/10">
            {/* Scan accuracy bar */}
            {session.totalExpected > 0 && (
              <div className="pt-4 space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Scan accuracy</span>
                  <span>
                    {session.totalScanned} / {session.totalExpected} pcs
                    {accuracy !== null && ` (${accuracy}%)`}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      (accuracy ?? 0) >= 100
                        ? "bg-green-500"
                        : (accuracy ?? 0) >= 90
                        ? "bg-amber-500"
                        : "bg-red-500"
                    }`}
                    style={{ width: `${Math.min(accuracy ?? 0, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Reprint all labels buttons */}
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="text-xs font-medium text-muted-foreground self-center">Reprint all:</span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => window.open(`/api/pdf/qc-gd-labels/${session.id}?type=gd`, "_blank")}
              >
                <Printer className="w-3 h-3" /> GD Labels
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => window.open(`/api/pdf/qc-gd-labels/${session.id}?type=sscc`, "_blank")}
              >
                <Printer className="w-3 h-3" /> SSCC Labels
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => window.open(`/api/pdf/qc-gd-labels/${session.id}?type=both`, "_blank")}
              >
                <Printer className="w-3 h-3" /> Print Both
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1 ml-auto"
                onClick={() => {
                  // Prefer transactionId so the scanner's startSession resume logic handles it
                  // (prevents duplicates when re-opening a completed session).
                  // Fall back to sessionId for sessions without a transactionId.
                  const url = session.transactionId
                    ? `/qc/scanner?txId=${session.transactionId}`
                    : `/qc/scanner?sessionId=${session.id}`;
                  window.open(url, "_blank");
                }}
              >
                <ExternalLink className="w-3 h-3" /> Open in Scanner
              </Button>
            </div>

            {/* Pallet cards */}
            {session.pallets.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Pallets ({session.pallets.length})
                </p>
                {session.pallets.map((p) => (
                  <PalletCard key={p.id} pallet={p} sessionId={session.id} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No pallets recorded for this session.</p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function QcHistory() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input
  const handleSearchChange = (val: string) => {
    setSearch(val);
    clearTimeout((handleSearchChange as any)._t);
    (handleSearchChange as any)._t = setTimeout(() => setDebouncedSearch(val), 300);
  };

  const { data, isLoading, refetch, isFetching } = trpc.qcScanner.getSessionHistory.useQuery(
    {
      limit: 200,
      status: statusFilter !== "all" ? (statusFilter as "scanning" | "complete" | "shipped") : undefined,
      search: debouncedSearch || undefined,
    },
    { refetchOnWindowFocus: false }
  );

  const sessions = (data?.sessions ?? []) as SessionRow[];
  const total = data?.total ?? 0;

  // Unique customer names for a future filter (derived client-side)
  const customerNames = useMemo(
    () => Array.from(new Set(sessions.map((s) => s.customerName).filter(Boolean))).sort() as string[],
    [sessions]
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">QC Session History</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Audit past QC sessions and reprint pallet labels
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Search TX ID, customer, PO…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-36 text-sm">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="scanning">Scanning</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
            <SelectItem value="shipped">Shipped</SelectItem>
          </SelectContent>
        </Select>
        {total > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            {sessions.length} of {total} session{total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Session list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No sessions found</p>
          <p className="text-sm mt-1">
            {debouncedSearch || statusFilter !== "all"
              ? "Try adjusting your filters."
              : "QC sessions will appear here once created."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  );
}

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileDown,
  Loader2,
  Package,
  PackageCheck,
  PackageX,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Truck,
  Undo2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useParams } from "wouter";

interface PullListItem {
  sku: string;
  description?: string;
  receiveItemId: number;
  qty: number;
  sourceQty?: number;
  fromLocationId: number;
  fromLocationName: string;
  fromLocationType: string;
  toLocationId: number;
  toLocationName: string;
  movement: "to_staging" | "to_pick_face";
  lotNumber?: string;
  expirationDate?: string;
}

interface PackListItem {
  orderId: number;
  referenceNum: string;
  sku: string;
  description?: string;
  qty: number;
  lotNumber?: string;
  expirationDate?: string;
  locationName: string;
}

interface AllocationDetail {
  orderId: number;
  referenceNum: string;
  status: "allocated" | "skipped";
  skipReason?: string;
  lineItems: Array<{
    sku: string;
    description?: string;
    qtyRequired: number;
    allocations: Array<{
      receiveItemId: number;
      qty: number;
      locationId: number;
      locationName: string;
      locationType: string;
      lotNumber?: string;
      expirationDate?: string;
    }>;
  }>;
  pullListItems: PullListItem[];
  packListItems: PackListItem[];
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    confirmed:   { bg: "#d1fae5", text: "#059669", dot: "#059669" },
    proposed:    { bg: "#dbeafe", text: "#1d4ed8", dot: "#3b82f6" },
    cancelled:   { bg: "#f3f4f6", text: "#6b7280", dot: "#9ca3af" },
    failed:      { bg: "#fee2e2", text: "#ef4444", dot: "#ef4444" },
    allocated:   { bg: "#d1fae5", text: "#059669", dot: "#059669" },
    skipped:     { bg: "#fef9c3", text: "#b45309", dot: "#f59e0b" },
    unallocated: { bg: "#ffedd5", text: "#c2410c", dot: "#f97316" },
  };
  const s = map[status] ?? { bg: "#f3f4f6", text: "#6b7280", dot: "#9ca3af" };
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
      style={{ background: s.bg, color: s.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.dot }} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

const locTypeBadge: Record<string, { bg: string; text: string }> = {
  staging:   { bg: "#ede9fe", text: "#6d28d9" },
  pick_face: { bg: "#dbeafe", text: "#1d4ed8" },
  warehouse: { bg: "#ffedd5", text: "#c2410c" },
};

function ReVerifyButton({ runId }: { runId: number }) {
  const utils = trpc.useUtils();
  const [loading, setLoading] = useState(false);
  const verifyMutation = trpc.allocation.verifyRun.useMutation({
    onSuccess: () => {
      toast.success("Re-verification complete.");
      utils.allocation.runDetail.invalidate({ runId });
      utils.allocation.history.invalidate();
    },
    onError: (e) => toast.error(`Verification failed: ${e.message}`),
    onSettled: () => setLoading(false),
  });
  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5 ml-2"
      style={{ borderColor: "#fca5a5", color: "#b91c1c" }}
      disabled={loading}
      onClick={() => { setLoading(true); verifyMutation.mutate({ runId }); }}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      Re-verify
    </Button>
  );
}

export default function RunDetail() {
  const params = useParams<{ runId: string }>();
  const runId = Number(params.runId);
  const [unallocatingId, setUnallocatingId] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);

  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.allocation.runDetail.useQuery({ runId });

  const retryMoveMutation = trpc.allocation.retryMove.useMutation({
    onSuccess: (result) => {
      if (result.success) toast.success(`Staging move succeeded — ${result.moved} item(s) moved.`);
      else toast.warning(`Move partially failed: ${result.errors.join("; ")}`);
      utils.allocation.runDetail.invalidate({ runId });
    },
    onError: (e) => toast.error(`Retry failed: ${e.message}`),
    onSettled: () => setRetrying(false),
  });

  const handleRetryMove = () => {
    if (!confirm("Re-attempt the staging inventory move for this run?")) return;
    setRetrying(true);
    retryMoveMutation.mutate({ runId });
  };

  const unallocateMutation = trpc.allocation.unallocateOrder.useMutation({
    onSuccess: () => {
      toast.success("Order unallocated in Extensiv.");
      utils.allocation.runDetail.invalidate({ runId });
    },
    onError: (e) => toast.error(`Unallocate failed: ${e.message}`),
    onSettled: () => setUnallocatingId(null),
  });

  const handleUnallocate = (runOrderId: number, referenceNum: string | null) => {
    if (!confirm(`Unallocate order ${referenceNum ?? runOrderId} in Extensiv? This cannot be undone.`)) return;
    setUnallocatingId(runOrderId);
    unallocateMutation.mutate({ runOrderId });
  };

  if (isLoading) {
    return (

        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>

    );
  }

  if (error || !data) {
    return (

        <div className="p-7 text-center text-muted-foreground">
          <AlertCircle className="h-8 w-8 mx-auto mb-2" />
          <p>Run not found or error loading data.</p>
          <Button variant="outline" className="mt-3" asChild>
            <Link href="/history">Back to History</Link>
          </Button>
        </div>

    );
  }

  const { run, orders } = data;

  const allocatedOrders = orders
    .filter((o) => o.status === "allocated" || o.status === "unallocated")
    .map((o) => ({ ...o, detail: o.allocationDetail as unknown as AllocationDetail }));
  const skippedOrders = orders.filter((o) => o.status === "skipped");

  const runPullList = (run as any).pullList as PullListItem[] | null | undefined;
  const pullList: PullListItem[] = Array.isArray(runPullList) && runPullList.length > 0
    ? runPullList
    : allocatedOrders.flatMap((o) => o.detail?.pullListItems ?? []);
  const packList: PackListItem[] = allocatedOrders.flatMap((o) => o.detail?.packListItems ?? []);

  const toStagingMoves  = pullList.filter((p) => p.movement === "to_staging" || !p.movement);
  const toPickFaceMoves = pullList.filter((p) => p.movement === "to_pick_face");

  type ConsolidatedRow = {
    sku: string; description?: string;
    fromLocationName: string; fromLocationType: string;
    sourceQty?: number; lotNumber?: string; expirationDate?: string;
    stagingLocationName: string; pickFaceLocationName: string;
    qtyToStaging: number; qtyToPickFace: number;
  };
  const consolidatedRowMap = new Map<string, ConsolidatedRow>();
  for (const item of pullList) {
    const key = `${item.sku}||${item.fromLocationName}||${item.lotNumber ?? ""}||${item.expirationDate ?? ""}`;
    if (!consolidatedRowMap.has(key)) {
      consolidatedRowMap.set(key, {
        sku: item.sku, description: item.description,
        fromLocationName: item.fromLocationName, fromLocationType: item.fromLocationType,
        sourceQty: item.sourceQty, lotNumber: item.lotNumber, expirationDate: item.expirationDate,
        stagingLocationName:  item.movement === "to_staging"   ? item.toLocationName : "",
        pickFaceLocationName: item.movement === "to_pick_face" ? item.toLocationName : "",
        qtyToStaging:  item.movement === "to_staging"   ? item.qty : 0,
        qtyToPickFace: item.movement === "to_pick_face" ? item.qty : 0,
      });
    } else {
      const row = consolidatedRowMap.get(key)!;
      if (item.movement === "to_staging") {
        row.qtyToStaging += item.qty;
        if (!row.stagingLocationName) row.stagingLocationName = item.toLocationName;
      } else {
        row.qtyToPickFace += item.qty;
        if (!row.pickFaceLocationName) row.pickFaceLocationName = item.toLocationName;
      }
    }
  }
  const consolidatedRows = Array.from(consolidatedRowMap.values());
  const hasPickFace  = consolidatedRows.some((r) => r.qtyToPickFace > 0);
  const hasSourceQty = consolidatedRows.some((r) => r.sourceQty != null);

  return (

      <div className="p-7 space-y-6 page-enter">
        {/* Page header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
              <Link href="/history" className="flex items-center gap-1">
                <ArrowLeft className="h-4 w-4" />Back
              </Link>
            </Button>
            <div>
              <p className="page-breadcrumb">Run History</p>
              <h1 className="page-title">Run #{run.id}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {run.customerName} · {new Date(run.createdAt).toLocaleString()}
                {run.confirmedAt && ` · Confirmed ${new Date(run.confirmedAt).toLocaleString()}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <StatusPill status={run.status} />
            {run.status === "confirmed" && run.notes && toStagingMoves.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                style={{ borderColor: "#fdba74", color: "#c2410c" }}
                onClick={handleRetryMove}
                disabled={retrying}
              >
                {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Retry Move
              </Button>
            )}
            {(run.status === "confirmed" || run.status === "proposed") && allocatedOrders.length > 0 && (
              <Button
                size="sm"
                className="gap-1.5 shadow-sm"
                onClick={() => {
                  const alreadyPrinted = !!data?.run.documentsPrintedAt;
                  const firstPrintParam = alreadyPrinted ? "" : "?firstPrint=1";
                  const pdfUrl = encodeURIComponent(`/api/pdf/all-documents/${runId}${firstPrintParam}`);
                  window.open(`/print?url=${pdfUrl}`, "_blank", "noopener,noreferrer");
                }}
              >
                <FileDown className="h-4 w-4" />
                Print Work Files
              </Button>
            )}
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="kpi-card">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />Allocated
            </p>
            <p className="text-[28px] font-extrabold tracking-tight leading-none">{run.allocatedCount}</p>
          </div>
          <div className="kpi-card">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
              <PackageX className="h-3.5 w-3.5 text-amber-500" />Skipped
            </p>
            <p className="text-[28px] font-extrabold tracking-tight leading-none">{skippedOrders.length}</p>
          </div>
          <div className="kpi-card">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
              <Truck className="h-3.5 w-3.5 text-purple-500" />Moves to Staging
            </p>
            <p className="text-[28px] font-extrabold tracking-tight leading-none">{toStagingMoves.length}</p>
          </div>
          <div className="kpi-card">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
              <RefreshCw className="h-3.5 w-3.5 text-blue-500" />Pallet Replenishments
            </p>
            <p className="text-[28px] font-extrabold tracking-tight leading-none">
              {toPickFaceMoves.filter((p) => p.fromLocationType === "warehouse").length}
            </p>
          </div>
        </div>

        {/* Notes banner */}
        {run.notes && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-3 text-sm text-red-800">
            <strong>Notes:</strong> {run.notes}
          </div>
        )}

        {/* Verification banner */}
        {run.status === "confirmed" && (() => {
          const verif = (run as typeof run & { verificationStatus?: string; verificationDetail?: unknown; verifiedAt?: string | null }).verificationStatus;
          const detail = (run as typeof run & { verificationDetail?: Array<{ orderId: number; referenceNum: string; status: string; fullyAllocated: boolean | null; skuResults: Array<{ sku: string; approvedQty: number; extensivQty: number; match: boolean }>; error?: string }> }).verificationDetail ?? [];
          const verifiedAt = (run as typeof run & { verifiedAt?: string | null }).verifiedAt;
          if (!verif || verif === "pending") {
            return (
              <div className="flex items-center gap-3 bg-muted/60 border rounded-2xl px-5 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span>Verification pending — Extensiv is being checked automatically…</span>
              </div>
            );
          }
          if (verif === "verified") {
            return (
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-3 text-sm text-emerald-800">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="font-semibold">Extensiv Verified</span>
                <span className="text-emerald-700">— all {detail.length} order{detail.length !== 1 ? "s" : ""} fully allocated and quantities match.</span>
                {verifiedAt && <span className="ml-auto text-xs text-emerald-600">{new Date(verifiedAt).toLocaleString()}</span>}
              </div>
            );
          }
          if (verif === "partial" || verif === "mismatch" || verif === "failed") {
            const problemOrders = detail.filter((d) => d.status !== "verified");
            return (
              <div className="bg-red-50 border border-red-200 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3 border-b border-red-200">
                  {verif === "partial" ? <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" /> : <ShieldX className="h-4 w-4 text-red-600 shrink-0" />}
                  <span className="text-sm font-semibold text-red-800">
                    Extensiv Verification {verif === "partial" ? "Partial" : verif === "mismatch" ? "Mismatch" : "Failed"}
                  </span>
                  {verifiedAt && <span className="ml-auto text-xs text-red-500">{new Date(verifiedAt).toLocaleString()}</span>}
                  <ReVerifyButton runId={run.id} />
                </div>
                <div className="divide-y divide-red-100 max-h-60 overflow-y-auto">
                  {problemOrders.map((o) => (
                    <div key={o.orderId} className="px-5 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-red-900">{o.referenceNum}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded font-semibold"
                          style={o.status === "partial" ? { background: "#fef9c3", color: "#b45309" } : { background: "#fee2e2", color: "#ef4444" }}
                        >{o.status}</span>
                      </div>
                      {o.error && <p className="text-xs text-red-600 mt-0.5">{o.error}</p>}
                      {o.skuResults?.filter((r) => !r.match).map((r) => (
                        <p key={r.sku} className="text-xs text-red-700 mt-0.5 font-mono">
                          {r.sku}: approved {r.approvedQty} · Extensiv {r.extensivQty}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          return null;
        })()}

        {/* Skipped orders banner */}
        {skippedOrders.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 flex items-center gap-2 border-b border-amber-200">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-800">{skippedOrders.length} Orders Skipped</span>
            </div>
            <div className="divide-y divide-amber-100 max-h-40 overflow-y-auto">
              {skippedOrders.map((o) => (
                <div key={o.id} className="flex items-center justify-between px-5 py-2 text-sm">
                  <span className="font-medium text-amber-900">{o.referenceNum}</span>
                  <span className="text-amber-700 text-xs">{o.skipReason}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="summary">
          <TabsList className="bg-muted/60 rounded-xl">
            <TabsTrigger value="pull">Pull List ({pullList.length})</TabsTrigger>
            <TabsTrigger value="pack">Pack List ({packList.length})</TabsTrigger>
            <TabsTrigger value="summary">Order Summary ({allocatedOrders.length})</TabsTrigger>
            <TabsTrigger value="orders">All Orders ({orders.length})</TabsTrigger>
          </TabsList>

          {/* ── Pull List ── */}
          <TabsContent value="pull" className="mt-4 space-y-4">
            {pullList.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl py-12 text-center text-muted-foreground">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No pull list items.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {consolidatedRows.length} line{consolidatedRows.length !== 1 ? "s" : ""}
                    {" · "}{toStagingMoves.length} to staging
                    {toPickFaceMoves.length > 0 && ` · ${toPickFaceMoves.filter((p) => p.fromLocationType === "warehouse").length} pallet replenishments`}
                  </p>
                  <div className="flex items-center gap-4">
                    <a href={`/api/pdf/pick-face-pull-sheet/${runId}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                      <FileDown className="h-4 w-4" />Pick Face PDF
                    </a>
                    <a href={`/api/pdf/warehouse-pull-sheet/${runId}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                      <FileDown className="h-4 w-4" />Warehouse PDF
                    </a>
                  </div>
                </div>
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  <table className="w-full data-table">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Description</th>
                        <th>Source Location</th>
                        {hasSourceQty && <th className="text-right">On Hand</th>}
                        <th className="text-right">→ Staging</th>
                        {hasPickFace && <th className="text-right">→ Pick Face</th>}
                        <th>Lot</th>
                        <th>Expiry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consolidatedRows.map((row, i) => {
                        const lt = locTypeBadge[row.fromLocationType];
                        return (
                          <tr key={i}>
                            <td className="font-mono text-xs font-semibold">{row.sku}</td>
                            <td className="text-muted-foreground text-xs">{row.description ?? "—"}</td>
                            <td>
                              <div className="flex items-center gap-1.5">
                                {lt && (
                                  <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                                    style={{ background: lt.bg, color: lt.text }}>
                                    {row.fromLocationType}
                                  </span>
                                )}
                                <span className="text-xs font-medium">{row.fromLocationName}</span>
                              </div>
                            </td>
                            {hasSourceQty && (
                              <td className="text-right text-muted-foreground text-xs">
                                {row.sourceQty != null ? row.sourceQty : "—"}
                              </td>
                            )}
                            <td className="text-right">
                              {row.qtyToStaging > 0 ? (
                                <div className="flex items-center justify-end gap-1">
                                  <span className="font-bold">{row.qtyToStaging}</span>
                                  {row.stagingLocationName && (
                                    <span className="text-xs text-muted-foreground">{row.stagingLocationName}</span>
                                  )}
                                </div>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                            {hasPickFace && (
                              <td className="text-right">
                                {row.qtyToPickFace > 0 ? (
                                  <div className="flex items-center justify-end gap-1">
                                    <span className="font-bold">{row.qtyToPickFace}</span>
                                    {row.pickFaceLocationName && (
                                      <span className="text-xs text-muted-foreground">{row.pickFaceLocationName}</span>
                                    )}
                                  </div>
                                ) : <span className="text-muted-foreground">—</span>}
                              </td>
                            )}
                            <td className="text-xs">{row.lotNumber ?? "—"}</td>
                            <td className="text-xs">{row.expirationDate ? new Date(row.expirationDate).toLocaleDateString() : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </TabsContent>

          {/* ── Pack List ── */}
          <TabsContent value="pack" className="mt-4">
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <h3 className="text-[15px] font-bold flex items-center gap-2">
                  <PackageCheck className="h-4 w-4 text-emerald-500" />Pack List
                </h3>
                {packList.length > 0 && (
                  <a href={`/api/pdf/pack-list/${runId}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                    <FileDown className="h-4 w-4" />Export PDF
                  </a>
                )}
              </div>
              <table className="w-full data-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>SKU</th>
                    <th>Description</th>
                    <th className="text-right">Qty</th>
                    <th>Lot</th>
                    <th>Expiry</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {allocatedOrders.flatMap((order) =>
                    (order.detail?.packListItems ?? []).map((item, i) => (
                      <tr key={`${order.id}-${i}`}>
                        <td className="font-medium">{item.referenceNum}</td>
                        <td className="font-mono text-xs">{item.sku}</td>
                        <td className="text-muted-foreground text-xs">{item.description ?? "—"}</td>
                        <td className="text-right font-bold">{item.qty}</td>
                        <td className="text-xs">{item.lotNumber ?? "—"}</td>
                        <td className="text-xs">{item.expirationDate ? new Date(item.expirationDate).toLocaleDateString() : "—"}</td>
                        <td className="text-xs">{item.locationName}</td>
                      </tr>
                    ))
                  )}
                  {packList.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground text-sm">No pack list items.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ── Order Summary ── */}
          <TabsContent value="summary" className="mt-4">
            <div className="space-y-3">
              {allocatedOrders.length === 0 && (
                <div className="bg-card border border-border rounded-2xl py-12 text-center text-muted-foreground text-sm">
                  No orders allocated.
                </div>
              )}
              {allocatedOrders.map((order) => {
                const lineItems = order.detail?.lineItems ?? [];
                const totalLines  = lineItems.length;
                const totalPieces = lineItems.reduce((sum, l) => sum + l.qtyRequired, 0);
                return (
                  <div key={order.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-sm flex items-center gap-2">
                          #{order.orderId}
                          {order.status === "unallocated" && <StatusPill status="unallocated" />}
                        </div>
                        <div className="text-xs text-muted-foreground space-x-2 mt-0.5">
                          {order.referenceNum && <span>Ref: {order.referenceNum}</span>}
                          {order.poNum && <span>PO: {order.poNum}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-xs font-medium">
                          {totalLines} {totalLines === 1 ? "line" : "lines"}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border text-xs font-medium">
                          {totalPieces} {totalPieces === 1 ? "pc" : "pcs"}
                        </span>
                        {order.status === "allocated" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs gap-1"
                            style={{ borderColor: "#fdba74", color: "#c2410c" }}
                            disabled={unallocatingId === order.id}
                            onClick={() => handleUnallocate(order.id, order.referenceNum ?? null)}
                          >
                            {unallocatingId === order.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Undo2 className="h-3 w-3" />
                            }
                            Unallocate
                          </Button>
                        )}
                      </div>
                    </div>
                    <table className="w-full data-table">
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>Description</th>
                          <th className="text-right">Qty</th>
                          <th>Lot</th>
                          <th>Expiry</th>
                          <th>Location</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.flatMap((line) =>
                          line.allocations.map((alloc, i) => {
                            const lt = locTypeBadge[alloc.locationType];
                            return (
                              <tr key={`${order.orderId}-${line.sku}-${i}`}>
                                <td className="font-mono text-xs">{line.sku}</td>
                                <td className="text-muted-foreground text-xs">{line.description ?? "—"}</td>
                                <td className="text-right font-semibold">{alloc.qty}</td>
                                <td className="text-xs">{alloc.lotNumber ?? "—"}</td>
                                <td className="text-xs">{alloc.expirationDate ? new Date(alloc.expirationDate).toLocaleDateString() : "—"}</td>
                                <td className="text-xs">
                                  {lt ? (
                                    <span className="px-1.5 py-0.5 rounded text-xs font-medium"
                                      style={{ background: lt.bg, color: lt.text }}>
                                      {alloc.locationName}
                                    </span>
                                  ) : alloc.locationName}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* ── All Orders ── */}
          <TabsContent value="orders" className="mt-4">
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <table className="w-full data-table">
                <thead>
                  <tr>
                    <th>Transaction ID</th>
                    <th>Customer Ref</th>
                    <th>PO #</th>
                    <th>Status</th>
                    <th>Skip Reason</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="font-semibold">#{o.orderId}</td>
                      <td className="font-mono text-xs text-muted-foreground">{o.referenceNum ?? "—"}</td>
                      <td className="font-mono text-xs text-muted-foreground">{o.poNum ?? "—"}</td>
                      <td><StatusPill status={o.status} /></td>
                      <td className="text-xs text-muted-foreground">{o.skipReason ?? "—"}</td>
                      <td className="text-right">
                        {o.status === "allocated" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1.5"
                            style={{ borderColor: "#fdba74", color: "#c2410c" }}
                            disabled={unallocatingId === o.id}
                            onClick={() => handleUnallocate(o.id, o.referenceNum ?? null)}
                          >
                            {unallocatingId === o.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Undo2 className="h-3 w-3" />
                            }
                            Unallocate
                          </Button>
                        )}
                        {o.status === "unallocated" && (
                          <span className="text-xs italic" style={{ color: "#f97316" }}>Unallocated</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

  );
}

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  CheckCircle2,
  FileDown,
  Loader2,
  Package,
  PackageCheck,
  PackageX,
  RefreshCw,
  Truck,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";

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
  poNum?: string;
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

const locTypeBadge: Record<string, string> = {
  staging: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  pick_face: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  warehouse: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

export default function AllocationReview() {
  const params = useParams<{ runId: string }>();
  const runId = Number(params.runId);
  const [, navigate] = useLocation();

  const { data, isLoading, error } = trpc.allocation.runDetail.useQuery({ runId });

  // Check if pick face locations are configured for this run's customer
  const { data: locationConfigData } = trpc.locations.listByCustomer.useQuery(
    { configId: data?.run.configId ?? 0, customerId: data?.run.customerId ?? 0 },
    { enabled: !!data?.run.configId && !!data?.run.customerId }
  );
  const hasPickFaceConfigured = (locationConfigData ?? []).some((l) => l.locationType === "pick_face");

  const confirmMutation = trpc.allocation.confirm.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Allocation confirmed! ${result.successCount} orders allocated.`);
      } else {
        toast.warning(`Partially confirmed: ${result.successCount} succeeded, ${result.errors.length} failed.`);
      }
      navigate("/history");
    },
    onError: (e) => toast.error(`Confirmation failed: ${e.message}`),
  });

  const cancelMutation = trpc.allocation.cancel.useMutation({
    onSuccess: () => { toast.info("Allocation run cancelled."); navigate("/allocate" as string); },
    onError: (e) => toast.error(e.message),
  });

  const utils = trpc.useUtils();
  const [unallocatingId, setUnallocatingId] = useState<number | null>(null);
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

  // ── Consolidated pull list rows ──────────────────────────────────────────
  // Group by source location + SKU + lot, merging staging and pick face moves
  // into a single row with separate qty columns.
  // IMPORTANT: useMemo must be called before any early returns (Rules of Hooks).
  interface ConsolidatedRow {
    key: string;
    sku: string;
    description?: string;
    fromLocationName: string;
    fromLocationType: string;
    sourceQty?: number;
    lotNumber?: string;
    expirationDate?: string;
    toStaging: number;
    toPickFace: number;
    stagingLocationName: string;
    pickFaceLocationName: string;
  }

  // Derive pull list from data (may be empty if data not loaded yet)
  const runPullListEarly = data ? (data.run as any).pullList as PullListItem[] | null | undefined : undefined;
  const allocatedOrdersEarly = data
    ? data.orders
        .filter((o) => o.status === "allocated")
        .map((o) => ({ ...o, detail: o.allocationDetail as unknown as AllocationDetail }))
    : [];
  const pullListEarly: PullListItem[] = Array.isArray(runPullListEarly) && runPullListEarly.length > 0
    ? runPullListEarly
    : allocatedOrdersEarly.flatMap((o) => o.detail?.pullListItems ?? []);

  const consolidatedRows = useMemo((): ConsolidatedRow[] => {
    const pullList = pullListEarly;
    const map = new Map<string, ConsolidatedRow>();
    for (const item of pullList) {
      const key = `${item.sku}|${item.fromLocationName}|${item.lotNumber ?? ""}|${item.expirationDate ?? ""}`;
      const existing = map.get(key);
      if (existing) {
        if (item.movement === "to_staging") {
          existing.toStaging += item.qty;
        } else {
          existing.toPickFace += item.qty;
          existing.pickFaceLocationName = item.toLocationName;
        }
        // Do NOT accumulate sourceQty here: to_staging and to_pick_face items for the
        // same pallet share the same sourceQty (total on-hand for that pallet).
        // Adding it again would double-count. sourceQty is already set when the row was created.
      } else {
        map.set(key, {
          key,
          sku: item.sku,
          description: item.description,
          fromLocationName: item.fromLocationName,
          fromLocationType: item.fromLocationType,
          sourceQty: item.sourceQty,
          lotNumber: item.lotNumber,
          expirationDate: item.expirationDate,
          toStaging: item.movement === "to_staging" ? item.qty : 0,
          toPickFace: item.movement === "to_pick_face" ? item.qty : 0,
          stagingLocationName: item.movement === "to_staging" ? item.toLocationName : "",
          pickFaceLocationName: item.movement === "to_pick_face" ? item.toLocationName : "",
        });
      }
    }
    // Second pass: fill in missing location names from other rows with same source
    const rows = Array.from(map.values());
    const stagingName = rows.find((r) => r.stagingLocationName)?.stagingLocationName ?? "Staging";
    const pfName = rows.find((r) => r.pickFaceLocationName)?.pickFaceLocationName ?? "Pick Face";
    for (const row of rows) {
      if (!row.stagingLocationName) row.stagingLocationName = stagingName;
      if (!row.pickFaceLocationName) row.pickFaceLocationName = pfName;
    }
    return rows;
  }, [pullListEarly]);

  const hasPickFaceMoves = consolidatedRows.some((r) => r.toPickFace > 0);
  const toStagingCount = pullListEarly.filter((p) => p.movement === "to_staging" || !p.movement).length;
  const toPickFaceCount = pullListEarly.filter((p) => p.movement === "to_pick_face").length;
  // Column headers: always use generic labels so location names don't appear in the header
  const pickFaceColLabel = "Pick Face";
  const stagingColLabel = consolidatedRows.find((r) => r.toStaging > 0 && r.stagingLocationName && r.stagingLocationName !== "Staging")?.stagingLocationName ?? "Staging";

  // ── Early returns (after all hooks) ─────────────────────────────────────
  if (isLoading) {
    return (

        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>

    );
  }

  if (error || !data) {
    return (

        <div className="p-6 text-center text-muted-foreground">
          <AlertCircle className="h-8 w-8 mx-auto mb-2" />
          <p>Run not found or error loading data.</p>
          <Button variant="outline" className="mt-3" onClick={() => navigate("/allocate")}>Back</Button>
        </div>

    );
  }

  const { run, orders } = data;
  const isProposed = run.status === "proposed";
  const isConfirmed = run.status === "confirmed";
  const allocatedOrders = allocatedOrdersEarly;
  const skippedOrders = orders.filter((o) => o.status === "skipped");
  const unallocatedOrders = orders.filter((o) => o.status === "unallocated");
  const pullList = pullListEarly;
  const packList: PackListItem[] = allocatedOrders.flatMap((o) => o.detail?.packListItems ?? []);

  return (

      <div className="p-6 space-y-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Allocation Review</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {run.customerName} · Run #{run.id} · {new Date(run.createdAt).toLocaleString()}
            </p>
          </div>
          {isProposed && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => { if (confirm("Cancel this allocation run?")) cancelMutation.mutate({ runId }); }}
                disabled={cancelMutation.isPending}
              >
                <XCircle className="h-4 w-4 mr-1.5" />
                Cancel
              </Button>
              <Button
                onClick={() => { if (confirm(`Confirm allocation of ${allocatedOrders.length} orders? This will write to Extensiv.`)) confirmMutation.mutate({ runId }); }}
                disabled={confirmMutation.isPending || allocatedOrders.length === 0}
              >
                {confirmMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Confirming...</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirm Allocation</>
                )}
              </Button>
            </div>
          )}
          {!isProposed && (
            <Badge className={
              run.status === "confirmed" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" :
              run.status === "cancelled" ? "bg-gray-100 text-gray-600" :
              "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
            }>
              {run.status}
            </Badge>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-4 flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
              <div>
                <p className="text-2xl font-bold">{allocatedOrders.length}</p>
                <p className="text-xs text-muted-foreground">Orders to Allocate</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 flex items-center gap-3">
              <PackageX className="h-6 w-6 text-yellow-600 shrink-0" />
              <div>
                <p className="text-2xl font-bold">{skippedOrders.length}</p>
                <p className="text-xs text-muted-foreground">Orders Skipped</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 flex items-center gap-3">
              <Truck className="h-6 w-6 text-purple-600 shrink-0" />
              <div>
                <p className="text-2xl font-bold">{toStagingCount}</p>
                <p className="text-xs text-muted-foreground">Moves to Staging</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 flex items-center gap-3">
              <RefreshCw className="h-6 w-6 text-blue-600 shrink-0" />
              <div>
                <p className="text-2xl font-bold">{toPickFaceCount}</p>
                <p className="text-xs text-muted-foreground">Pallet Replenishments</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Skipped orders warning */}
        {skippedOrders.length > 0 && (
          <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-yellow-800 dark:text-yellow-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" /> {skippedOrders.length} Orders Skipped
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {skippedOrders.map((o) => (
                  <div key={o.id} className="flex items-center justify-between text-sm py-1">
                    <div>
                      <span className="font-medium text-yellow-900 dark:text-yellow-200">#{o.orderId}</span>
                      {o.referenceNum && <span className="text-yellow-700 dark:text-yellow-400 text-xs ml-2">Ref: {o.referenceNum}</span>}
                      {(o as any).poNum && <span className="text-yellow-700 dark:text-yellow-400 text-xs ml-2">PO: {(o as any).poNum}</span>}
                    </div>
                    <span className="text-yellow-700 dark:text-yellow-400 text-xs">{o.skipReason}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Missing pick face config warning */}
        {isProposed && toPickFaceCount === 0 && !hasPickFaceConfigured && allocatedOrders.length > 0 && (
          <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900">
            <CardContent className="py-3 flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 shrink-0" />
              <div className="text-sm">
                <span className="font-semibold text-orange-800 dark:text-orange-300">No pick face configured</span>
                <span className="text-orange-700 dark:text-orange-400 ml-2">— all inventory will be moved directly to staging. If a pick face location should be used, set it up in Location Config before confirming.</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="pull">
          <TabsList>
            <TabsTrigger value="pull">
              Pull List ({consolidatedRows.length})
            </TabsTrigger>
            <TabsTrigger value="pack">
              Pack List ({packList.length})
            </TabsTrigger>
            <TabsTrigger value="moves">
              Move Summary ({pullListEarly.length})
            </TabsTrigger>
            <TabsTrigger value="summary">
              Order Summary ({allocatedOrders.length})
            </TabsTrigger>
          </TabsList>

          {/* ── Pull List Tab — single consolidated table ──────────────────────── */}
          <TabsContent value="pull" className="mt-4">
            {consolidatedRows.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No inventory movements needed.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm">Pull List</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        Pick from source locations. Move the required qty to staging; place any surplus back to the pick face.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <a
                        href={`/api/pdf/pick-face-pull-sheet/${runId}`}
                        download
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                      >
                        <FileDown className="h-3.5 w-3.5" />
                        Pick Face PDF
                      </a>
                      <a
                        href={`/api/pdf/warehouse-pull-sheet/${runId}`}
                        download
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                      >
                        <FileDown className="h-3.5 w-3.5" />
                        Warehouse PDF
                      </a>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="text-left px-4 py-3 font-medium">SKU</th>
                          <th className="text-left px-4 py-3 font-medium">Description</th>
                          <th className="text-left px-4 py-3 font-medium">Lot</th>
                          <th className="text-left px-4 py-3 font-medium">Expiry</th>
                          <th className="text-left px-4 py-3 font-medium">Source Location</th>
                          <th className="text-right px-4 py-3 font-medium">On Hand</th>
                          <th className="text-right px-4 py-3 font-medium text-purple-700 dark:text-purple-400">→ {stagingColLabel}</th>
                          {hasPickFaceMoves && (
                            <th className="text-right px-4 py-3 font-medium text-blue-700 dark:text-blue-400">→ {pickFaceColLabel}</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {consolidatedRows.map((row) => (
                          <tr key={row.key} className={`border-b border-border/50 hover:bg-muted/30 ${
                            row.toPickFace > 0
                              ? "bg-blue-50/60 dark:bg-blue-950/20 border-l-2 border-l-blue-400 dark:border-l-blue-600"
                              : ""
                          }`}>
                            <td className="px-4 py-2 font-mono text-xs">{row.sku}</td>
                            <td className="px-4 py-2 text-xs text-muted-foreground">{row.description ?? "—"}</td>
                            <td className="px-4 py-2 text-xs">{row.lotNumber ?? "—"}</td>
                            <td className="px-4 py-2 text-xs">
                              {row.expirationDate ? new Date(row.expirationDate).toLocaleDateString() : "—"}
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-1.5">
                                <Badge className={`text-xs ${locTypeBadge[row.fromLocationType] ?? ""}`}>
                                  {row.fromLocationType?.replace("_", " ")}
                                </Badge>
                                <span className="text-xs font-mono">{row.fromLocationName}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                              {row.sourceQty != null ? row.sourceQty : "—"}
                            </td>
                            <td className="px-4 py-2 text-right font-semibold text-purple-700 dark:text-purple-400">
                              {row.toStaging > 0 ? row.toStaging : "—"}
                            </td>
                            {hasPickFaceMoves && (
                              <td className="px-4 py-2 text-right font-semibold text-blue-700 dark:text-blue-400">
                                {row.toPickFace > 0 ? row.toPickFace : "—"}
                              </td>
                            )}
                          </tr>
                        ))}
                        <tr className="border-t-2 border-border bg-muted/40">
                          <td className="px-4 py-2.5 text-xs font-semibold text-muted-foreground" colSpan={5}>Total</td>
                          <td className="px-4 py-2.5 text-right font-bold tabular-nums text-muted-foreground">
                            {consolidatedRows.some(r => r.sourceQty != null)
                              ? consolidatedRows.reduce((s, r) => s + (r.sourceQty ?? 0), 0).toLocaleString()
                              : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold tabular-nums text-purple-700 dark:text-purple-400">
                            {consolidatedRows.reduce((s, r) => s + r.toStaging, 0).toLocaleString()}
                          </td>
                          {hasPickFaceMoves && (
                            <td className="px-4 py-2.5 text-right font-bold tabular-nums text-blue-700 dark:text-blue-400">
                              {consolidatedRows.reduce((s, r) => s + r.toPickFace, 0).toLocaleString()}
                            </td>
                          )}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Pack List Tab ─────────────────────────────────────────────────── */}
          <TabsContent value="pack" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Pack List</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Items to pick from staging and pack per order. All inventory will be in staging before packing begins.
                    </p>
                  </div>
                  {packList.length > 0 && (
                    <a
                      href={`/api/pdf/pack-list/${runId}`}
                      download
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                    >
                      <FileDown className="h-3.5 w-3.5" />
                      Export PDF
                    </a>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left px-4 py-3 font-medium">Transaction ID</th>
                        <th className="text-left px-4 py-3 font-medium">PO</th>
                        <th className="text-left px-4 py-3 font-medium">SKU</th>
                        <th className="text-left px-4 py-3 font-medium">Description</th>
                        <th className="text-right px-4 py-3 font-medium">Qty</th>
                        <th className="text-left px-4 py-3 font-medium">Lot</th>
                        <th className="text-left px-4 py-3 font-medium">Expiry</th>
                        <th className="text-left px-4 py-3 font-medium">From</th>
                      </tr>
                    </thead>
                    <tbody>
                      {packList.length === 0 && (
                        <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No items to pack.</td></tr>
                      )}
                      {allocatedOrders.map((order) => {
                        const items = order.detail?.packListItems ?? [];
                        if (items.length === 0) return null;
                        return items.map((item, i) => (
                          <tr
                            key={`${order.orderId}-${i}`}
                            className="border-b border-border/50 hover:bg-muted/30"
                          >
                            {i === 0 && (
                              <td
                                className="px-4 py-2 font-semibold align-top"
                                rowSpan={items.length}
                              >
                                <div className="flex items-center gap-1.5">
                                  <PackageCheck className="h-3.5 w-3.5 text-green-600" />
                                  {order.referenceNum}
                                </div>
                              </td>
                            )}
                            {i === 0 && (
                              <td
                                className="px-4 py-2 text-xs text-muted-foreground align-top"
                                rowSpan={items.length}
                              >
                                {(order as any).poNum ?? "—"}
                              </td>
                            )}
                            <td className="px-4 py-2 font-mono text-xs">{item.sku}</td>
                            <td className="px-4 py-2 text-xs text-muted-foreground">{item.description ?? "—"}</td>
                            <td className="px-4 py-2 text-right font-semibold">{item.qty}</td>
                            <td className="px-4 py-2 text-xs">{item.lotNumber ?? "—"}</td>
                            <td className="px-4 py-2 text-xs">{item.expirationDate ? new Date(item.expirationDate).toLocaleDateString() : "—"}</td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-1.5">
                                <Badge className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">staging</Badge>
                                <span className="text-xs font-mono">{item.locationName}</span>
                              </div>
                            </td>
                          </tr>
                        ));
                      })}
                      {(() => {
                        const totalPackQty = allocatedOrders.reduce((s, o) => s + (o.detail?.packListItems ?? []).reduce((ss, i) => ss + i.qty, 0), 0);
                        const totalPackLines = allocatedOrders.reduce((s, o) => s + (o.detail?.packListItems ?? []).length, 0);
                        if (totalPackLines === 0) return null;
                        return (
                          <tr className="border-t-2 border-border bg-muted/40">
                            <td className="px-4 py-2.5 text-xs font-semibold text-muted-foreground" colSpan={4}>Total ({totalPackLines} line{totalPackLines !== 1 ? "s" : ""})</td>
                            <td className="px-4 py-2.5 text-right font-bold tabular-nums">{totalPackQty.toLocaleString()}</td>
                            <td colSpan={3} />
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Unallocated Orders Tab ─────────────────────────────────────── */}
          {unallocatedOrders.length > 0 && (
            <TabsContent value="unallocated" className="mt-4">
              <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-red-800 dark:text-red-300 flex items-center gap-2">
                    <XCircle className="h-4 w-4" /> {unallocatedOrders.length} Orders Unallocated
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-1">
                    {unallocatedOrders.map((o) => (
                      <div key={o.id} className="flex items-center justify-between text-sm py-1">
                        <span className="font-medium text-red-900 dark:text-red-200">{o.referenceNum}</span>
                        <span className="text-red-700 dark:text-red-400 text-xs">Unallocated</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* ── Move Summary Tab ─────────────────────────────────────────────── */}
          <TabsContent value="moves" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <div>
                  <CardTitle className="text-sm">Move Summary</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    All planned inventory movements for this allocation run. Review before confirming.
                  </p>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {pullListEarly.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No moves planned.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="text-left px-4 py-3 font-medium">Type</th>
                          <th className="text-left px-4 py-3 font-medium">SKU</th>
                          <th className="text-left px-4 py-3 font-medium">Description</th>
                          <th className="text-left px-4 py-3 font-medium">Lot</th>
                          <th className="text-left px-4 py-3 font-medium">Expiry</th>
                          <th className="text-left px-4 py-3 font-medium">From</th>
                          <th className="text-left px-4 py-3 font-medium">To</th>
                          <th className="text-right px-4 py-3 font-medium">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pullListEarly
                          .slice()
                          .sort((a, b) => {
                            const typeOrder = (m: string) => m === "to_staging" ? 0 : 1;
                            if (typeOrder(a.movement) !== typeOrder(b.movement)) return typeOrder(a.movement) - typeOrder(b.movement);
                            return a.sku.localeCompare(b.sku);
                          })
                          .map((item, idx) => (
                            <tr key={idx} className="border-b border-border last:border-0 hover:bg-muted/30">
                              <td className="px-4 py-2.5">
                                {item.movement === "to_staging" ? (
                                  <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                                    Staging
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                    Pick Face
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 font-mono text-xs">{item.sku}</td>
                              <td className="px-4 py-2.5 text-muted-foreground max-w-[180px] truncate text-xs">{item.description ?? "—"}</td>
                              <td className="px-4 py-2.5 font-mono text-xs">{item.lotNumber ?? "—"}</td>
                              <td className="px-4 py-2.5 text-xs">
                                {item.expirationDate
                                  ? new Date(item.expirationDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })
                                  : "—"}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                  item.fromLocationType === "pick_face"
                                    ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                                    : item.fromLocationType === "staging"
                                    ? "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300"
                                    : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                                }`}>
                                  {item.fromLocationType === "pick_face" ? "pick face" : item.fromLocationType === "staging" ? "staging" : "wh"}
                                </span>
                                <span className="ml-1.5 font-mono text-xs">{item.fromLocationName}</span>
                              </td>
                              <td className="px-4 py-2.5 font-mono text-xs">{item.toLocationName}</td>
                              <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{item.qty.toLocaleString()}</td>
                            </tr>
                          ))}
                        <tr className="border-t-2 border-border bg-muted/40">
                          <td className="px-4 py-2.5 text-xs font-semibold text-muted-foreground" colSpan={7}>Total ({pullListEarly.length} move{pullListEarly.length !== 1 ? "s" : ""})</td>
                          <td className="px-4 py-2.5 text-right font-bold tabular-nums">
                            {pullListEarly.reduce((sum, item) => sum + item.qty, 0).toLocaleString()}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Order Summary Tab ─────────────────────────────────────────────── */}
          <TabsContent value="summary" className="mt-4">
            <div className="space-y-3">
              {allocatedOrders.length === 0 && (
                <Card>
                  <CardContent className="py-10 text-center text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No orders allocated.</p>
                  </CardContent>
                </Card>
              )}
              {allocatedOrders.length > 0 && (() => {
                const grandTotalPieces = allocatedOrders.reduce((s, o) => {
                  const lines = o.detail?.lineItems ?? [];
                  return s + lines.reduce((ss, l) => ss + l.allocations.reduce((sss, a) => sss + a.qty, 0), 0);
                }, 0);
                const grandTotalLines = allocatedOrders.reduce((s, o) => s + (o.detail?.lineItems ?? []).length, 0);
                return (
                  <div className="flex items-center justify-between px-4 py-2.5 mb-1 rounded-lg bg-muted/40 border border-border">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {allocatedOrders.length} order{allocatedOrders.length !== 1 ? "s" : ""} &middot; {grandTotalLines} line{grandTotalLines !== 1 ? "s" : ""}
                    </span>
                    <span className="text-sm font-bold tabular-nums">
                      {grandTotalPieces.toLocaleString()} pcs total
                    </span>
                  </div>
                );
              })()}
              {allocatedOrders.map((order) => {
                const lineItems = order.detail?.lineItems ?? [];
                const totalLines = lineItems.length;
                const totalPieces = lineItems.reduce((sum, l) => sum + l.qtyRequired, 0);
                return (
                  <Card key={order.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-sm">#{order.orderId}</div>
                          {order.referenceNum && (
                            <div className="text-xs text-muted-foreground">Customer Ref: {order.referenceNum}</div>
                          )}
                          {(order as any).poNum && (
                            <div className="text-xs text-muted-foreground">PO: {(order as any).poNum}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">{totalLines} {totalLines === 1 ? "line" : "lines"}</Badge>
                          <Badge variant="outline" className="text-xs">{totalPieces} {totalPieces === 1 ? "pc" : "pcs"}</Badge>
                          {isConfirmed && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                              disabled={unallocatingId === order.id}
                              onClick={() => handleUnallocate(order.id, order.referenceNum ?? null)}
                            >
                              {unallocatingId === order.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                "Unallocate"
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted/50">
                              <th className="text-left px-4 py-2 font-medium">SKU</th>
                              <th className="text-left px-4 py-2 font-medium">Description</th>
                              <th className="text-right px-4 py-2 font-medium">Qty</th>
                              <th className="text-left px-4 py-2 font-medium">Lot</th>
                              <th className="text-left px-4 py-2 font-medium">Expiry</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lineItems.flatMap((line) =>
                              line.allocations.map((alloc, i) => (
                                <tr key={`${order.orderId}-${line.sku}-${i}`} className="border-b border-border/50 hover:bg-muted/30">
                                  <td className="px-4 py-2 font-mono text-xs">{line.sku}</td>
                                  <td className="px-4 py-2 text-muted-foreground text-xs">{line.description ?? "—"}</td>
                                  <td className="px-4 py-2 text-right font-semibold">{alloc.qty}</td>
                                  <td className="px-4 py-2 text-xs">{alloc.lotNumber ?? "—"}</td>
                                  <td className="px-4 py-2 text-xs">{alloc.expirationDate ? new Date(alloc.expirationDate).toLocaleDateString() : "—"}</td>
                                </tr>
                              ))
                            )}
                            <tr className="border-t-2 border-border bg-muted/40">
                              <td className="px-4 py-2 text-xs font-semibold text-muted-foreground" colSpan={2}>Order Total</td>
                              <td className="px-4 py-2 text-right font-bold tabular-nums">{totalPieces.toLocaleString()}</td>
                              <td colSpan={2} />
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>

  );
}

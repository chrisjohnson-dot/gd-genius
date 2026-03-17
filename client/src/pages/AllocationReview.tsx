import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  ArrowRight,
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
import { useState } from "react";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";

interface PullListItem {
  sku: string;
  description?: string;
  receiveItemId: number;
  qty: number;
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

const locTypeBadge: Record<string, string> = {
  staging: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  pick_face: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  warehouse: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

const movementBadge: Record<string, string> = {
  to_staging: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  to_pick_face: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

const movementLabel: Record<string, string> = {
  to_staging: "→ Staging",
  to_pick_face: "→ Pick Face",
};

export default function AllocationReview() {
  const params = useParams<{ runId: string }>();
  const runId = Number(params.runId);
  const [, navigate] = useLocation();

  const { data, isLoading, error } = trpc.allocation.runDetail.useQuery({ runId });

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

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (error || !data) {
    return (
      <AppLayout>
        <div className="p-6 text-center text-muted-foreground">
          <AlertCircle className="h-8 w-8 mx-auto mb-2" />
          <p>Run not found or error loading data.</p>
          <Button variant="outline" className="mt-3" onClick={() => navigate("/allocate")}>Back</Button>
        </div>
      </AppLayout>
    );
  }

  const { run, orders } = data;
  const isProposed = run.status === "proposed";

  const allocatedOrders = orders
    .filter((o) => o.status === "allocated")
    .map((o) => ({ ...o, detail: o.allocationDetail as unknown as AllocationDetail }));
  const skippedOrders = orders.filter((o) => o.status === "skipped");
  const unallocatedOrders = orders.filter((o) => o.status === "unallocated");
  const isConfirmed = run.status === "confirmed";

  // Pull list is global (SKU-level, not per-order) — stored on the run
  // Fall back to per-order items for backward compatibility with older runs
  const runPullList = (run as any).pullList as PullListItem[] | null | undefined;
  const pullList: PullListItem[] = Array.isArray(runPullList) && runPullList.length > 0
    ? runPullList
    : allocatedOrders.flatMap((o) => o.detail?.pullListItems ?? []);

  const packList: PackListItem[] = allocatedOrders.flatMap((o) => o.detail?.packListItems ?? []);

  // Separate pull list by movement type
  const toStagingMoves = pullList.filter((p) => p.movement === "to_staging" || !p.movement);
  const toPickFaceMoves = pullList.filter((p) => p.movement === "to_pick_face");

  // Summary: aggregate by SKU
  const skuSummary = new Map<string, { sku: string; description?: string; totalQty: number; orders: string[] }>();
  for (const order of allocatedOrders) {
    for (const line of order.detail?.lineItems ?? []) {
      const existing = skuSummary.get(line.sku) ?? { sku: line.sku, description: line.description, totalQty: 0, orders: [] };
      existing.totalQty += line.qtyRequired;
      existing.orders.push(order.referenceNum ?? "");
      skuSummary.set(line.sku, existing);
    }
  }

  return (
    <AppLayout>
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
                <p className="text-2xl font-bold">{toStagingMoves.length}</p>
                <p className="text-xs text-muted-foreground">Moves to Staging</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 flex items-center gap-3">
              <RefreshCw className="h-6 w-6 text-blue-600 shrink-0" />
              <div>
                <p className="text-2xl font-bold">{toPickFaceMoves.length}</p>
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
                    </div>
                    <span className="text-yellow-700 dark:text-yellow-400 text-xs">{o.skipReason}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="pull">
          <TabsList>
            <TabsTrigger value="pull">
              Pull List ({pullList.length})
            </TabsTrigger>
            <TabsTrigger value="pack">
              Pack List ({packList.length})
            </TabsTrigger>
            <TabsTrigger value="summary">
              Order Summary ({allocatedOrders.length})
            </TabsTrigger>
          </TabsList>

          {/* ── Pull List Tab ─────────────────────────────────────────────────── */}
          <TabsContent value="pull" className="mt-4 space-y-4">
            {pullList.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No inventory movements needed.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Section 1: Moves to Staging */}
                {toStagingMoves.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">→ Staging</Badge>
                            Move to Staging Area
                          </CardTitle>
                          <p className="text-xs text-muted-foreground mt-1">
                            Pick these items from their current locations and bring them to the staging area
                          </p>
                        </div>
                        <a
                          href={`/api/pdf/pull-list/${runId}`}
                          download
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                        >
                          <FileDown className="h-3.5 w-3.5" />
                          Export PDF
                        </a>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted/50">
                              <th className="text-left px-4 py-3 font-medium">SKU</th>
                              <th className="text-left px-4 py-3 font-medium">Description</th>
                              <th className="text-right px-4 py-3 font-medium">Qty</th>
                              <th className="text-left px-4 py-3 font-medium">Lot</th>
                              <th className="text-left px-4 py-3 font-medium">Expiry</th>
                              <th className="text-left px-4 py-3 font-medium">From</th>
                              <th className="text-center px-4 py-3 font-medium"></th>
                              <th className="text-left px-4 py-3 font-medium">To</th>
                            </tr>
                          </thead>
                          <tbody>
                            {toStagingMoves.map((item, i) => (
                              <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                                <td className="px-4 py-2 font-mono text-xs">{item.sku}</td>
                                <td className="px-4 py-2 text-xs text-muted-foreground">{item.description ?? "—"}</td>
                                <td className="px-4 py-2 text-right font-semibold">{item.qty}</td>
                                <td className="px-4 py-2 text-xs">{item.lotNumber ?? "—"}</td>
                                <td className="px-4 py-2 text-xs">{item.expirationDate ? new Date(item.expirationDate).toLocaleDateString() : "—"}</td>
                                <td className="px-4 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <Badge className={`text-xs ${locTypeBadge[item.fromLocationType] ?? ""}`}>{item.fromLocationType?.replace("_", " ")}</Badge>
                                    <span className="text-xs font-mono">{item.fromLocationName}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <ArrowRight className="h-4 w-4 text-muted-foreground mx-auto" />
                                </td>
                                <td className="px-4 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <Badge className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">staging</Badge>
                                    <span className="text-xs font-mono">{item.toLocationName}</span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Section 2: Pallet Replenishments to Pick Face */}
                {toPickFaceMoves.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">→ Pick Face</Badge>
                        Pallet Replenishment — Put Balance Back to Pick Face
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        These are the remaining units from pallets that were partially used. Place them in the pick face for future orders.
                      </p>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted/50">
                              <th className="text-left px-4 py-3 font-medium">SKU</th>
                              <th className="text-left px-4 py-3 font-medium">Description</th>
                              <th className="text-right px-4 py-3 font-medium">Qty (Balance)</th>
                              <th className="text-left px-4 py-3 font-medium">Lot</th>
                              <th className="text-left px-4 py-3 font-medium">Expiry</th>
                              <th className="text-left px-4 py-3 font-medium">From (Pallet)</th>
                              <th className="text-center px-4 py-3 font-medium"></th>
                              <th className="text-left px-4 py-3 font-medium">To</th>
                            </tr>
                          </thead>
                          <tbody>
                            {toPickFaceMoves.map((item, i) => (
                              <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                                <td className="px-4 py-2 font-mono text-xs">{item.sku}</td>
                                <td className="px-4 py-2 text-xs text-muted-foreground">{item.description ?? "—"}</td>
                                <td className="px-4 py-2 text-right font-semibold">{item.qty}</td>
                                <td className="px-4 py-2 text-xs">{item.lotNumber ?? "—"}</td>
                                <td className="px-4 py-2 text-xs">{item.expirationDate ? new Date(item.expirationDate).toLocaleDateString() : "—"}</td>
                                <td className="px-4 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <Badge className={`text-xs ${locTypeBadge[item.fromLocationType] ?? ""}`}>{item.fromLocationType?.replace("_", " ")}</Badge>
                                    <span className="text-xs font-mono">{item.fromLocationName}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <ArrowRight className="h-4 w-4 text-muted-foreground mx-auto" />
                                </td>
                                <td className="px-4 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <Badge className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">pick face</Badge>
                                    <span className="text-xs font-mono">{item.toLocationName}</span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
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
                        <th className="text-left px-4 py-3 font-medium">Order #</th>
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
                        <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No items to pack.</td></tr>
                      )}
                      {/* Group by order */}
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
                          {order.referenceNum && <div className="text-xs text-muted-foreground">Customer Ref: {order.referenceNum}</div>}
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
    </AppLayout>
  );
}

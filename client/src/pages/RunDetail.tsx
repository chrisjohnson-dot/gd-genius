import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const statusClass: Record<string, string> = {
  confirmed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  proposed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  allocated: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  skipped: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  unallocated: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

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

export default function RunDetail() {
  const params = useParams<{ runId: string }>();
  const runId = Number(params.runId);
  const [unallocatingId, setUnallocatingId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.allocation.runDetail.useQuery({ runId });

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
          <Button variant="outline" className="mt-3" asChild>
            <Link href="/history">Back to History</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  const { run, orders } = data;
  const isConfirmed = run.status === "confirmed";

  const allocatedOrders = orders
    .filter((o) => o.status === "allocated" || o.status === "unallocated")
    .map((o) => ({ ...o, detail: o.allocationDetail as unknown as AllocationDetail }));
  const skippedOrders = orders.filter((o) => o.status === "skipped");
  const unallocatedOrders = orders.filter((o) => o.status === "unallocated");

  // Pull list is global (SKU-level, not per-order) — stored on the run
  const runPullList = (run as any).pullList as PullListItem[] | null | undefined;
  const pullList: PullListItem[] = Array.isArray(runPullList) && runPullList.length > 0
    ? runPullList
    : allocatedOrders.flatMap((o) => o.detail?.pullListItems ?? []);
  const packList: PackListItem[] = allocatedOrders.flatMap((o) => o.detail?.packListItems ?? []);

  const toStagingMoves = pullList.filter((p) => p.movement === "to_staging" || !p.movement);
  const toPickFaceMoves = pullList.filter((p) => p.movement === "to_pick_face");

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/history" className="flex items-center">
                <ArrowLeft className="h-4 w-4 mr-1" />Back
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Run #{run.id}</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                {run.customerName} · {new Date(run.createdAt).toLocaleString()}
                {run.confirmedAt && ` · Confirmed ${new Date(run.confirmedAt).toLocaleString()}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={statusClass[run.status] ?? ""}>{run.status}</Badge>
            {(run.status === "confirmed" || run.status === "proposed") && allocatedOrders.length > 0 && (
              <Button
                size="sm"
                variant="default"
                className="gap-1.5"
                onClick={() => {
                  window.open(`/api/pdf/pull-list/${runId}`, "_blank");
                  setTimeout(() => window.open(`/api/pdf/pack-list/${runId}`, "_blank"), 400);
                }}
              >
                <FileDown className="h-4 w-4" />
                Print Work Files
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-4 flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
              <div>
                <p className="text-2xl font-bold">{run.allocatedCount}</p>
                <p className="text-xs text-muted-foreground">Allocated</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 flex items-center gap-3">
              <PackageX className="h-6 w-6 text-yellow-600 shrink-0" />
              <div>
                <p className="text-2xl font-bold">{skippedOrders.length}</p>
                <p className="text-xs text-muted-foreground">Skipped</p>
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

        {/* Notes */}
        {run.notes && (
          <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900">
            <CardContent className="py-3 text-sm text-red-800 dark:text-red-300">
              <strong>Notes:</strong> {run.notes}
            </CardContent>
          </Card>
        )}

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
                    <span className="font-medium text-yellow-900 dark:text-yellow-200">{o.referenceNum}</span>
                    <span className="text-yellow-700 dark:text-yellow-400 text-xs">{o.skipReason}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="summary">
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
            <TabsTrigger value="orders">
              All Orders ({orders.length})
            </TabsTrigger>
          </TabsList>

          {/* ── Pull List Tab ─────────────────────────────────────────────────── */}
          <TabsContent value="pull" className="mt-4 space-y-4">
            {pullList.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No pull list items.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {toStagingMoves.length} move{toStagingMoves.length !== 1 ? "s" : ""} to staging
                    {toPickFaceMoves.length > 0 && ` · ${toPickFaceMoves.length} pallet replenishment${toPickFaceMoves.length !== 1 ? "s" : ""}`}
                  </p>
                  <a
                    href={`/api/pdf/pull-list/${runId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <FileDown className="h-4 w-4" />
                    Export PDF
                  </a>
                </div>

                {toStagingMoves.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Truck className="h-4 w-4 text-purple-600" />
                        Move to Staging ({toStagingMoves.length} items)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted/50">
                              <th className="text-left px-4 py-3 font-medium">SKU</th>
                              <th className="text-left px-4 py-3 font-medium">Description</th>
                              <th className="text-right px-4 py-3 font-medium">Qty</th>
                              <th className="text-left px-4 py-3 font-medium">From</th>
                              <th className="text-left px-4 py-3 font-medium">To</th>
                              <th className="text-left px-4 py-3 font-medium">Lot</th>
                              <th className="text-left px-4 py-3 font-medium">Expiry</th>
                            </tr>
                          </thead>
                          <tbody>
                            {toStagingMoves.map((item, i) => (
                              <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                                <td className="px-4 py-2 font-mono text-xs font-semibold">{item.sku}</td>
                                <td className="px-4 py-2 text-muted-foreground text-xs">{item.description ?? "—"}</td>
                                <td className="px-4 py-2 text-right font-bold">{item.qty}</td>
                                <td className="px-4 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${locTypeBadge[item.fromLocationType] ?? ""}`}>
                                      {item.fromLocationType}
                                    </span>
                                    <span className="text-xs">{item.fromLocationName}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${movementBadge[item.movement] ?? ""}`}>
                                      {movementLabel[item.movement] ?? item.movement}
                                    </span>
                                    <span className="text-xs">{item.toLocationName}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-xs">{item.lotNumber ?? "—"}</td>
                                <td className="px-4 py-2 text-xs">{item.expirationDate ? new Date(item.expirationDate).toLocaleDateString() : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {toPickFaceMoves.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 text-blue-600" />
                        Pallet Replenishment → Pick Face ({toPickFaceMoves.length} items)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted/50">
                              <th className="text-left px-4 py-3 font-medium">SKU</th>
                              <th className="text-left px-4 py-3 font-medium">Description</th>
                              <th className="text-right px-4 py-3 font-medium">Qty</th>
                              <th className="text-left px-4 py-3 font-medium">From</th>
                              <th className="text-left px-4 py-3 font-medium">To</th>
                              <th className="text-left px-4 py-3 font-medium">Lot</th>
                              <th className="text-left px-4 py-3 font-medium">Expiry</th>
                            </tr>
                          </thead>
                          <tbody>
                            {toPickFaceMoves.map((item, i) => (
                              <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                                <td className="px-4 py-2 font-mono text-xs font-semibold">{item.sku}</td>
                                <td className="px-4 py-2 text-muted-foreground text-xs">{item.description ?? "—"}</td>
                                <td className="px-4 py-2 text-right font-bold">{item.qty}</td>
                                <td className="px-4 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${locTypeBadge[item.fromLocationType] ?? ""}`}>
                                      {item.fromLocationType}
                                    </span>
                                    <span className="text-xs">{item.fromLocationName}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${movementBadge[item.movement] ?? ""}`}>
                                      {movementLabel[item.movement] ?? item.movement}
                                    </span>
                                    <span className="text-xs">{item.toLocationName}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-xs">{item.lotNumber ?? "—"}</td>
                                <td className="px-4 py-2 text-xs">{item.expirationDate ? new Date(item.expirationDate).toLocaleDateString() : "—"}</td>
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
                  <CardTitle className="text-sm flex items-center gap-2">
                    <PackageCheck className="h-4 w-4 text-green-600" />
                    Pack List
                  </CardTitle>
                  {packList.length > 0 && (
                    <a
                      href={`/api/pdf/pack-list/${runId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <FileDown className="h-4 w-4" />
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
                        <th className="text-left px-4 py-3 font-medium">Order</th>
                        <th className="text-left px-4 py-3 font-medium">SKU</th>
                        <th className="text-left px-4 py-3 font-medium">Description</th>
                        <th className="text-right px-4 py-3 font-medium">Qty</th>
                        <th className="text-left px-4 py-3 font-medium">Lot</th>
                        <th className="text-left px-4 py-3 font-medium">Expiry</th>
                        <th className="text-left px-4 py-3 font-medium">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allocatedOrders.flatMap((order) =>
                        (order.detail?.packListItems ?? []).map((item, i) => (
                          <tr key={`${order.id}-${i}`} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="px-4 py-2 font-medium">{item.referenceNum}</td>
                            <td className="px-4 py-2 font-mono text-xs">{item.sku}</td>
                            <td className="px-4 py-2 text-muted-foreground text-xs">{item.description ?? "—"}</td>
                            <td className="px-4 py-2 text-right font-bold">{item.qty}</td>
                            <td className="px-4 py-2 text-xs">{item.lotNumber ?? "—"}</td>
                            <td className="px-4 py-2 text-xs">{item.expirationDate ? new Date(item.expirationDate).toLocaleDateString() : "—"}</td>
                            <td className="px-4 py-2 text-xs">{item.locationName}</td>
                          </tr>
                        ))
                      )}
                      {packList.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No pack list items.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

                    {/* ── Order Summary Tab ─────────────────────────────────────────────── */}
          <TabsContent value="summary" className="mt-4">
            <div className="space-y-3">
              {allocatedOrders.length === 0 && (
                <Card>
                  <CardContent className="py-10 text-center text-muted-foreground">
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
                          <div className="font-semibold text-sm flex items-center gap-2">
                            #{order.orderId}
                            {order.status === "unallocated" && (
                              <Badge className="text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                                unallocated
                              </Badge>
                            )}
                          </div>
                          {order.referenceNum && <div className="text-xs text-muted-foreground">Customer Ref: {order.referenceNum}</div>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">{totalLines} {totalLines === 1 ? "line" : "lines"}</Badge>
                          <Badge variant="outline" className="text-xs">{totalPieces} {totalPieces === 1 ? "pc" : "pcs"}</Badge>
                          {order.status === "allocated" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs gap-1 border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950/30"
                              disabled={unallocatingId === order.id}
                              onClick={() => handleUnallocate(order.id, order.referenceNum ?? null)}
                            >
                              {unallocatingId === order.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Undo2 className="h-3 w-3" />
                              )}
                              Unallocate
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
                              <th className="text-left px-4 py-2 font-medium">Location</th>
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
                                  <td className="px-4 py-2 text-xs">
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${locTypeBadge[alloc.locationType] ?? ""}`}>
                                      {alloc.locationName}
                                    </span>
                                  </td>
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

          {/* ── All Orders Tab ─────────────────────────────────────────────────── */}
          <TabsContent value="orders" className="mt-4">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left px-4 py-3 font-medium">Order #</th>
                        <th className="text-left px-4 py-3 font-medium">Customer Ref</th>
                        <th className="text-left px-4 py-3 font-medium">Status</th>
                        <th className="text-left px-4 py-3 font-medium">Skip Reason</th>
                        <th className="text-right px-4 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="px-4 py-2 font-semibold">#{o.orderId}</td>
                          <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{o.referenceNum ?? "—"}</td>
                          <td className="px-4 py-2">
                            <Badge className={statusClass[o.status] ?? ""}>{o.status}</Badge>
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">{o.skipReason ?? "—"}</td>
                          <td className="px-4 py-2 text-right">
                              {o.status === "allocated" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950/30"
                                  disabled={unallocatingId === o.id}
                                  onClick={() => handleUnallocate(o.id, o.referenceNum ?? null)}
                                >
                                  {unallocatingId === o.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Undo2 className="h-3 w-3" />
                                  )}
                                  Unallocate
                                </Button>
                              )}
                              {o.status === "unallocated" && (
                                <span className="text-xs text-orange-600 dark:text-orange-400 italic">Unallocated</span>
                              )}
                            </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

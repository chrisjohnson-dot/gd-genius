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
  PackageX,
  Truck,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";

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
  pullListItems: Array<{
    sku: string;
    description?: string;
    receiveItemId: number;
    qty: number;
    fromLocationId: number;
    fromLocationName: string;
    fromLocationType: string;
    toLocationId: number;
    toLocationName: string;
    lotNumber?: string;
    expirationDate?: string;
  }>;
  packListItems: Array<{
    orderId: number;
    referenceNum: string;
    sku: string;
    description?: string;
    qty: number;
    lotNumber?: string;
    expirationDate?: string;
    locationName: string;
  }>;
}

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
    onSuccess: () => { toast.info("Allocation run cancelled."); navigate("/allocate"); },
    onError: (e) => toast.error(e.message),
  });

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

  // Parse allocation details
  const allocatedOrders = orders
    .filter((o) => o.status === "allocated")
    .map((o) => ({ ...o, detail: o.allocationDetail as unknown as AllocationDetail }));
  const skippedOrders = orders.filter((o) => o.status === "skipped");

  // Build global pull list and pack list from all allocated orders
  const pullList = allocatedOrders.flatMap((o) => o.detail?.pullListItems ?? []);
  const packList = allocatedOrders.flatMap((o) => o.detail?.packListItems ?? []);
  const summary = allocatedOrders.flatMap((o) => o.detail?.lineItems ?? []);

  const locTypeBadge: Record<string, string> = {
    staging: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    pick_face: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    warehouse: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  };

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
        <div className="grid grid-cols-3 gap-4">
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
              <Truck className="h-6 w-6 text-blue-600 shrink-0" />
              <div>
                <p className="text-2xl font-bold">{pullList.length}</p>
                <p className="text-xs text-muted-foreground">Inventory Movements</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Skipped orders warning */}
        {skippedOrders.length > 0 && (
          <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-yellow-800 dark:text-yellow-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" /> {skippedOrders.length} Orders Skipped (Insufficient Inventory)
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

        {/* Tabs: Summary, Pull List, Pack List */}
        <Tabs defaultValue="summary">
          <TabsList>
            <TabsTrigger value="summary">Allocation Summary</TabsTrigger>
            <TabsTrigger value="pull">Pull List ({pullList.length})</TabsTrigger>
            <TabsTrigger value="pack">Pack List ({packList.length})</TabsTrigger>
          </TabsList>

          {/* Summary Tab */}
          <TabsContent value="summary" className="mt-4">
            <Card>
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
                        <th className="text-left px-4 py-3 font-medium">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allocatedOrders.flatMap((order) =>
                        (order.detail?.lineItems ?? []).flatMap((line) =>
                          line.allocations.map((alloc, i) => (
                            <tr key={`${order.orderId}-${line.sku}-${i}`} className="border-b border-border/50 hover:bg-muted/30">
                              <td className="px-4 py-2 font-medium">{order.referenceNum}</td>
                              <td className="px-4 py-2 font-mono text-xs">{line.sku}</td>
                              <td className="px-4 py-2 text-muted-foreground text-xs">{line.description ?? "—"}</td>
                              <td className="px-4 py-2 text-right font-medium">{alloc.qty}</td>
                              <td className="px-4 py-2 text-xs">{alloc.lotNumber ?? "—"}</td>
                              <td className="px-4 py-2 text-xs">{alloc.expirationDate ? new Date(alloc.expirationDate).toLocaleDateString() : "—"}</td>
                              <td className="px-4 py-2 text-xs">{alloc.locationName}</td>
                              <td className="px-4 py-2">
                                <Badge className={`text-xs ${locTypeBadge[alloc.locationType] ?? ""}`}>{alloc.locationType}</Badge>
                              </td>
                            </tr>
                          ))
                        )
                      )}
                      {allocatedOrders.length === 0 && (
                        <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No orders allocated.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pull List Tab */}
          <TabsContent value="pull" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm text-muted-foreground">Inventory movements required before allocation</CardTitle>
                  {pullList.length > 0 && (
                    <a
                      href={`/api/pdf/pull-list/${runId}`}
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
                {pullList.length === 0 ? (
                  <div className="px-4 py-8 text-center text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No inventory movements needed — all inventory is already in staging.</p>
                  </div>
                ) : (
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
                          <th className="text-left px-4 py-3 font-medium">To (Staging)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pullList.map((item, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="px-4 py-2 font-mono text-xs">{item.sku}</td>
                            <td className="px-4 py-2 text-xs text-muted-foreground">{item.description ?? "—"}</td>
                            <td className="px-4 py-2 text-right font-medium">{item.qty}</td>
                            <td className="px-4 py-2 text-xs">{item.lotNumber ?? "—"}</td>
                            <td className="px-4 py-2 text-xs">{item.expirationDate ? new Date(item.expirationDate).toLocaleDateString() : "—"}</td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-1.5">
                                <Badge className={`text-xs ${locTypeBadge[item.fromLocationType] ?? ""}`}>{item.fromLocationType}</Badge>
                                <span className="text-xs">{item.fromLocationName}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-center">
                              <ArrowRight className="h-4 w-4 text-muted-foreground mx-auto" />
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-1.5">
                                <Badge className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">staging</Badge>
                                <span className="text-xs">{item.toLocationName}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pack List Tab */}
          <TabsContent value="pack" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm text-muted-foreground">Items to pack per order from staging</CardTitle>
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
                      {packList.map((item, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="px-4 py-2 font-medium">{item.referenceNum}</td>
                          <td className="px-4 py-2 font-mono text-xs">{item.sku}</td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">{item.description ?? "—"}</td>
                          <td className="px-4 py-2 text-right font-medium">{item.qty}</td>
                          <td className="px-4 py-2 text-xs">{item.lotNumber ?? "—"}</td>
                          <td className="px-4 py-2 text-xs">{item.expirationDate ? new Date(item.expirationDate).toLocaleDateString() : "—"}</td>
                          <td className="px-4 py-2 text-xs">{item.locationName}</td>
                        </tr>
                      ))}
                      {packList.length === 0 && (
                        <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No items to pack.</td></tr>
                      )}
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

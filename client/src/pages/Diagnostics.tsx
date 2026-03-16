import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { AlertCircle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { useState } from "react";

const STATUS_LABELS: Record<number, string> = {
  0: "Open",
  1: "Complete",
  2: "Partial",
  3: "Closed",
  4: "Cancelled",
};

export default function Diagnostics() {
  const [configId, setConfigId] = useState<number | null>(null);
  const [runDiag, setRunDiag] = useState(false);
  const [runSummary, setRunSummary] = useState(false);

  // Order debug state
  const [orderCustomerId, setOrderCustomerId] = useState<number | null>(null);
  const [orderFacilityId, setOrderFacilityId] = useState<number | null>(null);
  const [runOrderDiag, setRunOrderDiag] = useState(false);

  const { data: configs } = trpc.config.list.useQuery();

  const { data: diagData, isLoading, error, refetch } = trpc.extensiv.debugRaw.useQuery(
    { configId: configId! },
    { enabled: !!configId && runDiag }
  );

  const { data: summaryData, isLoading: summaryLoading, error: summaryError, refetch: refetchSummary } = trpc.extensiv.debugSummary.useQuery(
    { configId: configId! },
    { enabled: !!configId && runSummary }
  );

  const { data: orderDiagData, isLoading: orderDiagLoading, error: orderDiagError, refetch: refetchOrderDiag } = trpc.extensiv.debugOrders.useQuery(
    { configId: configId!, customerId: orderCustomerId!, facilityId: orderFacilityId! },
    { enabled: !!configId && !!orderCustomerId && !!orderFacilityId && runOrderDiag }
  );

  const handleRun = (id: number) => {
    setConfigId(id);
    setRunDiag(true);
    setRunSummary(true);
    setRunOrderDiag(false);
    setOrderCustomerId(null);
    setOrderFacilityId(null);
    if (configId === id) { refetch(); refetchSummary(); }
  };

  const handleRunOrderDiag = (custId: number, facId: number) => {
    setOrderCustomerId(custId);
    setOrderFacilityId(facId);
    setRunOrderDiag(true);
    if (orderCustomerId === custId && orderFacilityId === facId) refetchOrderDiag();
  };

  const countItems = (obj: unknown, relKey: string): number => {
    if (!obj || typeof obj !== "object") return 0;
    const embedded = (obj as Record<string, unknown>)._embedded as Record<string, unknown> | undefined;
    if (!embedded) return 0;
    const arr = embedded[relKey];
    return Array.isArray(arr) ? arr.length : 0;
  };

  const facilitiesCount = diagData
    ? countItems(diagData.facilities, "http://api.3plCentral.com/rels/properties/facility")
    : null;
  const customersCount = diagData
    ? countItems(diagData.customers, "http://api.3plCentral.com/rels/customers/customer")
    : null;

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold">API Diagnostics</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Test raw Extensiv API responses to diagnose connection and data issues.
          </p>
        </div>

        {/* Config selector */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Select API Configuration</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {!configs || configs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No API configurations found. Add one in API Settings first.</p>
            ) : (
              configs.map((cfg) => (
                <Button
                  key={cfg.id}
                  variant={configId === cfg.id ? "default" : "outline"}
                  onClick={() => handleRun(cfg.id)}
                  disabled={isLoading || summaryLoading}
                  className="gap-2"
                >
                  {(isLoading || summaryLoading) && configId === cfg.id && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  {cfg.name}
                </Button>
              ))
            )}
          </CardContent>
        </Card>

        {(error || summaryError) && (
          <Card className="border-destructive">
            <CardContent className="pt-4 flex items-start gap-2 text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">Error</p>
                <p className="text-xs mt-1">{(error ?? summaryError)?.message}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step-by-Step Debug Summary ── */}
        {summaryData && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold">Step-by-Step Debug Summary</h2>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  Step 1: Raw /properties/facilities Structure
                  {summaryData.step1_facilitiesError
                    ? <Badge variant="destructive" className="text-xs">Error</Badge>
                    : <Badge variant="outline" className="text-xs text-green-600">OK</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {summaryData.step1_facilitiesError ? (
                  <p className="text-xs text-destructive">{summaryData.step1_facilitiesError}</p>
                ) : (
                  <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap break-all">
                    {JSON.stringify(summaryData.step1_rawFacilitiesStructure, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  Step 2: Processed Facilities (what the app uses)
                  {summaryData.step2_processedFacilitiesError
                    ? <Badge variant="destructive" className="text-xs">Error</Badge>
                    : summaryData.step2_processedFacilities.length > 0
                      ? <Badge className="text-xs bg-green-600">{summaryData.step2_processedFacilities.length} found</Badge>
                      : <Badge variant="destructive" className="text-xs">0 found — this is why no warehouses show!</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {summaryData.step2_processedFacilitiesError ? (
                  <p className="text-xs text-destructive">{summaryData.step2_processedFacilitiesError}</p>
                ) : summaryData.step2_processedFacilities.length === 0 ? (
                  <p className="text-sm text-amber-600 font-medium">No facilities returned. The warehouse list will be empty.</p>
                ) : (
                  <div className="space-y-1">
                    {summaryData.step2_processedFacilities.map((f) => (
                      <div key={f.id} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">id={f.id}</span>
                        <span>{f.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Step 3: Customers per Facility (after filtering)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(summaryData.step3_customersByFacility).length === 0 ? (
                  <p className="text-sm text-amber-600">No facilities to check.</p>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(summaryData.step3_customersByFacility).map(([facKey, custs]) => {
                      const [facIdStr] = facKey.split(":");
                      const facId = parseInt(facIdStr);
                      return (
                        <div key={facKey}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-semibold text-muted-foreground uppercase">Facility: {facKey}</span>
                            {custs.length > 0
                              ? <Badge className="text-xs bg-green-600">{custs.length} customers</Badge>
                              : <Badge variant="destructive" className="text-xs">0 customers</Badge>}
                          </div>
                          {custs.length > 0 && (
                            <div className="space-y-2 ml-2">
                              {custs.slice(0, 20).map((c) => (
                                <div key={c.id} className="flex items-center gap-2">
                                  <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">id={c.id}</span>
                                  <span className="text-sm">{c.name}</span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 text-xs px-2 ml-auto"
                                    onClick={() => handleRunOrderDiag(c.id, facId)}
                                    disabled={orderDiagLoading && orderCustomerId === c.id && orderFacilityId === facId}
                                  >
                                    {orderDiagLoading && orderCustomerId === c.id ? (
                                      <RefreshCw className="h-3 w-3 animate-spin" />
                                    ) : "Debug Orders"}
                                  </Button>
                                </div>
                              ))}
                              {custs.length > 20 && (
                                <p className="text-xs text-muted-foreground ml-1">...and {custs.length - 20} more</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Order Diagnostics ── */}
        {(orderDiagData || orderDiagError) && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold">
              Order Diagnostics
              {orderCustomerId && <span className="text-muted-foreground font-normal text-sm ml-2">— customer {orderCustomerId}, facility {orderFacilityId}</span>}
            </h2>

            {orderDiagError && (
              <Card className="border-destructive">
                <CardContent className="pt-4 text-destructive text-sm">{orderDiagError.message}</CardContent>
              </Card>
            )}

            {orderDiagData && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-3 flex-wrap">
                    Orders from /orders/summaries
                    <Badge variant="outline" className="text-xs">{orderDiagData.totalResultsAll} total (no facility filter)</Badge>
                    <Badge variant="outline" className="text-xs">{orderDiagData.totalResultsFiltered} with facilityId={orderDiagData.sentFacilityId}</Badge>
                    <Badge className="text-xs bg-green-600">{orderDiagData.passCount} pass filter</Badge>
                    {orderDiagData.failCount > 0 && (
                      <Badge variant="destructive" className="text-xs">{orderDiagData.failCount} excluded</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(orderDiagData.fetchErrorAll || orderDiagData.fetchErrorFiltered) && (
                    <p className="text-xs text-destructive mb-2">{orderDiagData.fetchErrorAll ?? orderDiagData.fetchErrorFiltered}</p>
                  )}
                  {orderDiagData.uniqueFacilityIds.length > 0 && (
                    <div className="mb-3 p-2 bg-amber-50 dark:bg-amber-950/20 rounded text-xs">
                      <span className="font-medium">Facility IDs on these orders: </span>
                      {orderDiagData.uniqueFacilityIds.map(id => (
                        <span key={String(id)} className={`font-mono mr-2 px-1.5 py-0.5 rounded ${id === orderDiagData.sentFacilityId ? 'bg-green-200 dark:bg-green-800' : 'bg-muted'}`}>
                          {String(id)}{id === orderDiagData.sentFacilityId ? ' ✓ match' : ''}
                        </span>
                      ))}
                      {orderDiagData.facilityMatchCount === 0 && (
                        <span className="text-amber-700 dark:text-amber-400 font-medium ml-1">
                          — None match facilityId={orderDiagData.sentFacilityId}. The app now queries without facilityid and shows all orders.
                        </span>
                      )}
                    </div>
                  )}
                  {orderDiagData.orderSummaries.length === 0 ? (
                    <p className="text-sm text-amber-600">No orders returned from Extensiv for this customer (even without facility filter).</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left py-1.5 pr-3">Order ID</th>
                            <th className="text-left py-1.5 pr-3">Ref #</th>
                            <th className="text-left py-1.5 pr-3">Status</th>
                            <th className="text-left py-1.5 pr-3">Closed?</th>
                            <th className="text-left py-1.5 pr-3">Allocated?</th>
                            <th className="text-left py-1.5 pr-3">Order Facility</th>
                            <th className="text-left py-1.5 pr-3">Created</th>
                            <th className="text-left py-1.5">Passes Filter?</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orderDiagData.orderSummaries.map((o, i) => (
                            <tr key={i} className={`border-b ${o.passesFilter ? "" : "bg-red-50 dark:bg-red-950/20"}`}>
                              <td className="py-1.5 pr-3 font-mono">{o.orderId}</td>
                              <td className="py-1.5 pr-3">{o.referenceNum || "—"}</td>
                              <td className="py-1.5 pr-3">
                                <span className="font-mono">{o.status}</span>
                                <span className="text-muted-foreground ml-1">({STATUS_LABELS[o.status ?? -1] ?? "Unknown"})</span>
                              </td>
                              <td className="py-1.5 pr-3">
                                {o.isClosed
                                  ? <span className="text-red-600 font-medium">Yes</span>
                                  : <span className="text-green-600">No</span>}
                              </td>
                              <td className="py-1.5 pr-3">
                                {o.fullyAllocated
                                  ? <span className="text-red-600 font-medium">Yes</span>
                                  : <span className="text-green-600">No</span>}
                              </td>
                              <td className="py-1.5 pr-3 font-mono text-muted-foreground">
                                {o.orderFacilityId ? `${o.orderFacilityId} (${o.orderFacilityName ?? '?'})` : '—'}
                              </td>
                              <td className="py-1.5 pr-3 text-muted-foreground">
                                {o.creationDate ? new Date(o.creationDate).toLocaleDateString() : "—"}
                              </td>
                              <td className="py-1.5">
                                {o.passesFilter
                                  ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                  : <XCircle className="h-3.5 w-3.5 text-red-500" />}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── Raw API Responses ── */}
        {diagData && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold">Raw API Responses</h2>

            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Facilities (raw)</p>
                  <div className="flex items-center gap-2">
                    {facilitiesCount !== null && facilitiesCount > 0
                      ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                      : <AlertCircle className="h-4 w-4 text-amber-500" />}
                    <span className="text-2xl font-bold">{facilitiesCount ?? "?"}</span>
                  </div>
                  {diagData.facilitiesError != null && (
                    <p className="text-xs text-destructive mt-1">{String(diagData.facilitiesError)}</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">All Customers (page 1)</p>
                  <div className="flex items-center gap-2">
                    {customersCount !== null && customersCount > 0
                      ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                      : <AlertCircle className="h-4 w-4 text-amber-500" />}
                    <span className="text-2xl font-bold">{customersCount ?? "?"}</span>
                  </div>
                  {diagData.customersError != null && (
                    <p className="text-xs text-destructive mt-1">{String(diagData.customersError)}</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  Facilities Raw Response
                  <Badge variant="outline" className="text-xs">/properties/facilities</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap break-all">
                  {JSON.stringify(diagData.facilities, null, 2)}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  All Customers Raw Response (page 1)
                  <Badge variant="outline" className="text-xs">/customers</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap break-all">
                  {JSON.stringify(diagData.customers, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

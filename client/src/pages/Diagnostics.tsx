import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { useState } from "react";

export default function Diagnostics() {
  const [configId, setConfigId] = useState<number | null>(null);
  const [runDiag, setRunDiag] = useState(false);
  const [runSummary, setRunSummary] = useState(false);

  const { data: configs } = trpc.config.list.useQuery();

  const { data: diagData, isLoading, error, refetch } = trpc.extensiv.debugRaw.useQuery(
    { configId: configId! },
    { enabled: !!configId && runDiag }
  );

  const { data: summaryData, isLoading: summaryLoading, error: summaryError, refetch: refetchSummary } = trpc.extensiv.debugSummary.useQuery(
    { configId: configId! },
    { enabled: !!configId && runSummary }
  );

  const handleRun = (id: number) => {
    setConfigId(id);
    setRunDiag(true);
    setRunSummary(true);
    if (configId === id) { refetch(); refetchSummary(); }
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

        {/* ── Step-by-Step Debug Summary (compact, easy to read) ── */}
        {summaryData && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold">Step-by-Step Debug Summary</h2>

            {/* Step 1: Raw facilities structure */}
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

            {/* Step 2: Processed facilities */}
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
                  <p className="text-sm text-amber-600 font-medium">No facilities returned by fetchAllFacilities(). The warehouse list will be empty.</p>
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

            {/* Step 3: Customers per facility */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Step 3: Customers per Facility (after filtering)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(summaryData.step3_customersByFacility).length === 0 ? (
                  <p className="text-sm text-amber-600">No facilities to check (Step 2 returned 0 facilities).</p>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(summaryData.step3_customersByFacility).map(([facKey, custs]) => (
                      <div key={facKey}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold text-muted-foreground uppercase">Facility: {facKey}</span>
                          {custs.length > 0
                            ? <Badge className="text-xs bg-green-600">{custs.length} customers</Badge>
                            : <Badge variant="destructive" className="text-xs">0 customers — this is the bug!</Badge>}
                        </div>
                        {custs.length > 0 ? (
                          <div className="space-y-1 ml-2">
                            {custs.slice(0, 10).map((c) => (
                              <div key={c.id} className="flex items-center gap-2 text-sm">
                                <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">id={c.id}</span>
                                <span>{c.name}</span>
                              </div>
                            ))}
                            {custs.length > 10 && (
                              <p className="text-xs text-muted-foreground ml-1">...and {custs.length - 10} more</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground ml-2">No customers match this facility ID in their embedded facilities array.</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {diagData && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold">Raw API Responses</h2>

            {/* Summary row */}
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

            {/* Facilities raw response */}
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

            {/* Customers raw response */}
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

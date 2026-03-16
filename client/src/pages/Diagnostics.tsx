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

  const { data: configs } = trpc.config.list.useQuery();

  const { data: diagData, isLoading, error, refetch } = trpc.extensiv.debugRaw.useQuery(
    { configId: configId! },
    { enabled: !!configId && runDiag }
  );

  const handleRun = (id: number) => {
    setConfigId(id);
    setRunDiag(true);
    if (configId === id) refetch();
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
  const customersForFacilityCount = diagData
    ? countItems(diagData.customersForFacility, "http://api.3plCentral.com/rels/customers/customer")
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
                  disabled={isLoading}
                  className="gap-2"
                >
                  {isLoading && configId === cfg.id && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  {cfg.name}
                </Button>
              ))
            )}
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-4 flex items-start gap-2 text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">tRPC Error</p>
                <p className="text-xs mt-1">{error.message}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {diagData && (
          <div className="space-y-4">
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Facilities</p>
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
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">All Customers</p>
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
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                    Customers for Facility {String(diagData.testedFacilityId ?? "")}
                  </p>
                  <div className="flex items-center gap-2">
                    {customersForFacilityCount !== null && customersForFacilityCount > 0
                      ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                      : <AlertCircle className="h-4 w-4 text-amber-500" />}
                    <span className="text-2xl font-bold">{customersForFacilityCount ?? "?"}</span>
                  </div>
                  {diagData.customersForFacilityError != null && (
                    <p className="text-xs text-destructive mt-1">{String(diagData.customersForFacilityError)}</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Facilities list */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  Facilities Response
                  <Badge variant="outline" className="text-xs">/properties/facilities</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap break-all">
                  {JSON.stringify(diagData.facilities, null, 2)}
                </pre>
              </CardContent>
            </Card>

            {/* Customers list */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  All Customers Response
                  <Badge variant="outline" className="text-xs">/customers</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap break-all">
                  {JSON.stringify(diagData.customers, null, 2)}
                </pre>
              </CardContent>
            </Card>

            {/* Customers for facility */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  Customers for Facility {String(diagData.testedFacilityId ?? "")}
                  <Badge variant="outline" className="text-xs">/customers?facilityid={String(diagData.testedFacilityId ?? "")}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap break-all">
                  {JSON.stringify(diagData.customersForFacility, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

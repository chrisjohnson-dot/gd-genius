import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCw, AlertTriangle, CheckCircle2, Info, HelpCircle, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";

type EdiStatus = "sent" | "missing" | "not_required" | "unknown";

const STATUS_CONFIG: Record<EdiStatus, { label: string; variant: "default" | "destructive" | "secondary" | "outline"; icon: React.ReactNode }> = {
  sent: { label: "945 Sent", variant: "default", icon: <CheckCircle2 className="h-3 w-3" /> },
  missing: { label: "945 Missing", variant: "destructive", icon: <AlertTriangle className="h-3 w-3" /> },
  not_required: { label: "Not Required", variant: "secondary", icon: <Info className="h-3 w-3" /> },
  unknown: { label: "Unknown", variant: "outline", icon: <HelpCircle className="h-3 w-3" /> },
};

const DAYS_OPTIONS = [
  { value: "1", label: "Last 24 hours" },
  { value: "3", label: "Last 3 days" },
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
];

export default function EdiMonitor() {
  const [configId, setConfigId] = useState<number | null>(null);
  const [daysBack, setDaysBack] = useState(7);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [statusFilter, setStatusFilter] = useState<EdiStatus | "all">("all");

  const { data: configs, isLoading: configsLoading } = trpc.config.list.useQuery();

  // Auto-select first config
  useEffect(() => {
    if (configs && configs.length > 0 && configId === null) {
      setConfigId(configs[0].id);
    }
  }, [configs, configId]);

  const {
    data,
    isLoading,
    isFetching,
    refetch,
    error,
  } = trpc.ediMonitor.getShippedOrders.useQuery(
    { configId: configId!, daysBack },
    {
      enabled: configId !== null,
      refetchInterval: 5 * 60 * 1000, // auto-refresh every 5 minutes
    }
  );

  // Track last refresh time whenever data changes
  useEffect(() => {
    if (data) setLastRefreshed(new Date());
  }, [data]);

  const handleRefresh = () => {
    refetch();
    toast.info("Refreshing EDI status...");
  };

  const filteredOrders = data?.orders.filter(
    (o) => statusFilter === "all" || o.ediStatus === statusFilter
  ) ?? [];

  const summary = data?.summary;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">EDI 945 Monitor</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track Warehouse Shipping Advice (945) transmission status for shipped orders
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-xs text-muted-foreground">
              Last updated {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching || configId === null}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Config:</span>
          <Select
            value={configId?.toString() ?? ""}
            onValueChange={(v) => setConfigId(Number(v))}
            disabled={configsLoading}
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Select config..." />
            </SelectTrigger>
            <SelectContent>
              {configs?.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Period:</span>
          <Select
            value={daysBack.toString()}
            onValueChange={(v) => setDaysBack(Number(v))}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Filter:</span>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as EdiStatus | "all")}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="missing">945 Missing only</SelectItem>
              <SelectItem value="sent">Sent only</SelectItem>
              <SelectItem value="not_required">Not required only</SelectItem>
              <SelectItem value="unknown">Unknown only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ClearSight connection warning */}
      {summary && !summary.clearSightConnected && (
        <Alert>
          <WifiOff className="h-4 w-4" />
          <AlertDescription>
            ClearSight retailer list is not available — EDI requirement status cannot be determined.
            Orders with <strong>asnSent = false</strong> will show as <strong>Unknown</strong> until
            ClearSight is connected and the <code>/api/retailers</code> endpoint is live.
          </AlertDescription>
        </Alert>
      )}

      {summary?.clearSightConnected && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600">
          <Wifi className="h-3.5 w-3.5" />
          ClearSight retailer EDI requirements loaded
        </div>
      )}

      {/* Error state */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {error.message ?? "Failed to fetch orders from Extensiv."}
          </AlertDescription>
        </Alert>
      )}

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Total Shipped
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-3xl font-bold">{summary.total}</p>
            </CardContent>
          </Card>

          <Card className={summary.missing > 0 ? "border-destructive" : ""}>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-destructive uppercase tracking-wide">
                945 Missing
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className={`text-3xl font-bold ${summary.missing > 0 ? "text-destructive" : ""}`}>
                {summary.missing}
              </p>
              {summary.missing > 0 && (
                <p className="text-xs text-destructive mt-1">Action required</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-emerald-600 uppercase tracking-wide">
                945 Sent
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-3xl font-bold text-emerald-600">{summary.sent}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Unknown / N/A
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-3xl font-bold">{summary.unknown + summary.notRequired}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Orders table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Shipped Orders
            {filteredOrders.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({filteredOrders.length} order{filteredOrders.length !== 1 ? "s" : ""})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(isLoading || (isFetching && !data)) ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              Loading orders from Extensiv...
            </div>
          ) : !configId ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              Select a config to view orders
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              No orders found for the selected period and filter
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>EDI Status</TableHead>
                    <TableHead>Order #</TableHead>
                    <TableHead>PO #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Facility</TableHead>
                    <TableHead>Ship Date</TableHead>
                    <TableHead>Tracking</TableHead>
                    <TableHead>Carrier</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => {
                    const cfg = STATUS_CONFIG[order.ediStatus as EdiStatus];
                    return (
                      <TableRow
                        key={order.orderId}
                        className={order.ediStatus === "missing" ? "bg-destructive/5" : ""}
                      >
                        <TableCell>
                          <Badge variant={cfg.variant} className="flex items-center gap-1 w-fit">
                            {cfg.icon}
                            {cfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{order.referenceNum}</TableCell>
                        <TableCell className="text-sm">{order.poNum ?? "—"}</TableCell>
                        <TableCell className="text-sm">{order.customerName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{order.facilityName}</TableCell>
                        <TableCell className="text-sm">
                          {order.shipDate
                            ? new Date(order.shipDate).toLocaleDateString()
                            : order.processDate
                            ? new Date(order.processDate).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{order.trackingNumber ?? "—"}</TableCell>
                        <TableCell className="text-sm">{order.carrierName ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ClearSight integration spec note */}
      <div className="text-xs text-muted-foreground border rounded-md p-3 space-y-1">
        <p className="font-medium">ClearSight Integration Required</p>
        <p>
          GD Genius calls <code className="bg-muted px-1 rounded">GET {"{clearSightBaseUrl}"}/api/retailers</code> with{" "}
          <code className="bg-muted px-1 rounded">X-API-Key: {"{outboundApiKey}"}</code> to determine which retailers
          require EDI. Expected response:
        </p>
        <pre className="bg-muted rounded p-2 text-xs overflow-x-auto">
{`{ "retailers": [
  { "name": "Walmart", "requiresEdi": true, "aliases": ["WAL-MART"] },
  { "name": "Target",  "requiresEdi": true },
  { "name": "Local Co","requiresEdi": false }
]}`}
        </pre>
        <p>
          Until this endpoint is live in ClearSight, all <code className="bg-muted px-1 rounded">asnSent = false</code>{" "}
          orders will show as <strong>Unknown</strong> instead of <strong>Missing</strong> or <strong>Not Required</strong>.
        </p>
      </div>
    </div>
  );
}

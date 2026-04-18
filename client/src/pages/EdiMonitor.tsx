import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, AlertTriangle, CheckCircle2, Info, HelpCircle, Wifi, WifiOff, Flag, CheckCheck, X } from "lucide-react";
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

interface FlagDialogState {
  open: boolean;
  orderId: number | null;
  orderNumber: string;
  customerName: string;
  shipDate: string | null;
  trackingNumber: string | null;
}

const EMPTY_FLAG_DIALOG: FlagDialogState = {
  open: false,
  orderId: null,
  orderNumber: "",
  customerName: "",
  shipDate: null,
  trackingNumber: null,
};

export default function EdiMonitor() {
  const [configId, setConfigId] = useState<number | null>(null);
  const [daysBack, setDaysBack] = useState(7);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [statusFilter, setStatusFilter] = useState<EdiStatus | "all">("all");
  const [flagDialog, setFlagDialog] = useState<FlagDialogState>(EMPTY_FLAG_DIALOG);
  const [flagNotes, setFlagNotes] = useState("");

  // Track previous missing count to detect new Missing orders on auto-refresh
  const prevMissingCountRef = useRef<number | null>(null);

  const { data: configs, isLoading: configsLoading } = trpc.config.list.useQuery();

  // Auto-select first config
  useEffect(() => {
    if (configs && configs.length > 0 && configId === null) {
      setConfigId(configs[0].id);
    }
  }, [configs, configId]);

  const notifyOwnerMutation = trpc.system.notifyOwner.useMutation();

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

  // Track last refresh time and detect new Missing orders on auto-refresh
  useEffect(() => {
    if (!data) return;
    const currentMissing = data.summary.missing;
    setLastRefreshed(new Date());

    if (prevMissingCountRef.current !== null && currentMissing > prevMissingCountRef.current) {
      const newCount = currentMissing - prevMissingCountRef.current;
      toast.warning(
        `${newCount} new Missing 945 order${newCount !== 1 ? "s" : ""} detected!`,
        { duration: 8000 }
      );
      notifyOwnerMutation.mutate({
        title: `EDI 945 Alert: ${newCount} new missing order${newCount !== 1 ? "s" : ""}`,
        content: `Auto-refresh detected ${newCount} new order${newCount !== 1 ? "s" : ""} without a 945 Warehouse Shipping Advice. Total missing: ${currentMissing}. Please review the EDI 945 Monitor.`,
      });
    }
    prevMissingCountRef.current = currentMissing;
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escalations data
  const { data: escalationsRaw, refetch: refetchEscalations } = trpc.ediEscalations.list.useQuery(
    { configId: configId! },
    { enabled: configId !== null }
  );

  const flagMutation = trpc.ediEscalations.flag.useMutation({
    onSuccess: () => {
      toast.success("Order flagged for follow-up");
      setFlagDialog(EMPTY_FLAG_DIALOG);
      setFlagNotes("");
      void refetchEscalations();
    },
    onError: (err) => {
      toast.error(`Failed to flag order: ${err.message}`);
    },
  });

  const resolveMutation = trpc.ediEscalations.resolve.useMutation({
    onSuccess: () => {
      toast.success("Escalation resolved");
      void refetchEscalations();
    },
    onError: (err) => toast.error(`Failed to resolve: ${err.message}`),
  });

  const dismissMutation = trpc.ediEscalations.dismiss.useMutation({
    onSuccess: () => {
      toast.success("Escalation dismissed");
      void refetchEscalations();
    },
    onError: (err) => toast.error(`Failed to dismiss: ${err.message}`),
  });

  const handleRefresh = () => {
    void refetch();
    toast.info("Refreshing EDI status...");
  };

  const openFlagDialog = (order: {
    orderId: number;
    referenceNum: string;
    customerName: string;
    shipDate?: string | null;
    processDate?: string | null;
    trackingNumber?: string | null;
  }) => {
    setFlagDialog({
      open: true,
      orderId: order.orderId,
      orderNumber: order.referenceNum,
      customerName: order.customerName,
      shipDate: order.shipDate ?? order.processDate ?? null,
      trackingNumber: order.trackingNumber ?? null,
    });
    setFlagNotes("");
  };

  const handleFlag = () => {
    if (!flagDialog.orderId || !configId) return;
    flagMutation.mutate({
      configId,
      orderNumber: flagDialog.orderNumber,
      customerName: flagDialog.customerName,
      shipDate: flagDialog.shipDate ?? undefined,
      trackingNumber: flagDialog.trackingNumber ?? undefined,
      notes: flagNotes.trim() || undefined,
    });
  };

  const filteredOrders = data?.orders.filter(
    (o) => statusFilter === "all" || o.ediStatus === statusFilter
  ) ?? [];

  const summary = data?.summary;
  // Filter to open escalations client-side (list returns all statuses)
  const escalations = (escalationsRaw ?? []).filter((e) => e.status === "open");

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

      {/* Tabs: Orders | Escalations */}
      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="escalations">
            Escalations
            {escalations.length > 0 && (
              <Badge variant="destructive" className="ml-2 h-4 px-1.5 text-[10px]">
                {escalations.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Orders tab */}
        <TabsContent value="orders">
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
                        <TableHead className="w-10" />
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
                            <TableCell>
                              {order.ediStatus === "missing" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  title="Flag for follow-up"
                                  onClick={() => openFlagDialog(order)}
                                >
                                  <Flag className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Escalations tab */}
        <TabsContent value="escalations">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Open Escalations</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {escalations.length === 0 ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  No open escalations
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order #</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Ship Date</TableHead>
                        <TableHead>Tracking</TableHead>
                        <TableHead>Flagged</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="w-24">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {escalations.map((esc) => (
                        <TableRow key={esc.id}>
                          <TableCell className="font-mono text-sm">{esc.orderNumber}</TableCell>
                          <TableCell className="text-sm">{esc.customerName}</TableCell>
                          <TableCell className="text-sm">
                            {esc.shipDate ? new Date(esc.shipDate).toLocaleDateString() : "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{esc.trackingNumber ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(esc.flaggedAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-sm max-w-48 truncate">{esc.notes ?? "—"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                title="Mark resolved"
                                onClick={() => resolveMutation.mutate({ id: esc.id })}
                                disabled={resolveMutation.isPending}
                              >
                                <CheckCheck className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                title="Dismiss"
                                onClick={() => dismissMutation.mutate({ id: esc.id })}
                                disabled={dismissMutation.isPending}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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

      {/* Flag dialog */}
      <Dialog
        open={flagDialog.open}
        onOpenChange={(open) => {
          if (!open) setFlagDialog(EMPTY_FLAG_DIALOG);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-destructive" />
              Flag Order for Follow-up
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Order #</span>
                <p className="font-mono font-medium">{flagDialog.orderNumber}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Customer</span>
                <p className="font-medium">{flagDialog.customerName}</p>
              </div>
              {flagDialog.shipDate && (
                <div>
                  <span className="text-muted-foreground">Ship Date</span>
                  <p>{new Date(flagDialog.shipDate).toLocaleDateString()}</p>
                </div>
              )}
              {flagDialog.trackingNumber && (
                <div>
                  <span className="text-muted-foreground">Tracking</span>
                  <p className="font-mono text-xs">{flagDialog.trackingNumber}</p>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes (optional)</label>
              <Textarea
                placeholder="Add context about this missing 945..."
                value={flagNotes}
                onChange={(e) => setFlagNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFlagDialog(EMPTY_FLAG_DIALOG)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleFlag}
              disabled={flagMutation.isPending}
            >
              {flagMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Flag className="h-4 w-4 mr-2" />
              )}
              Flag for Follow-up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

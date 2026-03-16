import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  PackageSearch,
  Play,
  User,
  Warehouse,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type OrderMeta = {
  orderId: number;
  referenceNum: string;
  customerId: number;
  customerName: string;
};

type Step = "warehouse" | "orders";

// ─── Per-customer orders panel ────────────────────────────────────────────────
function CustomerOrdersPanel({
  configId,
  facilityId,
  customer,
  selectedOrders,
  onToggleOrder,
  locationConfigs,
}: {
  configId: number;
  facilityId: number;
  customer: { id: number; name: string };
  selectedOrders: Map<number, OrderMeta>;
  onToggleOrder: (orderId: number, referenceNum: string, customerId: number, customerName: string, select: boolean) => void;
  locationConfigs: Array<{ customerId: number; facilityId: number; locationType: string; locationId: number; locationName: string }> | undefined;
}) {
  const [open, setOpen] = useState(true);

  const { data: orders, isLoading } = trpc.extensiv.openOrders.useQuery(
    { configId, customerId: customer.id, facilityId },
    { enabled: true }
  );

  const stagingLocation = useMemo(() => {
    if (!locationConfigs) return null;
    const staging = locationConfigs.find(
      (lc) => lc.customerId === customer.id && lc.facilityId === facilityId && lc.locationType === "staging"
    );
    return staging ? { id: staging.locationId, name: staging.locationName } : null;
  }, [locationConfigs, customer.id, facilityId]);

  const orderIds = useMemo(() => (orders ?? []).map((o) => o.readOnly.orderId), [orders]);
  const selectedCount = orderIds.filter((id) => selectedOrders.has(id)).length;
  const allSelected = orderIds.length > 0 && selectedCount === orderIds.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const toggleSelectAll = () => {
    if (allSelected) {
      orderIds.forEach((id) => onToggleOrder(id, "", customer.id, customer.name, false));
    } else {
      (orders ?? []).forEach((o) =>
        onToggleOrder(o.readOnly.orderId, o.referenceNum, customer.id, customer.name, true)
      );
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="overflow-hidden">
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors select-none">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-md bg-blue-500/10 flex items-center justify-center">
                  <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">{customer.name}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isLoading ? "Loading..." : `${orders?.length ?? 0} open orders`}
                    {selectedCount > 0 && (
                      <span className="ml-2 text-primary font-medium">· {selectedCount} selected</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {stagingLocation ? (
                  <Badge className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-0 hidden sm:flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {stagingLocation.name}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 dark:text-amber-400 hidden sm:flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    No staging
                  </Badge>
                )}
                {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <Separator />
          <CardContent className="pt-3 pb-2">
            {isLoading ? (
              <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading orders...
              </div>
            ) : !orders || orders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <PackageSearch className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No open, unallocated orders.</p>
              </div>
            ) : (
              <>
                {/* Select All */}
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border">
                  <Checkbox
                    id={`selectAll-${customer.id}`}
                    checked={allSelected}
                    data-state={someSelected ? "indeterminate" : allSelected ? "checked" : "unchecked"}
                    onCheckedChange={toggleSelectAll}
                  />
                  <Label htmlFor={`selectAll-${customer.id}`} className="text-sm font-medium cursor-pointer">
                    Select All ({orders.length} orders)
                  </Label>
                </div>

                {/* Order list */}
                <div className="space-y-1 max-h-[360px] overflow-y-auto pr-1">
                  {orders.map((order) => {
                    const orderId = order.readOnly.orderId;
                    const isSelected = selectedOrders.has(orderId);
                    const lineCount = order.orderItems?.length ?? 0;
                    return (
                      <div
                        key={orderId}
                        className={`flex items-center gap-3 p-3 rounded-md cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-primary/8 border border-primary/20"
                            : "hover:bg-muted/50 border border-transparent"
                        }`}
                        onClick={() =>
                          onToggleOrder(orderId, order.referenceNum, customer.id, customer.name, !isSelected)
                        }
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(v) =>
                            onToggleOrder(orderId, order.referenceNum, customer.id, customer.name, !!v)
                          }
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{order.referenceNum}</p>
                          <p className="text-xs text-muted-foreground">
                            Order #{orderId}
                            {order.poNum ? ` · PO: ${order.poNum}` : ""}
                            {" · "}Created:{" "}
                            {new Date(order.readOnly.creationDate).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {lineCount > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {lineCount} {lineCount === 1 ? "line" : "lines"}
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function OrderSelection() {
  const [, navigate] = useLocation();

  const { data: configs, isLoading: configsLoading } = trpc.config.list.useQuery();
  const configId = configs && configs.length > 0 ? configs[0]!.id : null;

  const [step, setStep] = useState<Step>("warehouse");
  const [selectedFacility, setSelectedFacility] = useState<{ id: number; name: string } | null>(null);
  // Map of orderId → OrderMeta (includes customerId so we can group for propose)
  const [selectedOrders, setSelectedOrders] = useState<Map<number, OrderMeta>>(new Map());

  // Fetch facilities
  const { data: facilities, isLoading: facilitiesLoading } = trpc.extensiv.facilities.useQuery(
    { configId: configId! },
    { enabled: !!configId }
  );

  // Fetch ALL customers for selected facility
  const { data: customers, isLoading: customersLoading } = trpc.extensiv.customersForFacility.useQuery(
    { configId: configId!, facilityId: selectedFacility?.id ?? 0 },
    { enabled: !!configId && !!selectedFacility }
  );

  // Fetch all location configs (used by each customer panel to find staging)
  const { data: locationConfigs } = trpc.locations.list.useQuery(
    { configId: configId! },
    { enabled: !!configId && !!selectedFacility }
  );

  // Toggle a single order
  const handleToggleOrder = (
    orderId: number,
    referenceNum: string,
    customerId: number,
    customerName: string,
    select: boolean
  ) => {
    setSelectedOrders((prev) => {
      const next = new Map(prev);
      if (select) {
        next.set(orderId, { orderId, referenceNum, customerId, customerName });
      } else {
        next.delete(orderId);
      }
      return next;
    });
  };

  // Propose mutation
  const proposeMutation = trpc.allocation.propose.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Allocation proposed: ${data.result.allocatedOrders.length} orders allocated, ${data.result.skippedOrders.length} skipped`
      );
      navigate(`/review/${data.runId}`);
    },
    onError: (e) => toast.error(`Allocation failed: ${e.message}`),
  });

  const handleRunAllocation = () => {
    if (selectedOrders.size === 0) { toast.error("Select at least one order"); return; }
    if (!configId || !selectedFacility) { toast.error("No warehouse selected"); return; }

    // Group selected orders by customer
    const byCustomer = new Map<number, { customerId: number; customerName: string; orderIds: number[] }>();
    for (const meta of Array.from(selectedOrders.values())) {
      if (!byCustomer.has(meta.customerId)) {
        byCustomer.set(meta.customerId, {
          customerId: meta.customerId,
          customerName: meta.customerName,
          orderIds: [],
        });
      }
      byCustomer.get(meta.customerId)!.orderIds.push(meta.orderId);
    }

    // Build customers array with staging location per customer
    const customersPayload = Array.from(byCustomer.values()).map((c) => {
      const staging = locationConfigs?.find(
        (lc) => lc.customerId === c.customerId && lc.facilityId === selectedFacility.id && lc.locationType === "staging"
      );
      if (!staging) {
        toast.error(`No staging location configured for ${c.customerName}. Go to Location Config first.`);
        throw new Error("Missing staging location");
      }
      return {
        customerId: c.customerId,
        customerName: c.customerName,
        orderIds: c.orderIds,
        stagingLocationId: staging.locationId,
        stagingLocationName: staging.locationName,
      };
    });

    proposeMutation.mutate({
      configId,
      facilityId: selectedFacility.id,
      facilityName: selectedFacility.name,
      customers: customersPayload,
    });
  };

  const handleSelectFacility = (facility: { id: number; name: string }) => {
    setSelectedFacility(facility);
    setSelectedOrders(new Map());
    setStep("orders");
  };

  const handleBackToWarehouse = () => {
    setSelectedFacility(null);
    setSelectedOrders(new Map());
    setStep("warehouse");
  };

  if (configsLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!configId) {
    return (
      <AppLayout>
        <div className="p-6 max-w-2xl">
          <div className="text-center py-16 text-muted-foreground">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No API configuration found.</p>
            <p className="text-sm mt-1">Go to API Settings to add your Extensiv credentials first.</p>
            <Button className="mt-4" onClick={() => navigate("/settings")}>Go to Settings</Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Run Allocation Tool</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Select a warehouse, then pick orders from any customers to allocate in one run
            </p>
          </div>
          {step === "orders" && (
            <Button
              onClick={handleRunAllocation}
              disabled={selectedOrders.size === 0 || proposeMutation.isPending}
              className="flex items-center gap-2"
            >
              {proposeMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Running...</>
              ) : (
                <><Play className="h-4 w-4" /> Run Allocation Tool ({selectedOrders.size})</>
              )}
            </Button>
          )}
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={handleBackToWarehouse}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
              step === "warehouse"
                ? "bg-primary text-primary-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Warehouse className="h-3.5 w-3.5" />
            {selectedFacility ? selectedFacility.name : "Warehouse"}
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md ${
              step === "orders"
                ? "bg-primary text-primary-foreground font-medium"
                : "text-muted-foreground/40"
            }`}
          >
            <PackageSearch className="h-3.5 w-3.5" />
            Orders
            {selectedOrders.size > 0 && (
              <Badge className="ml-1 h-5 px-1.5 text-xs bg-white/20 text-inherit border-0">
                {selectedOrders.size}
              </Badge>
            )}
          </span>
        </div>

        {/* ── Step 1: Select Warehouse ── */}
        {step === "warehouse" && (
          <div className="space-y-3">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Warehouse className="h-4 w-4 text-primary" />
              Select Warehouse
            </h2>
            {facilitiesLoading ? (
              <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading warehouses...
              </div>
            ) : !facilities || facilities.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No warehouses found in Extensiv.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {facilities.map((facility) => (
                  <button
                    key={facility.id}
                    onClick={() => handleSelectFacility(facility)}
                    className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:border-primary hover:bg-primary/5 transition-all text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                        <Warehouse className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{facility.name}</p>
                        <p className="text-xs text-muted-foreground">ID: {facility.id}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: All Customers + Orders ── */}
        {step === "orders" && (
          <div className="space-y-4">
            {/* Rules reminder */}
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-md text-sm">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-amber-800 dark:text-amber-300">
                <strong>Active Rules:</strong> On-hold orders are excluded automatically. Orders that cannot be fully satisfied will be skipped (no partial allocation). Inventory sourced FEFO with staging/pick face priority.
              </div>
            </div>

            {customersLoading ? (
              <div className="flex items-center gap-2 py-10 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading customers...
              </div>
            ) : !customers || customers.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <User className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No customers found for this warehouse.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {customers.map((customer) => (
                  <CustomerOrdersPanel
                    key={customer.id}
                    configId={configId!}
                    facilityId={selectedFacility!.id}
                    customer={customer}
                    selectedOrders={selectedOrders}
                    onToggleOrder={handleToggleOrder}
                    locationConfigs={locationConfigs}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

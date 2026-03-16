import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
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

type Step = "warehouse" | "customer" | "orders";

export default function OrderSelection() {
  const [, navigate] = useLocation();

  const { data: configs, isLoading: configsLoading } = trpc.config.list.useQuery();

  // Use the first (and typically only) config automatically
  const configId = configs && configs.length > 0 ? configs[0]!.id : null;

  // Step state
  const [step, setStep] = useState<Step>("warehouse");
  const [selectedFacility, setSelectedFacility] = useState<{ id: number; name: string } | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: number; name: string } | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Map<number, OrderMeta>>(new Map());

  // Fetch facilities
  const { data: facilities, isLoading: facilitiesLoading } = trpc.extensiv.facilities.useQuery(
    { configId: configId! },
    { enabled: !!configId }
  );

  // Fetch customers for selected facility
  const { data: customers, isLoading: customersLoading } = trpc.extensiv.customersForFacility.useQuery(
    { configId: configId!, facilityId: selectedFacility?.id ?? 0 },
    { enabled: !!configId && !!selectedFacility }
  );

  // Fetch orders for selected customer + facility
  const { data: orders, isLoading: ordersLoading } = trpc.extensiv.openOrders.useQuery(
    {
      configId: configId!,
      customerId: selectedCustomer?.id ?? 0,
      facilityId: selectedFacility?.id ?? 0,
    },
    { enabled: !!configId && !!selectedFacility && !!selectedCustomer }
  );

  // Fetch location configs to auto-detect staging location
  const { data: locationConfigs } = trpc.locations.list.useQuery(
    { configId: configId! },
    { enabled: !!configId && !!selectedCustomer && !!selectedFacility }
  );

  const stagingLocation = useMemo(() => {
    if (!locationConfigs || !selectedCustomer || !selectedFacility) return null;
    const staging = locationConfigs.find(
      (lc) =>
        lc.customerId === selectedCustomer.id &&
        lc.facilityId === selectedFacility.id &&
        lc.locationType === "staging"
    );
    return staging ? { id: staging.locationId, name: staging.locationName } : null;
  }, [locationConfigs, selectedCustomer, selectedFacility]);

  // Order selection helpers
  const orderIds = useMemo(() => (orders ?? []).map((o) => o.readOnly.orderId), [orders]);
  const selectedCount = orderIds.filter((id) => selectedOrders.has(id)).length;
  const allSelected = orderIds.length > 0 && selectedCount === orderIds.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const toggleSelectAll = () => {
    setSelectedOrders((prev) => {
      const next = new Map(prev);
      if (allSelected) {
        orderIds.forEach((id) => next.delete(id));
      } else {
        (orders ?? []).forEach((o) => {
          next.set(o.readOnly.orderId, {
            orderId: o.readOnly.orderId,
            referenceNum: o.referenceNum,
            customerId: selectedCustomer!.id,
            customerName: selectedCustomer!.name,
          });
        });
      }
      return next;
    });
  };

  const toggleOrder = (orderId: number, referenceNum: string) => {
    setSelectedOrders((prev) => {
      const next = new Map(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.set(orderId, {
          orderId,
          referenceNum,
          customerId: selectedCustomer!.id,
          customerName: selectedCustomer!.name,
        });
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
    if (!configId) { toast.error("No API configuration found"); return; }
    if (!selectedFacility || !selectedCustomer) { toast.error("Select a warehouse and customer"); return; }
    if (!stagingLocation) {
      toast.error("No staging location configured for this customer/warehouse. Go to Location Config first.");
      return;
    }

    proposeMutation.mutate({
      configId,
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      facilityId: selectedFacility.id,
      facilityName: selectedFacility.name,
      orderIds: Array.from(selectedOrders.keys()),
      stagingLocationId: stagingLocation.id,
      stagingLocationName: stagingLocation.name,
    });
  };

  const handleSelectFacility = (facility: { id: number; name: string }) => {
    setSelectedFacility(facility);
    setSelectedCustomer(null);
    setSelectedOrders(new Map());
    setStep("customer");
  };

  const handleSelectCustomer = (customer: { id: number; name: string }) => {
    setSelectedCustomer(customer);
    setSelectedOrders(new Map());
    setStep("orders");
  };

  const handleBackToWarehouse = () => {
    setSelectedFacility(null);
    setSelectedCustomer(null);
    setSelectedOrders(new Map());
    setStep("warehouse");
  };

  const handleBackToCustomer = () => {
    setSelectedCustomer(null);
    setSelectedOrders(new Map());
    setStep("customer");
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
            <h1 className="text-2xl font-bold">Run Allocation</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Select orders to allocate, then review before confirming
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
                <><Play className="h-4 w-4" /> Run Allocation ({selectedOrders.size})</>
              )}
            </Button>
          )}
        </div>

        {/* Breadcrumb / Progress */}
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
          <button
            onClick={step === "orders" ? handleBackToCustomer : undefined}
            disabled={step === "warehouse"}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
              step === "customer"
                ? "bg-primary text-primary-foreground font-medium"
                : step === "orders"
                ? "text-muted-foreground hover:text-foreground hover:bg-muted"
                : "text-muted-foreground/40 cursor-not-allowed"
            }`}
          >
            <User className="h-3.5 w-3.5" />
            {selectedCustomer ? selectedCustomer.name : "Customer"}
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

        {/* ── Step 2: Select Customer ── */}
        {step === "customer" && (
          <div className="space-y-3">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Select Customer
              <span className="text-xs font-normal text-muted-foreground ml-1">
                — {selectedFacility?.name}
              </span>
            </h2>
            {customersLoading ? (
              <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading customers...
              </div>
            ) : !customers || customers.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <User className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No customers found for this warehouse.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {customers.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => handleSelectCustomer(customer)}
                    className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:border-primary hover:bg-primary/5 transition-all text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-md bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                        <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{customer.name}</p>
                        <p className="text-xs text-muted-foreground">ID: {customer.id}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Select Orders ── */}
        {step === "orders" && (
          <div className="space-y-4">
            {/* Context summary */}
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className="flex items-center gap-1.5 py-1 px-3">
                <Warehouse className="h-3 w-3" />
                {selectedFacility?.name}
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1.5 py-1 px-3">
                <User className="h-3 w-3" />
                {selectedCustomer?.name}
              </Badge>
              {stagingLocation ? (
                <Badge className="flex items-center gap-1.5 py-1 px-3 bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-0">
                  <CheckCircle2 className="h-3 w-3" />
                  Staging: {stagingLocation.name}
                </Badge>
              ) : (
                <Badge variant="outline" className="flex items-center gap-1.5 py-1 px-3 border-amber-300 text-amber-700 dark:text-amber-400">
                  <AlertCircle className="h-3 w-3" />
                  No staging location configured
                </Badge>
              )}
            </div>

            {/* Rules reminder */}
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-md text-sm">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-amber-800 dark:text-amber-300">
                <strong>Active Rules:</strong> On-hold orders are excluded automatically. Orders that cannot be fully satisfied will be skipped (no partial allocation). Inventory sourced FEFO with staging/pick face priority.
              </div>
            </div>

            {/* Orders card */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">
                    Open Orders — {selectedCustomer?.name}
                  </CardTitle>
                  {orders && orders.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {selectedCount} of {orders.length} selected
                    </span>
                  )}
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="pt-3 pb-2">
                {ordersLoading ? (
                  <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading orders...
                  </div>
                ) : !orders || orders.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <PackageSearch className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No open, unallocated orders for this customer.</p>
                  </div>
                ) : (
                  <>
                    {/* Select All */}
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border">
                      <Checkbox
                        id="selectAll"
                        checked={allSelected}
                        data-state={someSelected ? "indeterminate" : allSelected ? "checked" : "unchecked"}
                        onCheckedChange={toggleSelectAll}
                      />
                      <Label htmlFor="selectAll" className="text-sm font-medium cursor-pointer">
                        Select All ({orders.length} orders)
                      </Label>
                    </div>

                    {/* Order list */}
                    <div className="space-y-1 max-h-[480px] overflow-y-auto pr-1">
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
                            onClick={() => toggleOrder(orderId, order.referenceNum)}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleOrder(orderId, order.referenceNum)}
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
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

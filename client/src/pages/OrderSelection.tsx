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
  Users,
  Warehouse,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type OrderMeta = {
  orderId: number;
  referenceNum: string;
  customerId: number;
  customerName: string;
};

type Step = "warehouse" | "clients" | "orders";

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

  const { data: orders, isLoading, error: ordersError } = trpc.extensiv.openOrders.useQuery(
    { configId, customerId: customer.id, facilityId },
    { enabled: true, retry: 1 }
  );

  const stagingLocation = useMemo(() => {
    if (!locationConfigs) return null;
    const staging = locationConfigs.find(
      (lc) => lc.customerId === customer.id && lc.facilityId === facilityId && lc.locationType === "staging"
    );
    return staging ? { id: staging.locationId, name: staging.locationName } : null;
  }, [locationConfigs, customer.id, facilityId]);

  // In Extensiv's API: readOnly.orderId = Extensiv Transaction ID (used for API calls)
  //                     referenceNum = client's internal order number (display only)
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
            ) : ordersError ? (
              <div className="flex items-start gap-2 py-4 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Failed to load orders</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{ordersError.message}</p>
                </div>
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
                    // extensivOrderId = Extensiv Transaction ID (readOnly.orderId) — used for API calls and shown as primary bold label (Go Direct order #)
                    // customerRefNum = client's internal order number (referenceNum) — shown as secondary label
                    const extensivOrderId = order.readOnly.orderId;
                    const customerRefNum = order.referenceNum;
                    const isSelected = selectedOrders.has(extensivOrderId);
                    const lineCount = order.orderItems?.length ?? 0;
                    const totalPieces = order.orderItems?.reduce((sum: number, item: { qty?: number }) => sum + (item.qty ?? 0), 0) ?? 0;
                    return (
                      <div
                        key={extensivOrderId}
                        className={`flex items-center gap-3 p-3 rounded-md cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-primary/8 border border-primary/20"
                            : "hover:bg-muted/50 border border-transparent"
                        }`}
                        onClick={() =>
                          onToggleOrder(extensivOrderId, customerRefNum, customer.id, customer.name, !isSelected)
                        }
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(v) =>
                            onToggleOrder(extensivOrderId, customerRefNum, customer.id, customer.name, !!v)
                          }
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            #{extensivOrderId}
                            {(() => {
                              const shipToName = (order as unknown as { shipTo?: { companyName?: string; name?: string } }).shipTo?.companyName
                                || (order as unknown as { shipTo?: { companyName?: string; name?: string } }).shipTo?.name;
                              return shipToName ? (
                                <span className="ml-2 font-normal text-muted-foreground">
                                  — {shipToName}
                                </span>
                              ) : null;
                            })()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Customer Ref: {customerRefNum}
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
                          {totalPieces > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {totalPieces} {totalPieces === 1 ? "pc" : "pcs"}
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

// ─── Quick Allocate Facility Card with expandable customer checklist ─────────
function QuickAllocateFacilityCard({
  facility,
  configId,
  isQuickRunning,
  isPending,
  onSelectFacility,
  onQuickAllocate,
}: {
  facility: { id: number; name: string };
  configId: number;
  isQuickRunning: boolean;
  isPending: boolean;
  onSelectFacility: () => void;
  onQuickAllocate: (clientIds?: number[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number> | null>(null); // null = not yet initialized

  const { data: customers, isLoading: customersLoading } = trpc.extensiv.customersForFacility.useQuery(
    { configId, facilityId: facility.id },
    { enabled: expanded }
  );

  // Initialize selection from last-used when customers load
  const last = loadLastUsed();
  const hasLastUsed = last.facilityId === facility.id && (last.clientIds?.length ?? 0) > 0;

  // When customers load and we haven't set selection yet, initialize from last-used
  useEffect(() => {
    if (customers && selectedIds === null) {
      if (hasLastUsed && last.clientIds) {
        setSelectedIds(new Set(last.clientIds));
      } else {
        setSelectedIds(new Set(customers.map((c) => c.id)));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers]);

  const effectiveSelected = selectedIds ?? new Set<number>();
  const allSelected = customers ? customers.length > 0 && effectiveSelected.size === customers.length : false;
  const someSelected = effectiveSelected.size > 0 && !allSelected;

  const toggleCustomer = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!customers) return;
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(customers.map((c) => c.id)));
    }
  };

  const handleRun = (e: React.MouseEvent) => {
    e.stopPropagation();
    const ids = effectiveSelected.size > 0 ? Array.from(effectiveSelected) : undefined;
    onQuickAllocate(ids);
  };

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card hover:border-primary/40 transition-all">
      {/* Facility header — click to navigate to full wizard */}
      <button
        onClick={onSelectFacility}
        className="flex items-center justify-between p-4 text-left group flex-1"
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

      {/* Quick Allocate toggle row */}
      <div className="px-4 pb-3 border-t border-border/50 pt-2 space-y-2">
        <button
          className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 font-medium transition-colors w-full"
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
        >
          <Zap className="h-3.5 w-3.5" />
          Quick Allocate
          {expanded ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronRight className="h-3 w-3 ml-auto" />}
        </button>

        {expanded && (
          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
            {customersLoading ? (
              <div className="flex items-center gap-2 py-2 text-muted-foreground text-xs">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading clients...
              </div>
            ) : !customers || customers.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">No clients found.</p>
            ) : (
              <>
                {/* Select All */}
                <div className="flex items-center gap-2 pb-1 border-b border-border/50">
                  <Checkbox
                    id={`qa-all-${facility.id}`}
                    checked={allSelected}
                    data-state={someSelected ? "indeterminate" : allSelected ? "checked" : "unchecked"}
                    onCheckedChange={toggleAll}
                  />
                  <Label htmlFor={`qa-all-${facility.id}`} className="text-xs font-medium cursor-pointer">
                    All clients ({customers.length})
                  </Label>
                </div>
                {/* Customer list */}
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {customers.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/40 cursor-pointer" onClick={() => toggleCustomer(c.id)}>
                      <Checkbox
                        id={`qa-c-${facility.id}-${c.id}`}
                        checked={effectiveSelected.has(c.id)}
                        onCheckedChange={() => toggleCustomer(c.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Label htmlFor={`qa-c-${facility.id}-${c.id}`} className="text-xs cursor-pointer truncate">{c.name}</Label>
                    </div>
                  ))}
                </div>
                {/* Run button */}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full flex items-center gap-1.5 text-xs h-7 bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 mt-1"
                  disabled={isPending || effectiveSelected.size === 0}
                  onClick={handleRun}
                >
                  {isQuickRunning ? (
                    <><Loader2 className="h-3 w-3 animate-spin" /> Running...</>
                  ) : (
                    <><Zap className="h-3 w-3" /> Quick Allocate {effectiveSelected.size > 0 ? `(${effectiveSelected.size} client${effectiveSelected.size === 1 ? "" : "s"})` : ""}</>
                  )}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Persist last-used facility + clients in localStorage ────────────────────
const STORAGE_KEY = "gd-alloc-last-used";
function loadLastUsed(): { facilityId?: number; facilityName?: string; clientIds?: number[] } {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); } catch { return {}; }
}
function saveLastUsed(facilityId: number, facilityName: string, clientIds: number[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ facilityId, facilityName, clientIds }));
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function OrderSelection() {
  const [, navigate] = useLocation();

  const { data: configs, isLoading: configsLoading } = trpc.config.list.useQuery();
  const configId = configs && configs.length > 0 ? configs[0]!.id : null;

  const [step, setStep] = useState<Step>("warehouse");
  const [selectedFacility, setSelectedFacility] = useState<{ id: number; name: string } | null>(null);
  const [selectedClientIds, setSelectedClientIds] = useState<Set<number>>(new Set());
  // Map of orderId → OrderMeta
  const [selectedOrders, setSelectedOrders] = useState<Map<number, OrderMeta>>(new Map());
  const [quickAllocFacilityId, setQuickAllocFacilityId] = useState<number | null>(null);

  // Fetch facilities
  const { data: facilities, isLoading: facilitiesLoading } = trpc.extensiv.facilities.useQuery(
    { configId: configId! },
    { enabled: !!configId }
  );

  // Fetch ALL customers for selected facility (only when on clients step or beyond)
  const { data: customersRaw, isLoading: customersLoading } = trpc.extensiv.customersForFacility.useQuery(
    { configId: configId!, facilityId: selectedFacility?.id ?? 0 },
    { enabled: !!configId && !!selectedFacility }
  );

  // Sort customers A–Z by name for the client selection step
  const customers = useMemo(
    () => (customersRaw ?? []).slice().sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    [customersRaw]
  );

  // Only the selected customers (for orders step)
  const selectedCustomers = useMemo(
    () => (customers ?? []).filter((c) => selectedClientIds.has(c.id)),
    [customers, selectedClientIds]
  );

  // Fetch all location configs
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

  // Toggle a client checkbox
  const handleToggleClient = (clientId: number) => {
    setSelectedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) {
        next.delete(clientId);
        // Also deselect any orders from this client
        setSelectedOrders((orders) => {
          const nextOrders = new Map(orders);
          for (const [orderId, meta] of Array.from(nextOrders.entries())) {
            if (meta.customerId === clientId) nextOrders.delete(orderId);
          }
          return nextOrders;
        });
      } else {
        next.add(clientId);
      }
      return next;
    });
  };

  const handleSelectAllClients = () => {
    if (!customers) return;
    if (selectedClientIds.size === customers.length) {
      setSelectedClientIds(new Set());
    } else {
      setSelectedClientIds(new Set(customers.map((c) => c.id)));
    }
  };

  // Quick Propose mutation
  const quickProposeMutation = trpc.allocation.quickPropose.useMutation({
    onSuccess: (data) => {
      setQuickAllocFacilityId(null);
      toast.success(
        `Quick Allocation: ${data.result.allocatedOrders.length} orders allocated, ${data.result.skippedOrders.length} skipped`
      );
      navigate(`/review/${data.runId}`);
    },
    onError: (e) => {
      setQuickAllocFacilityId(null);
      toast.error(`Quick Allocation failed: ${e.message}`);
    },
  });

  const handleQuickAllocate = (facility: { id: number; name: string }, clientIds?: number[]) => {
    if (!configId) { toast.error("No API configuration found"); return; }
    setQuickAllocFacilityId(facility.id);
    quickProposeMutation.mutate({
      configId,
      facilityId: facility.id,
      facilityName: facility.name,
      customerIds: clientIds,
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

    const byCustomer = new Map<number, { customerId: number; customerName: string; orderIds: number[] }>();
    for (const meta of Array.from(selectedOrders.values())) {
      if (!byCustomer.has(meta.customerId)) {
        byCustomer.set(meta.customerId, { customerId: meta.customerId, customerName: meta.customerName, orderIds: [] });
      }
      byCustomer.get(meta.customerId)!.orderIds.push(meta.orderId);
    }

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
    // Restore last-used clients for this facility
    const last = loadLastUsed();
    const restoredClients = last.facilityId === facility.id && last.clientIds?.length
      ? new Set<number>(last.clientIds)
      : new Set<number>();
    setSelectedFacility(facility);
    setSelectedClientIds(restoredClients);
    setSelectedOrders(new Map());
    setStep("clients");
  };

  const handleProceedToOrders = () => {
    if (selectedClientIds.size === 0) { toast.error("Select at least one client"); return; }
    // Persist last-used selection
    if (selectedFacility) {
      saveLastUsed(selectedFacility.id, selectedFacility.name, Array.from(selectedClientIds));
    }
    setStep("orders");
  };

  const handleBackToWarehouse = () => {
    setSelectedFacility(null);
    setSelectedClientIds(new Set());
    setSelectedOrders(new Map());
    setStep("warehouse");
  };

  const handleBackToClients = () => {
    setSelectedOrders(new Map());
    setStep("clients");
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

  const allClientsSelected = customers && customers.length > 0 && selectedClientIds.size === customers.length;
  const someClientsSelected = selectedClientIds.size > 0 && !allClientsSelected;

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Run Allocation Tool</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Select a warehouse and clients, then pick orders to allocate
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
          <button
            onClick={step === "orders" ? handleBackToClients : undefined}
            disabled={step === "warehouse"}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
              step === "clients"
                ? "bg-primary text-primary-foreground font-medium"
                : step === "orders"
                ? "text-muted-foreground hover:text-foreground hover:bg-muted"
                : "text-muted-foreground/40 cursor-default"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Clients
            {selectedClientIds.size > 0 && step !== "clients" && (
              <Badge className="ml-1 h-5 px-1.5 text-xs bg-white/20 text-inherit border-0">
                {selectedClientIds.size}
              </Badge>
            )}
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
                {facilities.map((facility) => {
                  const isQuickRunning = quickAllocFacilityId === facility.id && quickProposeMutation.isPending;
                  return (
                    <QuickAllocateFacilityCard
                      key={facility.id}
                      facility={facility}
                      configId={configId!}
                      isQuickRunning={isQuickRunning}
                      isPending={quickProposeMutation.isPending}
                      onSelectFacility={() => handleSelectFacility(facility)}
                      onQuickAllocate={(clientIds) => handleQuickAllocate(facility, clientIds)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Select Clients ── */}
        {step === "clients" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Select Clients
                {customers && customers.length > 0 && (
                  <span className="text-sm font-normal text-muted-foreground">
                    — {customers.length} clients in {selectedFacility?.name}
                  </span>
                )}
              </h2>
              <Button
                onClick={handleProceedToOrders}
                disabled={selectedClientIds.size === 0}
                className="flex items-center gap-2"
              >
                Next: View Orders
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {customersLoading ? (
              <div className="flex items-center gap-2 py-10 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading clients...
              </div>
            ) : !customers || customers.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <User className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No clients found for this warehouse.</p>
              </div>
            ) : (
              <Card>
                <CardContent className="pt-4 pb-2">
                  {/* Select All */}
                  <div className="flex items-center gap-3 pb-3 mb-2 border-b border-border">
                    <Checkbox
                      id="selectAllClients"
                      checked={!!allClientsSelected}
                      data-state={someClientsSelected ? "indeterminate" : allClientsSelected ? "checked" : "unchecked"}
                      onCheckedChange={handleSelectAllClients}
                    />
                    <Label htmlFor="selectAllClients" className="text-sm font-medium cursor-pointer">
                      Select All Clients ({customers.length})
                    </Label>
                  </div>

                  {/* Client list */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {customers.map((customer) => {
                      const isSelected = selectedClientIds.has(customer.id);
                      return (
                        <div
                          key={customer.id}
                          className={`flex items-center gap-3 p-3 rounded-md cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-primary/8 border border-primary/20"
                              : "hover:bg-muted/50 border border-transparent"
                          }`}
                          onClick={() => handleToggleClient(customer.id)}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggleClient(customer.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-7 w-7 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
                              <User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <span className="text-sm font-medium truncate">{customer.name}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedClientIds.size > 0 && (
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                  disabled={quickProposeMutation.isPending}
                  onClick={() => selectedFacility && handleQuickAllocate(selectedFacility, Array.from(selectedClientIds))}
                >
                  {quickProposeMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Running...</>
                  ) : (
                    <><Zap className="h-4 w-4" /> Quick Allocate {selectedClientIds.size} {selectedClientIds.size === 1 ? "Client" : "Clients"}</>
                  )}
                </Button>
                <Button onClick={handleProceedToOrders} className="flex items-center gap-2">
                  View Orders for {selectedClientIds.size} {selectedClientIds.size === 1 ? "Client" : "Clients"}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Orders ── */}
        {step === "orders" && (
          <div className="space-y-4">
            <div className="space-y-3">
              {selectedCustomers.map((customer) => (
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
          </div>
        )}
      </div>
    </AppLayout>
  );
}

import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { AlertCircle, ChevronDown, ChevronRight, Loader2, PackageSearch, Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function OrderSelection() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: configs } = trpc.config.list.useQuery();
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [facilityId, setFacilityId] = useState<number>(1);
  const [facilityName, setFacilityName] = useState<string>("Facility 1");
  const [stagingLocationId, setStagingLocationId] = useState<number>(0);
  const [stagingLocationName, setStagingLocationName] = useState<string>("");

  // Fetch customers for selected config
  const { data: customers } = trpc.extensiv.customers.useQuery(
    { configId: selectedConfigId! },
    { enabled: !!selectedConfigId }
  );

  // Per-customer orders (fetched lazily)
  const [expandedCustomers, setExpandedCustomers] = useState<Set<number>>(new Set());
  const [selectedOrders, setSelectedOrders] = useState<Map<number, { orderId: number; referenceNum: string; customerId: number; customerName: string }>>(new Map());

  // Propose mutation
  const proposeMutation = trpc.allocation.propose.useMutation({
    onSuccess: (data) => {
      toast.success(`Allocation proposed: ${data.result.allocatedOrders.length} orders allocated, ${data.result.skippedOrders.length} skipped`);
      navigate(`/review/${data.runId}`);
    },
    onError: (e) => toast.error(`Allocation failed: ${e.message}`),
  });

  const toggleCustomer = (customerId: number) => {
    setExpandedCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  };

  const handleRunAllocation = () => {
    if (selectedOrders.size === 0) { toast.error("Select at least one order"); return; }
    if (!selectedConfigId) { toast.error("Select a configuration"); return; }
    if (!stagingLocationId) { toast.error("Enter a staging location ID"); return; }

    // Group by customer — only support single customer per run for simplicity
    const orderIds = Array.from(selectedOrders.keys());
    const firstOrder = Array.from(selectedOrders.values())[0]!;

    proposeMutation.mutate({
      configId: selectedConfigId,
      customerId: firstOrder.customerId,
      customerName: firstOrder.customerName,
      facilityId,
      facilityName,
      orderIds,
      stagingLocationId,
      stagingLocationName: stagingLocationName || `Staging (${stagingLocationId})`,
    });
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-5xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Run Allocation</h1>
            <p className="text-muted-foreground text-sm mt-1">Select orders to allocate, then review before confirming</p>
          </div>
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
        </div>

        {/* Configuration */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>API Configuration</Label>
              <Select
                value={selectedConfigId ? String(selectedConfigId) : ""}
                onValueChange={(v) => { setSelectedConfigId(Number(v)); setSelectedOrders(new Map()); setExpandedCustomers(new Set()); }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select configuration..." />
                </SelectTrigger>
                <SelectContent>
                  {(configs ?? []).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Facility ID</Label>
              <input
                type="number"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={facilityId}
                onChange={(e) => setFacilityId(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Staging Location ID</Label>
              <input
                type="number"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Extensiv location ID for staging"
                value={stagingLocationId || ""}
                onChange={(e) => setStagingLocationId(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Staging Location Name</Label>
              <input
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="e.g. STAGING-AREA-1"
                value={stagingLocationName}
                onChange={(e) => setStagingLocationName(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Rules reminder */}
        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-md text-sm">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-amber-800 dark:text-amber-300">
            <strong>Active Rules:</strong> Orders on hold are excluded automatically. Orders that cannot be fully satisfied will be skipped (no partial allocation). Inventory is sourced FEFO with staging/pick face priority.
          </div>
        </div>

        {/* Customer order lists */}
        {!selectedConfigId ? (
          <div className="text-center py-12 text-muted-foreground">
            <PackageSearch className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>Select a configuration to load available orders.</p>
          </div>
        ) : !customers || customers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No customers found.</div>
        ) : (
          <div className="space-y-3">
            {customers.map((customer) => (
              <CustomerOrderPanel
                key={customer.id}
                customer={customer}
                configId={selectedConfigId}
                facilityId={facilityId}
                expanded={expandedCustomers.has(customer.id)}
                onToggle={() => toggleCustomer(customer.id)}
                selectedOrders={selectedOrders}
                onSelectionChange={setSelectedOrders}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function CustomerOrderPanel({
  customer,
  configId,
  facilityId,
  expanded,
  onToggle,
  selectedOrders,
  onSelectionChange,
}: {
  customer: { id: number; name: string };
  configId: number;
  facilityId: number;
  expanded: boolean;
  onToggle: () => void;
  selectedOrders: Map<number, { orderId: number; referenceNum: string; customerId: number; customerName: string }>;
  onSelectionChange: React.Dispatch<React.SetStateAction<Map<number, { orderId: number; referenceNum: string; customerId: number; customerName: string }>>>;
}) {
  const { data: orders, isLoading } = trpc.extensiv.openOrders.useQuery(
    { configId, customerId: customer.id, facilityId },
    { enabled: expanded }
  );

  const customerOrderIds = (orders ?? []).map((o) => o.readOnly.orderId);
  const selectedCount = customerOrderIds.filter((id) => selectedOrders.has(id)).length;
  const allSelected = customerOrderIds.length > 0 && selectedCount === customerOrderIds.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const toggleSelectAll = () => {
    onSelectionChange((prev) => {
      const next = new Map(prev);
      if (allSelected) {
        customerOrderIds.forEach((id) => next.delete(id));
      } else {
        (orders ?? []).forEach((o) => {
          next.set(o.readOnly.orderId, {
            orderId: o.readOnly.orderId,
            referenceNum: o.referenceNum,
            customerId: customer.id,
            customerName: customer.name,
          });
        });
      }
      return next;
    });
  };

  const toggleOrder = (orderId: number, referenceNum: string) => {
    onSelectionChange((prev) => {
      const next = new Map(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.set(orderId, { orderId, referenceNum, customerId: customer.id, customerName: customer.name });
      return next;
    });
  };

  return (
    <Card>
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <span className="font-medium">{customer.name}</span>
          {selectedCount > 0 && (
            <Badge className="bg-primary/10 text-primary text-xs">{selectedCount} selected</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {expanded && orders && <span>{orders.length} open orders</span>}
        </div>
      </div>

      {expanded && (
        <>
          <Separator />
          <CardContent className="pt-3 pb-2">
            {isLoading ? (
              <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading orders...
              </div>
            ) : !orders || orders.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">No open, unallocated orders for this customer.</p>
            ) : (
              <>
                {/* Select All */}
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                  <Checkbox
                    id={`selectAll-${customer.id}`}
                    checked={allSelected}
                    onCheckedChange={toggleSelectAll}
                    className={someSelected ? "opacity-60" : ""}
                  />
                  <Label htmlFor={`selectAll-${customer.id}`} className="text-sm font-medium cursor-pointer">
                    Select All ({orders.length} orders)
                  </Label>
                </div>

                {/* Order list */}
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {orders.map((order) => {
                    const orderId = order.readOnly.orderId;
                    const isSelected = selectedOrders.has(orderId);
                    return (
                      <div
                        key={orderId}
                        className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-muted/50"}`}
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
                            Order ID: {orderId} · Created: {new Date(order.readOnly.creationDate).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">
                          Status {order.readOnly.status}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </>
      )}
    </Card>
  );
}

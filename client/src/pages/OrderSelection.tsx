import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
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
  RefreshCw,
  Search,
  User,
  Users,
  Warehouse,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useWarehouse } from "@/contexts/WarehouseContext";

type OrderMeta = {
  orderId: number;
  referenceNum: string;
  customerId: number;
  customerName: string;
};

type Step = "warehouse" | "clients" | "orders";

// ─── Per-customer orders panel ────────────────────────────────────────────────
/** Highlight all occurrences of `query` inside `text` with a yellow background span. */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 dark:bg-yellow-700/60 text-inherit rounded-sm px-0">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function CustomerOrdersPanel({
  configId,
  facilityId,
  customer,
  selectedOrders,
  onToggleOrder,
  locationConfigs,
  searchQuery,
}: {
  configId: number;
  facilityId: number;
  customer: { id: number; name: string };
  selectedOrders: Map<number, OrderMeta>;
  onToggleOrder: (orderId: number, referenceNum: string, customerId: number, customerName: string, select: boolean) => void;
  locationConfigs: Array<{ customerId: number; facilityId: number; locationType: string; locationId: number; locationName: string }> | undefined;
  searchQuery: string;
}) {
  const [open, setOpen] = useState(true);

  // Use DB-backed query for instant loading (data synced hourly in background)
  const { data: orders, isLoading, error: ordersError } = trpc.extensiv.openOrdersFromDb.useQuery(
    { customerId: customer.id, facilityId },
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

  // Exclude fully-allocated orders — they should not appear in the wizard
  const unallocatedOrders = useMemo(
    () => (orders ?? []).filter((o) => !o.readOnly.fullyAllocated),
    [orders]
  );

  const orderIds = useMemo(() => unallocatedOrders.map((o) => o.readOnly.orderId), [unallocatedOrders]);
  const selectedCount = orderIds.filter((id) => selectedOrders.has(id)).length;
  const allSelected = orderIds.length > 0 && selectedCount === orderIds.length;
  const someSelected = selectedCount > 0 && !allSelected;

  // Filter orders by search query (transaction ID, PO reference, ship-to name)
  const filteredOrders = useMemo(() => {
    if (!searchQuery) return unallocatedOrders;
    const q = searchQuery.toLowerCase();
    return unallocatedOrders.filter((o) => {
      const shipTo = (o as unknown as { shipTo?: { companyName?: string; name?: string } }).shipTo;
      const shipToName = (shipTo?.companyName ?? shipTo?.name ?? "").toLowerCase();
      return (
        String(o.readOnly.orderId).includes(q) ||
        (o.poNum ?? "").toLowerCase().includes(q) ||
        (o.referenceNum ?? "").toLowerCase().includes(q) ||
        shipToName.includes(q)
      );
    });
  }, [unallocatedOrders, searchQuery]);

  const toggleSelectAll = () => {
    if (allSelected) {
      orderIds.forEach((id) => onToggleOrder(id, "", customer.id, customer.name, false));
    } else {
      unallocatedOrders.forEach((o) =>
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
                    {isLoading ? "Loading..." : `${unallocatedOrders.length} unallocated order${unallocatedOrders.length !== 1 ? "s" : ""}`}
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
            ) : unallocatedOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <PackageSearch className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No open, unallocated orders.</p>
              </div>
            ) : (
              <>
                {/* Select All row */}
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border">
                  <Checkbox
                    id={`selectAll-${customer.id}`}
                    checked={allSelected}
                    data-state={someSelected ? "indeterminate" : allSelected ? "checked" : "unchecked"}
                    onCheckedChange={toggleSelectAll}
                    className="ml-1"
                  />
                  <Label htmlFor={`selectAll-${customer.id}`} className="text-xs font-medium cursor-pointer text-muted-foreground">
                    Select All ({unallocatedOrders.length} order{unallocatedOrders.length !== 1 ? "s" : ""}{searchQuery && filteredOrders.length !== unallocatedOrders.length ? ` · ${filteredOrders.length} matching` : ""})
                  </Label>
                </div>

                {/* Order table */}
                {searchQuery && filteredOrders.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Search className="h-6 w-6 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No orders match "{searchQuery}"</p>
                  </div>
                ) : (
                  <div className="max-h-[calc(100vh-380px)] overflow-y-auto">
                    <table className="w-full text-sm border-collapse table-fixed">
                      <colgroup>
                        {/* checkbox */}
                        <col style={{ width: "32px" }} />
                        {/* TX # */}
                        <col style={{ width: "90px" }} />
                        {/* Date */}
                        <col style={{ width: "68px" }} />
                        {/* PO # */}
                        <col style={{ width: "22%" }} />
                        {/* Ship To — takes remaining space */}
                        <col />
                        {/* City */}
                        <col style={{ width: "18%" }} />
                        {/* Ln/Pcs */}
                        <col style={{ width: "52px" }} />
                      </colgroup>
                      <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                        <tr className="border-b border-border">
                          <th className="w-8 px-1 py-2"></th>
                          <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground">TX #</th>
                          <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground">Date</th>
                          <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground">PO #</th>
                          <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground">Ship To</th>
                          <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground">City</th>
                          <th className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground">Ln/Pc</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredOrders.map((order) => {
                          const extensivOrderId = order.readOnly.orderId;
                          const customerRefNum = order.referenceNum;
                          const isSelected = selectedOrders.has(extensivOrderId);
                          // For DB-backed orders, use stored skuCount/totalPieces directly
                          const dbOrder = order as unknown as { _fromDb?: boolean; _dbTotalPieces?: number; _dbSkuCount?: number };
                          const lineCount = dbOrder._fromDb ? (dbOrder._dbSkuCount ?? 0) : (order.orderItems?.length ?? 0);
                          const totalPieces = dbOrder._fromDb ? (dbOrder._dbTotalPieces ?? 0) : (order.orderItems?.reduce((sum: number, item: { qty?: number }) => sum + (item.qty ?? 0), 0) ?? 0);
                          const shipTo = (order as unknown as { shipTo?: { companyName?: string; name?: string; city?: string; state?: string } }).shipTo;
                          const shipToName = shipTo?.companyName ?? shipTo?.name ?? "";
                          const city = shipTo?.city ?? "";
                          const state = shipTo?.state ?? "";
                          const cityState = city && state ? `${city}, ${state}` : city || state || "—";
                          const createdDate = order.readOnly.creationDate
                            ? new Date(order.readOnly.creationDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                            : "—";
                          return (
                            <tr
                              key={extensivOrderId}
                              className={`cursor-pointer transition-colors ${
                                isSelected
                                  ? "bg-primary/8 hover:bg-primary/12"
                                  : "hover:bg-muted/40"
                              }`}
                              onClick={() => onToggleOrder(extensivOrderId, customerRefNum, customer.id, customer.name, !isSelected)}
                            >
                              <td className="px-1 py-2 text-center">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={(v) => onToggleOrder(extensivOrderId, customerRefNum, customer.id, customer.name, !!v)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </td>
                              <td className="px-2 py-2 font-medium text-xs">
                                <div className="truncate"><HighlightMatch text={String(extensivOrderId)} query={searchQuery} /></div>
                                {customerRefNum && (
                                  <div className="text-[10px] text-muted-foreground truncate">Ref: <HighlightMatch text={customerRefNum} query={searchQuery} /></div>
                                )}
                              </td>
                              <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">{createdDate}</td>
                              <td className="px-2 py-2 text-xs text-muted-foreground">
                                <div className="truncate" title={order.poNum ?? undefined}>{order.poNum ? <HighlightMatch text={order.poNum} query={searchQuery} /> : "—"}</div>
                              </td>
                              <td className="px-2 py-2 text-xs">
                                <div className="truncate" title={shipToName}>{shipToName ? <HighlightMatch text={shipToName} query={searchQuery} /> : "—"}</div>
                              </td>
                              <td className="px-2 py-2 text-xs text-muted-foreground">
                                <div className="truncate" title={cityState}>{cityState}</div>
                              </td>
                              <td className="px-2 py-2 text-center text-xs whitespace-nowrap">
                                {lineCount > 0 ? lineCount : "—"}/{totalPieces > 0 ? totalPieces : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
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

  // Sort: stable A–Z (selection does not reorder the list)
  const sortedCustomers = useMemo(
    () =>
      (customers ?? []).slice().sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? "")
      ),
    [customers]
  );

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
                  {sortedCustomers.map((c) => (
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
  const { selectedFacilityId: globalFacilityId, selectedFacilityName: globalFacilityName } = useWarehouse();

  const { data: configs, isLoading: configsLoading } = trpc.config.list.useQuery();
  const configId = configs && configs.length > 0 ? configs[0]!.id : null;

  const [step, setStep] = useState<Step>(globalFacilityId ? "clients" : "warehouse");
  const [selectedFacility, setSelectedFacility] = useState<{ id: number; name: string } | null>(
    globalFacilityId && globalFacilityName ? { id: globalFacilityId, name: globalFacilityName } : null
  );
  const [selectedClientIds, setSelectedClientIds] = useState<Set<number>>(new Set());
  // Map of orderId → OrderMeta
  const [selectedOrders, setSelectedOrders] = useState<Map<number, OrderMeta>>(new Map());
  const [quickAllocFacilityId, setQuickAllocFacilityId] = useState<number | null>(null);
  // Search query for the orders step
  const [orderSearch, setOrderSearch] = useState("");

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

  // Sort customers: stable A–Z (selection does not reorder the list)
  const customers = useMemo(
    () =>
      (customersRaw ?? []).slice().sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? "")
      ),
    [customersRaw]
  );

  // Only the selected customers (for orders step)
  const selectedCustomers = useMemo(
    () => (customers ?? []).filter((c) => selectedClientIds.has(c.id)),
    [customers, selectedClientIds]
  );

  // Fetch open order counts for all customers at the clients step (shown in brackets next to each name)
  // Uses DB-backed query for instant loading — no Extensiv API call needed
  const customerIds = useMemo(() => (customers ?? []).map((c) => c.id), [customers]);
  const { data: orderCountsRaw, isLoading: orderCountsLoading } = trpc.extensiv.openOrderCountsFromDb.useQuery(
    { customerIds, facilityId: selectedFacility?.id ?? 0 },
    { enabled: !!selectedFacility && step === "clients" && customerIds.length > 0 }
  );

  // Sync mutation — triggers a live Extensiv pull when user wants fresh data
  const utils = trpc.useUtils();
  const syncMutation = trpc.pickSchedule.syncNow.useMutation({
    onSuccess: () => {
      toast.success("Sync started — orders will refresh in a moment");
      // Invalidate DB-backed queries after a short delay to pick up new data
      setTimeout(() => {
        utils.extensiv.openOrdersFromDb.invalidate();
        utils.extensiv.openOrderCountsFromDb.invalidate();
      }, 5000);
    },
    onError: (e) => toast.error(`Sync failed: ${e.message}`),
  });
  const orderCountMap = useMemo(() => {
    const m = new Map<number, number>();
    (orderCountsRaw ?? []).forEach(({ customerId, count }) => m.set(customerId, count));
    return m;
  }, [orderCountsRaw]);

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
      // Persist immediately so deselections survive page reloads
      if (selectedFacility) {
        saveLastUsed(selectedFacility.id, selectedFacility.name, Array.from(next));
      }
      return next;
    });
  };

  const handleSelectAllClients = () => {
    if (!customers) return;
    const next =
      selectedClientIds.size === customers.length
        ? new Set<number>()
        : new Set<number>(customers.map((c) => c.id));
    setSelectedClientIds(next);
    // Persist immediately
    if (selectedFacility) {
      saveLastUsed(selectedFacility.id, selectedFacility.name, Array.from(next));
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

  // Reset wizard whenever the global warehouse selection changes
  useEffect(() => {
    if (globalFacilityId && globalFacilityName) {
      setSelectedFacility({ id: globalFacilityId, name: globalFacilityName });
      setSelectedClientIds(new Set());
      setSelectedOrders(new Map());
      setStep("clients");
    } else if (!globalFacilityId) {
      // Global warehouse was cleared — go back to warehouse picker
      setSelectedFacility(null);
      setSelectedClientIds(new Set());
      setSelectedOrders(new Map());
      setStep("warehouse");
    }
  }, [globalFacilityId, globalFacilityName]);

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
    if (globalFacilityId) {
      // Global warehouse is set — can't change warehouse, just reset client/order selection
      setSelectedClientIds(new Set());
      setSelectedOrders(new Map());
      setStep("clients");
    } else {
      setSelectedFacility(null);
      setSelectedClientIds(new Set());
      setSelectedOrders(new Map());
      setStep("warehouse");
    }
  };

  const handleBackToClients = () => {
    setSelectedOrders(new Map());
    setStep("clients");
  };

  if (configsLoading) {
    return (

        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>

    );
  }

  if (!configId) {
    return (

        <div className="p-6 max-w-2xl">
          <div className="text-center py-16 text-muted-foreground">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No API configuration found.</p>
            <p className="text-sm mt-1">Go to API Settings to add your Extensiv credentials first.</p>
            <Button className="mt-4" onClick={() => navigate("/settings")}>Go to Settings</Button>
          </div>
        </div>

    );
  }

  const allClientsSelected = customers && customers.length > 0 && selectedClientIds.size === customers.length;
  const someClientsSelected = selectedClientIds.size > 0 && !allClientsSelected;

  return (

      <div className="p-6 space-y-6 w-full">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Run Allocation Wizard</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Select a warehouse and clients, then pick orders to allocate
            </p>
          </div>
          {step === "orders" && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="flex items-center gap-1.5 text-xs"
                title="Pull latest orders from Extensiv"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                {syncMutation.isPending ? "Syncing..." : "Refresh"}
              </Button>
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
          )}
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={handleBackToWarehouse}
            disabled={!!globalFacilityId && step === "clients"}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
              step === "warehouse"
                ? "bg-primary text-primary-foreground font-medium"
                : globalFacilityId
                ? "text-foreground font-medium cursor-default"
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
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                  className="flex items-center gap-1.5 text-xs"
                  title="Pull latest orders from Extensiv"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                  {syncMutation.isPending ? "Syncing..." : "Refresh"}
                </Button>
                <Button
                  onClick={handleProceedToOrders}
                  disabled={selectedClientIds.size === 0}
                  className="flex items-center gap-2"
                >
                  Next: View Orders
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
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
                  {/* Client list */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {customers.map((customer) => {
                      const isSelected = selectedClientIds.has(customer.id);
                      const count = orderCountMap.get(customer.id);
                      const hasCount = orderCountMap.has(customer.id);
                      const isZero = hasCount && count === 0;
                      // Allow deselection of already-selected zero-order clients;
                      // only block *selecting* new clients that have no orders.
                      const isBlocked = isZero && !isSelected;
                      return (
                        <div
                          key={customer.id}
                          className={`flex items-center gap-3 p-3 rounded-md transition-colors ${
                            isBlocked
                              ? "opacity-40 cursor-not-allowed border border-transparent"
                              : isSelected
                              ? "bg-primary/8 border border-primary/20 cursor-pointer"
                              : "hover:bg-muted/50 border border-transparent cursor-pointer"
                          }`}
                          onClick={() => !isBlocked && handleToggleClient(customer.id)}
                        >
                          <Checkbox
                            checked={isSelected}
                            disabled={isBlocked}
                            onCheckedChange={() => !isBlocked && handleToggleClient(customer.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-7 w-7 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
                              <User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <span className="text-sm font-medium truncate">{customer.name}</span>
                            {orderCountsLoading && !hasCount ? (
                              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
                            ) : hasCount ? (
                              <span className="text-xs text-muted-foreground shrink-0">({count})</span>
                            ) : null}
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
            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by transaction ID, PO reference, or ship-to name…"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                className="pl-9 pr-9"
              />
              {orderSearch && (
                <button
                  onClick={() => setOrderSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
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
                  searchQuery={orderSearch.trim()}
                />
              ))}
            </div>
          </div>
        )}
      </div>

  );
}

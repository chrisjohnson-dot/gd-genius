import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Package,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  ChevronRight,
  Search,
  Layers,
  BoxIcon,
  RefreshCw,
  CheckCircle2,
  Circle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface PackageSize {
  id: number;
  clientId: number;
  clientName: string;
  name: string;
  lengthCm: string | null;
  widthCm: string | null;
  heightCm: string | null;
  weightKg: string | null;
  sortOrder: number;
}

// ─── Inline Edit Row ──────────────────────────────────────────────────────────
function EditRow({
  size,
  onSave,
  onCancel,
}: {
  size: PackageSize;
  onSave: (data: Partial<PackageSize>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(size.name);
  const [lengthCm, setLengthCm] = useState(size.lengthCm ?? "");
  const [widthCm, setWidthCm] = useState(size.widthCm ?? "");
  const [heightCm, setHeightCm] = useState(size.heightCm ?? "");
  const [weightKg, setWeightKg] = useState(size.weightKg ?? "");

  return (
    <div className="flex flex-wrap items-center gap-2 py-2 px-3 bg-muted/40 rounded-lg">
      <Input className="w-36 h-8 text-sm" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <Input className="w-20 h-8 text-sm" placeholder="L (cm)" type="number" value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} />
      <Input className="w-20 h-8 text-sm" placeholder="W (cm)" type="number" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} />
      <Input className="w-20 h-8 text-sm" placeholder="H (cm)" type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
      <Input className="w-20 h-8 text-sm" placeholder="Wt (kg)" type="number" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
      <div className="flex gap-1 ml-auto">
        <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700"
          onClick={() => onSave({ name: name.trim() || size.name, lengthCm: lengthCm || null, widthCm: widthCm || null, heightCm: heightCm || null, weightKg: weightKg || null })}>
          <Check className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onCancel}><X className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}

// ─── Add Row ──────────────────────────────────────────────────────────────────
function AddRow({ clientId, clientName }: { clientId: number; clientName: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [widthCm, setWidthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const utils = trpc.useUtils();
  const createMutation = trpc.smallParcel.createPackageSize.useMutation({
    onSuccess: () => {
      toast.success("Package size added");
      setName(""); setLengthCm(""); setWidthCm(""); setHeightCm(""); setWeightKg(""); setOpen(false);
      utils.smallParcel.listAllPackageSizes.invalidate();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => setOpen(true)}>
        <Plus className="w-3.5 h-3.5" /> Add custom size
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 py-2 px-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
      <Input className="w-36 h-8 text-sm" placeholder="Name *" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <Input className="w-20 h-8 text-sm" placeholder="L (cm)" type="number" value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} />
      <Input className="w-20 h-8 text-sm" placeholder="W (cm)" type="number" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} />
      <Input className="w-20 h-8 text-sm" placeholder="H (cm)" type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
      <Input className="w-20 h-8 text-sm" placeholder="Wt (kg)" type="number" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
      <div className="flex gap-1 ml-auto">
        <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700"
          disabled={!name.trim() || createMutation.status === "pending"}
          onClick={() => createMutation.mutate({
            clientId, clientName, name: name.trim(),
            lengthCm: lengthCm ? parseFloat(lengthCm) : undefined,
            widthCm: widthCm ? parseFloat(widthCm) : undefined,
            heightCm: heightCm ? parseFloat(heightCm) : undefined,
            weightKg: weightKg ? parseFloat(weightKg) : undefined,
          })}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setOpen(false)}><X className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}

// ─── Packaging Type Toggle Card ───────────────────────────────────────────────
function PackagingTypeCard({
  label,
  subtext,
  enabled,
  onToggle,
  pending,
  icon,
}: {
  label: string;
  subtext?: string;
  enabled: boolean;
  onToggle: () => void;
  pending: boolean;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all w-full
        ${enabled
          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30"
          : "border-border bg-background hover:bg-muted/40 opacity-60 hover:opacity-80"
        }
        ${pending ? "opacity-50 cursor-wait" : "cursor-pointer"}
      `}
    >
      <div className={`shrink-0 ${enabled ? "text-blue-600" : "text-muted-foreground"}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{label}</div>
        {subtext && <div className="text-xs text-muted-foreground truncate">{subtext}</div>}
      </div>
      <div className="shrink-0">
        {enabled
          ? <CheckCircle2 className="w-5 h-5 text-blue-600" />
          : <Circle className="w-5 h-5 text-muted-foreground/40" />
        }
      </div>
    </button>
  );
}

// ─── Extensiv Packaging + Toggle Section ─────────────────────────────────────
function ExtensivPackagingSection({
  configId,
  clientId,
  clientName,
}: {
  configId: number;
  clientId: number;
  clientName: string;
}) {
  const utils = trpc.useUtils();

  // Fetch Extensiv packaging types
  const { data: extData, isLoading: extLoading, error: extError, refetch, isFetching } =
    trpc.smallParcel.getExtensivPackaging.useQuery(
      { configId, clientId },
      { enabled: configId > 0 && clientId > 0, staleTime: 5 * 60 * 1000 }
    );

  // Fetch enabled state from DB
  const { data: enabledRows = [], isLoading: enabledLoading } =
    trpc.smallParcel.getClientPackagingEnabled.useQuery(
      { configId, clientId },
      { enabled: configId > 0 && clientId > 0 }
    );

  // Build a lookup: "category:typeName" → enabled
  const enabledMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const row of enabledRows) {
      m.set(`${row.category}:${row.typeName}`, row.enabled);
    }
    return m;
  }, [enabledRows]);

  // Track pending toggles
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  const toggleMutation = trpc.smallParcel.setClientPackagingEnabled.useMutation({
    onSuccess: () => {
      utils.smallParcel.getClientPackagingEnabled.invalidate({ configId, clientId });
    },
    onError: (err) => toast.error(`Failed to update: ${err.message}`),
    onSettled: (_data, _err, variables) => {
      const key = `${variables.category}:${variables.typeName}`;
      setPendingKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
    },
  });

  const handleToggle = (category: "package_unit" | "pallet", typeName: string, currentEnabled: boolean) => {
    const key = `${category}:${typeName}`;
    setPendingKeys((prev) => new Set(prev).add(key));
    toggleMutation.mutate({
      configId,
      clientId,
      clientName,
      category,
      typeName,
      enabled: !currentEnabled,
    });
  };

  if (extLoading || enabledLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading packaging from Extensiv…</span>
      </div>
    );
  }

  if (extError) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-destructive">
        <p className="text-sm">Failed to load: {extError.message}</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  if (!extData) return null;

  const { packageUnits, palletTypes, totalItems } = extData;
  const enabledCount = enabledRows.filter((r) => r.enabled).length;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{clientName}</h2>
          <p className="text-xs text-muted-foreground">
            {totalItems.toLocaleString()} SKUs · {enabledCount} packaging type{enabledCount !== 1 ? "s" : ""} enabled
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Instruction banner */}
      <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        <strong>Click to enable/disable</strong> — enabled types appear as buttons in Pack &amp; Ship and QC.
      </div>

      {/* Package Units */}
      {packageUnits.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BoxIcon className="w-4 h-4 text-blue-600" />
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Package Units</h3>
            <Badge variant="secondary">{packageUnits.length}</Badge>
          </div>
          <div className="flex flex-col gap-2">
            {packageUnits.map((pkg) => {
              const key = `package_unit:${pkg.unitName}`;
              const isEnabled = enabledMap.get(key) ?? false;
              const isPending = pendingKeys.has(key);
              const dimStr = [pkg.imperial.length, pkg.imperial.width, pkg.imperial.height].filter(Boolean).join(" × ");
              const subParts = [];
              if (pkg.inventoryUnitsPerUnit && pkg.inventoryUnitsPerUnit > 0) subParts.push(`${pkg.inventoryUnitsPerUnit} units/pkg`);
              if (dimStr) subParts.push(`${dimStr} in`);
              if (pkg.imperial.weight) subParts.push(`${pkg.imperial.weight} lbs`);
              subParts.push(`${pkg.skuCount} SKU${pkg.skuCount !== 1 ? "s" : ""}`);
              return (
                <PackagingTypeCard
                  key={pkg.unitName}
                  label={pkg.unitName}
                  subtext={subParts.join(" · ")}
                  enabled={isEnabled}
                  onToggle={() => handleToggle("package_unit", pkg.unitName, isEnabled)}
                  pending={isPending}
                  icon={<Package className="w-4 h-4" />}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Pallet Types */}
      {palletTypes.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-4 h-4 text-amber-600" />
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Pallet Types</h3>
            <Badge variant="secondary">{palletTypes.length}</Badge>
          </div>
          <div className="flex flex-col gap-2">
            {palletTypes.map((pallet) => {
              const key = `pallet:${pallet.palletName}`;
              const isEnabled = enabledMap.get(key) ?? false;
              const isPending = pendingKeys.has(key);
              const dimStr = [pallet.imperial.length, pallet.imperial.width, pallet.imperial.height].filter(Boolean).join(" × ");
              const subParts = [];
              if (pallet.qtyPerPallet && pallet.qtyPerPallet > 0) subParts.push(`${pallet.qtyPerPallet} units/pallet`);
              if (dimStr) subParts.push(`${dimStr} in`);
              if (pallet.imperial.weight) subParts.push(`${pallet.imperial.weight} lbs`);
              subParts.push(`${pallet.skuCount} SKU${pallet.skuCount !== 1 ? "s" : ""}`);
              return (
                <PackagingTypeCard
                  key={pallet.palletName}
                  label={pallet.palletName}
                  subtext={subParts.join(" · ")}
                  enabled={isEnabled}
                  onToggle={() => handleToggle("pallet", pallet.palletName, isEnabled)}
                  pending={isPending}
                  icon={<Layers className="w-4 h-4" />}
                />
              );
            })}
          </div>
        </div>
      )}

      {packageUnits.length === 0 && palletTypes.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">No packaging types found in Extensiv for this client.</p>
      )}
    </div>
  );
}

// ─── Custom Package Sizes Section ─────────────────────────────────────────────
function CustomPackageSizesSection({ clientId, clientName, sizes }: { clientId: number; clientName: string; sizes: PackageSize[] }) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const deleteMutation = trpc.smallParcel.deletePackageSize.useMutation({
    onSuccess: () => { toast.success("Deleted"); utils.smallParcel.listAllPackageSizes.invalidate(); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
  const updateMutation = trpc.smallParcel.updatePackageSize.useMutation({
    onSuccess: () => { toast.success("Updated"); setEditingId(null); utils.smallParcel.listAllPackageSizes.invalidate(); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Package className="w-4 h-4 text-green-600" />
        <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Custom Pack &amp; Ship Sizes</h3>
        <Badge variant="secondary">{sizes.length}</Badge>
      </div>
      <div className="flex flex-col gap-2">
        {sizes.length === 0 && (
          <p className="text-sm text-muted-foreground py-1 pl-1">No custom sizes for this client.</p>
        )}
        {sizes.map((size) =>
          editingId === size.id ? (
            <EditRow key={size.id} size={size}
              onSave={(data) => updateMutation.mutate({ id: size.id, name: data.name, lengthCm: data.lengthCm ? parseFloat(data.lengthCm) : null, widthCm: data.widthCm ? parseFloat(data.widthCm) : null, heightCm: data.heightCm ? parseFloat(data.heightCm) : null, weightKg: data.weightKg ? parseFloat(data.weightKg) : null })}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div key={size.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/40 group">
              <Package className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="font-medium text-sm">{size.name}</span>
              {(size.lengthCm || size.widthCm || size.heightCm) && (
                <span className="text-xs text-muted-foreground">{[size.lengthCm, size.widthCm, size.heightCm].filter(Boolean).join(" × ")} cm</span>
              )}
              {size.weightKg && <span className="text-xs text-muted-foreground">{size.weightKg} kg</span>}
              <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(size.id)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => { if (confirm(`Delete "${size.name}"?`)) deleteMutation.mutate({ id: size.id }); }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )
        )}
        <AddRow clientId={clientId} clientName={clientName} />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SmallParcelPackageSizes() {
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);

  const { data: configs } = trpc.config.list.useQuery();
  const configId = configs?.[0]?.id ?? 0;

  // Fetch all Extensiv customers
  const { data: customers = [], isLoading: customersLoading } = trpc.extensiv.customers.useQuery(
    { configId },
    { enabled: configId > 0 }
  );

  // Fetch last-order-date per client (for graying out inactive)
  const { data: lastOrderDates = [] } = trpc.smallParcel.getLastOrderDatesPerClient.useQuery(
    { configId },
    { enabled: configId > 0, staleTime: 5 * 60 * 1000 }
  );

  // Build a lookup: clientId → Date
  const lastOrderMap = useMemo(() => {
    const m = new Map<number, Date>();
    for (const row of lastOrderDates) {
      m.set(row.clientId, new Date(row.lastOrderDate));
    }
    return m;
  }, [lastOrderDates]);

  // 60-day cutoff
  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 60);
    return d;
  }, []);

  // Fetch custom package sizes from DB
  const { data: allSizes = [] } = trpc.smallParcel.listAllPackageSizes.useQuery();

  // Sort customers alphabetically, active first then inactive
  const sortedCustomers = useMemo(() => {
    return [...customers].sort((a, b) => {
      const aActive = (lastOrderMap.get(a.id) ?? new Date(0)) >= cutoff;
      const bActive = (lastOrderMap.get(b.id) ?? new Date(0)) >= cutoff;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [customers, lastOrderMap, cutoff]);

  // Filter by search
  const filteredCustomers = useMemo(() => {
    if (!search.trim()) return sortedCustomers;
    const q = search.toLowerCase();
    return sortedCustomers.filter((c) => c.name.toLowerCase().includes(q));
  }, [sortedCustomers, search]);

  // Selected customer info
  const selectedCustomer = customers.find((c) => c.id === selectedClientId) ?? null;

  // Custom sizes for selected client
  const customSizesForSelected = useMemo(() => {
    if (selectedClientId === null) return [];
    return allSizes.filter((s) => s.clientId === selectedClientId);
  }, [allSizes, selectedClientId]);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* ── Left Panel: Client List ── */}
      <div className="w-72 shrink-0 border-r flex flex-col bg-background">
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
              <Package className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight">Package Sizes</h1>
              <p className="text-xs text-muted-foreground">Select a client</p>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Search clients…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Client list */}
        <div className="flex-1 overflow-y-auto py-2">
          {customersLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : filteredCustomers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No clients found</p>
          ) : (
            filteredCustomers.map((customer) => {
              const isSelected = customer.id === selectedClientId;
              const lastOrder = lastOrderMap.get(customer.id);
              const isActive = lastOrder != null && lastOrder >= cutoff;
              const customCount = allSizes.filter((s) => s.clientId === customer.id).length;

              return (
                <button
                  key={customer.id}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-muted/60
                    ${isSelected ? "bg-blue-50 dark:bg-blue-900/20 border-r-2 border-blue-600" : ""}
                    ${!isActive ? "opacity-40" : ""}
                  `}
                  onClick={() => setSelectedClientId(customer.id)}
                >
                  <span className={`flex-1 text-sm truncate ${isSelected ? "font-semibold text-blue-700 dark:text-blue-400" : ""}`}>
                    {customer.name}
                  </span>
                  {customCount > 0 && (
                    <Badge variant="secondary" className="text-xs shrink-0">{customCount}</Badge>
                  )}
                  {isSelected && <ChevronRight className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t text-xs text-muted-foreground text-center">
          {filteredCustomers.length} of {sortedCustomers.length} clients
          {" · "}
          <span className="opacity-50">faded = no orders in 60d</span>
        </div>
      </div>

      {/* ── Right Panel: Packaging Detail ── */}
      <div className="flex-1 overflow-y-auto">
        {!selectedCustomer ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Package className="w-12 h-12 opacity-20" />
            <p className="text-sm">Select a client to view and configure their packaging types</p>
          </div>
        ) : (
          <div className="p-6 max-w-2xl flex flex-col gap-6">
            {/* Extensiv packaging with toggle */}
            {configId > 0 ? (
              <ExtensivPackagingSection
                configId={configId}
                clientId={selectedCustomer.id}
                clientName={selectedCustomer.name}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No Extensiv config found.</p>
            )}

            {/* Divider */}
            <div className="border-t" />

            {/* Custom Pack & Ship sizes from DB */}
            <CustomPackageSizesSection
              clientId={selectedCustomer.id}
              clientName={selectedCustomer.name}
              sizes={customSizesForSelected}
            />
          </div>
        )}
      </div>
    </div>
  );
}

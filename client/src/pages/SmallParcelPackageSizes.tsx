import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
function AddRow({ clientId, clientName, onAdded }: { clientId: number; clientName: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [widthCm, setWidthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const utils = trpc.useUtils();
  const createMutation = trpc.smallParcel.createPackageSize.useMutation({
    onSuccess: () => { toast.success("Package size added"); setName(""); setLengthCm(""); setWidthCm(""); setHeightCm(""); setWeightKg(""); setOpen(false); utils.smallParcel.listAllPackageSizes.invalidate(); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => setOpen(true)}>
        <Plus className="w-3.5 h-3.5" /> Add size
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
          onClick={() => createMutation.mutate({ clientId, clientName, name: name.trim(), lengthCm: lengthCm ? parseFloat(lengthCm) : undefined, widthCm: widthCm ? parseFloat(widthCm) : undefined, heightCm: heightCm ? parseFloat(heightCm) : undefined, weightKg: weightKg ? parseFloat(weightKg) : undefined })}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setOpen(false)}><X className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}

// ─── Extensiv Packaging Detail Panel ─────────────────────────────────────────
function ExtensivPackagingDetail({ configId, clientId, clientName }: { configId: number; clientId: number; clientName: string }) {
  const { data, isLoading, error, refetch, isFetching } = trpc.smallParcel.getExtensivPackaging.useQuery(
    { configId, clientId },
    { enabled: configId > 0 && clientId > 0, staleTime: 5 * 60 * 1000 }
  );

  if (isLoading || isFetching) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <span className="text-sm">Loading packaging from Extensiv…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-destructive">
        <p className="text-sm">Failed to load packaging: {error.message}</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  if (!data) return null;

  const { packageUnits, palletTypes, totalItems } = data;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{clientName}</h2>
          <p className="text-xs text-muted-foreground">{totalItems.toLocaleString()} SKUs in Extensiv</p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Package Units */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <BoxIcon className="w-4 h-4 text-blue-600" />
          <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Package Units</h3>
          <Badge variant="secondary">{packageUnits.length}</Badge>
        </div>
        {packageUnits.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2 pl-6">No package units configured.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {packageUnits.map((pkg) => (
              <div key={pkg.unitName} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <Package className="w-4 h-4 text-blue-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{pkg.unitName}</span>
                    {pkg.isPrepackaged && (
                      <Badge variant="outline" className="text-xs py-0">Pre-packed</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-0.5">
                    {pkg.inventoryUnitsPerUnit != null && pkg.inventoryUnitsPerUnit > 0 && (
                      <span className="text-xs text-muted-foreground">{pkg.inventoryUnitsPerUnit} units/pkg</span>
                    )}
                    {(pkg.imperial.length || pkg.imperial.width || pkg.imperial.height) && (
                      <span className="text-xs text-muted-foreground">
                        {[pkg.imperial.length, pkg.imperial.width, pkg.imperial.height].filter(Boolean).join(" × ")} in
                      </span>
                    )}
                    {pkg.imperial.weight && (
                      <span className="text-xs text-muted-foreground">{pkg.imperial.weight} lbs</span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{pkg.skuCount} SKU{pkg.skuCount !== 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pallet Types */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-amber-600" />
          <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Pallet Types</h3>
          <Badge variant="secondary">{palletTypes.length}</Badge>
        </div>
        {palletTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2 pl-6">No pallet types configured.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {palletTypes.map((pallet) => (
              <div key={pallet.palletName} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors">
                <Layers className="w-4 h-4 text-amber-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm">{pallet.palletName}</span>
                  <div className="flex flex-wrap gap-3 mt-0.5">
                    {pallet.qtyPerPallet != null && pallet.qtyPerPallet > 0 && (
                      <span className="text-xs text-muted-foreground">{pallet.qtyPerPallet} units/pallet</span>
                    )}
                    {(pallet.imperial.length || pallet.imperial.width || pallet.imperial.height) && (
                      <span className="text-xs text-muted-foreground">
                        {[pallet.imperial.length, pallet.imperial.width, pallet.imperial.height].filter(Boolean).join(" × ")} in
                      </span>
                    )}
                    {pallet.imperial.weight && (
                      <span className="text-xs text-muted-foreground">{pallet.imperial.weight} lbs</span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{pallet.skuCount} SKU{pallet.skuCount !== 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
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
          <p className="text-sm text-muted-foreground py-1 pl-6">No custom sizes configured for this client.</p>
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
        <AddRow clientId={clientId} clientName={clientName} onAdded={() => {}} />
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

  // Fetch custom package sizes from DB
  const { data: allSizes = [] } = trpc.smallParcel.listAllPackageSizes.useQuery();

  // Build sorted customer list (alphabetical)
  const sortedCustomers = useMemo(() => {
    return [...customers].sort((a, b) => a.name.localeCompare(b.name));
  }, [customers]);

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
              const customCount = allSizes.filter((s) => s.clientId === customer.id).length;
              return (
                <button
                  key={customer.id}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-muted/60 ${isSelected ? "bg-blue-50 dark:bg-blue-900/20 border-r-2 border-blue-600" : ""}`}
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

        {/* Footer: total count */}
        <div className="p-3 border-t text-xs text-muted-foreground text-center">
          {filteredCustomers.length} of {sortedCustomers.length} clients
        </div>
      </div>

      {/* ── Right Panel: Packaging Detail ── */}
      <div className="flex-1 overflow-y-auto">
        {!selectedCustomer ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Package className="w-12 h-12 opacity-20" />
            <p className="text-sm">Select a client to view their packaging options</p>
          </div>
        ) : (
          <div className="p-6 max-w-2xl flex flex-col gap-6">
            {/* Extensiv packaging from API */}
            {configId > 0 ? (
              <ExtensivPackagingDetail
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

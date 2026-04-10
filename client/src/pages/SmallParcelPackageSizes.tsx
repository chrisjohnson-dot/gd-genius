import { useState, useMemo } from "react";
import { useUnitSystem } from "@/hooks/useUnitSystem";
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
  ChevronLeft,
  Search,
  Layers,
  BoxIcon,
  RefreshCw,
  CheckCircle2,
  Circle,
  Mail,
  Ruler,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Classify a package unit name into Envelopes, Boxes, or null (pallet handled separately) */
function classifyPackageUnit(name: string): "envelope" | "box" {
  const lower = name.toLowerCase();
  if (
    lower.includes("envelope") ||
    lower.includes("mailer") ||
    lower.includes("poly") ||
    lower.includes("flat") ||
    lower.includes("padded") ||
    lower.includes("bubble")
  ) {
    return "envelope";
  }
  return "box";
}

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

type CategoryView = "root" | "envelope" | "box" | "pallet";

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
      toast.success("Added");
      setOpen(false);
      setName(""); setLengthCm(""); setWidthCm(""); setHeightCm(""); setWeightKg("");
      utils.smallParcel.listAllPackageSizes.invalidate();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  if (!open) {
    return (
      <button
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground py-2 px-3 rounded-lg hover:bg-muted/40 transition-colors w-full"
        onClick={() => setOpen(true)}
      >
        <Plus className="w-4 h-4" /> Add custom size
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 py-2 px-3 bg-muted/40 rounded-lg">
      <Input className="w-36 h-8 text-sm" placeholder="Name *" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <Input className="w-20 h-8 text-sm" placeholder="L (cm)" type="number" value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} />
      <Input className="w-20 h-8 text-sm" placeholder="W (cm)" type="number" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} />
      <Input className="w-20 h-8 text-sm" placeholder="H (cm)" type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
      <Input className="w-20 h-8 text-sm" placeholder="Wt (kg)" type="number" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
      <div className="flex gap-1 ml-auto">
        <Button size="sm" className="h-8"
          onClick={() => {
            if (!name.trim()) { toast.error("Name is required"); return; }
            createMutation.mutate({ clientId, clientName, name: name.trim(), lengthCm: lengthCm ? parseFloat(lengthCm) : undefined, widthCm: widthCm ? parseFloat(widthCm) : undefined, heightCm: heightCm ? parseFloat(heightCm) : undefined, weightKg: weightKg ? parseFloat(weightKg) : undefined });
          }}
          disabled={createMutation.isPending}
        >Save</Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setOpen(false)}><X className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}

// ─── Packaging Type Card ──────────────────────────────────────────────────────
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

// ─── Category Tile ────────────────────────────────────────────────────────────
function CategoryTile({
  label,
  icon,
  count,
  enabledCount,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  count: number;
  enabledCount: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-4 px-5 py-4 rounded-2xl border-2 border-border bg-background hover:bg-muted/40 hover:border-blue-400 transition-all text-left w-full group"
    >
      <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-base">{label}</div>
        <div className="text-xs text-muted-foreground">
          {count} option{count !== 1 ? "s" : ""}{" "}
          {enabledCount > 0 && (
            <span className="text-blue-600 font-medium">· {enabledCount} enabled</span>
          )}
        </div>
      </div>
      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-blue-600 transition-colors shrink-0" />
    </button>
  );
}

//// ─── Category Detail Panel ────────────────────────────────────────────
function CategoryDetailPanel({
  configId,
  clientId,
  clientName,
  category,
  onBack,
}: {
  configId: number;
  clientId: number;
  clientName: string;
  category: CategoryView;
  onBack: () => void;
}) {
  const utils = trpc.useUtils();
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  // Own the queries directly so invalidation triggers immediate re-render
  const { data: inventoryItems = [], isLoading: invLoading } =
    trpc.smallParcel.listPackagingInventory.useQuery(
      { configId },
      { enabled: configId > 0 }
    );

  const { data: enabledRows = [], isLoading: enabledLoading } =
    trpc.smallParcel.getClientPackagingEnabled.useQuery(
      { configId, clientId, clientName },
      { enabled: configId > 0 && clientId > 0 }
    );

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

  const enabledMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const row of enabledRows) {
      m.set(`${row.category}:${row.typeName}`, row.enabled);
    }
    return m;
  }, [enabledRows]);

  const handleToggle = (cat: "package_unit" | "pallet", typeName: string, currentEnabled: boolean) => {
    const key = `${cat}:${typeName}`;
    setPendingKeys((prev) => new Set(prev).add(key));
    toggleMutation.mutate({ configId, clientId, clientName, category: cat, typeName, enabled: !currentEnabled });
  };

  // Filter inventory items for this category
  const categoryItems = useMemo(() => {
    return inventoryItems
      .filter((item) => item.category === category)
      .sort((a, b) => {
        const aDbCat = category === "pallet" ? "pallet" : "package_unit";
        const aEnabled = enabledMap.get(`${aDbCat}:${a.name}`) ?? false;
        const bEnabled = enabledMap.get(`${aDbCat}:${b.name}`) ?? false;
        if (aEnabled !== bEnabled) return aEnabled ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [inventoryItems, category, enabledMap]);

  const categoryLabel = category === "envelope" ? "Envelopes" : category === "box" ? "Boxes" : "Pallets";
  const categoryIcon = category === "envelope" ? <Mail className="w-4 h-4" /> : category === "box" ? <BoxIcon className="w-4 h-4" /> : <Layers className="w-4 h-4" />;
  const dbCat = category === "pallet" ? "pallet" : "package_unit";
  const enabledCount = categoryItems.filter((i) => enabledMap.get(`${dbCat}:${i.name}`) ?? false).length;

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const deleteMutation = trpc.smallParcel.deletePackagingInventoryItem.useMutation({
    onMutate: async (variables) => {
      // Optimistic: remove from inventory cache immediately
      await utils.smallParcel.listPackagingInventory.cancel({ configId });
      const prev = utils.smallParcel.listPackagingInventory.getData({ configId });
      utils.smallParcel.listPackagingInventory.setData({ configId }, (old) =>
        (old ?? []).filter((i) => i.id !== variables.id)
      );
      return { prev };
    },
    onSuccess: () => {
      toast.success("Custom type deleted from inventory.");
      utils.smallParcel.listPackagingInventory.invalidate({ configId });
      utils.smallParcel.getClientPackagingEnabled.invalidate({ configId, clientId });
    },
    onError: (err, _vars, context) => {
      toast.error(`Delete failed: ${err.message}`);
      if (context?.prev !== undefined) {
        utils.smallParcel.listPackagingInventory.setData({ configId }, context.prev);
      }
    },
    onSettled: () => setConfirmDeleteId(null),
  });

  const [searchQuery, setSearchQuery] = useState("");
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return categoryItems;
    return categoryItems.filter((i) => i.name.toLowerCase().includes(q));
  }, [categoryItems, searchQuery]);

  if (invLoading || enabledLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading packaging types…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={onBack}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="text-blue-600">{categoryIcon}</div>
          <div>
            <h2 className="text-lg font-semibold leading-tight">{categoryLabel}</h2>
            <p className="text-xs text-muted-foreground">
              {categoryItems.length} option{categoryItems.length !== 1 ? "s" : ""} · {enabledCount} enabled for {clientName}
            </p>
          </div>
        </div>
      </div>

      {/* Instruction */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
        <strong>Click to enable/disable</strong> — enabled types appear as options in Pack &amp; Ship and QC.
      </div>

      {/* Search bar */}
      {categoryItems.length > 5 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder={`Search ${categoryLabel.toLowerCase()}…`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearchQuery("")}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Items grid */}
      {filteredItems.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-border p-8 text-center text-muted-foreground">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">
            {searchQuery ? `No results for "${searchQuery}"` : `No ${categoryLabel.toLowerCase()} in inventory`}
          </p>
          {!searchQuery && (
            <p className="text-xs mt-1">Go to Packaging → Packaging Inventory to add {categoryLabel.toLowerCase()}.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {filteredItems.map((item) => {
            const key = `${dbCat}:${item.name}`;
            const isEnabled = enabledMap.get(key) ?? false;
            const isPending = pendingKeys.has(key);
            const icon = category === "pallet"
              ? <Layers className="w-4 h-4" />
              : category === "envelope"
                ? <Mail className="w-4 h-4" />
                : <BoxIcon className="w-4 h-4" />;
            const stockBadge = item.onHandQty > 0
              ? <span className="text-xs text-green-600 font-medium">{item.onHandQty} in stock</span>
              : <span className="text-xs text-red-500 font-medium">Out of stock</span>;
            const isConfirmingDelete = confirmDeleteId === item.id;
            return (
              <div key={key} className="relative group">
                <button
                  type="button"
                  disabled={isPending || deleteMutation.isPending}
                  onClick={() => !isConfirmingDelete && handleToggle(dbCat, item.name, isEnabled)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all w-full ${
                    isEnabled
                      ? "border-blue-500 bg-blue-50 shadow-sm"
                      : "border-border bg-white hover:border-blue-300 hover:bg-blue-50/40"
                  } ${isPending ? "opacity-60 cursor-wait" : "cursor-pointer"} ${item.isCustom ? "pr-10" : ""}`}
                >
                  <div className={`shrink-0 ${isEnabled ? "text-blue-600" : "text-muted-foreground"}`}>{icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-sm font-medium truncate ${isEnabled ? "text-blue-900" : "text-foreground"}`}>{item.name}</p>
                      {item.isCustom && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 shrink-0">custom</span>
                      )}
                    </div>
                    <div className="mt-0.5">{stockBadge}</div>
                  </div>
                  {isEnabled && (
                    <div className="shrink-0 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>

                {/* Trash icon — only on custom items */}
                {item.isCustom && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {isConfirmingDelete ? (
                      <>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); deleteMutation.mutate({ id: item.id, configId }); }}
                          disabled={deleteMutation.isPending}
                          className="text-[10px] font-semibold px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600 transition-colors"
                        >
                          {deleteMutation.isPending ? "…" : "Delete"}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                          className="text-[10px] font-semibold px-2 py-1 rounded bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(item.id); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50"
                        title="Delete custom type"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add custom type */}
      <AddCustomTypeForm
        configId={configId}
        clientId={clientId}
        clientName={clientName}
        invCategory={category as "envelope" | "box" | "pallet"}
        dbCategory={dbCat}
        categoryLabel={categoryLabel}
        onAdded={(newName) => {
          const key = `${dbCat}:${newName}`;
          setPendingKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
        }}
      />
    </div>
  );
}

// ─── Add Custom Type Form ────────────────────────────────────────────────────
function AddCustomTypeForm({
  configId,
  clientId,
  clientName,
  invCategory,
  dbCategory,
  categoryLabel,
  onAdded,
}: {
  configId: number;
  clientId: number;
  clientName: string;
  /** The inventory category for this panel — always correct, never guessed from name */
  invCategory: "envelope" | "box" | "pallet";
  dbCategory: "package_unit" | "pallet";
  categoryLabel: string;
  onAdded: (typeName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [typeName, setTypeName] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [dimUnit, setDimUnit] = useState<"in" | "cm">("in");
  const utils = trpc.useUtils();

  // Read the live inventory cache to detect duplicates as the user types
  const inventoryCache = utils.smallParcel.listPackagingInventory.getData({ configId }) ?? [];

  // Build the full name the same way handleSave does (without dimensions, just the base name check)
  const trimmedName = typeName.trim().toLowerCase();
  const isDuplicate = trimmedName.length > 0 && inventoryCache.some(
    (item) => item.category === invCategory && item.name.trim().toLowerCase() === trimmedName
  );

  const reset = () => {
    setTypeName(""); setLength(""); setWidth(""); setHeight(""); setWeight(""); setDimUnit("in");
    setOpen(false);
  };

  // Convert cm to inches for storage (we always store in inches)
  const toInches = (val: string) => {
    const n = parseFloat(val);
    if (isNaN(n)) return "";
    return dimUnit === "cm" ? (n / 2.54).toFixed(2) : val;
  };

  // Add custom type: inserts into packaging_inventory AND enables for this client
  const addMutation = trpc.smallParcel.addCustomPackagingType.useMutation({
    onMutate: async (variables) => {
      // Optimistic update: inject the new item directly into the cache immediately
      await utils.smallParcel.listPackagingInventory.cancel({ configId });
      await utils.smallParcel.getClientPackagingEnabled.cancel({ configId, clientId });

      const prevInventory = utils.smallParcel.listPackagingInventory.getData({ configId });
      const prevEnabled = utils.smallParcel.getClientPackagingEnabled.getData({ configId, clientId });

      // Add item to inventory cache
      utils.smallParcel.listPackagingInventory.setData({ configId }, (old) => [
        ...(old ?? []),
        {
          id: -1, // temp id
          configId,
          facilityId: 0,
          name: variables.typeName,
          category: variables.category,
          unit: "each",
          onHandQty: 0,
          minStockLevel: 0,
          weeklyConsumption: 0,
          notes: null,
          isCustom: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      // Add enabled row to cache
      utils.smallParcel.getClientPackagingEnabled.setData({ configId, clientId }, (old) => [
        ...(old ?? []),
        {
          id: -1,
          configId,
          clientId,
          clientName,
          category: dbCategory,
          typeName: variables.typeName,
          enabled: true,
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      return { prevInventory, prevEnabled };
    },
    onSuccess: (_data, variables) => {
      toast.success(`"${variables.typeName}" added and enabled for ${clientName}`);
      onAdded(variables.typeName);
      reset();
      // Refetch to replace temp id with real id from DB
      utils.smallParcel.listPackagingInventory.invalidate({ configId });
      utils.smallParcel.getClientPackagingEnabled.invalidate({ configId, clientId });
      utils.smallParcel.getAllPackagingTypeNames.invalidate({ configId });
    },
    onError: (err, _variables, context) => {
      toast.error(`Failed: ${err.message}`);
      // Roll back optimistic update
      if (context?.prevInventory !== undefined) {
        utils.smallParcel.listPackagingInventory.setData({ configId }, context.prevInventory);
      }
      if (context?.prevEnabled !== undefined) {
        utils.smallParcel.getClientPackagingEnabled.setData({ configId, clientId }, context.prevEnabled);
      }
    },
  });

  const handleSave = () => {
    const name = typeName.trim();
    if (!name) { toast.error("Name is required"); return; }
    // Build a descriptive name including dimensions if provided (always stored in inches)
    const lIn = toInches(length); const wIn = toInches(width); const hIn = toInches(height);
    const dims = [lIn, wIn, hIn].filter(Boolean);
    const dimSuffix = dims.length === 3 ? ` (${dims[0]}×${dims[1]}×${dims[2]} in)` : dims.length > 0 ? ` (${dims.join("×")} in)` : "";
    const fullName = name.includes("×") || name.includes("x") ? name : `${name}${dimSuffix}`;
    // Use invCategory directly — it's the panel's category, always correct
    addMutation.mutate({ configId, clientId, clientName, category: invCategory, typeName: fullName });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground py-3 px-4 rounded-xl border-2 border-dashed border-border hover:border-blue-400 hover:bg-muted/30 transition-all w-full"
      >
        <Plus className="w-4 h-4" />
        Add custom {categoryLabel.toLowerCase().replace(/s$/, "")} type…
      </button>
    );
  }

  return (
    <div className="rounded-xl border-2 border-blue-400 bg-blue-50 p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-blue-900">Add custom {categoryLabel.toLowerCase().replace(/s$/, "")} type</p>
        <button type="button" onClick={reset} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Name */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Name <span className="text-red-500">*</span></label>
        <Input
          className={`h-9 text-sm bg-white ${isDuplicate ? "border-red-400 focus-visible:ring-red-400" : ""}`}
          placeholder={`e.g. "Auto-Bagger Envelope" or "Custom 12×10×8 Box"`}
          value={typeName}
          onChange={(e) => setTypeName(e.target.value)}
          autoFocus
        />
        {isDuplicate && (
          <p className="text-xs text-red-600 flex items-center gap-1">
            <X className="w-3 h-3 shrink-0" />
            A {categoryLabel.toLowerCase().replace(/s$/, "")} with this name already exists — choose a different name.
          </p>
        )}
      </div>

      {/* Dimensions */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">Dimensions — optional</label>
          <div className="flex rounded-md border border-border overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setDimUnit("in")}
              className={`px-2.5 py-1 font-medium transition-colors ${
                dimUnit === "in" ? "bg-blue-500 text-white" : "bg-white text-muted-foreground hover:bg-muted"
              }`}
            >in</button>
            <button
              type="button"
              onClick={() => setDimUnit("cm")}
              className={`px-2.5 py-1 font-medium transition-colors ${
                dimUnit === "cm" ? "bg-blue-500 text-white" : "bg-white text-muted-foreground hover:bg-muted"
              }`}
            >cm</button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground text-center">Length</span>
            <Input className="h-9 text-sm text-center bg-white" placeholder="L" value={length} onChange={(e) => setLength(e.target.value)} />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground text-center">Width</span>
            <Input className="h-9 text-sm text-center bg-white" placeholder="W" value={width} onChange={(e) => setWidth(e.target.value)} />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground text-center">Height</span>
            <Input className="h-9 text-sm text-center bg-white" placeholder="H" value={height} onChange={(e) => setHeight(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Weight */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Max weight (lbs) — optional</label>
        <Input className="h-9 text-sm bg-white" placeholder="e.g. 2.5" value={weight} onChange={(e) => setWeight(e.target.value)} />
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={reset} disabled={addMutation.isPending}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={addMutation.isPending || !typeName.trim() || isDuplicate} className="gap-1.5">
          {addMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Save
        </Button>
      </div>
    </div>
  );
}

// ─── Extensiv Packaging Section (three-category root + drill-down) ────────────
function ExtensivPackagingSection({
  configId,
  clientId,
  clientName,
}: {
  configId: number;
  clientId: number;
  clientName: string;
}) {
  const [categoryView, setCategoryView] = useState<CategoryView>("root");

  // Fetch all packaging inventory items from DB (fast, no Extensiv API call)
  const { data: inventoryItems = [], isLoading: invLoading, refetch: invRefetch, isFetching: invFetching } =
    trpc.smallParcel.listPackagingInventory.useQuery(
      { configId },
      { enabled: configId > 0, staleTime: 2 * 60 * 1000 }
    );

  // Fetch enabled state from DB for this client
  const { data: enabledRows = [], isLoading: enabledLoading } =
    trpc.smallParcel.getClientPackagingEnabled.useQuery(
      { configId, clientId, clientName },
      { enabled: configId > 0 && clientId > 0 }
    );

  // Build enabled map
  const enabledMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const row of enabledRows) {
      m.set(`${row.category}:${row.typeName}`, row.enabled);
    }
    return m;
  }, [enabledRows]);

  // Count options + enabled per category for the tiles
  const categoryCounts = useMemo(() => {
    const counts = { envelope: { count: 0, enabled: 0 }, box: { count: 0, enabled: 0 }, pallet: { count: 0, enabled: 0 } };
    for (const item of inventoryItems) {
      const cat = item.category as "envelope" | "box" | "pallet";
      if (!(cat in counts)) continue;
      counts[cat].count++;
      const dbCat = cat === "pallet" ? "pallet" : "package_unit";
      if (enabledMap.get(`${dbCat}:${item.name}`)) counts[cat].enabled++;
    }
    return counts;
  }, [inventoryItems, enabledMap]);

  if (categoryView !== "root") {
    return (
      <CategoryDetailPanel
        configId={configId}
        clientId={clientId}
        clientName={clientName}
        category={categoryView}
        onBack={() => setCategoryView("root")}
      />
    );
  }

  // Root: three category tiles
  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold">{clientName}</h2>
          <p className="text-xs text-muted-foreground">Select a category to enable packaging types</p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => invRefetch()} disabled={invFetching}>
          <RefreshCw className={`w-3.5 h-3.5 ${invFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {invLoading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading packaging types…</span>
        </div>
      ) : inventoryItems.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-border p-8 text-center text-muted-foreground">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No packaging types found</p>
          <p className="text-xs mt-1">Go to Packaging → Packaging Inventory and click "Load Standard Packaging Types" to add the standard list.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <CategoryTile
            label="Envelopes"
            icon={<Mail className="w-5 h-5" />}
            count={categoryCounts.envelope.count}
            enabledCount={categoryCounts.envelope.enabled}
            onClick={() => setCategoryView("envelope")}
          />
          <CategoryTile
            label="Boxes"
            icon={<BoxIcon className="w-5 h-5" />}
            count={categoryCounts.box.count}
            enabledCount={categoryCounts.box.enabled}
            onClick={() => setCategoryView("box")}
          />
          <CategoryTile
            label="Pallets"
            icon={<Layers className="w-5 h-5" />}
            count={categoryCounts.pallet.count}
            enabledCount={categoryCounts.pallet.enabled}
            onClick={() => setCategoryView("pallet")}
          />
        </div>
      )}
    </div>
  );
}

// ─── Custom Package Sizes Section ─────────────────────────────────────────────
function CustomPackageSizesSection({ clientId, clientName, sizes }: { clientId: number; clientName: string; sizes: PackageSize[] }) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const { unit: customUnit, toggle: customToggle, fmtDims, fmtWt } = useUnitSystem();
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
        <Button size="sm" variant="outline" className="gap-1.5 ml-auto h-7 text-xs" onClick={customToggle} title={`Currently showing ${customUnit === "metric" ? "cm/kg" : "in/lbs"}`}>
          <Ruler className="w-3 h-3" />
          {customUnit === "metric" ? "in/lbs" : "cm/kg"}
        </Button>
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
                <span className="text-xs text-muted-foreground">{fmtDims(size.lengthCm, size.widthCm, size.heightCm)}</span>
              )}
              {size.weightKg && <span className="text-xs text-muted-foreground">{fmtWt(size.weightKg)}</span>}
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

  // Sort customers alphabetically
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

              return (
                <button
                  key={customer.id}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-muted/60
                    ${isSelected ? "bg-blue-50 dark:bg-blue-900/20 border-r-2 border-blue-600" : ""}
                  `}
                  onClick={() => setSelectedClientId(customer.id)}
                >
                  <span className={`flex-1 text-sm truncate ${isSelected ? "font-semibold text-blue-700 dark:text-blue-400" : ""}`}>
                    {customer.name}
                  </span>
                  {isSelected && <ChevronRight className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t text-xs text-muted-foreground text-center">
          {filteredCustomers.length} of {sortedCustomers.length} clients
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
            {/* Three-category packaging with toggle */}
            {configId > 0 ? (
              <ExtensivPackagingSection
                configId={configId}
                clientId={selectedCustomer.id}
                clientName={selectedCustomer.name}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No Extensiv config found.</p>
            )}


          </div>
        )}
      </div>
    </div>
  );
}

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

// ─── Category Detail Panel ────────────────────────────────────────────────────
function CategoryDetailPanel({
  configId,
  clientId,
  clientName,
  category,
  extData,
  extLoading,
  extError,
  extRefetch,
  extFetching,
  enabledRows,
  enabledLoading,
  globalTypeNames,
  onBack,
}: {
  configId: number;
  clientId: number;
  clientName: string;
  category: CategoryView;
  extData: {
    allPackageTypes?: Array<{ name: string; sourceField: "packageUnit" | "pallet"; unitId: number; inventoryUnitsPerUnit: number | null; isPrepackaged: boolean; imperial: { length: number | null; width: number | null; height: number | null; weight: number | null }; skuCount: number }>;
    packageUnits: Array<{ unitName: string; inventoryUnitsPerUnit: number | null; isPrepackaged: boolean; imperial: { length: number | null; width: number | null; height: number | null; weight: number | null }; skuCount: number }>;
    palletTypes: Array<{ palletName: string; qtyPerPallet: number | null; imperial: { length: number | null; width: number | null; height: number | null; weight: number | null }; skuCount: number }>;
    totalItems: number;
  } | undefined;
  extLoading: boolean;
  extError: unknown;
  extRefetch: () => void;
  extFetching: boolean;
  enabledRows: Array<{ category: string; typeName: string; enabled: boolean }>;
  enabledLoading: boolean;
  globalTypeNames: Array<{ category: string; typeName: string; clientCount: number }>;
  onBack: () => void;
}) {
  const utils = trpc.useUtils();
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
    toggleMutation.mutate({
      configId,
      clientId,
      clientName,
      category: cat,
      typeName,
      enabled: !currentEnabled,
    });
  };

  const { unit, toggle, fmtInchDims, fmtLbs, unitLabel } = useUnitSystem();

  // Build the list of items to show for this category
  type ItemEntry = {
    typeName: string;
    dbCategory: "package_unit" | "pallet";
    fromExtensiv: boolean;
    // Raw imperial dims from Extensiv (null for global-catalogue-only items)
    imperial: { l: number | null; w: number | null; h: number | null; wt: number | null } | null;
    extra: string; // non-dimension metadata (units/pallet, SKU count, etc.)
    globalClientCount?: number;
  };
  const items = useMemo(() => {
    const seen = new Set<string>();
    const result: ItemEntry[] = [];

    if (extData) {
      // Prefer allPackageTypes (flat list from new API) — fall back to legacy packageUnits/palletTypes
      const allTypes = extData.allPackageTypes;
      if (allTypes) {
        // allPackageTypes: classify each entry by name + sourceField
        for (const t of allTypes) {
          // Determine which UI category this entry belongs to
          let uiCategory: "envelope" | "box" | "pallet";
          if (t.sourceField === "pallet") {
            uiCategory = "pallet";
          } else {
            uiCategory = classifyPackageUnit(t.name);
          }
          if (uiCategory !== category) continue;
          if (seen.has(t.name)) continue;
          seen.add(t.name);
          const dbCat: "package_unit" | "pallet" = t.sourceField === "pallet" ? "pallet" : "package_unit";
          const extraParts: string[] = [];
          if (t.inventoryUnitsPerUnit && t.inventoryUnitsPerUnit > 0) extraParts.push(`${t.inventoryUnitsPerUnit} units/pkg`);
          extraParts.push(`${t.skuCount} SKU${t.skuCount !== 1 ? "s" : ""}`);
          result.push({
            typeName: t.name,
            dbCategory: dbCat,
            fromExtensiv: true,
            imperial: { l: t.imperial.length, w: t.imperial.width, h: t.imperial.height, wt: t.imperial.weight },
            extra: extraParts.join(" · "),
          });
        }
      } else {
        // Legacy fallback: use packageUnits + palletTypes
        if (category === "pallet") {
          for (const p of extData.palletTypes) {
            if (!seen.has(p.palletName)) {
              seen.add(p.palletName);
              const extraParts: string[] = [];
              if (p.qtyPerPallet && p.qtyPerPallet > 0) extraParts.push(`${p.qtyPerPallet} units/pallet`);
              extraParts.push(`${p.skuCount} SKU${p.skuCount !== 1 ? "s" : ""}`);
              result.push({
                typeName: p.palletName,
                dbCategory: "pallet",
                fromExtensiv: true,
                imperial: { l: p.imperial.length, w: p.imperial.width, h: p.imperial.height, wt: p.imperial.weight },
                extra: extraParts.join(" · "),
              });
            }
          }
        } else {
          for (const p of extData.packageUnits) {
            const cls = classifyPackageUnit(p.unitName);
            if (cls !== category) continue;
            if (!seen.has(p.unitName)) {
              seen.add(p.unitName);
              const extraParts: string[] = [];
              if (p.inventoryUnitsPerUnit && p.inventoryUnitsPerUnit > 0) extraParts.push(`${p.inventoryUnitsPerUnit} units/pkg`);
              extraParts.push(`${p.skuCount} SKU${p.skuCount !== 1 ? "s" : ""}`);
              result.push({
                typeName: p.unitName,
                dbCategory: "package_unit",
                fromExtensiv: true,
                imperial: { l: p.imperial.length, w: p.imperial.width, h: p.imperial.height, wt: p.imperial.weight },
                extra: extraParts.join(" · "),
              });
            }
          }
        }
      }
    }

    // Always supplement with global catalogue entries not already seen
    if (category === "pallet") {
      for (const g of globalTypeNames) {
        if (g.category === "pallet" && !seen.has(g.typeName)) {
          seen.add(g.typeName);
          result.push({ typeName: g.typeName, dbCategory: "pallet", fromExtensiv: false, imperial: null, extra: "", globalClientCount: g.clientCount });
        }
      }
    } else {
      for (const g of globalTypeNames) {
        if (g.category !== "package_unit") continue;
        const cls = classifyPackageUnit(g.typeName);
        if (cls !== category) continue;
        if (!seen.has(g.typeName)) {
          seen.add(g.typeName);
          result.push({ typeName: g.typeName, dbCategory: "package_unit", fromExtensiv: false, imperial: null, extra: "", globalClientCount: g.clientCount });
        }
      }
    }

    return result.sort((a, b) => {
      const aEnabled = enabledMap.get(`${a.dbCategory}:${a.typeName}`) ?? false;
      const bEnabled = enabledMap.get(`${b.dbCategory}:${b.typeName}`) ?? false;
      if (aEnabled !== bEnabled) return aEnabled ? -1 : 1;
      return a.typeName.localeCompare(b.typeName);
    });
  }, [category, extData, globalTypeNames, enabledMap]);

  const categoryLabel = category === "envelope" ? "Envelopes" : category === "box" ? "Boxes" : "Pallets";
  const categoryIcon = category === "envelope" ? <Mail className="w-4 h-4" /> : category === "box" ? <BoxIcon className="w-4 h-4" /> : <Layers className="w-4 h-4" />;
  const enabledCount = items.filter((i) => enabledMap.get(`${i.dbCategory}:${i.typeName}`) ?? false).length;

  const [searchQuery, setSearchQuery] = useState("");
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.typeName.toLowerCase().includes(q) || i.extra.toLowerCase().includes(q));
  }, [items, searchQuery]);

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
        <p className="text-sm">Failed to load Extensiv data.</p>
        <Button size="sm" variant="outline" onClick={() => extRefetch()}>Retry</Button>
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
              {items.length} option{items.length !== 1 ? "s" : ""} · {enabledCount} enabled for {clientName}
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={toggle} title={`Currently showing ${unitLabel}`}>
          <Ruler className="w-3.5 h-3.5" />
          {unit === "metric" ? "in/lbs" : "cm/kg"}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => extRefetch()} disabled={extFetching}>
          <RefreshCw className={`w-3.5 h-3.5 ${extFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Instruction */}
      <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        <strong>Click to enable/disable</strong> — enabled types appear as buttons in Pack &amp; Ship and QC.
      </div>

      {/* Search bar — shown for all categories, most useful for Boxes */}
      {items.length > 5 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder={`Search ${categoryLabel.toLowerCase()}…`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchQuery("")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Items */}
      {filteredItems.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          {searchQuery ? `No results for "${searchQuery}"` : `No ${categoryLabel.toLowerCase()} found for this client or in the global catalogue.`}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredItems.map((item) => {
            const key = `${item.dbCategory}:${item.typeName}`;
            const isEnabled = enabledMap.get(key) ?? false;
            const isPending = pendingKeys.has(key);
            const icon = item.dbCategory === "pallet"
              ? <Layers className="w-4 h-4" />
              : category === "envelope"
                ? <Mail className="w-4 h-4" />
                : <BoxIcon className="w-4 h-4" />;
            return (
              <PackagingTypeCard
                key={key}
                label={item.typeName}
                subtext={(() => {
                  if (!item.fromExtensiv || !item.imperial) {
                    return item.globalClientCount != null
                      ? `Used by ${item.globalClientCount} client${item.globalClientCount !== 1 ? "s" : ""}`
                      : item.extra || undefined;
                  }
                  const parts: string[] = [];
                  const dimStr = fmtInchDims(item.imperial.l, item.imperial.w, item.imperial.h);
                  if (item.extra) parts.push(item.extra.split(" · ")[0]); // units/pallet or units/pkg
                  if (dimStr) parts.push(dimStr);
                  if (item.imperial.wt) parts.push(fmtLbs(item.imperial.wt));
                  const skuPart = item.extra.split(" · ").at(-1) ?? "";
                  if (skuPart && skuPart !== parts[0]) parts.push(skuPart);
                  return parts.join(" · ") || undefined;
                })()}
                enabled={isEnabled}
                onToggle={() => handleToggle(item.dbCategory, item.typeName, isEnabled)}
                pending={isPending}
                icon={icon}
              />
            );
          })}
        </div>
      )}

      {/* Add custom type */}
      <AddCustomTypeForm
        configId={configId}
        clientId={clientId}
        clientName={clientName}
        dbCategory={category === "pallet" ? "pallet" : "package_unit"}
        categoryLabel={categoryLabel}
        onAdded={(newName) => {
          // Optimistically add to the enabled map so the new card shows immediately
          const key = `${category === "pallet" ? "pallet" : "package_unit"}:${newName}`;
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
  dbCategory,
  categoryLabel,
  onAdded,
}: {
  configId: number;
  clientId: number;
  clientName: string;
  dbCategory: "package_unit" | "pallet";
  categoryLabel: string;
  onAdded: (typeName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [typeName, setTypeName] = useState("");
  const utils = trpc.useUtils();

  const addMutation = trpc.smallParcel.setClientPackagingEnabled.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(`"${variables.typeName}" added and enabled`);
      onAdded(variables.typeName);
      setTypeName("");
      setOpen(false);
      utils.smallParcel.getClientPackagingEnabled.invalidate({ configId, clientId });
      utils.smallParcel.getAllPackagingTypeNames.invalidate({ configId });
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

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
    <div className="flex items-center gap-2 py-3 px-4 rounded-xl border-2 border-blue-400 bg-blue-50 dark:bg-blue-900/20">
      <Plus className="w-4 h-4 text-blue-600 shrink-0" />
      <Input
        className="h-8 text-sm flex-1"
        placeholder={`e.g. "Custom 12×10×8 Box"`}
        value={typeName}
        onChange={(e) => setTypeName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (!typeName.trim()) return;
            addMutation.mutate({ configId, clientId, clientName, category: dbCategory, typeName: typeName.trim(), enabled: true });
          }
          if (e.key === "Escape") { setOpen(false); setTypeName(""); }
        }}
        autoFocus
      />
      <Button
        size="sm"
        className="h-8 shrink-0"
        onClick={() => {
          if (!typeName.trim()) { toast.error("Type name is required"); return; }
          addMutation.mutate({ configId, clientId, clientName, category: dbCategory, typeName: typeName.trim(), enabled: true });
        }}
        disabled={addMutation.isPending || !typeName.trim()}
      >
        {addMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      </Button>
      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => { setOpen(false); setTypeName(""); }}>
        <X className="w-4 h-4" />
      </Button>
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

  // Fetch Extensiv packaging types for this client
  const { data: extData, isLoading: extLoading, error: extError, refetch, isFetching } =
    trpc.smallParcel.getExtensivPackaging.useQuery(
      { configId, clientId },
      { enabled: configId > 0 && clientId > 0, staleTime: 5 * 60 * 1000 }
    );

  // Fetch enabled state from DB for this client
  const { data: enabledRows = [], isLoading: enabledLoading } =
    trpc.smallParcel.getClientPackagingEnabled.useQuery(
      { configId, clientId },
      { enabled: configId > 0 && clientId > 0 }
    );

  // Fetch global catalogue (all distinct type names across all clients)
  const { data: globalTypeNames = [] } =
    trpc.smallParcel.getAllPackagingTypeNames.useQuery(
      { configId },
      { enabled: configId > 0, staleTime: 10 * 60 * 1000 }
    );

  // Build enabled map for root category tiles
  const enabledMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const row of enabledRows) {
      m.set(`${row.category}:${row.typeName}`, row.enabled);
    }
    return m;
  }, [enabledRows]);

  // Count options + enabled per category for the tiles
  const categoryCounts = useMemo(() => {
    const seen = { envelope: new Set<string>(), box: new Set<string>(), pallet: new Set<string>() };
    const enabled = { envelope: 0, box: 0, pallet: 0 };

    // From Extensiv — prefer allPackageTypes (new flat list), fall back to legacy fields
    if (extData) {
      if (extData.allPackageTypes) {
        for (const t of extData.allPackageTypes) {
          if (t.sourceField === "pallet") {
            seen.pallet.add(t.name);
          } else {
            const cls = classifyPackageUnit(t.name);
            seen[cls].add(t.name);
          }
        }
      } else {
        for (const p of extData.packageUnits) {
          const cls = classifyPackageUnit(p.unitName);
          seen[cls].add(p.unitName);
        }
        for (const p of extData.palletTypes) {
          seen.pallet.add(p.palletName);
        }
      }
    }
    // From global catalogue
    for (const g of globalTypeNames) {
      if (g.category === "package_unit") {
        const cls = classifyPackageUnit(g.typeName);
        seen[cls].add(g.typeName);
      } else if (g.category === "pallet") {
        seen.pallet.add(g.typeName);
      }
    }
    // Count enabled
    for (const [key, val] of Array.from(enabledMap.entries())) {
      if (!val) continue;
      const [cat, name] = key.split(/:(.+)/);
      if (cat === "package_unit") {
        const cls = classifyPackageUnit(name);
        enabled[cls]++;
      } else if (cat === "pallet") {
        enabled.pallet++;
      }
    }

    return {
      envelope: { count: seen.envelope.size, enabled: enabled.envelope },
      box: { count: seen.box.size, enabled: enabled.box },
      pallet: { count: seen.pallet.size, enabled: enabled.pallet },
    };
  }, [extData, globalTypeNames, enabledMap]);

  const { unit: rootUnit, toggle: rootToggle } = useUnitSystem();

  if (categoryView !== "root") {
    return (
      <CategoryDetailPanel
        configId={configId}
        clientId={clientId}
        clientName={clientName}
        category={categoryView}
        extData={extData}
        extLoading={extLoading}
        extError={extError}
        extRefetch={refetch}
        extFetching={isFetching}
        enabledRows={enabledRows}
        enabledLoading={enabledLoading}
        globalTypeNames={globalTypeNames}
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
          <p className="text-xs text-muted-foreground">
            Select a category to enable packaging types
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={rootToggle} title={`Currently showing ${rootUnit === "metric" ? "cm/kg" : "in/lbs"}`}>
          <Ruler className="w-3.5 h-3.5" />
          {rootUnit === "metric" ? "in/lbs" : "cm/kg"}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {extLoading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading packaging from Extensiv…</span>
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

  // Fetch custom package sizes from DB
  const { data: allSizes = [] } = trpc.smallParcel.listAllPackageSizes.useQuery();

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

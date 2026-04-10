import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  Pencil,
  Trash2,
  ShoppingCart,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Flame,
  Info,
  RefreshCw,
  Warehouse,
  Package,
  Mail,
  Box as BoxIcon,
  LayoutGrid as PalletIcon,
} from "lucide-react";

// ─── Classify packaging type name into category ───────────────────────────────

function classifyPackageType(name: string, sourceField: "packageUnit" | "pallet"): "envelope" | "box" | "pallet" {
  if (sourceField === "pallet") return "pallet";
  const lower = name.toLowerCase();
  if (
    lower.includes("envelope") ||
    lower.includes("mailer") ||
    lower.includes("poly") ||
    lower.includes("flat") ||
    lower.includes("padded") ||
    lower.includes("bubble")
  ) return "envelope";
  return "box";
}

// ─── Types ────────────────────────────────────────────────────────────────────

type InventoryItem = {
  id: number;
  configId: number;
  facilityId: number;
  name: string;
  category: "envelope" | "box" | "pallet";
  unit: string;
  onHandQty: number;
  minStockLevel: number;
  weeklyConsumption: number;
  notes?: string | null;
  updatedAt: Date;
  createdAt: Date;
};

type ExtensivPackageType = {
  name: string;
  sourceField: "packageUnit" | "pallet";
  unitId: number;
  inventoryUnitsPerUnit: number | null;
  isPrepackaged: boolean;
  imperial: { length: number | null; width: number | null; height: number | null; weight: number | null };
  skuCount: number;
};

// A merged row: either tracked in DB or only known from Extensiv
type MergedRow = {
  name: string;
  category: "envelope" | "box" | "pallet";
  dbItem: InventoryItem | null;       // null = not yet in inventory DB
  extType: ExtensivPackageType | null; // null = manually added, not in Extensiv
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysRemaining(item: InventoryItem): number | null {
  if (!item.weeklyConsumption || item.weeklyConsumption === 0) return null;
  return Math.round((item.onHandQty / item.weeklyConsumption) * 7);
}

function burnUrgency(days: number | null): "unknown" | "critical" | "warning" | "ok" {
  if (days === null) return "unknown";
  if (days < 7) return "critical";
  if (days < 14) return "warning";
  return "ok";
}

function stockStatus(item: InventoryItem): "ok" | "low" | "critical" | "out" {
  if (item.onHandQty === 0) return "out";
  if (item.onHandQty < item.minStockLevel) return "critical";
  if (item.minStockLevel > 0 && item.onHandQty < item.minStockLevel * 2) return "low";
  return "ok";
}

// ─── Warehouse Selector ───────────────────────────────────────────────────────

function WarehouseSelector({
  configId,
  selectedFacilityId,
  onSelect,
}: {
  configId: number;
  selectedFacilityId: number | null;
  onSelect: (id: number, name: string) => void;
}) {
  const { data: facilities = [], isLoading } = trpc.smallParcel.listFacilities.useQuery(
    { configId },
    { enabled: configId > 0, staleTime: 5 * 60 * 1000 }
  );

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-6">
      <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
        <Warehouse className="w-8 h-8 text-blue-500" />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900">Select a Warehouse</h2>
        <p className="text-sm text-gray-500 mt-1">Choose which warehouse to view packaging inventory for</p>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading warehouses…
        </div>
      ) : facilities.length === 0 ? (
        <p className="text-sm text-gray-400">No warehouses found in Extensiv</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-2xl">
          {facilities.map((f) => (
            <button
              key={f.id}
              onClick={() => onSelect(f.id, f.name)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                selectedFacilityId === f.id
                  ? "border-blue-500 bg-blue-50 shadow-sm"
                  : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50"
              }`}
            >
              <Warehouse className={`w-5 h-5 shrink-0 ${selectedFacilityId === f.id ? "text-blue-500" : "text-gray-400"}`} />
              <span className={`text-sm font-medium ${selectedFacilityId === f.id ? "text-blue-700" : "text-gray-700"}`}>
                {f.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Add / Edit Item Dialog ───────────────────────────────────────────────────

function ItemDialog({
  configId,
  facilityId,
  item,
  prefillName,
  prefillCategory,
  onClose,
}: {
  configId: number;
  facilityId: number;
  item?: InventoryItem;
  prefillName?: string;
  prefillCategory?: "envelope" | "box" | "pallet";
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState(item?.name ?? prefillName ?? "");
  const [category, setCategory] = useState<"envelope" | "box" | "pallet">(item?.category ?? prefillCategory ?? "box");
  const [unit, setUnit] = useState(item?.unit ?? "each");
  const [onHandQty, setOnHandQty] = useState(String(item?.onHandQty ?? 0));
  const [minStockLevel, setMinStockLevel] = useState(String(item?.minStockLevel ?? 0));
  const [weeklyConsumption, setWeeklyConsumption] = useState(String(item?.weeklyConsumption ?? 0));
  const [notes, setNotes] = useState(item?.notes ?? "");

  const upsert = trpc.smallParcel.upsertPackagingInventoryItem.useMutation({
    onSuccess: () => {
      utils.smallParcel.listPackagingInventory.invalidate({ configId, facilityId });
      toast.success(item ? "Item updated" : "Item added");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    const qty = parseInt(onHandQty, 10);
    const min = parseInt(minStockLevel, 10);
    const weekly = parseInt(weeklyConsumption, 10);
    if (!name.trim()) return toast.error("Name is required");
    if (isNaN(qty) || qty < 0) return toast.error("On-hand quantity must be ≥ 0");
    upsert.mutate({
      id: item?.id,
      configId,
      facilityId,
      name: name.trim(),
      category,
      unit: unit.trim() || "each",
      onHandQty: qty,
      minStockLevel: isNaN(min) ? 0 : min,
      weeklyConsumption: isNaN(weekly) ? 0 : weekly,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Packaging Item" : "Add Packaging Item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Medium Brown Box" className="bg-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Category</label>
              <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="envelope">Envelope</SelectItem>
                  <SelectItem value="box">Box</SelectItem>
                  <SelectItem value="pallet">Pallet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Unit</label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="each" className="bg-white" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">On Hand</label>
              <Input type="number" min={0} value={onHandQty} onChange={(e) => setOnHandQty(e.target.value)} className="bg-white" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Min Stock</label>
              <Input type="number" min={0} value={minStockLevel} onChange={(e) => setMinStockLevel(e.target.value)} className="bg-white" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Weekly Use</label>
              <Input type="number" min={0} value={weeklyConsumption} onChange={(e) => setWeeklyConsumption(e.target.value)} className="bg-white" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Notes (optional)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes…" className="bg-white" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={upsert.isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={upsert.isPending}>
            {upsert.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            {item ? "Save Changes" : "Add Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reorder Dialog ───────────────────────────────────────────────────────────

function ReorderDialog({
  item,
  configId,
  onClose,
}: {
  item: InventoryItem;
  configId: number;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [qty, setQty] = useState("50");
  const [notes, setNotes] = useState("");

  const createRequest = trpc.smallParcel.createPackagingReorderRequest.useMutation({
    onSuccess: () => {
      utils.smallParcel.listPackagingReorderRequests.invalidate({ configId });
      toast.success("Reorder request submitted");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm bg-white">
        <DialogHeader>
          <DialogTitle>Request Reorder</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-gray-600">
            Requesting reorder for <span className="font-semibold text-gray-900">{item.name}</span>
            {item.onHandQty === 0 && <span className="ml-1 text-red-500">(out of stock)</span>}
          </p>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Quantity to Order</label>
            <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="bg-white" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Notes (optional)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes for accounting…" className="bg-white" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={createRequest.isPending}>Cancel</Button>
          <Button onClick={() => {
            const q = parseInt(qty, 10);
            if (isNaN(q) || q < 1) return toast.error("Quantity must be at least 1");
            createRequest.mutate({ inventoryItemId: item.id, configId, requestedQty: q, notes: notes.trim() || undefined });
          }} disabled={createRequest.isPending}>
            {createRequest.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── On-Hand Inline Edit ──────────────────────────────────────────────────────

function OnHandCell({ item, configId, facilityId }: { item: InventoryItem; configId: number; facilityId: number }) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(item.onHandQty));

  const update = trpc.smallParcel.updatePackagingOnHand.useMutation({
    onSuccess: () => {
      utils.smallParcel.listPackagingInventory.invalidate({ configId, facilityId });
      setEditing(false);
    },
    onError: (e) => { toast.error(e.message); setEditing(false); },
  });

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={0}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="h-7 w-20 text-sm bg-white"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const n = parseInt(val, 10);
              if (!isNaN(n) && n >= 0) update.mutate({ id: item.id, configId, onHandQty: n });
            }
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <Button size="sm" variant="ghost" className="h-7 px-1.5 text-green-600 hover:text-green-700" onClick={() => {
          const n = parseInt(val, 10);
          if (!isNaN(n) && n >= 0) update.mutate({ id: item.id, configId, onHandQty: n });
        }}>✓</Button>
        <Button size="sm" variant="ghost" className="h-7 px-1.5 text-gray-400" onClick={() => setEditing(false)}>✕</Button>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setVal(String(item.onHandQty)); setEditing(true); }}
      className="font-mono text-sm text-gray-800 hover:text-blue-600 hover:underline cursor-pointer"
      title="Click to edit on-hand quantity"
    >
      {item.onHandQty}
    </button>
  );
}

// ─── Packaging Row ────────────────────────────────────────────────────────────

function PackagingRow({
  row,
  configId,
  facilityId,
  onEdit,
  onDelete,
  onReorder,
  onAddToInventory,
}: {
  row: MergedRow;
  configId: number;
  facilityId: number;
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
  onReorder: (item: InventoryItem) => void;
  onAddToInventory: (name: string, category: "envelope" | "box" | "pallet") => void;
}) {
  const db = row.dbItem;
  const isTracked = db !== null;
  const isOutOfStock = isTracked && db!.onHandQty === 0;
  const status = isTracked ? stockStatus(db!) : null;
  const days = isTracked ? daysRemaining(db!) : null;
  const urgency = burnUrgency(days);

  // Row background: out-of-stock = red tint, low = amber tint, untracked = gray/muted
  const rowBg = !isTracked
    ? "bg-gray-50 opacity-70"
    : isOutOfStock
    ? "bg-red-50 border-l-2 border-l-red-400"
    : status === "critical"
    ? "bg-red-50"
    : status === "low" || urgency === "warning"
    ? "bg-amber-50"
    : "bg-white";

  return (
    <tr className={`border-b border-gray-100 transition-colors hover:bg-blue-50/30 ${rowBg}`}>
      {/* Name */}
      <td className="py-2.5 px-4">
        <div className="flex items-center gap-2">
          {!isTracked && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0 inline-block" />
              </TooltipTrigger>
              <TooltipContent>Not yet tracked in inventory — click "Add" to start tracking</TooltipContent>
            </Tooltip>
          )}
          {isTracked && isOutOfStock && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
          {isTracked && status === "low" && !isOutOfStock && <TrendingDown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
          <span className={`text-sm font-medium ${!isTracked ? "text-gray-400" : "text-gray-800"}`}>{row.name}</span>
          {!isTracked && (
            <Badge className="text-[10px] bg-gray-100 text-gray-400 border-gray-200 ml-1">Not tracked</Badge>
          )}
          {isTracked && isOutOfStock && (
            <Badge className="text-[10px] bg-red-100 text-red-600 border-red-200 ml-1">Out of stock</Badge>
          )}
        </div>
        {isTracked && db!.notes && (
          <p className="text-[11px] text-gray-400 mt-0.5 pl-5">{db!.notes}</p>
        )}
        {row.extType && (
          <p className="text-[11px] text-gray-400 mt-0.5 pl-5">
            {row.extType.skuCount} SKU{row.extType.skuCount !== 1 ? "s" : ""} in Extensiv
            {row.extType.imperial.length && ` · ${row.extType.imperial.length}×${row.extType.imperial.width}×${row.extType.imperial.height} in`}
          </p>
        )}
      </td>

      {/* On Hand */}
      <td className="py-2.5 px-4 text-right">
        {isTracked ? (
          <div className="flex items-center justify-end gap-1">
            <OnHandCell item={db!} configId={configId} facilityId={facilityId} />
            <span className="text-xs text-gray-400">{db!.unit}</span>
          </div>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>

      {/* Min Stock */}
      <td className="py-2.5 px-4 text-right">
        {isTracked ? (
          <span className="text-sm font-mono text-gray-500">{db!.minStockLevel}</span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>

      {/* Days Left */}
      <td className="py-2.5 px-4">
        {isTracked ? (
          days === null ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-gray-300 text-xs flex items-center gap-1 cursor-default">
                  <Info className="w-3 h-3" /> —
                </span>
              </TooltipTrigger>
              <TooltipContent>Set weekly consumption to calculate days remaining</TooltipContent>
            </Tooltip>
          ) : urgency === "critical" ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-100 border border-red-200 rounded px-2 py-0.5">
              <Flame className="w-3 h-3" /> {days}d
            </span>
          ) : urgency === "warning" ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-100 border border-amber-200 rounded px-2 py-0.5">
              <AlertTriangle className="w-3 h-3" /> {days}d
            </span>
          ) : (
            <span className="text-xs text-green-600 font-mono">{days}d</span>
          )
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>

      {/* Status */}
      <td className="py-2.5 px-4">
        {isTracked ? (
          isOutOfStock ? (
            <Badge className="text-[11px] bg-red-100 text-red-600 border-red-200">Out of Stock</Badge>
          ) : status === "critical" ? (
            <Badge className="text-[11px] bg-red-100 text-red-600 border-red-200">Below Min</Badge>
          ) : status === "low" ? (
            <Badge className="text-[11px] bg-amber-100 text-amber-600 border-amber-200">Low Stock</Badge>
          ) : (
            <Badge className="text-[11px] bg-green-100 text-green-600 border-green-200">OK</Badge>
          )
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>

      {/* Actions */}
      <td className="py-2.5 px-4">
        <div className="flex items-center justify-end gap-1">
          {isTracked ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                onClick={() => onReorder(db!)}
                title="Request reorder"
              >
                <ShoppingCart className="w-3.5 h-3.5 mr-1" /> Reorder
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                onClick={() => onEdit(db!)}
                title="Edit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-red-400 hover:text-red-600 hover:bg-red-50"
                onClick={() => onDelete(db!)}
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs text-blue-600 border-blue-200 hover:bg-blue-50 bg-white"
              onClick={() => onAddToInventory(row.name, row.category)}
            >
              <Plus className="w-3 h-3 mr-1" /> Add
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Category Tab Panel ───────────────────────────────────────────────────────

function CategoryPanel({
  category,
  rows,
  configId,
  facilityId,
  onEdit,
  onDelete,
  onReorder,
  onAddToInventory,
}: {
  category: "envelope" | "box" | "pallet";
  rows: MergedRow[];
  configId: number;
  facilityId: number;
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
  onReorder: (item: InventoryItem) => void;
  onAddToInventory: (name: string, category: "envelope" | "box" | "pallet") => void;
}) {
  const catRows = rows.filter((r) => r.category === category);
  const tracked = catRows.filter((r) => r.dbItem !== null);
  const untracked = catRows.filter((r) => r.dbItem === null);

  // Sort: out-of-stock first, then low, then ok, then untracked
  const sorted = [
    ...tracked.filter((r) => r.dbItem!.onHandQty === 0),
    ...tracked.filter((r) => r.dbItem!.onHandQty > 0 && stockStatus(r.dbItem!) !== "ok"),
    ...tracked.filter((r) => r.dbItem!.onHandQty > 0 && stockStatus(r.dbItem!) === "ok"),
    ...untracked,
  ];

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Package className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">No {category} types found for this warehouse.</p>
        <p className="text-xs mt-1 text-gray-300">Packaging types are pulled from Extensiv item records.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <th className="text-left py-2.5 px-4 font-medium">Name</th>
            <th className="text-right py-2.5 px-4 font-medium">On Hand</th>
            <th className="text-right py-2.5 px-4 font-medium">Min Stock</th>
            <th className="text-left py-2.5 px-4 font-medium">Days Left</th>
            <th className="text-left py-2.5 px-4 font-medium">Status</th>
            <th className="text-right py-2.5 px-4 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <PackagingRow
              key={row.name}
              row={row}
              configId={configId}
              facilityId={facilityId}
              onEdit={onEdit}
              onDelete={onDelete}
              onReorder={onReorder}
              onAddToInventory={onAddToInventory}
            />
          ))}
        </tbody>
      </table>
      {untracked.length > 0 && (
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            <Info className="w-3 h-3 inline mr-1" />
            {untracked.length} type{untracked.length !== 1 ? "s" : ""} from Extensiv not yet tracked — click <strong>Add</strong> to start tracking stock.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PackagingInventory() {
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [selectedFacilityName, setSelectedFacilityName] = useState<string>("");
  const [tab, setTab] = useState("box");
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [reorderItem, setReorderItem] = useState<InventoryItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<InventoryItem | null>(null);
  const [addDialog, setAddDialog] = useState<{ name: string; category: "envelope" | "box" | "pallet" } | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const { data: configs } = trpc.config.list.useQuery();
  const configId = configs?.[0]?.id ?? 0;

  // DB inventory for selected facility
  const { data: dbItems = [], isLoading: dbLoading } = trpc.smallParcel.listPackagingInventory.useQuery(
    { configId, facilityId: selectedFacilityId ?? 0 },
    { enabled: configId > 0 && selectedFacilityId !== null, staleTime: 30_000 }
  );

  // Extensiv packaging types for selected facility (all customers)
  const { data: extData, isLoading: extLoading, refetch: extRefetch, isFetching: extFetching } =
    trpc.smallParcel.getExtensivPackagingForFacility.useQuery(
      { configId, facilityId: selectedFacilityId ?? 0 },
      { enabled: configId > 0 && selectedFacilityId !== null && (selectedFacilityId ?? 0) > 0, staleTime: 10 * 60 * 1000 }
    );

  const { data: requests = [] } = trpc.smallParcel.listPackagingReorderRequests.useQuery(
    { configId },
    { enabled: configId > 0, staleTime: 30_000 }
  );

  const utils = trpc.useUtils();

  const deleteItem_ = trpc.smallParcel.deletePackagingInventoryItem.useMutation({
    onSuccess: () => {
      utils.smallParcel.listPackagingInventory.invalidate({ configId, facilityId: selectedFacilityId ?? 0 });
      toast.success("Item deleted");
      setDeleteItem(null);
    },
    onError: (e) => toast.error(e.message),
  });

  // Merge Extensiv types with DB items
  const mergedRows = useMemo((): MergedRow[] => {
    const dbMap = new Map<string, InventoryItem>();
    for (const item of dbItems as InventoryItem[]) {
      dbMap.set(item.name.toLowerCase().trim(), item);
    }

    const seen = new Set<string>();
    const rows: MergedRow[] = [];

    // First: all Extensiv types
    const extTypes = extData?.allPackageTypes ?? [];
    for (const t of extTypes) {
      const key = t.name.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      const category = classifyPackageType(t.name, t.sourceField);
      rows.push({
        name: t.name,
        category,
        dbItem: dbMap.get(key) ?? null,
        extType: t,
      });
    }

    // Then: DB items not in Extensiv (manually added)
    for (const item of dbItems as InventoryItem[]) {
      const key = item.name.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        name: item.name,
        category: item.category,
        dbItem: item,
        extType: null,
      });
    }

    return rows;
  }, [dbItems, extData]);

  // Summary counts
  const outOfStock = mergedRows.filter((r) => r.dbItem && r.dbItem.onHandQty === 0).length;
  const lowStock = mergedRows.filter((r) => r.dbItem && stockStatus(r.dbItem) === "low").length;
  const untracked = mergedRows.filter((r) => r.dbItem === null).length;
  const openRequests = requests.filter((r: { status: string }) => r.status === "pending" || r.status === "ordered").length;

  const envelopeCount = mergedRows.filter((r) => r.category === "envelope").length;
  const boxCount = mergedRows.filter((r) => r.category === "box").length;
  const palletCount = mergedRows.filter((r) => r.category === "pallet").length;

  const isLoading = dbLoading || extLoading;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Packaging Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {selectedFacilityId
              ? `Viewing ${selectedFacilityName} — track on-hand stock, burn rate, and reorder requests`
              : "Select a warehouse to view packaging inventory"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedFacilityId && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                onClick={() => extRefetch()}
                disabled={extFetching}
              >
                {extFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Sync Extensiv
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                onClick={() => setSelectedFacilityId(null)}
              >
                <Warehouse className="w-4 h-4" /> Change Warehouse
              </Button>
              <Button onClick={() => setAddOpen(true)} size="sm" className="gap-1.5">
                <Plus className="w-4 h-4" /> Add Item
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Warehouse selector or inventory view */}
      {!selectedFacilityId ? (
        <div className="rounded-xl bg-white border border-gray-200 shadow-sm">
          <WarehouseSelector
            configId={configId}
            selectedFacilityId={selectedFacilityId}
            onSelect={(id, name) => {
              setSelectedFacilityId(id);
              setSelectedFacilityName(name);
            }}
          />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="rounded-xl bg-white border border-gray-200 shadow-sm px-5 py-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Types</p>
              <p className="text-2xl font-bold text-gray-900">{mergedRows.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">{untracked} not yet tracked</p>
            </div>
            <div className={`rounded-xl border shadow-sm px-5 py-4 ${outOfStock > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-200"}`}>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Out of Stock</p>
              <p className={`text-2xl font-bold ${outOfStock > 0 ? "text-red-600" : "text-gray-900"}`}>{outOfStock}</p>
            </div>
            <div className={`rounded-xl border shadow-sm px-5 py-4 ${lowStock > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"}`}>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Low Stock</p>
              <p className={`text-2xl font-bold ${lowStock > 0 ? "text-amber-600" : "text-gray-900"}`}>{lowStock}</p>
            </div>
            <div className={`rounded-xl border shadow-sm px-5 py-4 ${openRequests > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"}`}>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Open Reorders</p>
              <p className={`text-2xl font-bold ${openRequests > 0 ? "text-amber-600" : "text-gray-900"}`}>{openRequests}</p>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
            <Tabs value={tab} onValueChange={setTab}>
              <div className="border-b border-gray-200 px-4 pt-3">
                <TabsList className="bg-gray-100 border border-gray-200 h-9">
                  <TabsTrigger value="envelope" className="gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm text-xs">
                    <Mail className="w-3.5 h-3.5" />
                    Envelopes
                    <span className="ml-1 text-[10px] bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5 font-mono">{envelopeCount}</span>
                  </TabsTrigger>
                  <TabsTrigger value="box" className="gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm text-xs">
                    <BoxIcon className="w-3.5 h-3.5" />
                    Boxes
                    <span className="ml-1 text-[10px] bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5 font-mono">{boxCount}</span>
                  </TabsTrigger>
                  <TabsTrigger value="pallet" className="gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm text-xs">
                    <PalletIcon className="w-3.5 h-3.5" />
                    Pallets
                    <span className="ml-1 text-[10px] bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5 font-mono">{palletCount}</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-16 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  {extLoading ? "Loading Extensiv packaging types…" : "Loading inventory…"}
                </div>
              ) : (
                <>
                  <TabsContent value="envelope" className="mt-0">
                    <CategoryPanel
                      category="envelope"
                      rows={mergedRows}
                      configId={configId}
                      facilityId={selectedFacilityId}
                      onEdit={setEditItem}
                      onDelete={setDeleteItem}
                      onReorder={setReorderItem}
                      onAddToInventory={(name, cat) => setAddDialog({ name, category: cat })}
                    />
                  </TabsContent>
                  <TabsContent value="box" className="mt-0">
                    <CategoryPanel
                      category="box"
                      rows={mergedRows}
                      configId={configId}
                      facilityId={selectedFacilityId}
                      onEdit={setEditItem}
                      onDelete={setDeleteItem}
                      onReorder={setReorderItem}
                      onAddToInventory={(name, cat) => setAddDialog({ name, category: cat })}
                    />
                  </TabsContent>
                  <TabsContent value="pallet" className="mt-0">
                    <CategoryPanel
                      category="pallet"
                      rows={mergedRows}
                      configId={configId}
                      facilityId={selectedFacilityId}
                      onEdit={setEditItem}
                      onDelete={setDeleteItem}
                      onReorder={setReorderItem}
                      onAddToInventory={(name, cat) => setAddDialog({ name, category: cat })}
                    />
                  </TabsContent>
                </>
              )}
            </Tabs>
          </div>
        </>
      )}

      {/* Dialogs */}
      {addOpen && selectedFacilityId && (
        <ItemDialog configId={configId} facilityId={selectedFacilityId} onClose={() => setAddOpen(false)} />
      )}
      {addDialog && selectedFacilityId && (
        <ItemDialog
          configId={configId}
          facilityId={selectedFacilityId}
          prefillName={addDialog.name}
          prefillCategory={addDialog.category}
          onClose={() => setAddDialog(null)}
        />
      )}
      {editItem && selectedFacilityId && (
        <ItemDialog configId={configId} facilityId={selectedFacilityId} item={editItem} onClose={() => setEditItem(null)} />
      )}
      {reorderItem && (
        <ReorderDialog item={reorderItem} configId={configId} onClose={() => setReorderItem(null)} />
      )}

      {/* Delete confirmation */}
      {deleteItem && (
        <Dialog open onOpenChange={(o) => { if (!o) setDeleteItem(null); }}>
          <DialogContent className="max-w-sm bg-white">
            <DialogHeader>
              <DialogTitle>Delete Item?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-500 py-2">
              Are you sure you want to delete <span className="text-gray-900 font-medium">{deleteItem.name}</span>? This cannot be undone.
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeleteItem(null)} disabled={deleteItem_.isPending}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => deleteItem_.mutate({ id: deleteItem.id, configId })}
                disabled={deleteItem_.isPending}
              >
                {deleteItem_.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

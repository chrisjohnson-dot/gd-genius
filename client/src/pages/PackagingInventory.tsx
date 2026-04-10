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
  Plus,
  Pencil,
  Trash2,
  ShoppingCart,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Warehouse,
  Package,
  Mail,
  Box,
  LayoutGrid,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

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

type StockStatus = "ok" | "low" | "critical" | "out" | "unset";

function getStockStatus(item: InventoryItem): StockStatus {
  if (item.minStockLevel === 0 && item.onHandQty === 0) return "unset";
  if (item.onHandQty === 0) return "out";
  if (item.minStockLevel > 0 && item.onHandQty < item.minStockLevel) return "critical";
  if (item.minStockLevel > 0 && item.onHandQty < item.minStockLevel * 1.5) return "low";
  return "ok";
}

function daysLeft(item: InventoryItem): number | null {
  if (!item.weeklyConsumption) return null;
  return Math.round((item.onHandQty / item.weeklyConsumption) * 7);
}

// ─── Item Dialog ──────────────────────────────────────────────────────────────

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
  const [category, setCategory] = useState<"envelope" | "box" | "pallet">(
    item?.category ?? prefillCategory ?? "box"
  );
  const [unit, setUnit] = useState(item?.unit ?? "each");
  const [onHandQty, setOnHandQty] = useState(String(item?.onHandQty ?? 0));
  const [minStock, setMinStock] = useState(String(item?.minStockLevel ?? 0));
  const [weekly, setWeekly] = useState(String(item?.weeklyConsumption ?? 0));
  const [notes, setNotes] = useState(item?.notes ?? "");

  const upsert = trpc.smallParcel.upsertPackagingInventoryItem.useMutation({
    onSuccess: () => {
      utils.smallParcel.listPackagingInventory.invalidate({ configId, facilityId });
      toast.success(item ? "Updated" : "Added");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    const qty = parseInt(onHandQty, 10);
    const min = parseInt(minStock, 10);
    const wk = parseInt(weekly, 10);
    if (!name.trim()) return toast.error("Name is required");
    if (isNaN(qty) || qty < 0) return toast.error("On-hand qty must be ≥ 0");
    upsert.mutate({
      id: item?.id,
      configId,
      facilityId,
      name: name.trim(),
      category,
      unit: unit.trim() || "each",
      onHandQty: qty,
      minStockLevel: isNaN(min) ? 0 : min,
      weeklyConsumption: isNaN(wk) ? 0 : wk,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Packaging Item" : "Add Packaging Item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Box 12x12x12" className="bg-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Category</label>
              <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="envelope">Envelope / Mailer</SelectItem>
                  <SelectItem value="box">Box / Carton</SelectItem>
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
              <Input type="number" min={0} value={minStock} onChange={(e) => setMinStock(e.target.value)} className="bg-white" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Weekly Use</label>
              <Input type="number" min={0} value={weekly} onChange={(e) => setWeekly(e.target.value)} className="bg-white" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Notes / Dimensions</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 12×12×12 in" className="bg-white" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
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
  userId,
  userName,
  onClose,
}: {
  item: InventoryItem;
  configId: number;
  userId: number;
  userName: string;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [qty, setQty] = useState(String(Math.max(item.minStockLevel - item.onHandQty, 1)));
  const [notes, setNotes] = useState("");

  const create = trpc.smallParcel.createPackagingReorderRequest.useMutation({
    onSuccess: () => {
      utils.smallParcel.listPackagingReorderRequests.invalidate({ configId });
      toast.success("Reorder request created");
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
        <div className="space-y-3 py-1">
          <p className="text-sm text-gray-600">
            <span className="font-medium">{item.name}</span>
            <span className="text-gray-400 ml-2">On hand: {item.onHandQty}</span>
          </p>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Quantity to Order</label>
            <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="bg-white" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Notes (optional)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Urgency, supplier, etc." className="bg-white" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate({ configId, inventoryItemId: item.id, requestedQty: parseInt(qty, 10) || 1, notes: notes.trim() || undefined })} disabled={create.isPending}>
            {create.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────

function DeleteDialog({ item, configId, facilityId, onClose }: { item: InventoryItem; configId: number; facilityId: number; onClose: () => void }) {
  const utils = trpc.useUtils();
  const del = trpc.smallParcel.deletePackagingInventoryItem.useMutation({
    onSuccess: () => {
      utils.smallParcel.listPackagingInventory.invalidate({ configId, facilityId });
      toast.success("Deleted");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm bg-white">
        <DialogHeader><DialogTitle>Delete Item</DialogTitle></DialogHeader>
        <p className="text-sm text-gray-600 py-2">Remove <span className="font-medium">{item.name}</span> from inventory? This cannot be undone.</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => del.mutate({ id: item.id, configId })} disabled={del.isPending}>
            {del.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Stock Badge ──────────────────────────────────────────────────────────────

function StockBadge({ item }: { item: InventoryItem }) {
  const status = getStockStatus(item);
  if (status === "unset") return <span className="text-xs text-gray-400">—</span>;
  if (status === "out") return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">Out of Stock</Badge>;
  if (status === "critical") return <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">Critical</Badge>;
  if (status === "low") return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">Low</Badge>;
  return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">In Stock</Badge>;
}

// ─── Category Panel ───────────────────────────────────────────────────────────

function CategoryPanel({
  items,
  configId,
  facilityId,
  userId,
  userName,
  onEdit,
  onDelete,
  onReorder,
}: {
  items: InventoryItem[];
  configId: number;
  facilityId: number;
  userId: number;
  userName: string;
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
  onReorder: (item: InventoryItem) => void;
}) {
  const utils = trpc.useUtils();
  const updateQty = trpc.smallParcel.updatePackagingOnHand.useMutation({
    onSuccess: () => utils.smallParcel.listPackagingInventory.invalidate({ configId, facilityId }),
    onError: (e) => toast.error(e.message),
  });

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Package className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">No items in this category yet.</p>
        <p className="text-xs mt-1">Use the "Add Item" button to add one manually.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {items.map((item) => {
        const status = getStockStatus(item);
        const days = daysLeft(item);
        const rowBg =
          status === "out" ? "bg-red-50/60" :
          status === "critical" ? "bg-orange-50/60" :
          status === "low" ? "bg-amber-50/40" :
          "bg-white";

        return (
          <div key={item.id} className={`flex items-center gap-4 px-4 py-3 ${rowBg} hover:bg-gray-50/80 transition-colors`}>
            {/* Name + notes */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
              {item.notes && <p className="text-xs text-gray-400 truncate">{item.notes}</p>}
            </div>

            {/* On Hand — inline editable */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                className="w-6 h-6 rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 text-sm font-bold flex items-center justify-center"
                onClick={() => updateQty.mutate({ id: item.id, configId, onHandQty: Math.max(0, item.onHandQty - 1) })}
              >−</button>
              <span className="w-12 text-center text-sm font-mono font-semibold text-gray-800">
                {item.onHandQty}
              </span>
              <button
                className="w-6 h-6 rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 text-sm font-bold flex items-center justify-center"
                onClick={() => updateQty.mutate({ id: item.id, configId, onHandQty: item.onHandQty + 1 })}
              >+</button>
              <span className="text-xs text-gray-400 ml-0.5">{item.unit}</span>
            </div>

            {/* Status badge */}
            <div className="w-24 shrink-0 text-right">
              <StockBadge item={item} />
            </div>

            {/* Days left */}
            <div className="w-20 shrink-0 text-right">
              {days !== null ? (
                <span className={`text-xs font-mono ${days < 7 ? "text-red-600 font-semibold" : days < 14 ? "text-amber-600" : "text-gray-400"}`}>
                  {days}d left
                </span>
              ) : (
                <span className="text-xs text-gray-300">—</span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => onReorder(item)}
                className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                title="Request reorder"
              >
                <ShoppingCart className="w-4 h-4" />
              </button>
              <button
                onClick={() => onEdit(item)}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                title="Edit"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDelete(item)}
                className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PackagingInventory() {
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [selectedFacilityName, setSelectedFacilityName] = useState("");
  const [tab, setTab] = useState("box");
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [reorderItem, setReorderItem] = useState<InventoryItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<InventoryItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addCategory, setAddCategory] = useState<"envelope" | "box" | "pallet">("box");

  const { data: configs } = trpc.config.list.useQuery();
  const configId = configs?.[0]?.id ?? 0;

  const { data: me } = trpc.auth.me.useQuery();
  const userId = me?.id ?? 0;
  const userName = me?.name ?? "Unknown";

  const { data: facilities = [], isLoading: facilitiesLoading } = trpc.smallParcel.listFacilities.useQuery(
    { configId },
    { enabled: configId > 0, staleTime: 5 * 60 * 1000 }
  );

  const { data: allItems = [], isLoading: itemsLoading, refetch } = trpc.smallParcel.listPackagingInventory.useQuery(
    { configId, facilityId: selectedFacilityId ?? 0 },
    { enabled: configId > 0 && selectedFacilityId !== null, staleTime: 30_000 }
  );

  const { data: requests = [] } = trpc.smallParcel.listPackagingReorderRequests.useQuery(
    { configId },
    { enabled: configId > 0, staleTime: 30_000 }
  );

  const utils = trpc.useUtils();

  const seed = trpc.smallParcel.seedStandardPackagingTypes.useMutation({
    onSuccess: (res) => {
      utils.smallParcel.listPackagingInventory.invalidate({ configId, facilityId: selectedFacilityId ?? 0 });
      toast.success(`Loaded ${res.inserted} standard packaging types${res.skipped > 0 ? ` (${res.skipped} already existed)` : ""}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const items = allItems as InventoryItem[];

  const envelopes = useMemo(() => items.filter((i) => i.category === "envelope"), [items]);
  const boxes = useMemo(() => items.filter((i) => i.category === "box"), [items]);
  const pallets = useMemo(() => items.filter((i) => i.category === "pallet"), [items]);

  const outCount = items.filter((i) => getStockStatus(i) === "out").length;
  const lowCount = items.filter((i) => getStockStatus(i) === "low" || getStockStatus(i) === "critical").length;
  const openRequests = (requests as { status: string }[]).filter((r) => r.status === "pending" || r.status === "ordered").length;

  const isLoading = itemsLoading;

  // ── Warehouse selector screen ──
  if (selectedFacilityId === null) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-gray-900">Packaging Inventory</h1>
          <p className="text-sm text-gray-500 mt-1">Select a warehouse to view and manage packaging stock</p>
        </div>

        {facilitiesLoading ? (
          <div className="flex items-center gap-2 text-gray-400 py-8">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading warehouses…
          </div>
        ) : facilities.length === 0 ? (
          <div className="text-sm text-gray-400 py-8">No warehouses found. Check your Extensiv configuration.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {facilities.map((f) => (
              <button
                key={f.id}
                onClick={() => { setSelectedFacilityId(f.id); setSelectedFacilityName(f.name); }}
                className="flex items-center gap-4 p-5 rounded-xl border border-gray-200 bg-white hover:border-blue-400 hover:shadow-sm text-left transition-all group"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors">
                  <Warehouse className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{f.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Click to view inventory</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Inventory view ──
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedFacilityId(null)}
              className="text-xs text-blue-500 hover:text-blue-700 hover:underline"
            >
              ← All Warehouses
            </button>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mt-0.5">{selectedFacilityName} — Packaging Inventory</h1>
          <p className="text-xs text-gray-400 mt-0.5">{items.length} items tracked</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {items.length === 0 && (
            <Button
              onClick={() => seed.mutate({ configId, facilityId: selectedFacilityId })}
              disabled={seed.isPending}
              className="gap-1.5 bg-blue-600 hover:bg-blue-700"
              size="sm"
            >
              {seed.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Load Standard Packaging Types
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5 bg-white" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => { setAddCategory(tab as "envelope" | "box" | "pallet"); setAddOpen(true); }}
          >
            <Plus className="w-4 h-4" /> Add Item
          </Button>
        </div>
      </div>

      {/* Summary pills */}
      {items.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {outCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs bg-red-50 text-red-700 border border-red-200 rounded-full px-3 py-1">
              <AlertTriangle className="w-3.5 h-3.5" /> {outCount} out of stock
            </div>
          )}
          {lowCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-3 py-1">
              <AlertTriangle className="w-3.5 h-3.5" /> {lowCount} low / critical
            </div>
          )}
          {openRequests > 0 && (
            <div className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-3 py-1">
              <ShoppingCart className="w-3.5 h-3.5" /> {openRequests} open reorder{openRequests !== 1 ? "s" : ""}
            </div>
          )}
          {outCount === 0 && lowCount === 0 && (
            <div className="flex items-center gap-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-3 py-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> All stock levels OK
            </div>
          )}
        </div>
      )}

      {/* Empty state with seed button */}
      {!isLoading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50 text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
            <Package className="w-7 h-7 text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700">No packaging items yet for this warehouse</p>
            <p className="text-xs text-gray-400 mt-1 max-w-xs">
              Load the standard list of envelopes, boxes, and pallets to get started — or add items manually.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => seed.mutate({ configId, facilityId: selectedFacilityId })}
              disabled={seed.isPending}
              className="gap-1.5 bg-blue-600 hover:bg-blue-700"
            >
              {seed.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Load Standard Packaging Types
            </Button>
            <Button variant="outline" onClick={() => { setAddCategory("box"); setAddOpen(true); }} className="gap-1.5 bg-white">
              <Plus className="w-4 h-4" /> Add Manually
            </Button>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading inventory…
        </div>
      )}

      {/* Tabs */}
      {!isLoading && items.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Column headers */}
          <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500">
            <span className="flex-1">Name</span>
            <span className="w-32 text-center">On Hand</span>
            <span className="w-24 text-right">Status</span>
            <span className="w-20 text-right">Burn Rate</span>
            <span className="w-24 text-right">Actions</span>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <div className="px-4 pt-3 border-b border-gray-100">
              <TabsList className="bg-gray-100 h-8">
                <TabsTrigger value="envelope" className="text-xs gap-1.5 h-7">
                  <Mail className="w-3.5 h-3.5" />
                  Envelopes
                  <span className="ml-1 text-[10px] bg-gray-200 text-gray-600 rounded-full px-1.5 font-mono">{envelopes.length}</span>
                </TabsTrigger>
                <TabsTrigger value="box" className="text-xs gap-1.5 h-7">
                  <Box className="w-3.5 h-3.5" />
                  Boxes
                  <span className="ml-1 text-[10px] bg-gray-200 text-gray-600 rounded-full px-1.5 font-mono">{boxes.length}</span>
                </TabsTrigger>
                <TabsTrigger value="pallet" className="text-xs gap-1.5 h-7">
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Pallets
                  <span className="ml-1 text-[10px] bg-gray-200 text-gray-600 rounded-full px-1.5 font-mono">{pallets.length}</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="envelope" className="mt-0">
              <CategoryPanel
                items={envelopes}
                configId={configId}
                facilityId={selectedFacilityId}
                userId={userId}
                userName={userName}
                onEdit={setEditItem}
                onDelete={setDeleteItem}
                onReorder={setReorderItem}
              />
            </TabsContent>
            <TabsContent value="box" className="mt-0">
              <CategoryPanel
                items={boxes}
                configId={configId}
                facilityId={selectedFacilityId}
                userId={userId}
                userName={userName}
                onEdit={setEditItem}
                onDelete={setDeleteItem}
                onReorder={setReorderItem}
              />
            </TabsContent>
            <TabsContent value="pallet" className="mt-0">
              <CategoryPanel
                items={pallets}
                configId={configId}
                facilityId={selectedFacilityId}
                userId={userId}
                userName={userName}
                onEdit={setEditItem}
                onDelete={setDeleteItem}
                onReorder={setReorderItem}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Dialogs */}
      {addOpen && (
        <ItemDialog
          configId={configId}
          facilityId={selectedFacilityId}
          prefillCategory={addCategory}
          onClose={() => setAddOpen(false)}
        />
      )}
      {editItem && (
        <ItemDialog
          configId={configId}
          facilityId={selectedFacilityId}
          item={editItem}
          onClose={() => setEditItem(null)}
        />
      )}
      {reorderItem && (
        <ReorderDialog
          item={reorderItem}
          configId={configId}
          userId={userId}
          userName={userName}
          onClose={() => setReorderItem(null)}
        />
      )}
      {deleteItem && (
        <DeleteDialog
          item={deleteItem}
          configId={configId}
          facilityId={selectedFacilityId}
          onClose={() => setDeleteItem(null)}
        />
      )}
    </div>
  );
}

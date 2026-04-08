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
  Package,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  TrendingDown,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type InventoryItem = {
  id: number;
  configId: number;
  name: string;
  category: "envelope" | "box" | "pallet";
  unit: string;
  onHandQty: number;
  minStockLevel: number;
  notes?: string | null;
  updatedAt: Date;
  createdAt: Date;
};

type ReorderRequest = {
  id: number;
  configId: number;
  inventoryItemId: number;
  requestedQty: number;
  notes?: string | null;
  requestedByUserId?: string | number | null;
  requestedByName?: string | null;
  status: "pending" | "ordered" | "received" | "cancelled";
  fulfilledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function categoryLabel(cat: string) {
  if (cat === "envelope") return "Envelope";
  if (cat === "pallet") return "Pallet";
  return "Box";
}

function categoryColor(cat: string) {
  if (cat === "envelope") return "bg-blue-500/10 text-blue-400 border-blue-500/20";
  if (cat === "pallet") return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  return "bg-violet-500/10 text-violet-400 border-violet-500/20";
}

function stockStatus(item: InventoryItem): "ok" | "low" | "critical" {
  if (item.onHandQty < item.minStockLevel) return "critical";
  // Warn when on-hand is less than 2× min stock (a rough "low" proxy)
  if (item.minStockLevel > 0 && item.onHandQty < item.minStockLevel * 2) return "low";
  return "ok";
}

function statusBadge(status: "ok" | "low" | "critical") {
  if (status === "critical")
    return <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-[11px]">Below Min</Badge>;
  if (status === "low")
    return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[11px]">Low Stock</Badge>;
  return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[11px]">OK</Badge>;
}

function reorderStatusBadge(status: ReorderRequest["status"]) {
  if (status === "pending")
    return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[11px]">Pending</Badge>;
  if (status === "ordered")
    return <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[11px]">Ordered</Badge>;
  if (status === "received")
    return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[11px]">Received</Badge>;
  return <Badge className="bg-slate-500/15 text-slate-400 border-slate-500/30 text-[11px]">Cancelled</Badge>;
}

// ─── Add / Edit Item Dialog ───────────────────────────────────────────────────

function ItemDialog({
  configId,
  item,
  onClose,
}: {
  configId: number;
  item?: InventoryItem;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState<"envelope" | "box" | "pallet">(item?.category ?? "box");
  const [unit, setUnit] = useState(item?.unit ?? "each");
  const [onHandQty, setOnHandQty] = useState(String(item?.onHandQty ?? 0));
  const [minStockLevel, setMinStockLevel] = useState(String(item?.minStockLevel ?? 0));
  const [notes, setNotes] = useState(item?.notes ?? "");

  const upsert = trpc.smallParcel.upsertPackagingInventoryItem.useMutation({
    onSuccess: () => {
      utils.smallParcel.listPackagingInventory.invalidate({ configId });
      toast.success(item ? "Item updated" : "Item added");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  function handleSave() {
    if (!name.trim()) return toast.error("Name is required");
    upsert.mutate({
      id: item?.id,
      configId,
      name: name.trim(),
      category,
      unit: unit.trim() || "each",
      onHandQty: parseInt(onHandQty) || 0,
      minStockLevel: parseInt(minStockLevel) || 0,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Packaging Item" : "Add Packaging Item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium text-slate-300 mb-1 block">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 12×10×8 Box"
              className="bg-[#1e2130] border-white/10"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-300 mb-1 block">Category</label>
              <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                <SelectTrigger className="bg-[#1e2130] border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="envelope">Envelope</SelectItem>
                  <SelectItem value="box">Box</SelectItem>
                  <SelectItem value="pallet">Pallet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 mb-1 block">Unit</label>
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="each"
                className="bg-[#1e2130] border-white/10"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-300 mb-1 block">On-Hand Qty</label>
              <Input
                type="number"
                min={0}
                value={onHandQty}
                onChange={(e) => setOnHandQty(e.target.value)}
                className="bg-[#1e2130] border-white/10"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 mb-1 block">Min Stock Level</label>
              <Input
                type="number"
                min={0}
                value={minStockLevel}
                onChange={(e) => setMinStockLevel(e.target.value)}
                className="bg-[#1e2130] border-white/10"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 mb-1 block">Notes (optional)</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. supplier, SKU, storage location"
              className="bg-[#1e2130] border-white/10"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={upsert.isPending}>Cancel</Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            {item ? "Save Changes" : "Add Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Inline On-Hand Editor ────────────────────────────────────────────────────

function OnHandCell({
  item,
  configId,
}: {
  item: InventoryItem;
  configId: number;
}) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(item.onHandQty));

  const update = trpc.smallParcel.updatePackagingOnHand.useMutation({
    onSuccess: () => {
      utils.smallParcel.listPackagingInventory.invalidate({ configId });
      setEditing(false);
    },
    onError: (e) => toast.error(e.message),
  });

  function commit() {
    const qty = parseInt(value);
    if (isNaN(qty) || qty < 0) return;
    if (qty === item.onHandQty) { setEditing(false); return; }
    update.mutate({ id: item.id, configId, onHandQty: qty });
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          onBlur={commit}
          autoFocus
          className="w-20 h-7 text-sm bg-[#1e2130] border-white/10 px-2"
        />
        {update.isPending && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
      </div>
    );
  }

  return (
    <button
      onClick={() => { setValue(String(item.onHandQty)); setEditing(true); }}
      className="font-mono text-sm text-slate-200 hover:text-white hover:underline underline-offset-2 cursor-pointer"
      title="Click to edit"
    >
      {item.onHandQty}
    </button>
  );
}

// ─── Reorder Request Dialog ───────────────────────────────────────────────────

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
  const [qty, setQty] = useState(String(Math.max(item.minStockLevel - item.onHandQty, 1)));
  const [notes, setNotes] = useState("");

  const create = trpc.smallParcel.createPackagingReorderRequest.useMutation({
    onSuccess: () => {
      utils.smallParcel.listPackagingReorderRequests.invalidate({ configId });
      toast.success("Reorder request submitted — accounting has been notified");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Request Reorder</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-[#1e2130] border border-white/10 px-4 py-3">
            <p className="text-sm font-medium text-slate-200">{item.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              On hand: <span className="text-slate-300 font-mono">{item.onHandQty}</span> {item.unit} &nbsp;·&nbsp;
              Min: <span className="text-slate-300 font-mono">{item.minStockLevel}</span> {item.unit}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 mb-1 block">Quantity to Order</label>
            <Input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="bg-[#1e2130] border-white/10"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 mb-1 block">Notes (optional)</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Urgency, supplier preference, etc."
              className="bg-[#1e2130] border-white/10"
            />
          </div>
          <p className="text-xs text-slate-500">
            Submitting this request will notify accounting to place the order.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button onClick={() => create.mutate({ inventoryItemId: item.id, configId, requestedQty: parseInt(qty) || 1, notes: notes.trim() || undefined })} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ShoppingCart className="w-4 h-4 mr-1" />}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Stock Table ──────────────────────────────────────────────────────────────

function StockTable({
  items,
  configId,
  onEdit,
  onDelete,
  onReorder,
}: {
  items: InventoryItem[];
  configId: number;
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
  onReorder: (item: InventoryItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <Package className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">No packaging items yet. Add one to get started.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-500">
            <th className="text-left py-2 px-3 font-medium">Name</th>
            <th className="text-left py-2 px-3 font-medium">Category</th>
            <th className="text-right py-2 px-3 font-medium">On Hand</th>
            <th className="text-right py-2 px-3 font-medium">Unit</th>
            <th className="text-right py-2 px-3 font-medium">Min Stock</th>
            <th className="text-left py-2 px-3 font-medium">Status</th>
            <th className="text-right py-2 px-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const status = stockStatus(item);
            return (
              <tr
                key={item.id}
                className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors ${
                  status === "critical" ? "bg-red-500/5" : status === "low" ? "bg-amber-500/5" : ""
                }`}
              >
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    {status === "critical" && <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                    {status === "low" && <TrendingDown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                    <span className="text-slate-200 font-medium">{item.name}</span>
                  </div>
                  {item.notes && <p className="text-[11px] text-slate-500 mt-0.5 pl-5">{item.notes}</p>}
                </td>
                <td className="py-2.5 px-3">
                  <Badge className={`text-[11px] border ${categoryColor(item.category)}`}>
                    {categoryLabel(item.category)}
                  </Badge>
                </td>
                <td className="py-2.5 px-3 text-right">
                  <OnHandCell item={item} configId={configId} />
                </td>
                <td className="py-2.5 px-3 text-right text-slate-400 text-xs">{item.unit}</td>
                <td className="py-2.5 px-3 text-right font-mono text-slate-400">{item.minStockLevel}</td>
                <td className="py-2.5 px-3">{statusBadge(status)}</td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                      onClick={() => onReorder(item)}
                      title="Request reorder"
                    >
                      <ShoppingCart className="w-3.5 h-3.5 mr-1" /> Reorder
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-slate-400 hover:text-slate-200"
                      onClick={() => onEdit(item)}
                      title="Edit item"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
                      onClick={() => onDelete(item)}
                      title="Delete item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Requests Tab ─────────────────────────────────────────────────────────────

function RequestsTab({
  requests,
  items,
  configId,
}: {
  requests: ReorderRequest[];
  items: InventoryItem[];
  configId: number;
}) {
  const utils = trpc.useUtils();
  const updateStatus = trpc.smallParcel.updatePackagingReorderRequestStatus.useMutation({
    onSuccess: () => {
      utils.smallParcel.listPackagingReorderRequests.invalidate({ configId });
      toast.success("Status updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const itemMap = useMemo(() => {
    const m = new Map<number, InventoryItem>();
    for (const i of items) m.set(i.id, i);
    return m;
  }, [items]);

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <CheckCircle2 className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">No reorder requests yet.</p>
      </div>
    );
  }

  const open = requests.filter((r) => r.status === "pending" || r.status === "ordered");
  const closed = requests.filter((r) => r.status === "received" || r.status === "cancelled");

  function RequestRow({ req }: { req: ReorderRequest }) {
    const item = itemMap.get(req.inventoryItemId);
    return (
      <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
        <td className="py-2.5 px-3">
          <p className="text-slate-200 font-medium text-sm">{item?.name ?? `Item #${req.inventoryItemId}`}</p>
          {item && (
            <Badge className={`text-[10px] border mt-0.5 ${categoryColor(item.category)}`}>
              {categoryLabel(item.category)}
            </Badge>
          )}
        </td>
        <td className="py-2.5 px-3 text-right font-mono text-slate-200">{req.requestedQty}</td>
        <td className="py-2.5 px-3 text-slate-400 text-xs">{req.requestedByName ?? "—"}</td>
        <td className="py-2.5 px-3 text-slate-400 text-xs">
          {new Date(req.createdAt).toLocaleDateString()}
        </td>
        <td className="py-2.5 px-3">{reorderStatusBadge(req.status)}</td>
        <td className="py-2.5 px-3">
          {req.notes && <p className="text-xs text-slate-500 max-w-[180px] truncate" title={req.notes}>{req.notes}</p>}
        </td>
        <td className="py-2.5 px-3">
          <div className="flex items-center justify-end gap-1">
            {req.status === "pending" && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                onClick={() => updateStatus.mutate({ id: req.id, configId, status: "ordered" })}
                disabled={updateStatus.isPending}
              >
                <Clock className="w-3 h-3 mr-1" /> Mark Ordered
              </Button>
            )}
            {req.status === "ordered" && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                onClick={() => updateStatus.mutate({ id: req.id, configId, status: "received" })}
                disabled={updateStatus.isPending}
              >
                <CheckCircle2 className="w-3 h-3 mr-1" /> Mark Received
              </Button>
            )}
            {(req.status === "pending" || req.status === "ordered") && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
                onClick={() => updateStatus.mutate({ id: req.id, configId, status: "cancelled" })}
                disabled={updateStatus.isPending}
              >
                <XCircle className="w-3 h-3" />
              </Button>
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-6">
      {open.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Open Requests ({open.length})</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="text-left py-2 px-3 font-medium">Item</th>
                  <th className="text-right py-2 px-3 font-medium">Qty</th>
                  <th className="text-left py-2 px-3 font-medium">Requested By</th>
                  <th className="text-left py-2 px-3 font-medium">Date</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                  <th className="text-left py-2 px-3 font-medium">Notes</th>
                  <th className="text-right py-2 px-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {open.map((req) => <RequestRow key={req.id} req={req} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {closed.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Fulfilled / Cancelled ({closed.length})</p>
          <div className="overflow-x-auto opacity-60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="text-left py-2 px-3 font-medium">Item</th>
                  <th className="text-right py-2 px-3 font-medium">Qty</th>
                  <th className="text-left py-2 px-3 font-medium">Requested By</th>
                  <th className="text-left py-2 px-3 font-medium">Date</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                  <th className="text-left py-2 px-3 font-medium">Notes</th>
                  <th className="py-2 px-3" />
                </tr>
              </thead>
              <tbody>
                {closed.map((req) => <RequestRow key={req.id} req={req} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PackagingInventory() {
  const [tab, setTab] = useState("stock");
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [reorderItem, setReorderItem] = useState<InventoryItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<InventoryItem | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<"all" | "envelope" | "box" | "pallet">("all");

  const { data: configs } = trpc.config.list.useQuery();
  const configId = configs?.[0]?.id ?? 0;

  const { data: items = [], isLoading } = trpc.smallParcel.listPackagingInventory.useQuery(
    { configId },
    { enabled: configId > 0, staleTime: 30_000 }
  );

  const { data: requests = [], isLoading: requestsLoading } = trpc.smallParcel.listPackagingReorderRequests.useQuery(
    { configId },
    { enabled: configId > 0, staleTime: 30_000 }
  );

  const utils = trpc.useUtils();
  const deleteItem_ = trpc.smallParcel.deletePackagingInventoryItem.useMutation({
    onSuccess: () => {
      utils.smallParcel.listPackagingInventory.invalidate({ configId });
      toast.success("Item deleted");
      setDeleteItem(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const filteredItems = useMemo(() => {
    if (categoryFilter === "all") return items;
    return items.filter((i) => i.category === categoryFilter);
  }, [items, categoryFilter]);

  // Summary stats
  const criticalCount = items.filter((i) => stockStatus(i) === "critical").length;
  const lowCount = items.filter((i) => stockStatus(i) === "low").length;
  const openRequests = requests.filter((r) => r.status === "pending" || r.status === "ordered").length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Packaging Inventory</h1>
          <p className="text-sm text-slate-400 mt-0.5">Track on-hand stock and submit reorder requests</p>
        </div>
        <Button onClick={() => setAddOpen(true)} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> Add Item
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl bg-[#1a1d2e] border border-white/10 px-5 py-4">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total Items</p>
          <p className="text-2xl font-bold text-slate-100">{items.length}</p>
        </div>
        <div className={`rounded-xl border px-5 py-4 ${criticalCount > 0 ? "bg-red-500/10 border-red-500/20" : "bg-[#1a1d2e] border-white/10"}`}>
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Below Min Stock</p>
          <p className={`text-2xl font-bold ${criticalCount > 0 ? "text-red-400" : "text-slate-100"}`}>{criticalCount}</p>
        </div>
        <div className={`rounded-xl border px-5 py-4 ${openRequests > 0 ? "bg-amber-500/10 border-amber-500/20" : "bg-[#1a1d2e] border-white/10"}`}>
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Open Reorder Requests</p>
          <p className={`text-2xl font-bold ${openRequests > 0 ? "text-amber-400" : "text-slate-100"}`}>{openRequests}</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between mb-4">
          <TabsList className="bg-[#1a1d2e] border border-white/10">
            <TabsTrigger value="stock" className="data-[state=active]:bg-white/10">
              Stock
              {(criticalCount > 0 || lowCount > 0) && (
                <span className="ml-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                  {criticalCount + lowCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="requests" className="data-[state=active]:bg-white/10">
              Reorder Requests
              {openRequests > 0 && (
                <span className="ml-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                  {openRequests}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {tab === "stock" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Filter:</span>
              {(["all", "envelope", "box", "pallet"] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    categoryFilter === cat
                      ? "bg-white/10 border-white/20 text-slate-200"
                      : "border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20"
                  }`}
                >
                  {cat === "all" ? "All" : categoryLabel(cat)}
                </button>
              ))}
            </div>
          )}
        </div>

        <TabsContent value="stock">
          <div className="rounded-xl bg-[#1a1d2e] border border-white/10 overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading inventory…
              </div>
            ) : (
              <StockTable
                items={filteredItems}
                configId={configId}
                onEdit={setEditItem}
                onDelete={setDeleteItem}
                onReorder={setReorderItem}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="requests">
          <div className="rounded-xl bg-[#1a1d2e] border border-white/10 p-4">
            {requestsLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading requests…
              </div>
            ) : (
              <RequestsTab requests={requests as ReorderRequest[]} items={items as InventoryItem[]} configId={configId} />
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {addOpen && (
        <ItemDialog configId={configId} onClose={() => setAddOpen(false)} />
      )}
      {editItem && (
        <ItemDialog configId={configId} item={editItem} onClose={() => setEditItem(null)} />
      )}
      {reorderItem && (
        <ReorderDialog item={reorderItem} configId={configId} onClose={() => setReorderItem(null)} />
      )}

      {/* Delete confirmation */}
      {deleteItem && (
        <Dialog open onOpenChange={(o) => { if (!o) setDeleteItem(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Item?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-400 py-2">
              Are you sure you want to delete <span className="text-slate-200 font-medium">{deleteItem.name}</span>? This cannot be undone.
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

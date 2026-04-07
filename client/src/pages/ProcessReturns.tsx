import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Warehouse,
  Users,
  ScanBarcode,
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  CheckCircle2,
  Loader2,
  PackageCheck,
  RotateCcw,
  X,
  Pencil,
  Send,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
type Condition = "new" | "good" | "damaged" | "unsellable";
type Disposition = "restock" | "quarantine" | "destroy" | "return_to_vendor";

type ScannedItem = {
  id: number;
  sessionId: number;
  sku: string;
  description?: string | null;
  quantity: number;
  condition: Condition;
  disposition: Disposition;
  lotNumber?: string | null;
  notes?: string | null;
  scannedByName?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type Session = {
  id: number;
  configId: number;
  warehouseName: string;
  clientId: number;
  clientName: string;
  status: "open" | "closed" | "cancelled";
  referenceNumber?: string | null;
  notes?: string | null;
  createdByName?: string | null;
  pushStatus?: "pending" | "sent" | "failed" | null;
  pushAttempts?: number | null;
  pushError?: string | null;
  lastPushedAt?: Date | string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const CONDITION_OPTIONS: { value: Condition; label: string; color: string }[] = [
  { value: "new", label: "New / Unopened", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "good", label: "Good / Used", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "damaged", label: "Damaged", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "unsellable", label: "Unsellable", color: "bg-red-100 text-red-700 border-red-200" },
];

const DISPOSITION_OPTIONS: { value: Disposition; label: string }[] = [
  { value: "restock", label: "Restock" },
  { value: "quarantine", label: "Quarantine" },
  { value: "destroy", label: "Destroy" },
  { value: "return_to_vendor", label: "Return to Vendor" },
];

function conditionStyle(c: Condition) {
  return CONDITION_OPTIONS.find((o) => o.value === c)?.color ?? "";
}
function conditionLabel(c: Condition) {
  return CONDITION_OPTIONS.find((o) => o.value === c)?.label ?? c;
}
function dispositionLabel(d: Disposition) {
  return DISPOSITION_OPTIONS.find((o) => o.value === d)?.label ?? d;
}

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Warehouse", icon: Warehouse },
    { n: 2, label: "Customer", icon: Users },
    { n: 3, label: "Scan Items", icon: ScanBarcode },
  ];
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map(({ n, label, icon: Icon }, idx) => (
        <div key={n} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                step === n
                  ? "bg-blue-600 border-blue-600 text-white shadow-md"
                  : step > n
                  ? "bg-emerald-500 border-emerald-500 text-white"
                  : "bg-muted border-border text-muted-foreground"
              }`}
            >
              {step > n ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
            </div>
            <span
              className={`text-[11px] font-semibold mt-1 ${
                step === n ? "text-blue-600" : step > n ? "text-emerald-600" : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div
              className={`h-0.5 w-16 mx-1 mb-4 transition-all ${step > n ? "bg-emerald-400" : "bg-border"}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step 1: Select Warehouse ─────────────────────────────────────────────────
function StepWarehouse({
  onSelect,
}: {
  onSelect: (configId: number, facilityId: number, facilityName: string) => void;
}) {
  const { data: configs = [], isLoading: configsLoading } = trpc.config.list.useQuery();
  const primaryConfig = configs[0];
  const { data: facilities = [], isLoading: facilitiesLoading } = trpc.returns.listFacilities.useQuery(
    { configId: primaryConfig?.id ?? 0 },
    { enabled: !!primaryConfig }
  );
  const isLoading = configsLoading || (!!primaryConfig && facilitiesLoading);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Select Warehouse</h2>
      <p className="text-sm text-muted-foreground mb-5">
        Choose the warehouse where the return is being received.
      </p>
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading warehouses…</span>
        </div>
      ) : !primaryConfig ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No warehouses configured. Add one in Settings first.
        </div>
      ) : facilities.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No facilities found. Please check your Extensiv connection in Settings.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {facilities.map((f) => (
            <button
              key={f.id}
              onClick={() => onSelect(primaryConfig.id, f.id, f.name)}
              className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-blue-400 hover:shadow-md transition-all text-left group"
            >
              <div className="p-2.5 rounded-lg bg-blue-50 group-hover:bg-blue-100 transition-colors">
                <Warehouse className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground truncate">
                  {f.name}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-blue-500 transition-colors" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Step 2: Select Customer ──────────────────────────────────────────────────
function StepCustomer({
  configId,
  warehouseName,
  onSelect,
  onBack,
}: {
  configId: number;
  warehouseName: string;
  onSelect: (clientId: number, clientName: string) => void;
  onBack: () => void;
}) {
  const [search, setSearch] = useState("");
  const { data: customers = [], isLoading } = trpc.extensiv.customers.useQuery({ configId });

  const filtered = [...customers]
    .filter((c: { id: number; name: string }) =>
      c.name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Select Customer</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Choose the customer whose items are being returned at{" "}
        <span className="font-medium text-foreground">{warehouseName}</span>.
      </p>
      <Input
        placeholder="Search customers…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4"
      />
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading customers…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          {search ? "No customers match your search." : "No customers found for this warehouse."}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 max-h-80 overflow-y-auto pr-1">
          {filtered.map((c: { id: number; name: string }) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id, c.name)}
              className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:border-blue-400 hover:shadow-sm transition-all text-left group"
            >
              <div className="p-2 rounded-lg bg-purple-50 group-hover:bg-purple-100 transition-colors">
                <Users className="h-4 w-4 text-purple-600" />
              </div>
              <span className="font-medium text-sm text-foreground flex-1 truncate">{c.name}</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-blue-500 transition-colors" />
            </button>
          ))}
        </div>
      )}
      <div className="mt-5">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Scan Items ───────────────────────────────────────────────────────
function StepScanItems({
  session,
  items,
  onItemAdded,
  onItemRemoved,
  onClose,
  onBack,
}: {
  session: Session;
  items: ScannedItem[];
  onItemAdded: () => void;
  onItemRemoved: () => void;
  onClose: () => void;
  onBack: () => void;
}) {
  const utils = trpc.useUtils();
  const skuRef = useRef<HTMLInputElement>(null);

  // Form state
  const [sku, setSku] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [condition, setCondition] = useState<Condition>("good");
  const [disposition, setDisposition] = useState<Disposition>("restock");
  const [lotNumber, setLotNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const addItem = trpc.returns.addItem.useMutation({
    onSuccess: () => {
      utils.returns.getSession.invalidate({ id: session.id });
      onItemAdded();
      // Reset form but keep condition/disposition
      setSku("");
      setDescription("");
      setQuantity(1);
      setLotNumber("");
      setNotes("");
      setEditingId(null);
      setTimeout(() => skuRef.current?.focus(), 50);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateItem = trpc.returns.updateItem.useMutation({
    onSuccess: () => {
      utils.returns.getSession.invalidate({ id: session.id });
      onItemAdded();
      setSku("");
      setDescription("");
      setQuantity(1);
      setLotNumber("");
      setNotes("");
      setEditingId(null);
      setTimeout(() => skuRef.current?.focus(), 50);
    },
    onError: (err) => toast.error(err.message),
  });

  const removeItem = trpc.returns.removeItem.useMutation({
    onSuccess: () => {
      utils.returns.getSession.invalidate({ id: session.id });
      onItemRemoved();
    },
    onError: (err) => toast.error(err.message),
  });

  const closeSession = trpc.returns.closeSession.useMutation({
    onSuccess: () => {
      toast.success("Session closed successfully");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const pushToClearSight = trpc.returns.pushSessionToClearSight.useMutation({
    onSuccess: (data) => {
      toast.success(`Pushed to ClearSight — ${data.itemCount} item${data.itemCount !== 1 ? "s" : ""} sent.`);
      utils.returns.getSession.invalidate({ id: session.id });
    },
    onError: (err) => {
      toast.error(`Push failed: ${err.message}`);
      utils.returns.getSession.invalidate({ id: session.id });
    },
  });

  // Auto-focus SKU input on mount
  useEffect(() => {
    setTimeout(() => skuRef.current?.focus(), 100);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sku.trim()) return;
    if (editingId !== null) {
      updateItem.mutate({ id: editingId, sku: sku.trim(), description: description || undefined, quantity, condition, disposition, lotNumber: lotNumber || undefined, notes: notes || undefined });
    } else {
      addItem.mutate({ sessionId: session.id, sku: sku.trim(), description: description || undefined, quantity, condition, disposition, lotNumber: lotNumber || undefined, notes: notes || undefined });
    }
  }

  function handleEdit(item: ScannedItem) {
    setEditingId(item.id);
    setSku(item.sku);
    setDescription(item.description ?? "");
    setQuantity(item.quantity);
    setCondition(item.condition);
    setDisposition(item.disposition);
    setLotNumber(item.lotNumber ?? "");
    setNotes(item.notes ?? "");
    setTimeout(() => skuRef.current?.focus(), 50);
  }

  function handleCancelEdit() {
    setEditingId(null);
    setSku("");
    setDescription("");
    setQuantity(1);
    setLotNumber("");
    setNotes("");
    setTimeout(() => skuRef.current?.focus(), 50);
  }

  const totalUnits = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div>
      {/* Session info bar */}
      <div className="flex flex-wrap items-center gap-3 mb-5 p-3 rounded-xl bg-muted/50 border border-border/50 text-sm">
        <span className="font-semibold text-foreground">Session #{session.id}</span>
        <span className="text-muted-foreground">|</span>
        <span className="text-muted-foreground">{session.warehouseName}</span>
        <span className="text-muted-foreground">|</span>
        <span className="font-medium text-foreground">{session.clientName}</span>
        {session.referenceNumber && (
          <>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">Ref: {session.referenceNumber}</span>
          </>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {items.length} SKU{items.length !== 1 ? "s" : ""} &bull; {totalUnits} unit{totalUnits !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        {/* Scan form */}
        <Card className="shadow-sm border-0 bg-white dark:bg-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <ScanBarcode className="h-4 w-4 text-blue-600" />
              <h3 className="font-semibold text-sm">
                {editingId !== null ? "Edit Item" : "Scan / Enter Item"}
              </h3>
              {editingId !== null && (
                <button
                  onClick={handleCancelEdit}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <X className="h-3 w-3" /> Cancel edit
                </button>
              )}
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* SKU */}
              <div>
                <Label className="text-xs font-semibold mb-1 block">SKU / Barcode *</Label>
                <Input
                  ref={skuRef}
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="Scan barcode or type SKU…"
                  className="font-mono"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <Label className="text-xs font-semibold mb-1 block">Description</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional item description"
                />
              </div>

              {/* Qty + Condition */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold mb-1 block">Quantity</Label>
                  <Input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="tabular-nums"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold mb-1 block">Condition</Label>
                  <Select value={condition} onValueChange={(v) => setCondition(v as Condition)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONDITION_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Disposition */}
              <div>
                <Label className="text-xs font-semibold mb-1 block">Disposition</Label>
                <Select value={disposition} onValueChange={(v) => setDisposition(v as Disposition)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DISPOSITION_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Lot + Notes */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold mb-1 block">Lot / Serial #</Label>
                  <Input
                    value={lotNumber}
                    onChange={(e) => setLotNumber(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold mb-1 block">Notes</Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full gap-2"
                disabled={addItem.isPending || updateItem.isPending}
              >
                {addItem.isPending || updateItem.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : editingId !== null ? (
                  <Pencil className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {editingId !== null ? "Update Item" : "Add Item"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Scanned items list */}
        <Card className="shadow-sm border-0 bg-white dark:bg-card flex flex-col">
          <CardContent className="p-0 flex flex-col flex-1">
            <div className="px-5 pt-5 pb-3 border-b border-border/40">
              <p className="text-sm font-semibold">
                Scanned Items
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({items.length} line{items.length !== 1 ? "s" : ""}, {totalUnits} unit{totalUnits !== 1 ? "s" : ""})
                </span>
              </p>
            </div>

            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 py-12 text-muted-foreground">
                <PackageCheck className="h-8 w-8 mb-2 opacity-20" />
                <p className="text-sm">No items scanned yet</p>
                <p className="text-xs opacity-60 mt-1">Scan a barcode or enter a SKU to begin</p>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 max-h-[400px]">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-start gap-3 px-4 py-3 border-b border-border/30 hover:bg-muted/20 transition-colors ${
                      editingId === item.id ? "bg-blue-50/50 dark:bg-blue-950/20" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold text-foreground">
                          {item.sku}
                        </span>
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${conditionStyle(item.condition)}`}
                        >
                          {conditionLabel(item.condition)}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">x{item.quantity}</span>
                        <span>{dispositionLabel(item.disposition)}</span>
                        {item.lotNumber && <span>Lot: {item.lotNumber}</span>}
                      </div>
                      {item.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5 italic">{item.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleEdit(item)}
                        className="p-1.5 rounded hover:bg-blue-100 text-muted-foreground hover:text-blue-600 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => removeItem.mutate({ id: item.id })}
                        className="p-1.5 rounded hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors"
                        title="Remove"
                        disabled={removeItem.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Footer actions */}
            <div className="px-4 py-3 border-t border-border/40 flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="gap-1 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </Button>
              <Button
                size="sm"
                className="ml-auto gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                disabled={items.length === 0 || closeSession.isPending}
                onClick={() => setConfirmClose(true)}
              >
                {closeSession.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Close Session
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Close confirmation dialog */}
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this return session?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to close Session #{session.id} for{" "}
              <strong>{session.clientName}</strong> with {items.length} line item
              {items.length !== 1 ? "s" : ""} ({totalUnits} unit{totalUnits !== 1 ? "s" : ""}). This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
                setConfirmClose(false);
                closeSession.mutate({ id: session.id });
              }}
            >
              Close Session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Post-close: Push to ClearSight */}
      {session.status === "closed" && (() => {
        const ps = session.pushStatus;
        const attempts = session.pushAttempts ?? 0;
        const isSent = ps === "sent";
        const isFailed = ps === "failed";
        const isPending = pushToClearSight.isPending;
        const maxAttemptsReached = attempts >= 3;

        // Colour scheme per status
        const panelCls = isSent
          ? "border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-800"
          : isFailed
          ? "border-red-200 bg-red-50/60 dark:bg-red-950/20 dark:border-red-800"
          : "border-blue-200 bg-blue-50/60 dark:bg-blue-950/20 dark:border-blue-800";

        return (
          <div className={`mt-4 p-4 rounded-xl border ${panelCls} flex items-start gap-3`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                {isSent ? (
                  <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : isFailed ? (
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                ) : null}
                <p className={`text-sm font-semibold ${
                  isSent ? "text-emerald-900 dark:text-emerald-200"
                  : isFailed ? "text-red-900 dark:text-red-200"
                  : "text-blue-900 dark:text-blue-200"
                }`}>
                  {isSent ? "Pushed to ClearSight" : isFailed ? "Push Failed" : "Session Closed"}
                </p>
                {attempts > 0 && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    isSent ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                  }`}>
                    {attempts} attempt{attempts !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              {isFailed && session.pushError && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 break-words">
                  {session.pushError}
                </p>
              )}
              {!isSent && !isFailed && (
                <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                  Push this session to ClearSight to notify them of the processed return.
                </p>
              )}
              {isFailed && maxAttemptsReached && (
                <p className="text-xs text-red-500 mt-1">
                  Maximum auto-retry attempts (3) reached. Use the button to retry manually.
                </p>
              )}
            </div>
            {!isSent && (
              <Button
                size="sm"
                className={`gap-1.5 shrink-0 ${
                  isFailed
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
                onClick={() => pushToClearSight.mutate({ sessionId: session.id })}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isFailed ? (
                  <RotateCcw className="h-3.5 w-3.5" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                {isFailed ? "Retry Push" : "Push to ClearSight"}
              </Button>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ProcessReturns() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [configId, setConfigId] = useState<number | null>(null);
  const [warehouseName, setWarehouseName] = useState("");
  const [facilityId, setFacilityId] = useState<number | null>(null);
  const [clientId, setClientId] = useState<number | null>(null);
  const [clientName, setClientName] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [refNumber, setRefNumber] = useState("");
  const [showRefDialog, setShowRefDialog] = useState(false);
  const [pendingClientId, setPendingClientId] = useState<number | null>(null);
  const [pendingClientName, setPendingClientName] = useState("");

  const utils = trpc.useUtils();

  // Load existing session if we have one
  const { data: sessionData, refetch: refetchSession } = trpc.returns.getSession.useQuery(
    { id: sessionId! },
    { enabled: sessionId !== null }
  );

  const createSession = trpc.returns.createSession.useMutation({
    onSuccess: (data) => {
      setSessionId(data.id);
      setStep(3);
      setShowRefDialog(false);
    },
    onError: (err) => toast.error(err.message),
  });

  function handleWarehouseSelect(cId: number, fId: number, fName: string) {
    setConfigId(cId);
    setFacilityId(fId);
    setWarehouseName(fName);
    setStep(2);
  }

  function handleCustomerSelect(id: number, name: string) {
    setPendingClientId(id);
    setPendingClientName(name);
    setShowRefDialog(true);
  }

  function handleStartSession() {
    if (!configId || !pendingClientId) return;
    setClientId(pendingClientId);
    setClientName(pendingClientName);
    createSession.mutate({
      configId,
      warehouseName,
      facilityId: facilityId ?? undefined,
      facilityName: warehouseName || undefined,
      clientId: pendingClientId,
      clientName: pendingClientName,
      referenceNumber: refNumber.trim() || undefined,
    });
  }

  function handleSessionClosed() {
    navigate("/returns");
  }

  return (
    <div className="p-7 page-enter max-w-5xl">
      <p className="page-breadcrumb">Returns</p>
      <h1 className="page-title">Process Returns</h1>
      <p className="text-sm text-muted-foreground mb-7">
        Step through warehouse, customer, and item scanning to record an inbound return.
      </p>

      <StepIndicator step={step} />

      <Card className="shadow-sm border-0 bg-white dark:bg-card">
        <CardContent className="p-6">
          {step === 1 && (
            <StepWarehouse onSelect={handleWarehouseSelect} />
          )}
          {step === 2 && configId !== null && (
            <StepCustomer
              configId={configId}
              warehouseName={warehouseName}
              onSelect={handleCustomerSelect}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && sessionId !== null && sessionData && (
            <StepScanItems
              session={sessionData.session as Session}
              items={sessionData.items as ScannedItem[]}
              onItemAdded={() => refetchSession()}
              onItemRemoved={() => refetchSession()}
              onClose={handleSessionClosed}
              onBack={() => {
                // Don't go back once session is created — just navigate to dashboard
                navigate("/returns");
              }}
            />
          )}
          {step === 3 && (sessionId === null || !sessionData) && (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm">Creating session…</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reference number dialog */}
      <AlertDialog open={showRefDialog} onOpenChange={setShowRefDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start Return Session</AlertDialogTitle>
            <AlertDialogDescription>
              Starting a return for <strong>{pendingClientName}</strong> at{" "}
              <strong>{warehouseName}</strong>. Optionally enter an RMA or reference number.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 py-2">
            <Label className="text-xs font-semibold mb-1 block">
              Reference / RMA Number (optional)
            </Label>
            <Input
              value={refNumber}
              onChange={(e) => setRefNumber(e.target.value)}
              placeholder="e.g. RMA-2026-001"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleStartSession();
              }}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowRefDialog(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleStartSession}
              disabled={createSession.isPending}
            >
              {createSession.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-1" />
              )}
              Start Session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

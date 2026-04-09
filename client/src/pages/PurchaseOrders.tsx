import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus,
  RefreshCw,
  RotateCcw,
  FileText,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
} from "lucide-react";

const WAREHOUSES = ["Columbus", "Reno", "Toronto", "Calgary"] as const;
type Warehouse = (typeof WAREHOUSES)[number];

const CURRENCIES = ["CAD", "USD"] as const;

function formatCurrency(val: string | null | undefined, currency = "CAD") {
  const n = parseFloat(val ?? "0");
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(n);
}

function PushStatusBadge({
  status,
  attempts,
}: {
  status: string;
  attempts: number;
}) {
  if (status === "sent")
    return (
      <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-1">
        <CheckCircle2 className="w-3 h-3" />
        Sent to OpFi
      </Badge>
    );
  if (status === "pending")
    return (
      <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 gap-1">
        <Clock className="w-3 h-3" />
        Pending
      </Badge>
    );
  if (status === "failed")
    return (
      <Badge className="bg-red-500/15 text-red-600 border-red-500/30 gap-1">
        <XCircle className="w-3 h-3" />
        Failed ({attempts})
      </Badge>
    );
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <AlertCircle className="w-3 h-3" />
      Skipped
    </Badge>
  );
}

function getCurrentBillingPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getTodayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

interface CreatePOForm {
  customerId: string;
  customerName: string;
  warehouse: Warehouse | "";
  poDate: string;
  billingPeriod: string;
  kittingCharge: string;
  labourCharge: string;
  materialCharge: string;
  currency: "CAD" | "USD";
  notes: string;
}

const EMPTY_FORM: CreatePOForm = {
  customerId: "",
  customerName: "",
  warehouse: "",
  poDate: getTodayDate(),
  billingPeriod: getCurrentBillingPeriod(),
  kittingCharge: "0.00",
  labourCharge: "0.00",
  materialCharge: "0.00",
  currency: "CAD",
  notes: "",
};

export default function PurchaseOrders() {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreatePOForm>(EMPTY_FORM);
  const [filterWarehouse, setFilterWarehouse] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterBillingPeriod, setFilterBillingPeriod] = useState<string>("");

  const utils = trpc.useUtils();

  const { data: pos = [], isLoading } = trpc.purchaseOrder.list.useQuery({
    warehouse: filterWarehouse !== "all" ? (filterWarehouse as Warehouse) : undefined,
    status: filterStatus !== "all" ? (filterStatus as "pending" | "sent" | "failed" | "skipped") : undefined,
    billingPeriod: filterBillingPeriod || undefined,
    limit: 200,
  });

  const createMutation = trpc.purchaseOrder.create.useMutation({
    onSuccess: (data) => {
      toast.success(`PO ${data.poNumber} created and pushed to OpFi`);
      setShowCreate(false);
      setForm(EMPTY_FORM);
      utils.purchaseOrder.list.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to create PO: ${err.message}`);
    },
  });

  const retryMutation = trpc.purchaseOrder.retryPush.useMutation({
    onSuccess: (res) => {
      if (res.success) {
        toast.success("Push to OpFi succeeded");
      } else {
        toast.error(`Retry failed: ${res.error}`);
      }
      utils.purchaseOrder.list.invalidate();
    },
    onError: (err) => {
      toast.error(`Retry error: ${err.message}`);
    },
  });

  const total = useMemo(() => {
    const k = parseFloat(form.kittingCharge) || 0;
    const l = parseFloat(form.labourCharge) || 0;
    const m = parseFloat(form.materialCharge) || 0;
    return k + l + m;
  }, [form.kittingCharge, form.labourCharge, form.materialCharge]);

  function handleCreate() {
    if (!form.customerId.trim()) {
      toast.error("Customer ID is required");
      return;
    }
    if (!form.customerName.trim()) {
      toast.error("Customer name is required");
      return;
    }
    if (!form.warehouse) {
      toast.error("Please select a warehouse");
      return;
    }
    createMutation.mutate({
      customerId: form.customerId.trim(),
      customerName: form.customerName.trim(),
      warehouse: form.warehouse as Warehouse,
      poDate: form.poDate,
      billingPeriod: form.billingPeriod,
      kittingCharge: parseFloat(form.kittingCharge) || 0,
      labourCharge: parseFloat(form.labourCharge) || 0,
      materialCharge: parseFloat(form.materialCharge) || 0,
      currency: form.currency,
      notes: form.notes || undefined,
    });
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create and manage GD Genius purchase orders — pushed to OpFi automatically on submission.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Purchase Order
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={filterWarehouse} onValueChange={setFilterWarehouse}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Warehouses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Warehouses</SelectItem>
            {WAREHOUSES.map((w) => (
              <SelectItem key={w} value={w}>{w}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
          </SelectContent>
        </Select>

        <Input
          placeholder="Billing period (YYYY-MM)"
          value={filterBillingPeriod}
          onChange={(e) => setFilterBillingPeriod(e.target.value)}
          className="w-48"
        />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => utils.purchaseOrder.list.invalidate()}
          className="gap-1.5 text-muted-foreground"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {/* Summary counts */}
      {pos.length > 0 && (
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{pos.length} PO{pos.length !== 1 ? "s" : ""}</span>
          <span className="text-emerald-600 font-medium">
            {pos.filter((p) => p.opfiPushStatus === "sent").length} sent
          </span>
          <span className="text-amber-600 font-medium">
            {pos.filter((p) => p.opfiPushStatus === "pending").length} pending
          </span>
          <span className="text-red-600 font-medium">
            {pos.filter((p) => p.opfiPushStatus === "failed").length} failed
          </span>
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-40">PO Number</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="w-28">Warehouse</TableHead>
              <TableHead className="w-28">Billing Period</TableHead>
              <TableHead className="w-24 text-right">Kitting</TableHead>
              <TableHead className="w-24 text-right">Labour</TableHead>
              <TableHead className="w-24 text-right">Material</TableHead>
              <TableHead className="w-28 text-right font-semibold">Total</TableHead>
              <TableHead className="w-36">OpFi Status</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                  Loading purchase orders…
                </TableCell>
              </TableRow>
            ) : pos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <FileText className="w-10 h-10 opacity-30" />
                    <p className="font-medium">No purchase orders yet</p>
                    <p className="text-sm">Click "New Purchase Order" to create your first PO.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              pos.map((po) => (
                <TableRow key={po.id} className="hover:bg-muted/20">
                  <TableCell className="font-mono text-sm font-medium">{po.poNumber}</TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{po.customerName}</div>
                    <div className="text-xs text-muted-foreground">{po.customerId}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{po.warehouse}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{po.billingPeriod}</TableCell>
                  <TableCell className="text-right text-sm">
                    {formatCurrency(po.kittingCharge, po.currency ?? "CAD")}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatCurrency(po.labourCharge, po.currency ?? "CAD")}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatCurrency(po.materialCharge, po.currency ?? "CAD")}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-sm">
                    {formatCurrency(po.totalCharge, po.currency ?? "CAD")}
                  </TableCell>
                  <TableCell>
                    <PushStatusBadge
                      status={po.opfiPushStatus ?? "pending"}
                      attempts={po.opfiPushAttempts ?? 0}
                    />
                  </TableCell>
                  <TableCell>
                    {(po.opfiPushStatus === "failed" || po.opfiPushStatus === "pending") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Retry OpFi push"
                        disabled={retryMutation.isPending}
                        onClick={() => retryMutation.mutate({ id: po.id })}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create PO Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              New Purchase Order
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Customer */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Customer ID</Label>
                <Input
                  placeholder="e.g. CUST-001"
                  value={form.customerId}
                  onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Customer Name</Label>
                <Input
                  placeholder="e.g. Acme Corp"
                  value={form.customerName}
                  onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                />
              </div>
            </div>

            {/* Warehouse + Currency */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Warehouse</Label>
                <Select
                  value={form.warehouse}
                  onValueChange={(v) => setForm((f) => ({ ...f, warehouse: v as Warehouse }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {WAREHOUSES.map((w) => (
                      <SelectItem key={w} value={w}>{w}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select
                  value={form.currency}
                  onValueChange={(v) => setForm((f) => ({ ...f, currency: v as "CAD" | "USD" }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>PO Date</Label>
                <Input
                  type="date"
                  value={form.poDate}
                  onChange={(e) => setForm((f) => ({ ...f, poDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Billing Period</Label>
                <Input
                  placeholder="YYYY-MM"
                  value={form.billingPeriod}
                  onChange={(e) => setForm((f) => ({ ...f, billingPeriod: e.target.value }))}
                />
              </div>
            </div>

            {/* Charges */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Charges ({form.currency})</Label>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Kitting</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.kittingCharge}
                    onChange={(e) => setForm((f) => ({ ...f, kittingCharge: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Labour</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.labourCharge}
                    onChange={(e) => setForm((f) => ({ ...f, labourCharge: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Material</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.materialCharge}
                    onChange={(e) => setForm((f) => ({ ...f, materialCharge: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <div className="text-sm font-semibold">
                  Total:{" "}
                  <span className="text-primary">
                    {new Intl.NumberFormat("en-CA", {
                      style: "currency",
                      currency: form.currency,
                    }).format(total)}
                  </span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Any additional notes for this PO…"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="gap-2"
            >
              {createMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Create & Push to OpFi
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus,
  ChevronLeft,
  Package,
  HardHat,
  Wrench,
  FileText,
  Box,
  DollarSign,
  LayoutGrid,
  RotateCcw,
  ChevronsUpDown,
} from "lucide-react";

type PoType = "kitting" | "labor" | "materials";
type View = "landing" | PoType;

const WAREHOUSES = ["Columbus", "Reno", "Toronto", "Calgary", "Mississauga"] as const;
const CURRENCIES = ["CAD", "USD"] as const;

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusStyle(status: string) {
  const map: Record<string, { bg: string; color: string }> = {
    approved: { bg: "#d1fae5", color: "#065f46" },
    pending:  { bg: "#fef3c7", color: "#92400e" },
    invoiced: { bg: "#dbeafe", color: "#1e40af" },
    received: { bg: "#d1fae5", color: "#065f46" },
    ordered:  { bg: "#fef3c7", color: "#92400e" },
    rejected: { bg: "#fee2e2", color: "#991b1b" },
    sent:     { bg: "#d1fae5", color: "#065f46" },
    failed:   { bg: "#fee2e2", color: "#991b1b" },
    skipped:  { bg: "#f3f4f6", color: "#374151" },
  };
  return map[status] ?? { bg: "#f3f4f6", color: "#374151" };
}

function StatusBadge({ status }: { status: string }) {
  const s = statusStyle(status);
  return (
    <span style={{ background: s.bg, color: s.color }} className="px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap">
      {status}
    </span>
  );
}

function WarehouseBadge({ warehouse }: { warehouse: string }) {
  return (
    <span className="bg-[#dcf0c8] text-[#3a6b20] px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap">
      {warehouse}
    </span>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">{icon}</div>
      <div>
        <div className="text-xs text-gray-500 font-medium mb-0.5">{label}</div>
        <div className="text-2xl font-extrabold text-gray-900 tracking-tight">{value}</div>
      </div>
    </div>
  );
}

function SimpleKpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="text-xs text-gray-500 font-medium mb-1">{label}</div>
      <div className="text-2xl font-extrabold text-gray-900 tracking-tight">{value}</div>
    </div>
  );
}

// ─── Customer Autocomplete ───────────────────────────────────────────────────
function CustomerAutocomplete({ value, onChange, onSelectId }: {
  value: string;
  onChange: (name: string) => void;
  onSelectId: (id: string) => void;
}) {
  const { data: configs } = trpc.config.list.useQuery();
  const configId = configs && configs.length > 0 ? configs[0]!.id : null;
  const { data: customers = [] } = trpc.extensiv.customers.useQuery(
    { configId: configId! },
    { enabled: !!configId }
  );
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = value.trim()
    ? customers.filter((c) => c.name.toLowerCase().includes(value.toLowerCase()))
    : customers;

  const handleSelect = (c: { id: number; name: string }) => {
    onChange(c.name);
    onSelectId(String(c.id));
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Type to search customers…"
          className="pr-8"
        />
        <ChevronsUpDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(c); }}
            >
              {c.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreatePoDialog({ open, onClose, defaultType, onCreated }: {
  open: boolean; onClose: () => void; defaultType: PoType; onCreated: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const thisPeriod = today.slice(0, 7);
  const [poType, setPoType] = useState<PoType>(defaultType);
  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [poDate, setPoDate] = useState(today);
  const [billingPeriod, setBillingPeriod] = useState(thisPeriod);
  const [currency, setCurrency] = useState<"CAD" | "USD">("CAD");
  const [notes, setNotes] = useState("");
  const [sku, setSku] = useState("");
  const [skuDescription, setSkuDescription] = useState("");
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [employeeRole, setEmployeeRole] = useState("");
  const [hoursWorked, setHoursWorked] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [itemName, setItemName] = useState("");
  const [vendorName, setVendorName] = useState("");

  const createMutation = trpc.purchaseOrder.create.useMutation({
    onSuccess: (data) => { toast.success(`PO ${data.poNumber} created`); onCreated(); onClose(); },
    onError: (err) => toast.error(err.message),
  });

  function handleSubmit() {
    if (!customerName.trim()) return toast.error("Customer name is required");
    if (!warehouse) return toast.error("Warehouse is required");
    createMutation.mutate({
      poType, customerId: customerId || customerName, customerName,
      warehouse: warehouse as typeof WAREHOUSES[number],
      poDate, billingPeriod, currency, notes: notes || undefined,
      sku: poType === "kitting" ? sku || undefined : undefined,
      skuDescription: poType === "kitting" ? skuDescription || undefined : undefined,
      qty: poType !== "labor" && qty ? parseInt(qty) : undefined,
      unitCost: poType !== "labor" && unitCost ? parseFloat(unitCost) : undefined,
      employeeName: poType === "labor" ? employeeName || undefined : undefined,
      employeeRole: poType === "labor" ? employeeRole || undefined : undefined,
      hoursWorked: poType === "labor" && hoursWorked ? parseFloat(hoursWorked) : undefined,
      hourlyRate: poType === "labor" && hourlyRate ? parseFloat(hourlyRate) : undefined,
      itemName: poType === "materials" ? itemName || undefined : undefined,
      vendorName: poType === "materials" ? vendorName || undefined : undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New {poType.charAt(0).toUpperCase() + poType.slice(1)} PO</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <Label>PO Type</Label>
            <Select value={poType} onValueChange={(v) => setPoType(v as PoType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="kitting">Kitting</SelectItem>
                <SelectItem value="labor">Labor</SelectItem>
                <SelectItem value="materials">Materials</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Customer Name *</Label>
              <CustomerAutocomplete
                value={customerName}
                onChange={setCustomerName}
                onSelectId={setCustomerId}
              />
            </div>
            <div><Label>Customer ID</Label><Input value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="Auto-filled or manual" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Warehouse *</Label>
              <Select value={warehouse} onValueChange={setWarehouse}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{WAREHOUSES.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as "CAD" | "USD")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>PO Date</Label><Input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} /></div>
            <div><Label>Billing Period (YYYY-MM)</Label><Input value={billingPeriod} onChange={(e) => setBillingPeriod(e.target.value)} placeholder="2026-04" /></div>
          </div>
          {poType === "kitting" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>SKU</Label><Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="KIT-001" /></div>
                <div><Label>Description</Label><Input value={skuDescription} onChange={(e) => setSkuDescription(e.target.value)} placeholder="Gift Set Assembly" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Quantity</Label><Input type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="500" /></div>
                <div><Label>Unit Cost</Label><Input type="number" min="0" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="2.10" /></div>
              </div>
            </>
          )}
          {poType === "labor" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Employee Name</Label><Input value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} placeholder="Mike Torres" /></div>
                <div><Label>Role</Label><Input value={employeeRole} onChange={(e) => setEmployeeRole(e.target.value)} placeholder="Warehouse Associate" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Hours Worked</Label><Input type="number" min="0" step="0.5" value={hoursWorked} onChange={(e) => setHoursWorked(e.target.value)} placeholder="40" /></div>
                <div><Label>Hourly Rate</Label><Input type="number" min="0" step="0.01" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder="28.00" /></div>
              </div>
            </>
          )}
          {poType === "materials" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Item Name</Label><Input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Poly Bags 12×15" /></div>
                <div><Label>Vendor</Label><Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="PackCo" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Quantity</Label><Input type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="5000" /></div>
                <div><Label>Unit Cost</Label><Input type="number" min="0" step="0.0001" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="0.08" /></div>
              </div>
            </>
          )}
          <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes…" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending} className="bg-[#5da032] hover:bg-[#4a8828] text-white">
            {createMutation.isPending ? "Creating…" : "Create PO"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LandingView({ onNavigate }: { onNavigate: (v: PoType) => void }) {
  const { data: allPos = [], refetch } = trpc.purchaseOrder.list.useQuery({});
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState<PoType>("kitting");

  const kittingPos = allPos.filter((p) => p.poType === "kitting");
  const laborPos = allPos.filter((p) => p.poType === "labor");
  const materialsPos = allPos.filter((p) => p.poType === "materials");
  const totalValue = allPos.reduce((s, p) => s + parseFloat(p.totalCharge ?? "0"), 0);
  const pendingCount = allPos.filter((p) => p.poStatus === "pending" || p.poStatus === "ordered").length;

  const categories = [
    {
      id: "kitting" as PoType, label: "Kitting",
      description: "Purchase orders for kitting and assembly operations. Track kit SKUs, quantities, unit costs, and approval status per customer.",
      Icon: Package, iconBg: "#dbeafe", iconColor: "#2563eb", accentColor: "#2563eb",
      count: kittingPos.length,
      pending: kittingPos.filter((p) => p.poStatus === "pending").length,
      value: kittingPos.reduce((s, p) => s + parseFloat(p.totalCharge ?? "0"), 0),
    },
    {
      id: "labor" as PoType, label: "Labor",
      description: "Purchase orders for warehouse labor charges. Track employee hours, roles, hourly rates, and billable labor cost per customer.",
      Icon: HardHat, iconBg: "#ede9fe", iconColor: "#7c3aed", accentColor: "#7c3aed",
      count: laborPos.length,
      pending: laborPos.filter((p) => p.poStatus === "pending").length,
      value: laborPos.reduce((s, p) => s + parseFloat(p.totalCharge ?? "0"), 0),
    },
    {
      id: "materials" as PoType, label: "Materials",
      description: "Purchase orders for packaging and consumable materials. Track items, vendors, quantities, and receipt status per customer.",
      Icon: Wrench, iconBg: "#d1fae5", iconColor: "#059669", accentColor: "#059669",
      count: materialsPos.length,
      pending: materialsPos.filter((p) => p.poStatus === "ordered").length,
      value: materialsPos.reduce((s, p) => s + parseFloat(p.totalCharge ?? "0"), 0),
    },
  ];

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      <div className="flex items-start justify-between mb-7">
        <div>
          <div className="text-xs text-gray-400 font-medium mb-1">Operations</div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Purchase Orders</h1>
          <p className="text-sm text-gray-500 mt-1">Manage kitting, labor, and materials POs across all warehouses</p>
        </div>
        <Button className="bg-[#5da032] hover:bg-[#4a8828] text-white font-semibold rounded-xl flex items-center gap-1.5"
          onClick={() => { setCreateType("kitting"); setShowCreate(true); }}>
          <Plus className="w-4 h-4" /> New PO
        </Button>
      </div>
      <div className="grid grid-cols-4 gap-4 mb-7">
        <KpiCard icon={<FileText className="w-5 h-5 text-[#5da032]" />} label="Total POs" value={allPos.length} />
        <KpiCard icon={<Box className="w-5 h-5 text-amber-500" />} label="Pending / Ordered" value={pendingCount} />
        <KpiCard icon={<DollarSign className="w-5 h-5 text-emerald-500" />} label="Total PO Value" value={fmt(totalValue)} />
        <KpiCard icon={<LayoutGrid className="w-5 h-5 text-violet-600" />} label="Categories" value={3} />
      </div>
      <div className="grid grid-cols-3 gap-6">
        {categories.map((cat) => (
          <div key={cat.id} onClick={() => onNavigate(cat.id)}
            className="bg-white rounded-2xl border-[1.5px] border-gray-200 p-7 cursor-pointer transition-all duration-200 shadow-sm hover:-translate-y-0.5"
            onMouseEnter={(e) => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = cat.accentColor; el.style.boxShadow = `0 4px 16px ${cat.accentColor}22`; }}
            onMouseLeave={(e) => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = "#e5e7eb"; el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)"; }}
          >
            <div className="flex items-start justify-between mb-5">
              <div className="rounded-2xl flex items-center justify-center" style={{ background: cat.iconBg, color: cat.iconColor, width: 52, height: 52 }}>
                <cat.Icon className="w-6 h-6" />
              </div>
              {cat.pending > 0 && (
                <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-full border border-amber-200">{cat.pending} pending</span>
              )}
            </div>
            <div className="text-xl font-extrabold text-gray-900 mb-2 tracking-tight">{cat.label}</div>
            <p className="text-sm text-gray-500 leading-relaxed mb-5">{cat.description}</p>
            <div className="grid grid-cols-2 gap-2.5 mb-5">
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-xs text-gray-400 font-medium">POs</div>
                <div className="text-base font-bold text-gray-900 mt-0.5">{cat.count}</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-xs text-gray-400 font-medium">Total Value</div>
                <div className="text-base font-bold text-gray-900 mt-0.5">{fmt(cat.value)}</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: cat.accentColor }}>
              View {cat.label} POs <span className="text-base">→</span>
            </div>
          </div>
        ))}
      </div>
      <CreatePoDialog open={showCreate} onClose={() => setShowCreate(false)} defaultType={createType} onCreated={() => refetch()} />
    </div>
  );
}

function PoSubView({ poType, label, onBack }: { poType: PoType; label: string; onBack: () => void }) {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const { data: pos = [], refetch } = trpc.purchaseOrder.list.useQuery({ poType });
  const retryMutation = trpc.purchaseOrder.retryPush.useMutation({
    onSuccess: () => { toast.success("Retry queued"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const q = search.toLowerCase();
  const filtered = pos.filter((p) =>
    !q || p.poNumber.toLowerCase().includes(q) || p.customerName.toLowerCase().includes(q) ||
    (p.sku ?? "").toLowerCase().includes(q) || (p.skuDescription ?? "").toLowerCase().includes(q) ||
    (p.employeeName ?? "").toLowerCase().includes(q) || (p.employeeRole ?? "").toLowerCase().includes(q) ||
    (p.itemName ?? "").toLowerCase().includes(q) || (p.vendorName ?? "").toLowerCase().includes(q) ||
    p.warehouse.toLowerCase().includes(q)
  );
  const totalValue = filtered.reduce((s, p) => s + parseFloat(p.totalCharge ?? "0"), 0);
  const pendingOrOrdered = filtered.filter((p) => p.poStatus === "pending" || p.poStatus === "ordered").length;

  const kpiLabel = poType === "kitting" ? "Pending Approval" : poType === "labor" ? "Pending Approval" : "Awaiting Receipt";
  const totalLabel = poType === "labor" ? "Total Labor Cost" : "Total Value";

  const kittingCols = ["PO #", "Date", "Customer", "Warehouse", "SKU", "Description", "Qty", "Unit Cost", "Total", "Status", ""];
  const laborCols   = ["PO #", "Date", "Customer", "Warehouse", "Employee", "Role", "Hours", "Rate/hr", "Total", "Status", ""];
  const materialCols= ["PO #", "Date", "Customer", "Warehouse", "Item", "Vendor", "Qty", "Unit Cost", "Total", "Status", ""];
  const cols = poType === "kitting" ? kittingCols : poType === "labor" ? laborCols : materialCols;

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      <div className="flex items-start justify-between mb-7">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium mb-1">
            <button onClick={onBack} className="text-[#5da032] font-semibold flex items-center gap-1 hover:underline">
              <ChevronLeft className="w-3.5 h-3.5" /> Purchase Orders
            </button>
            <span>/ {label}</span>
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">{label} Purchase Orders</h1>
        </div>
        <Button className="bg-[#5da032] hover:bg-[#4a8828] text-white font-semibold rounded-xl flex items-center gap-1.5" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" /> New {label} PO
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-7">
        <SimpleKpiCard label="Total POs" value={filtered.length} />
        <SimpleKpiCard label={kpiLabel} value={pendingOrOrdered} />
        <SimpleKpiCard label={totalLabel} value={fmt(totalValue)} />
      </div>
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">{label} PO List</h3>
          <input className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-56 focus:outline-none focus:border-[#5da032]"
            placeholder="Search POs…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gray-50">
              <tr>{cols.map((h) => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200 whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={cols.length} className="text-center py-10 text-gray-400">No POs found</td></tr>
              ) : filtered.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 font-bold text-[#5da032] font-mono text-sm whitespace-nowrap">{p.poNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{p.poDate}</td>
                  <td className="px-4 py-3 text-sm">{p.customerName}</td>
                  <td className="px-4 py-3"><WarehouseBadge warehouse={p.warehouse} /></td>
                  {poType === "kitting" && <>
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono">{p.sku ?? "—"}</td>
                    <td className="px-4 py-3 text-sm">{p.skuDescription ?? "—"}</td>
                    <td className="px-4 py-3 text-sm font-semibold">{p.qty != null ? p.qty.toLocaleString() : "—"}</td>
                    <td className="px-4 py-3 text-sm">{p.unitCost != null ? fmt(parseFloat(p.unitCost)) : "—"}</td>
                  </>}
                  {poType === "labor" && <>
                    <td className="px-4 py-3 text-sm font-semibold">{p.employeeName ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{p.employeeRole ?? "—"}</td>
                    <td className="px-4 py-3 text-sm font-semibold">{p.hoursWorked != null ? `${p.hoursWorked}h` : "—"}</td>
                    <td className="px-4 py-3 text-sm">{p.hourlyRate != null ? fmt(parseFloat(p.hourlyRate)) : "—"}</td>
                  </>}
                  {poType === "materials" && <>
                    <td className="px-4 py-3 text-sm font-medium">{p.itemName ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{p.vendorName ?? "—"}</td>
                    <td className="px-4 py-3 text-sm font-semibold">{p.qty != null ? p.qty.toLocaleString() : "—"}</td>
                    <td className="px-4 py-3 text-sm">{p.unitCost != null ? fmt(parseFloat(p.unitCost)) : "—"}</td>
                  </>}
                  <td className="px-4 py-3 text-sm font-bold">{fmt(parseFloat(p.totalCharge ?? "0"))}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.poStatus ?? "pending"} /></td>
                  <td className="px-4 py-3">
                    {(p.opfiPushStatus === "failed" || p.opfiPushStatus === "pending") && (
                      <button onClick={() => retryMutation.mutate({ id: p.id })} title="Retry OpFi push">
                        <RotateCcw className="w-3.5 h-3.5 text-gray-400 hover:text-gray-700" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <CreatePoDialog open={showCreate} onClose={() => setShowCreate(false)} defaultType={poType} onCreated={() => refetch()} />
    </div>
  );
}

export default function PurchaseOrders() {
  const [view, setView] = useState<View>("landing");
  if (view === "kitting")   return <PoSubView poType="kitting"   label="Kitting"   onBack={() => setView("landing")} />;
  if (view === "labor")     return <PoSubView poType="labor"     label="Labor"     onBack={() => setView("landing")} />;
  if (view === "materials") return <PoSubView poType="materials" label="Materials" onBack={() => setView("landing")} />;
  return <LandingView onNavigate={(v) => setView(v)} />;
}

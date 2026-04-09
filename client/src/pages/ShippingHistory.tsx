import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { ScrollText, Search, Plus, RefreshCw, Package, Truck, ExternalLink, Copy, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const PLATFORM_LABELS: Record<string, string> = {
  veeqo: "Veeqo",
  techship: "TechShip",
  shipwell: "Shipwell",
  manual: "Manual",
};

const PLATFORM_COLORS: Record<string, string> = {
  veeqo: "bg-orange-100 text-orange-700 border-orange-200",
  techship: "bg-blue-100 text-blue-700 border-blue-200",
  shipwell: "bg-purple-100 text-purple-700 border-purple-200",
  manual: "bg-gray-100 text-gray-600 border-gray-200",
};

const MODE_LABELS: Record<string, string> = {
  small_parcel: "Small Parcel",
  ltl: "LTL",
  ftl: "FTL",
  other: "Other",
};

const STATUS_COLORS: Record<string, string> = {
  booked: "bg-green-100 text-green-700 border-green-200",
  in_transit: "bg-blue-100 text-blue-700 border-blue-200",
  delivered: "bg-emerald-100 text-emerald-700 border-emerald-200",
  exception: "bg-red-100 text-red-700 border-red-200",
  void: "bg-gray-100 text-gray-500 border-gray-200",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={handleCopy} className="ml-1 text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

interface ManualEntryForm {
  platform: "veeqo" | "techship" | "shipwell" | "manual";
  mode: "small_parcel" | "ltl" | "ftl" | "other";
  orderNumber: string;
  customerName: string;
  facilityName: string;
  shipToName: string;
  shipToCity: string;
  shipToState: string;
  shipToZip: string;
  carrier: string;
  serviceLevel: string;
  trackingNumber: string;
  bolNumber: string;
  proNumber: string;
  notes: string;
}

const DEFAULT_FORM: ManualEntryForm = {
  platform: "manual",
  mode: "small_parcel",
  orderNumber: "",
  customerName: "",
  facilityName: "",
  shipToName: "",
  shipToCity: "",
  shipToState: "",
  shipToZip: "",
  carrier: "",
  serviceLevel: "",
  trackingNumber: "",
  bolNumber: "",
  proNumber: "",
  notes: "",
};

export default function ShippingHistory() {
  // Filters
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const handleSearchChange = (val: string) => {
    setSearch(val);
    clearTimeout((handleSearchChange as unknown as { _t?: ReturnType<typeof setTimeout> })._t);
    (handleSearchChange as unknown as { _t?: ReturnType<typeof setTimeout> })._t = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(0);
    }, 400);
  };

  const queryInput = useMemo(() => ({
    platform: platformFilter !== "all" ? (platformFilter as "veeqo" | "techship" | "shipwell" | "manual") : undefined,
    trackingNumber: debouncedSearch.length >= 3 ? debouncedSearch : undefined,
    orderNumber: debouncedSearch.length >= 3 && !debouncedSearch.match(/^[A-Z0-9]{10,}$/) ? debouncedSearch : undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }), [platformFilter, debouncedSearch, page]);

  const { data, isLoading, refetch } = trpc.shippingHistory.list.useQuery(queryInput);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  // Manual entry dialog
  const [showManual, setShowManual] = useState(false);
  const [form, setForm] = useState<ManualEntryForm>(DEFAULT_FORM);
  const recordManual = trpc.shippingHistory.recordManual.useMutation({
    onSuccess: () => {
      toast.success("Tracking number recorded", { description: `${form.trackingNumber} saved successfully.` });
      setShowManual(false);
      setForm(DEFAULT_FORM);
      void refetch();
    },
    onError: (err) => {
      toast.error("Error", { description: err.message });
    },
  });

  const handleSubmitManual = () => {
    if (!form.trackingNumber.trim()) {
      toast.error("Tracking number required");
      return;
    }
    recordManual.mutate({
      ...form,
      orderNumber: form.orderNumber || undefined,
      customerName: form.customerName || undefined,
      facilityName: form.facilityName || undefined,
      shipToName: form.shipToName || undefined,
      shipToCity: form.shipToCity || undefined,
      shipToState: form.shipToState || undefined,
      shipToZip: form.shipToZip || undefined,
      carrier: form.carrier || undefined,
      serviceLevel: form.serviceLevel || undefined,
      bolNumber: form.bolNumber || undefined,
      proNumber: form.proNumber || undefined,
      notes: form.notes || undefined,
    });
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-7 page-enter">
      <p className="page-breadcrumb">Shipping</p>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title mb-1">Shipping History</h1>
          <p className="text-sm text-muted-foreground">
            Unified tracking registry across Veeqo, Shipwell, TechShip, and manual entries
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowManual(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Record Tracking
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by tracking # or order #..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All platforms" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            <SelectItem value="veeqo">Veeqo</SelectItem>
            <SelectItem value="shipwell">Shipwell</SelectItem>
            <SelectItem value="techship">TechShip</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground ml-auto">
          {total.toLocaleString()} shipment{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tracking #</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Platform</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mode</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Order #</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ship To</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Carrier / Service</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-muted-foreground">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Loading shipments...
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-muted-foreground">
                    <ScrollText className="h-10 w-10 mx-auto mb-3 opacity-20" />
                    <p className="font-medium">No shipments found</p>
                    <p className="text-xs mt-1 opacity-70">
                      {debouncedSearch || platformFilter !== "all"
                        ? "Try adjusting your filters"
                        : "Shipments will appear here after labels are purchased in Pack & Ship or orders are sent to Shipwell"}
                    </p>
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">
                    {row.trackingNumber ? (
                      <span className="flex items-center gap-1">
                        <span className="text-foreground font-medium">{row.trackingNumber}</span>
                        <CopyButton text={row.trackingNumber} />
                      </span>
                    ) : row.bolNumber ? (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <span>BOL: {row.bolNumber}</span>
                        <CopyButton text={row.bolNumber} />
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">Pending</span>
                    )}
                    {row.proNumber && (
                      <div className="text-muted-foreground text-xs mt-0.5">PRO: {row.proNumber}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${PLATFORM_COLORS[row.platform] ?? "bg-gray-100 text-gray-600"}`}>
                      {PLATFORM_LABELS[row.platform] ?? row.platform}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {row.mode === "small_parcel" ? (
                      <span className="flex items-center gap-1"><Package className="h-3 w-3" />{MODE_LABELS[row.mode]}</span>
                    ) : (
                      <span className="flex items-center gap-1"><Truck className="h-3 w-3" />{MODE_LABELS[row.mode ?? ""] ?? row.mode}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                    {row.orderNumber ?? <span className="italic opacity-50">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {row.customerName ?? <span className="text-muted-foreground italic opacity-50">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {[row.shipToCity, row.shipToState].filter(Boolean).join(", ") || <span className="italic opacity-50">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {row.carrier ? (
                      <div>
                        <span className="font-medium text-foreground">{row.carrier}</span>
                        {row.serviceLevel && <div className="text-muted-foreground">{row.serviceLevel}</div>}
                      </div>
                    ) : (
                      <span className="text-muted-foreground italic opacity-50">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[row.status ?? "booked"] ?? "bg-gray-100 text-gray-600"}`}>
                      {(row.status ?? "booked").replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—"}
                    {row.labelUrl && (
                      <a href={row.labelUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-primary hover:underline inline-flex items-center gap-0.5">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
            <span className="text-xs text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Manual Entry Dialog */}
      <Dialog open={showManual} onOpenChange={setShowManual}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Tracking Number</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Platform</Label>
                <Select value={form.platform} onValueChange={(v) => setForm(f => ({ ...f, platform: v as ManualEntryForm["platform"] }))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="veeqo">Veeqo</SelectItem>
                    <SelectItem value="techship">TechShip</SelectItem>
                    <SelectItem value="shipwell">Shipwell</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Mode</Label>
                <Select value={form.mode} onValueChange={(v) => setForm(f => ({ ...f, mode: v as ManualEntryForm["mode"] }))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small_parcel">Small Parcel</SelectItem>
                    <SelectItem value="ltl">LTL</SelectItem>
                    <SelectItem value="ftl">FTL</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs mb-1 block">Tracking Number <span className="text-red-500">*</span></Label>
              <Input
                value={form.trackingNumber}
                onChange={(e) => setForm(f => ({ ...f, trackingNumber: e.target.value }))}
                placeholder="e.g. 1Z999AA10123456784"
                className="h-8 text-sm font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">BOL Number</Label>
                <Input value={form.bolNumber} onChange={(e) => setForm(f => ({ ...f, bolNumber: e.target.value }))} placeholder="Optional" className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">PRO Number</Label>
                <Input value={form.proNumber} onChange={(e) => setForm(f => ({ ...f, proNumber: e.target.value }))} placeholder="Optional" className="h-8 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Order Number</Label>
                <Input value={form.orderNumber} onChange={(e) => setForm(f => ({ ...f, orderNumber: e.target.value }))} placeholder="e.g. 143355885" className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Customer</Label>
                <Input value={form.customerName} onChange={(e) => setForm(f => ({ ...f, customerName: e.target.value }))} placeholder="Customer name" className="h-8 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Carrier</Label>
                <Input value={form.carrier} onChange={(e) => setForm(f => ({ ...f, carrier: e.target.value }))} placeholder="e.g. UPS, FedEx" className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Service Level</Label>
                <Input value={form.serviceLevel} onChange={(e) => setForm(f => ({ ...f, serviceLevel: e.target.value }))} placeholder="e.g. Ground" className="h-8 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Ship-To City</Label>
                <Input value={form.shipToCity} onChange={(e) => setForm(f => ({ ...f, shipToCity: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">State/Prov</Label>
                <Input value={form.shipToState} onChange={(e) => setForm(f => ({ ...f, shipToState: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Postal Code</Label>
                <Input value={form.shipToZip} onChange={(e) => setForm(f => ({ ...f, shipToZip: e.target.value }))} className="h-8 text-sm" />
              </div>
            </div>

            <div>
              <Label className="text-xs mb-1 block">Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" className="h-8 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManual(false)}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleSubmitManual} disabled={recordManual.isPending || !form.trackingNumber.trim()}>
              {recordManual.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Save Tracking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

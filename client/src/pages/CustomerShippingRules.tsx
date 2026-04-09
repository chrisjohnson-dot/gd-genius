import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  UserCog,
  Wand2,
  Zap,
  Package,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

type Rule = {
  id: number;
  configId: number;
  customerId: number;
  customerName: string;
  integration: string;
  preferredCarrier: string | null;
  maxTransitDays: number | null;
  excludedCarriers: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type RuleForm = {
  customerId: string;
  customerName: string;
  integration: "rate_wizard" | "veeqo" | "techship";
  preferredCarrier: string;
  maxTransitDays: string;
  excludedCarriers: string;
  notes: string;
};

const EMPTY_FORM: RuleForm = {
  customerId: "",
  customerName: "",
  integration: "rate_wizard",
  preferredCarrier: "",
  maxTransitDays: "",
  excludedCarriers: "",
  notes: "",
};

const INTEGRATION_META: Record<string, { label: string; color: string; icon: React.ReactNode; description: string }> = {
  rate_wizard: {
    label: "Rate Wizard",
    color: "bg-blue-600 text-white",
    icon: <Wand2 className="h-3 w-3" />,
    description: "Native GD Genius rate shopping with direct carrier APIs",
  },
  veeqo: {
    label: "Veeqo",
    color: "bg-purple-600 text-white",
    icon: <Zap className="h-3 w-3" />,
    description: "Route through Veeqo for Amazon and marketplace orders",
  },
  techship: {
    label: "TechShip",
    color: "bg-slate-600 text-white",
    icon: <Package className="h-3 w-3" />,
    description: "Legacy TechShip integration (being phased out)",
  },
};

const US_CARRIERS = [
  { code: "usps", label: "USPS" },
  { code: "fedex", label: "FedEx" },
  { code: "ups", label: "UPS" },
  { code: "ontrac", label: "OnTrac" },
  { code: "dhl_express", label: "DHL Express" },
];

const CA_CARRIERS = [
  { code: "fedex", label: "FedEx" },
  { code: "ups", label: "UPS" },
  { code: "dhl_express", label: "DHL Express" },
  { code: "canpar", label: "Canpar" },
  { code: "purolator", label: "Purolator" },
  { code: "canada_post", label: "Canada Post" },
  { code: "gls_canada", label: "GLS Canada" },
];

const ALL_CARRIERS = [
  ...US_CARRIERS,
  ...CA_CARRIERS.filter((c) => !US_CARRIERS.find((u) => u.code === c.code)),
];

export default function CustomerShippingRules() {
  const { data: configs, isLoading: configsLoading } = trpc.config.list.useQuery();
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM);

  // Auto-select first config
  const configId = selectedConfigId ?? (configs?.[0]?.id ?? null);

  const { data: rules = [], isLoading: rulesLoading, refetch } = trpc.rateWizard.listCustomerShippingRules.useQuery(
    { configId: configId! },
    { enabled: configId !== null }
  );

  const upsert = trpc.rateWizard.upsertCustomerShippingRule.useMutation({
    onSuccess: () => { toast.success("Rule saved."); setDialogOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.rateWizard.deleteCustomerShippingRule.useMutation({
    onSuccess: () => { toast.success("Rule deleted."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (r: Rule) => {
    setEditingId(r.id);
    setForm({
      customerId: String(r.customerId),
      customerName: r.customerName,
      integration: r.integration as RuleForm["integration"],
      preferredCarrier: r.preferredCarrier ?? "",
      maxTransitDays: r.maxTransitDays ? String(r.maxTransitDays) : "",
      excludedCarriers: r.excludedCarriers ? JSON.parse(r.excludedCarriers).join(", ") : "",
      notes: r.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.customerName.trim()) {
      toast.error("Customer name is required.");
      return;
    }
    if (!configId) {
      toast.error("No configuration selected.");
      return;
    }
    const excludedArr = form.excludedCarriers
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    upsert.mutate({
      id: editingId ?? undefined,
      configId,
      customerId: parseInt(form.customerId) || 0,
      customerName: form.customerName.trim(),
      integration: form.integration,
      preferredCarrier: form.preferredCarrier || undefined,
      maxTransitDays: form.maxTransitDays ? parseInt(form.maxTransitDays) : undefined,
      excludedCarriers: excludedArr.length > 0 ? JSON.stringify(excludedArr) : undefined,
      notes: form.notes || undefined,
    });
  };

  const filteredRules = useMemo(() => {
    const q = search.toLowerCase();
    return (rules as Rule[]).filter(
      (r) => !q || r.customerName.toLowerCase().includes(q) || r.integration.includes(q)
    );
  }, [rules, search]);

  // Stats
  const rateWizardCount = (rules as Rule[]).filter((r) => r.integration === "rate_wizard").length;
  const veeqoCount = (rules as Rule[]).filter((r) => r.integration === "veeqo").length;
  const techshipCount = (rules as Rule[]).filter((r) => r.integration === "techship").length;

  if (configsLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
          <UserCog className="h-5 w-5 text-blue-500" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Customer Shipping Rules</h1>
          <p className="text-sm text-muted-foreground">
            Route each customer to the correct shipping integration — Rate Wizard, Veeqo, or TechShip.
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300">
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" />
        <span>
          Customers without a rule use the <strong>default integration</strong> set in Shipping Integration settings.
          Add a rule here only when a customer needs a different integration, preferred carrier, or transit-day limit.
        </span>
      </div>

      {/* Config selector + stats */}
      <div className="flex flex-wrap items-center gap-3">
        {configs && configs.length > 1 && (
          <Select
            value={String(configId)}
            onValueChange={(v) => setSelectedConfigId(parseInt(v))}
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Select config" />
            </SelectTrigger>
            <SelectContent>
              {configs.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex gap-2 flex-wrap">
          <Badge className="gap-1 bg-blue-600 text-white"><Wand2 className="h-3 w-3" /> Rate Wizard: {rateWizardCount}</Badge>
          <Badge className="gap-1 bg-purple-600 text-white"><Zap className="h-3 w-3" /> Veeqo: {veeqoCount}</Badge>
          {techshipCount > 0 && <Badge className="gap-1 bg-slate-600 text-white"><Package className="h-3 w-3" /> TechShip: {techshipCount}</Badge>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search customers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm w-52"
            />
          </div>
          <Button size="sm" onClick={openCreate} className="gap-1.5 h-8">
            <Plus className="h-3.5 w-3.5" /> Add Rule
          </Button>
        </div>
      </div>

      {/* Rules table */}
      {rulesLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading rules…
        </div>
      ) : filteredRules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <UserCog className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium text-muted-foreground">
              {search ? "No customers match your search." : "No customer shipping rules yet."}
            </p>
            {!search && (
              <p className="text-xs text-muted-foreground mt-1">
                All customers will use the default integration from Shipping Integration settings.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {filteredRules.length} Rule{filteredRules.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {filteredRules.map((r) => {
                const meta = INTEGRATION_META[r.integration] ?? INTEGRATION_META.rate_wizard;
                const excluded: string[] = r.excludedCarriers ? JSON.parse(r.excludedCarriers) : [];
                return (
                  <div key={r.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{r.customerName}</span>
                        <Badge className={`gap-1 text-xs ${meta.color}`}>
                          {meta.icon} {meta.label}
                        </Badge>
                        {r.preferredCarrier && (
                          <Badge variant="outline" className="text-xs">
                            Preferred: {ALL_CARRIERS.find((c) => c.code === r.preferredCarrier)?.label ?? r.preferredCarrier}
                          </Badge>
                        )}
                        {r.maxTransitDays && (
                          <Badge variant="outline" className="text-xs">
                            Max {r.maxTransitDays}d transit
                          </Badge>
                        )}
                      </div>
                      {excluded.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Excluded: {excluded.map((c) => ALL_CARRIERS.find((x) => x.code === c)?.label ?? c).join(", ")}
                        </p>
                      )}
                      {r.notes && <p className="text-xs text-muted-foreground italic mt-0.5">{r.notes}</p>}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => openEdit(r)} className="h-7 px-2">
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { if (confirm(`Delete rule for "${r.customerName}"?`)) del.mutate({ id: r.id }); }}
                        className="h-7 px-2 text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Customer Shipping Rule" : "Add Customer Shipping Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Customer Name</Label>
              <Input
                placeholder="e.g. Acme Corp"
                value={form.customerName}
                onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Customer ID (optional)</Label>
              <Input
                placeholder="Extensiv customer ID"
                value={form.customerId}
                onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Leave blank if unknown — used for automatic matching.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Shipping Integration</Label>
              <Select
                value={form.integration}
                onValueChange={(v) => setForm((f) => ({ ...f, integration: v as RuleForm["integration"] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(INTEGRATION_META).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        {meta.icon}
                        <span>{meta.label}</span>
                        <span className="text-xs text-muted-foreground">— {meta.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.integration === "rate_wizard" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Preferred Carrier (optional)</Label>
                  <Select
                    value={form.preferredCarrier || "none"}
                    onValueChange={(v) => setForm((f) => ({ ...f, preferredCarrier: v === "none" ? "" : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No preference — always cheapest" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No preference — always cheapest</SelectItem>
                      {ALL_CARRIERS.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Max Transit Days (optional)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    placeholder="e.g. 3"
                    value={form.maxTransitDays}
                    onChange={(e) => setForm((f) => ({ ...f, maxTransitDays: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">Filters out services slower than this limit.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Excluded Carriers (optional)</Label>
                  <Input
                    placeholder="e.g. ontrac, dhl_express"
                    value={form.excludedCarriers}
                    onChange={(e) => setForm((f) => ({ ...f, excludedCarriers: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">Comma-separated carrier codes to never use for this customer.</p>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                rows={2}
                placeholder="e.g. Customer requires FedEx for all orders per contract"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={upsert.isPending} className="gap-1.5">
              {upsert.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

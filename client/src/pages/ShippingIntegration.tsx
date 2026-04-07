import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Package,
  Pencil,
  Plus,
  Save,
  TestTube2,
  Trash2,
  Truck,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ─── Active Integration Badge ─────────────────────────────────────────────────
function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge className="bg-green-600 text-white text-xs gap-1">
      <CheckCircle2 className="h-3 w-3" /> Active
    </Badge>
  ) : (
    <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>
  );
}

// ─── Shipwell Credentials Panel ───────────────────────────────────────────────
function ShipwellPanel() {
  const { data: config, isLoading, refetch } = trpc.shipwell.getConfig.useQuery();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [showPassword, setShowPassword] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [formInitialized, setFormInitialized] = useState(false);

  if (config && !formInitialized) {
    setEmail(config.email);
    setEnvironment(config.environment as "sandbox" | "production");
    setFormInitialized(true);
  }

  const saveConfig = trpc.shipwell.saveConfig.useMutation({
    onSuccess: () => { toast.success("Shipwell credentials saved."); setPassword(""); refetch(); },
    onError: (err) => toast.error(`Save failed: ${err.message}`),
  });
  const testConnection = trpc.shipwell.testConnection.useMutation({
    onSuccess: (data) => {
      setTestResult({ success: true, message: `Connected as ${data.user?.first_name} ${data.user?.last_name} (${data.user?.email})` });
      toast.success("Shipwell connection verified.");
    },
    onError: (err) => { setTestResult({ success: false, message: err.message }); toast.error(`Connection test failed: ${err.message}`); },
  });

  if (isLoading) return <div className="flex items-center gap-2 text-muted-foreground py-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-4">
      {config && (
        <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/30">
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{config.email}</p>
            <p className="text-xs text-muted-foreground">Last updated {new Date(config.updatedAt).toLocaleDateString()}</p>
          </div>
          <Badge variant={config.environment === "production" ? "default" : "secondary"} className={config.environment === "production" ? "bg-green-600 text-white text-xs" : "text-xs"}>
            {config.environment === "production" ? "Production" : "Sandbox"}
          </Badge>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Email Address</Label>
          <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Password</Label>
          <div className="relative">
            <Input type={showPassword ? "text" : "password"} placeholder={config?.hasPassword ? "•••••••• (leave blank to keep)" : "Enter password"} value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
            <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
              {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Environment</Label>
          <Select value={environment} onValueChange={(v) => setEnvironment(v as "sandbox" | "production")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sandbox">Sandbox (testing)</SelectItem>
              <SelectItem value="production">Production (live)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => { if (!email || !password) { toast.error("Email and password are required."); return; } saveConfig.mutate({ email, password, environment }); }} disabled={saveConfig.isPending || !email || (!password && !config?.hasPassword)} className="gap-1.5">
          {saveConfig.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
        </Button>
        <Button size="sm" variant="outline" onClick={() => { if (!config) { toast.error("Save credentials first."); return; } setTestResult(null); testConnection.mutate(); }} disabled={testConnection.isPending || !config} className="gap-1.5">
          {testConnection.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube2 className="h-3.5 w-3.5" />} Test
        </Button>
      </div>
      {testResult && (
        <div className={`flex items-start gap-2 rounded-lg p-3 text-xs border ${testResult.success ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300" : "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300"}`}>
          {testResult.success ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
          {testResult.message}
        </div>
      )}
    </div>
  );
}

// ─── TechShip Panel ───────────────────────────────────────────────────────────
type TechshipRow = {
  id: number;
  locationName: string;
  baseUrl: string;
  apiKey: string;
  apiSecretMasked: string;
  isActive: boolean | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};
type TechshipFormState = { locationName: string; baseUrl: string; apiKey: string; apiSecret: string; isActive: boolean; notes: string };
const EMPTY_TS: TechshipFormState = { locationName: "", baseUrl: "https://", apiKey: "", apiSecret: "", isActive: true, notes: "" };

function TechShipPanel() {
  const { data: configs = [], isLoading, refetch } = trpc.techship.list.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TechshipFormState>(EMPTY_TS);
  const [testResults, setTestResults] = useState<Record<number, { success: boolean; message: string }>>({});

  const saveMutation = trpc.techship.save.useMutation({ onSuccess: () => { toast.success("Location saved."); setDialogOpen(false); refetch(); }, onError: (e) => toast.error(e.message) });
  const deleteMutation = trpc.techship.delete.useMutation({ onSuccess: () => { toast.success("Deleted."); refetch(); }, onError: (e) => toast.error(e.message) });
  const testMutation = trpc.techship.testConnection.useMutation({
    onSuccess: (data, vars) => { setTestResults((p) => ({ ...p, [vars.id]: data })); if (data.success) toast.success(data.message); else toast.error(data.message); },
    onError: (e, vars) => { setTestResults((p) => ({ ...p, [vars.id]: { success: false, message: e.message } })); },
  });

  const openCreate = () => { setEditingId(null); setForm(EMPTY_TS); setDialogOpen(true); };
  const openEdit = (c: TechshipRow) => { setEditingId(c.id); setForm({ locationName: c.locationName, baseUrl: c.baseUrl, apiKey: c.apiKey, apiSecret: "", isActive: c.isActive ?? true, notes: c.notes ?? "" }); setDialogOpen(true); };
  const handleSave = () => {
    if (!form.locationName.trim() || !form.apiKey.trim()) { toast.error("Location name and API key are required."); return; }
    if (!editingId && !form.apiSecret.trim()) { toast.error("API Secret is required."); return; }
    saveMutation.mutate({ id: editingId ?? undefined, locationName: form.locationName.trim(), baseUrl: form.baseUrl.trim().replace(/\/$/, ""), apiKey: form.apiKey.trim(), apiSecret: form.apiSecret.trim() || "KEEP_EXISTING", isActive: form.isActive, notes: form.notes.trim() || undefined });
  };

  if (isLoading) return <div className="flex items-center gap-2 text-muted-foreground py-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Add Location</Button>
      </div>
      {configs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No TechShip locations configured.</p>
      ) : (
        (configs as TechshipRow[]).map((cfg) => {
          const result = testResults[cfg.id];
          return (
            <div key={cfg.id} className="flex items-start gap-3 rounded-lg border p-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium">{cfg.locationName}</span>
                  <Badge variant={cfg.isActive ? "default" : "secondary"} className={cfg.isActive ? "bg-green-600 text-white text-xs" : "text-xs"}>{cfg.isActive ? "Active" : "Inactive"}</Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">{cfg.baseUrl}</p>
                {result && <p className={`text-xs mt-1 ${result.success ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>{result.success ? "✓ " : "✗ "}{result.message}</p>}
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Button size="sm" variant="outline" onClick={() => testMutation.mutate({ id: cfg.id })} disabled={testMutation.isPending} className="h-7 px-2 text-xs gap-1"><TestTube2 className="h-3 w-3" /> Test</Button>
                <Button size="sm" variant="outline" onClick={() => openEdit(cfg)} className="h-7 px-2"><Pencil className="h-3 w-3" /></Button>
                <Button size="sm" variant="outline" onClick={() => { if (confirm(`Delete ${cfg.locationName}?`)) deleteMutation.mutate({ id: cfg.id }); }} className="h-7 px-2 text-red-500 hover:text-red-600"><Trash2 className="h-3 w-3" /></Button>
              </div>
            </div>
          );
        })
      )}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingId ? "Edit TechShip Location" : "Add TechShip Location"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label className="text-xs">Location Name</Label><Input placeholder="e.g. Calgary" value={form.locationName} onChange={(e) => setForm((f) => ({ ...f, locationName: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Base URL</Label><Input placeholder="https://godirect-xxx.techship.ca" value={form.baseUrl} onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">API Key</Label><Input value={form.apiKey} onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">API Secret {editingId && <span className="text-muted-foreground">(leave blank to keep)</span>}</Label><Input type="password" placeholder={editingId ? "Leave blank to keep current" : "Enter secret"} value={form.apiSecret} onChange={(e) => setForm((f) => ({ ...f, apiSecret: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Notes (optional)</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
            <div className="flex items-center gap-2"><Switch id="ts-active" checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} /><Label htmlFor="ts-active" className="text-xs">Active</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-1.5">{saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Veeqo Panel ─────────────────────────────────────────────────────────────
function VeeqoPanel() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/30">
        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium">API Key Configured</p>
          <p className="text-xs text-muted-foreground">Vqt/••••••••••••••••••••••••••••••••</p>
        </div>
        <Badge className="bg-green-600 text-white text-xs">Active</Badge>
      </div>
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
        <span><strong>US Account Note:</strong> Veeqo's carrier label purchase API is only available for UK accounts. For US accounts, labels are generated via a direct carrier API and the tracking number is recorded in Veeqo.</span>
      </div>
    </div>
  );
}

// ─── Integration Card ─────────────────────────────────────────────────────────
type IntegrationDef = {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  panel: React.ReactNode;
};

function IntegrationSection({
  category,
  label,
  description,
  icon,
  integrations,
  activeIntegration,
  onSetActive,
  isSettingActive,
}: {
  category: "ltl" | "small_parcel";
  label: string;
  description: string;
  icon: React.ReactNode;
  integrations: IntegrationDef[];
  activeIntegration: string;
  onSetActive: (key: string) => void;
  isSettingActive: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">{icon}</div>
        <div>
          <h2 className="text-base font-semibold">{label}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="space-y-2">
        {integrations.map((intg) => {
          const isActive = activeIntegration === intg.key;
          const isExpanded = expanded === intg.key;
          return (
            <Card key={intg.key} className={isActive ? "border-blue-400 dark:border-blue-600" : ""}>
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 flex items-center gap-2.5">
                    <span className="font-medium text-sm">{intg.label}</span>
                    <ActiveBadge active={isActive} />
                  </div>
                  <div className="flex items-center gap-2">
                    {!isActive && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onSetActive(intg.key)}
                        disabled={isSettingActive}
                        className="h-7 text-xs gap-1"
                      >
                        {isSettingActive ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                        Set as Active
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpanded(isExpanded ? null : intg.key)}
                      className="h-7 text-xs gap-1"
                    >
                      {isExpanded ? "Hide" : "Configure"}
                      <ChevronRight className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{intg.description}</p>
              </CardHeader>
              {isExpanded && (
                <CardContent className="pt-0 pb-4 px-4 border-t">
                  <div className="pt-3">{intg.panel}</div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ShippingIntegration() {
  const { data: settings, isLoading, refetch } = trpc.shippingIntegration.getSettings.useQuery();
  const setActiveMutation = trpc.shippingIntegration.setActive.useMutation({
    onSuccess: () => { toast.success("Active integration updated."); refetch(); },
    onError: (e) => toast.error(`Failed to update: ${e.message}`),
  });

  const ltlIntegrations: IntegrationDef[] = [
    {
      key: "shipwell",
      label: "Shipwell",
      description: "LTL shipment management, rate shopping, and carrier tendering.",
      icon: <Truck className="h-4 w-4 text-blue-500" />,
      panel: <ShipwellPanel />,
    },
  ];

  const smallParcelIntegrations: IntegrationDef[] = [
    {
      key: "techship",
      label: "TechShip",
      description: "Multi-location small parcel label generation via TechShip API.",
      icon: <Package className="h-4 w-4 text-blue-500" />,
      panel: <TechShipPanel />,
    },
    {
      key: "veeqo",
      label: "Veeqo",
      description: "Order management and shipping via Veeqo API.",
      icon: <Zap className="h-4 w-4 text-blue-500" />,
      panel: <VeeqoPanel />,
    },
  ];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
          <Truck className="h-5 w-5 text-blue-500" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Shipping Integration</h1>
          <p className="text-sm text-muted-foreground">Configure and select the active integration for LTL and small parcel shipping.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center"><Loader2 className="h-5 w-5 animate-spin" /> Loading settings…</div>
      ) : (
        <>
          <IntegrationSection
            category="ltl"
            label="LTL (Less Than Truckload)"
            description="Used for pallet and freight shipments."
            icon={<Truck className="h-4 w-4 text-blue-500" />}
            integrations={ltlIntegrations}
            activeIntegration={settings?.ltl ?? "shipwell"}
            onSetActive={(key) => setActiveMutation.mutate({ category: "ltl", integration: key })}
            isSettingActive={setActiveMutation.isPending}
          />

          <div className="border-t" />

          <IntegrationSection
            category="small_parcel"
            label="Small Parcel"
            description="Used for individual package label generation and carrier selection."
            icon={<Package className="h-4 w-4 text-blue-500" />}
            integrations={smallParcelIntegrations}
            activeIntegration={settings?.small_parcel ?? "techship"}
            onSetActive={(key) => setActiveMutation.mutate({ category: "small_parcel", integration: key })}
            isSettingActive={setActiveMutation.isPending}
          />
        </>
      )}
    </div>
  );
}

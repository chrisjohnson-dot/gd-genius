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
  Bell,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Loader2,
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

// ─── Shipwell Credentials Tab ─────────────────────────────────────────────────
function ShipwellCredentialsTab() {
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

  return (
    <div className="space-y-6">
      {!isLoading && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Connection Status</CardTitle>
          </CardHeader>
          <CardContent>
            {config ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="text-sm font-medium">{config.email}</p>
                    <p className="text-xs text-muted-foreground">Credentials saved · Last updated {new Date(config.updatedAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <Badge variant={config.environment === "production" ? "default" : "secondary"} className={config.environment === "production" ? "bg-green-600 text-white" : ""}>
                  {config.environment === "production" ? "Production" : "Sandbox"}
                </Badge>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-muted-foreground">
                <AlertCircle className="h-5 w-5 text-amber-500" />
                <p className="text-sm">No Shipwell credentials configured yet.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Credentials</CardTitle>
          <CardDescription>Enter your Shipwell account email and password.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sw-email">Email Address</Label>
            <Input id="sw-email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sw-password">Password</Label>
            <div className="relative">
              <Input id="sw-password" type={showPassword ? "text" : "password"} placeholder={config?.hasPassword ? "•••••••• (leave blank to keep current)" : "Enter password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="pr-10" />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sw-env">Environment</Label>
            <Select value={environment} onValueChange={(v) => setEnvironment(v as "sandbox" | "production")}>
              <SelectTrigger id="sw-env"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox (testing)</SelectItem>
                <SelectItem value="production">Production (live)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={() => { if (!email || !password) { toast.error("Email and password are required."); return; } saveConfig.mutate({ email, password, environment }); }} disabled={saveConfig.isPending || !email || (!password && !config?.hasPassword)} className="gap-2">
              {saveConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Credentials
            </Button>
            <Button variant="outline" onClick={() => { if (!config) { toast.error("Save your credentials first."); return; } setTestResult(null); testConnection.mutate(); }} disabled={testConnection.isPending || !config} className="gap-2">
              {testConnection.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />} Test Connection
            </Button>
          </div>
          {testResult && (
            <div className={`flex items-start gap-3 rounded-lg p-3 text-sm border ${testResult.success ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300" : "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300"}`}>
              {testResult.success ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
              <span>{testResult.message}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Veeqo Tab ────────────────────────────────────────────────────────────────
function VeeqoTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Veeqo Integration</CardTitle>
          <CardDescription>Veeqo is used for order management and shipping. The API key is stored as a system secret.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 rounded-lg border p-4 bg-muted/30">
            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
            <div>
              <p className="text-sm font-medium">API Key Configured</p>
              <p className="text-xs text-muted-foreground">Key: Vqt/••••••••••••••••••••••••••••••••</p>
            </div>
            <Badge className="ml-auto bg-green-600 text-white">Active</Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-800 dark:text-amber-300 space-y-1">
              <p className="font-medium">Label Generation — US Account Limitation</p>
              <p className="text-xs opacity-80">
                Veeqo's carrier label purchase API is currently only available for UK accounts. For US accounts, labels must be generated via a direct carrier API (UPS, FedEx, USPS) or a multi-carrier platform. Once a tracking number is obtained, it is recorded in Veeqo and Extensiv automatically.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── TechShip Tab ─────────────────────────────────────────────────────────────
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

type TechshipFormState = {
  locationName: string;
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  isActive: boolean;
  notes: string;
};

const EMPTY_TECHSHIP: TechshipFormState = {
  locationName: "",
  baseUrl: "https://",
  apiKey: "",
  apiSecret: "",
  isActive: true,
  notes: "",
};

function TechShipTab() {
  const { data: configs = [], isLoading, refetch } = trpc.techship.list.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TechshipFormState>(EMPTY_TECHSHIP);
  const [testResults, setTestResults] = useState<Record<number, { success: boolean; message: string }>>({});

  const saveMutation = trpc.techship.save.useMutation({
    onSuccess: () => { toast.success("TechShip location saved."); setDialogOpen(false); refetch(); },
    onError: (err) => toast.error(`Save failed: ${err.message}`),
  });
  const deleteMutation = trpc.techship.delete.useMutation({
    onSuccess: () => { toast.success("Location deleted."); refetch(); },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });
  const testMutation = trpc.techship.testConnection.useMutation({
    onSuccess: (data, variables) => {
      setTestResults((prev) => ({ ...prev, [variables.id]: data }));
      if (data.success) toast.success(data.message);
      else toast.error(data.message);
    },
    onError: (err, variables) => {
      setTestResults((prev) => ({ ...prev, [variables.id]: { success: false, message: err.message } }));
      toast.error(err.message);
    },
  });

  const openCreate = () => { setEditingId(null); setForm(EMPTY_TECHSHIP); setDialogOpen(true); };
  const openEdit = (c: TechshipRow) => {
    setEditingId(c.id);
    setForm({ locationName: c.locationName, baseUrl: c.baseUrl, apiKey: c.apiKey, apiSecret: "", isActive: c.isActive ?? true, notes: c.notes ?? "" });
    setDialogOpen(true);
  };
  const handleSave = () => {
    if (!form.locationName.trim()) { toast.error("Location name is required."); return; }
    if (!form.baseUrl.startsWith("http")) { toast.error("Base URL must start with https://"); return; }
    if (!form.apiKey.trim()) { toast.error("API Key is required."); return; }
    if (!editingId && !form.apiSecret.trim()) { toast.error("API Secret is required for new locations."); return; }
    saveMutation.mutate({
      id: editingId ?? undefined,
      locationName: form.locationName.trim(),
      baseUrl: form.baseUrl.trim().replace(/\/$/, ""),
      apiKey: form.apiKey.trim(),
      apiSecret: form.apiSecret.trim() || "KEEP_EXISTING",
      isActive: form.isActive,
      notes: form.notes.trim() || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">TechShip Locations</h3>
          <p className="text-sm text-muted-foreground">Configure TechShip API credentials for each warehouse location.</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> Add Location</Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : configs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Truck className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No TechShip locations configured yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(configs as TechshipRow[]).map((cfg) => {
            const result = testResults[cfg.id];
            return (
              <Card key={cfg.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{cfg.locationName}</span>
                        <Badge variant={cfg.isActive ? "default" : "secondary"} className={cfg.isActive ? "bg-green-600 text-white text-xs" : "text-xs"}>
                          {cfg.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{cfg.baseUrl}</p>
                      <p className="text-xs text-muted-foreground">Key: {cfg.apiKey.slice(0, 8)}…</p>
                      {cfg.notes && <p className="text-xs text-muted-foreground mt-1 italic">{cfg.notes}</p>}
                      {result && (
                        <div className={`flex items-center gap-2 mt-2 text-xs ${result.success ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {result.success ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                          {result.message}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => testMutation.mutate({ id: cfg.id })} disabled={testMutation.isPending} className="gap-1.5 text-xs">
                        {testMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <TestTube2 className="h-3 w-3" />} Test
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(cfg)} className="gap-1.5 text-xs">
                        <Pencil className="h-3 w-3" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { if (confirm(`Delete ${cfg.locationName}?`)) deleteMutation.mutate({ id: cfg.id }); }} className="gap-1.5 text-xs text-red-600 hover:text-red-700">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit TechShip Location" : "Add TechShip Location"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Location Name</Label>
              <Input placeholder="e.g. Calgary" value={form.locationName} onChange={(e) => setForm((f) => ({ ...f, locationName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input placeholder="https://godirect-xxx.techship.ca" value={form.baseUrl} onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={form.apiKey} onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>API Secret {editingId && <span className="text-xs text-muted-foreground">(leave blank to keep current)</span>}</Label>
              <Input type="password" placeholder={editingId ? "Leave blank to keep current" : "Enter API secret"} value={form.apiSecret} onChange={(e) => setForm((f) => ({ ...f, apiSecret: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea placeholder="Any notes about this location…" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            <div className="flex items-center gap-3">
              <Switch id="ts-active" checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
              <Label htmlFor="ts-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-2">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ShippingIntegration() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
          <Truck className="h-5 w-5 text-blue-500" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Shipping Integration</h1>
          <p className="text-sm text-muted-foreground">Configure carrier and TMS integrations: Shipwell, Veeqo, and TechShip.</p>
        </div>
      </div>

      <Tabs defaultValue="techship">
        <TabsList className="mb-4">
          <TabsTrigger value="techship">TechShip</TabsTrigger>
          <TabsTrigger value="shipwell">Shipwell</TabsTrigger>
          <TabsTrigger value="veeqo">Veeqo</TabsTrigger>
        </TabsList>
        <TabsContent value="techship"><TechShipTab /></TabsContent>
        <TabsContent value="shipwell"><ShipwellCredentialsTab /></TabsContent>
        <TabsContent value="veeqo"><VeeqoTab /></TabsContent>
      </Tabs>
    </div>
  );
}

import AppLayout from "@/components/AppLayout";
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
import { AlertCircle, Bell, CheckCircle2, Clock, Eye, EyeOff, Loader2, Pencil, Plus, Save, TestTube2, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ─── Credentials Tab ─────────────────────────────────────────────────────────
function CredentialsTab() {
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
          <CardDescription>Enter your Shipwell account email and password. Use Sandbox for testing before switching to Production.</CardDescription>
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
            {config?.hasPassword && !password && <p className="text-xs text-muted-foreground">Password is saved. Enter a new one only if you want to change it.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="sw-env">Environment</Label>
            <Select value={environment} onValueChange={(v) => setEnvironment(v as "sandbox" | "production")}>
              <SelectTrigger id="sw-env"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />Sandbox (testing)</span></SelectItem>
                <SelectItem value="production"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-green-500 inline-block" />Production (live)</span></SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{environment === "sandbox" ? "Sandbox: https://sandbox-api.shipwell.com — safe for testing." : "Production: https://api.shipwell.com — live environment, real shipments."}</p>
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

      <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <Zap className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
              <p className="font-medium">How Shipwell integration works</p>
              <p className="text-xs opacity-80">When an order reaches <strong>QC Complete</strong> status, a "Send to Shipwell" button appears. Clicking it creates a shipment in Shipwell and shows the live bidding/transit status directly on the order row. Delivered orders are automatically removed from the Open Orders screen.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Lane Thresholds Tab ──────────────────────────────────────────────────────
type LaneThreshold = {
  id: number;
  laneName: string;
  facilityCode: string | null;
  destinationRegion: string | null;
  thresholdHours: number;
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type LaneFormState = {
  laneName: string;
  facilityCode: string;
  destinationRegion: string;
  thresholdHours: number;
  isActive: boolean;
  notes: string;
};

const EMPTY_FORM: LaneFormState = { laneName: "", facilityCode: "", destinationRegion: "", thresholdHours: 2, isActive: true, notes: "" };

function LaneThresholdsTab() {
  const { data: thresholds = [], isLoading, refetch } = trpc.laneThresholds.list.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<LaneFormState>(EMPTY_FORM);

  const createMutation = trpc.laneThresholds.create.useMutation({
    onSuccess: () => { toast.success("Lane threshold created."); setDialogOpen(false); refetch(); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
  const updateMutation = trpc.laneThresholds.update.useMutation({
    onSuccess: () => { toast.success("Lane threshold updated."); setDialogOpen(false); refetch(); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
  const deleteMutation = trpc.laneThresholds.delete.useMutation({
    onSuccess: () => { toast.success("Lane threshold deleted."); refetch(); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (t: LaneThreshold) => {
    setEditingId(t.id);
    setForm({ laneName: t.laneName, facilityCode: t.facilityCode ?? "", destinationRegion: t.destinationRegion ?? "", thresholdHours: t.thresholdHours, isActive: t.isActive, notes: t.notes ?? "" });
    setDialogOpen(true);
  };
  const handleSave = () => {
    if (!form.laneName.trim()) { toast.error("Lane name is required."); return; }
    if (form.thresholdHours < 1 || form.thresholdHours > 168) { toast.error("Threshold must be between 1 and 168 hours."); return; }
    const payload = { laneName: form.laneName.trim(), facilityCode: form.facilityCode.trim() || null, destinationRegion: form.destinationRegion.trim() || null, thresholdHours: form.thresholdHours, isActive: form.isActive, notes: form.notes.trim() || null };
    if (editingId !== null) { updateMutation.mutate({ id: editingId, ...payload }); }
    else { createMutation.mutate(payload); }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Zero-Bid Alert Thresholds</CardTitle>
              <CardDescription className="mt-1">
                Configure how long a Quoting order can have zero carrier bids before an alert is sent. The system matches by facility code first, then falls back to the global default (2 hours).
              </CardDescription>
            </div>
            <Button onClick={openCreate} className="gap-2 shrink-0">
              <Plus className="h-4 w-4" /> Add Lane
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading thresholds...
            </div>
          ) : thresholds.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">No custom lane thresholds</p>
              <p className="text-xs mt-1">All lanes use the global default of 2 hours. Add a lane to override.</p>
            </div>
          ) : (
            <div className="divide-y">
              {(thresholds as LaneThreshold[]).map((t) => (
                <div key={t.id} className="flex items-center justify-between py-3 gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{t.laneName}</span>
                      {!t.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                      {t.facilityCode && <span>Facility: <span className="font-mono">{t.facilityCode}</span></span>}
                      {t.destinationRegion && <span>Dest: {t.destinationRegion}</span>}
                      {t.notes && <span className="italic truncate max-w-[200px]">{t.notes}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 rounded-md px-2.5 py-1 text-sm font-medium">
                      <Clock className="h-3.5 w-3.5" />
                      {t.thresholdHours}h
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { if (confirm(`Delete threshold "${t.laneName}"?`)) deleteMutation.mutate({ id: t.id }); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <Clock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-800 dark:text-amber-300 space-y-1">
              <p className="font-medium">How lane thresholds work</p>
              <p className="text-xs opacity-80">
                When a Quoting order has zero carrier bids for longer than the configured threshold, a ⚠️ warning icon appears on the order row and an owner notification is sent. Facility-specific thresholds take priority over global ones. Thresholds are checked every 15 minutes during the Shipwell status sync.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId !== null ? "Edit Lane Threshold" : "Add Lane Threshold"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="lt-name">Lane Name <span className="text-destructive">*</span></Label>
              <Input id="lt-name" placeholder="e.g. TOR → Ontario" value={form.laneName} onChange={(e) => setForm((f) => ({ ...f, laneName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lt-facility">Facility Code <span className="text-xs text-muted-foreground">(optional — leave blank for global)</span></Label>
              <Input id="lt-facility" placeholder="e.g. TOR-Toronto" value={form.facilityCode} onChange={(e) => setForm((f) => ({ ...f, facilityCode: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Match the facility code shown in the Open Orders warehouse cards.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lt-dest">Destination Region <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Input id="lt-dest" placeholder="e.g. Ontario, BC, California" value={form.destinationRegion} onChange={(e) => setForm((f) => ({ ...f, destinationRegion: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lt-hours">Zero-Bid Alert Threshold (hours) <span className="text-destructive">*</span></Label>
              <Input id="lt-hours" type="number" min={1} max={168} value={form.thresholdHours} onChange={(e) => setForm((f) => ({ ...f, thresholdHours: parseInt(e.target.value) || 2 }))} />
              <p className="text-xs text-muted-foreground">Alert fires when a Quoting order has 0 bids for this many hours. Default is 2 hours.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lt-notes">Notes <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Textarea id="lt-notes" placeholder="e.g. Urgent lane — carriers slow to respond on weekends" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3">
              <Switch id="lt-active" checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
              <Label htmlFor="lt-active" className="cursor-pointer">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingId !== null ? "Save Changes" : "Create Threshold"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Notifications Tab ───────────────────────────────────────────────────────
// Hours for the time picker (0-23 mapped to display strings)
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${String(i).padStart(2, "0")}:00`,
}));

// Common minute options (every 15 min)
const MINUTE_OPTIONS = [0, 15, 30, 45].map((m) => ({
  value: m,
  label: String(m).padStart(2, "0"),
}));

function NotificationsTab() {
  const [alertResult, setAlertResult] = useState<{
    success: boolean;
    overdueCount: number;
    suppressedCount: number;
    message: string;
  } | null>(null);

  // ── Alert time state ────────────────────────────────────────────────────────
  const { data: alertTimeData, refetch: refetchAlertTime } = trpc.overdueAlert.getAlertTime.useQuery();
  const [selectedHour, setSelectedHour] = useState<number>(7);
  const [selectedMinute, setSelectedMinute] = useState<number>(0);
  const [timeInitialized, setTimeInitialized] = useState(false);

  if (alertTimeData && !timeInitialized) {
    setSelectedHour(alertTimeData.hour);
    setSelectedMinute(alertTimeData.minute);
    setTimeInitialized(true);
  }

  const saveAlertTime = trpc.overdueAlert.setAlertTime.useMutation({
    onSuccess: (data) => {
      toast.success(`Alert time updated to ${data.time}. Scheduler rescheduled.`);
      refetchAlertTime();
    },
    onError: (err) => toast.error(`Failed to save alert time: ${err.message}`),
  });

  const pad = (n: number) => String(n).padStart(2, "0");
  const currentTimeStr = alertTimeData
    ? `${pad(alertTimeData.hour)}:${pad(alertTimeData.minute)}`
    : "07:00";
  const pendingTimeStr = `${pad(selectedHour)}:${pad(selectedMinute)}`;
  const isDirty = pendingTimeStr !== currentTimeStr;

  // ── Test alert state ────────────────────────────────────────────────────────
  const triggerAlert = trpc.overdueAlert.triggerNow.useMutation({
    onSuccess: (data) => {
      setAlertResult(data);
      if (data.success && data.overdueCount > 0) {
        toast.success(`Alert sent — ${data.overdueCount} overdue order${data.overdueCount !== 1 ? "s" : ""} notified.`);
      } else if (data.success && data.overdueCount === 0) {
        toast.info(data.suppressedCount > 0 ? `All ${data.suppressedCount} overdue orders already notified today.` : "No overdue unallocated orders right now.");
      } else {
        toast.error(`Alert failed: ${data.message}`);
      }
    },
    onError: (err) => {
      setAlertResult(null);
      toast.error(`Failed to trigger alert: ${err.message}`);
    },
  });

  return (
    <div className="space-y-6">
      {/* ── Alert Schedule Card ── */}
      <Card>
        <CardHeader>
          <CardTitle>Alert Schedule</CardTitle>
          <CardDescription>
            Set the time the overdue order notification fires each day. The scheduler updates immediately — no restart required.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-2">
              <Label htmlFor="alert-hour">Hour</Label>
              <Select
                value={String(selectedHour)}
                onValueChange={(v) => setSelectedHour(Number(v))}
              >
                <SelectTrigger id="alert-hour" className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {HOUR_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="alert-minute">Minute</Label>
              <Select
                value={String(selectedMinute)}
                onValueChange={(v) => setSelectedMinute(Number(v))}
              >
                <SelectTrigger id="alert-minute" className="w-[90px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MINUTE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => saveAlertTime.mutate({ hour: selectedHour, minute: selectedMinute })}
              disabled={saveAlertTime.isPending || !isDirty}
              className="gap-2 mb-0.5"
            >
              {saveAlertTime.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Time
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Currently scheduled: <span className="font-medium text-foreground">{currentTimeStr}</span> daily
            {isDirty && <span className="text-amber-500 ml-2">(unsaved: {pendingTimeStr})</span>}
          </p>
        </CardContent>
      </Card>

      {/* ── Test Alert Card ── */}
      <Card>
        <CardHeader>
          <CardTitle>Send Test Alert</CardTitle>
          <CardDescription>
            Trigger the overdue order alert immediately to verify the notification arrives. Each order is only
            included once per calendar day (alert suppression applies).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Button
              onClick={() => { setAlertResult(null); triggerAlert.mutate(); }}
              disabled={triggerAlert.isPending}
              className="gap-2"
            >
              {triggerAlert.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Bell className="h-4 w-4" />}
              {triggerAlert.isPending ? "Sending…" : "Send Test Alert Now"}
            </Button>
            {alertResult && (
              <span className="text-xs text-muted-foreground">
                Last run: {new Date().toLocaleTimeString()}
              </span>
            )}
          </div>

          {alertResult && (
            <div className={`flex items-start gap-3 rounded-lg p-4 text-sm border ${
              alertResult.success
                ? alertResult.overdueCount > 0
                  ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300"
                  : "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300"
                : "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300"
            }`}>
              {alertResult.success
                ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
              <div className="space-y-1">
                <p className="font-medium">
                  {alertResult.success
                    ? alertResult.overdueCount > 0
                      ? `Notification sent — ${alertResult.overdueCount} overdue order${alertResult.overdueCount !== 1 ? "s" : ""} included`
                      : "No notification sent — no qualifying orders"
                    : "Alert failed"}
                </p>
                <p className="text-xs opacity-80">{alertResult.message}</p>
                {alertResult.suppressedCount > 0 && (
                  <p className="text-xs opacity-70">
                    {alertResult.suppressedCount} order{alertResult.suppressedCount !== 1 ? "s" : ""} suppressed (already notified today).
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <Bell className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
              <p className="font-medium">Alert suppression</p>
              <p className="text-xs opacity-80">
                Each overdue order is notified at most once per calendar day. If an order was already included in
                today's alert it will be skipped on subsequent runs (including manual test runs) until midnight.
                Orders that become overdue after the scheduled run will appear in the next day's alert.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ShipwellSettings() {
  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Zap className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Shipwell Settings</h1>
            <p className="text-sm text-muted-foreground">Configure Shipwell TMS credentials and zero-bid alert thresholds per shipping lane.</p>
          </div>
        </div>

        <Tabs defaultValue="credentials">
          <TabsList className="mb-4">
            <TabsTrigger value="credentials">Credentials</TabsTrigger>
            <TabsTrigger value="lanes">Lane Thresholds</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
          </TabsList>
          <TabsContent value="credentials"><CredentialsTab /></TabsContent>
          <TabsContent value="lanes"><LaneThresholdsTab /></TabsContent>
          <TabsContent value="notifications"><NotificationsTab /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

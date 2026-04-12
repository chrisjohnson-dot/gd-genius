import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CheckCircle2, XCircle, RefreshCw, Copy, Eye, EyeOff,
  Wifi, WifiOff, Clock, Package, AlertCircle, Info, Link2,
  ShieldCheck, Plus, Trash2, Pencil, KeyRound
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
type CortexConn = {
  id: number;
  platform: string;
  displayName: string;
  baseUrl: string;
  outboundApiKey: string;
  inboundApiKey: string;
  webhookUrl: string;
  syncIntervalSeconds: number;
  enabled: boolean;
  lastHealthCheck: Date | null;
  lastHealthStatus: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="outline" className="text-muted-foreground">Not tested</Badge>;
  if (status === "ok") return <Badge className="bg-emerald-600 text-white gap-1"><CheckCircle2 className="h-3 w-3" /> Connected</Badge>;
  return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> {status}</Badge>;
}

function MaskedInput({
  value, onChange, label, placeholder, id
}: { value: string; onChange: (v: string) => void; label: string; placeholder?: string; id: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-10 font-mono text-sm"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

// ─── Connection Card ──────────────────────────────────────────────────────────
function ConnectionCard({ platform, label }: { platform: string; label: string }) {
  const utils = trpc.useUtils();
  const { data: conn, isLoading } = trpc.cortex.getConnection.useQuery({ platform });

  const [form, setForm] = useState({
    displayName: "",
    baseUrl: "",
    outboundApiKey: "",
    inboundApiKey: "",
    webhookUrl: "",
    syncIntervalSeconds: 300,
    enabled: false,
  });
  const [initialised, setInitialised] = useState(false);

  // Seed form from DB once
  if (conn && !initialised) {
    setForm({
      displayName: conn.displayName ?? "",
      baseUrl: conn.baseUrl ?? "",
      outboundApiKey: conn.outboundApiKey ?? "",
      inboundApiKey: conn.inboundApiKey ?? "",
      webhookUrl: conn.webhookUrl ?? "",
      syncIntervalSeconds: conn.syncIntervalSeconds ?? 300,
      enabled: conn.enabled ?? false,
    });
    setInitialised(true);
  }

  const save = trpc.cortex.saveConnection.useMutation({
    onSuccess: () => {
      toast.success(`${label} connection updated.`);
      utils.cortex.getConnection.invalidate({ platform });
      utils.cortex.listConnections.invalidate();
    },
    onError: (e) => toast.error(`Save failed: ${e.message}`),
  });

  const test = trpc.cortex.testConnection.useMutation({
    onSuccess: (data) => {
      const body = data.body as Record<string, unknown>;
      if (platform === "opfi") {
        const ms = body?.durationMs as number | undefined;
        const hasSheets = body?.hasRateSheets as boolean | undefined;
        toast.success(
          `OpFi connection verified — responded in ${ms ?? "?"}ms` +
          (hasSheets ? ", rate sheets available" : ", no rate sheets for probe client")
        );
      } else {
        toast.success(`${label} health check passed. Platform: ${(body?.platform as string) ?? "unknown"}`);
      }
      utils.cortex.getConnection.invalidate({ platform });
    },
    onError: (e) => toast.error(`Connection failed: ${e.message}`),
  });

  const copyInboundKey = () => {
    navigator.clipboard.writeText(form.inboundApiKey);
    toast.success("Inbound API key copied to clipboard.");
  };

  // Derive the Genius inbound URL for display
  const geniusBase = typeof window !== "undefined" ? window.location.origin : "";

  if (isLoading) return <div className="py-8 text-center text-muted-foreground text-sm">Loading…</div>;

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-3">
          {form.enabled ? <Wifi className="h-4 w-4 text-emerald-500" /> : <WifiOff className="h-4 w-4 text-muted-foreground" />}
          <span className="text-sm font-medium">{form.enabled ? "Enabled" : "Disabled"}</span>
          {conn?.lastHealthCheck && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last check: {new Date(conn.lastHealthCheck).toLocaleString()}
            </span>
          )}
        </div>
        <StatusBadge status={conn?.lastHealthStatus ?? null} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Display name */}
        <div className="space-y-1.5">
          <Label htmlFor={`${platform}-name`}>Display Name</Label>
          <Input
            id={`${platform}-name`}
            value={form.displayName}
            onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            placeholder={label}
          />
        </div>

        {/* Base URL */}
        <div className="space-y-1.5">
          <Label htmlFor={`${platform}-url`}>{label} Base URL</Label>
          <Input
            id={`${platform}-url`}
            value={form.baseUrl}
            onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
            placeholder="https://clearsight.example.com"
            className="font-mono text-sm"
          />
        </div>

        {/* Outbound API key (we use when calling them) */}
        <MaskedInput
          id={`${platform}-outbound-key`}
          label={`Outbound API Key (Genius → ${label})`}
          value={form.outboundApiKey}
          onChange={(v) => setForm((f) => ({ ...f, outboundApiKey: v }))}
          placeholder="Key Genius uses when calling ClearSight"
        />

        {/* Inbound API key (they use when calling us) */}
        <div className="space-y-1.5">
          <Label htmlFor={`${platform}-inbound-key`} className="flex items-center gap-1.5">
            Inbound API Key ({label} → Genius)
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Share this key with {label}. They must include it as the <code>X-API-Key</code> header when calling Genius endpoints.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <div className="flex gap-2">
            <Input
              id={`${platform}-inbound-key`}
              type="password"
              value={form.inboundApiKey}
              onChange={(e) => setForm((f) => ({ ...f, inboundApiKey: e.target.value }))}
              placeholder="Key ClearSight sends to Genius"
              className="font-mono text-sm"
            />
            <Button variant="outline" size="icon" onClick={copyInboundKey} title="Copy inbound key">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Webhook URL */}
        <div className="space-y-1.5">
          <Label htmlFor={`${platform}-webhook`}>Webhook URL (Genius → {label})</Label>
          <Input
            id={`${platform}-webhook`}
            value={form.webhookUrl}
            onChange={(e) => setForm((f) => ({ ...f, webhookUrl: e.target.value }))}
            placeholder="https://clearsight.example.com/api/cortex/webhook/genius"
            className="font-mono text-sm"
          />
        </div>

        {/* Sync interval */}
        <div className="space-y-1.5">
          <Label htmlFor={`${platform}-interval`}>Sync Interval (seconds)</Label>
          <Input
            id={`${platform}-interval`}
            type="number"
            min={60}
            value={form.syncIntervalSeconds}
            onChange={(e) => setForm((f) => ({ ...f, syncIntervalSeconds: parseInt(e.target.value) || 300 }))}
          />
          <p className="text-xs text-muted-foreground">Minimum 60 seconds. Default: 300 (5 min).</p>
        </div>
      </div>

      {/* Genius inbound endpoints (read-only info) */}
      <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Genius Inbound Endpoints (share with {label})</p>
        <div className="space-y-2 font-mono text-xs">
          {[
            { method: "GET", path: "/api/health", desc: "Health check" },
            { method: "POST", path: "/api/returns", desc: "Submit return request" },
            { method: "GET", path: "/api/returns/processed", desc: "Poll processed returns" },
          ].map(({ method, path, desc }) => (
            <div key={path} className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] font-mono w-12 justify-center shrink-0">{method}</Badge>
              <code className="text-foreground">{geniusBase}{path}</code>
              <span className="text-muted-foreground">— {desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Enable toggle + actions */}
      <div className="flex items-center justify-between border-t pt-4">
        <div className="flex items-center gap-3">
          <Switch
            checked={form.enabled}
            onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
            id={`${platform}-enabled`}
          />
          <Label htmlFor={`${platform}-enabled`} className="cursor-pointer">
            {form.enabled ? "Integration enabled" : "Integration disabled"}
          </Label>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => test.mutate({ platform })}
            disabled={test.isPending}
            className="gap-2"
          >
            {test.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
            Test Connection
          </Button>
          <Button
            onClick={() => save.mutate({ platform, ...form })}
            disabled={save.isPending}
            className="gap-2"
          >
            {save.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Inbound Returns Log ──────────────────────────────────────────────────────
function InboundReturnsLog() {
  const { data: rows, isLoading } = trpc.cortex.listInboundReturns.useQuery({ limit: 50 });
  const utils = trpc.useUtils();

  const updateStatus = trpc.cortex.updateReturnStatus.useMutation({
    onSuccess: () => {
      utils.cortex.listInboundReturns.invalidate();
      toast.success("Status updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const statusColors: Record<string, string> = {
    Received: "bg-blue-100 text-blue-800",
    Inspecting: "bg-yellow-100 text-yellow-800",
    Processed: "bg-emerald-100 text-emerald-800",
    Refunded: "bg-purple-100 text-purple-800",
    Rejected: "bg-red-100 text-red-800",
    Restocked: "bg-teal-100 text-teal-800",
  };

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Loading…</div>;
  if (!rows?.length) return (
    <div className="py-12 text-center text-muted-foreground space-y-2">
      <Package className="h-8 w-8 mx-auto opacity-30" />
      <p className="text-sm">No inbound returns from ClearSight yet.</p>
      <p className="text-xs">Returns submitted by ClearSight via POST /api/returns will appear here.</p>
    </div>
  );

  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Return #</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Received</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-mono text-sm font-medium">{r.returnNumber}</TableCell>
              <TableCell>{r.customerName || <span className="text-muted-foreground">—</span>}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{r.reason || "—"}</TableCell>
              <TableCell>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[r.status] ?? "bg-muted text-muted-foreground"}`}>
                  {r.status}
                </span>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {new Date(r.createdAt).toLocaleString()}
              </TableCell>
              <TableCell>
                {r.status === "Received" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateStatus.mutate({ id: r.id, status: "Inspecting" })}
                    disabled={updateStatus.isPending}
                  >
                    Start Inspection
                  </Button>
                )}
                {r.status === "Inspecting" && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                      onClick={() => updateStatus.mutate({ id: r.id, status: "Processed" })}
                      disabled={updateStatus.isPending}
                    >
                      Process
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => updateStatus.mutate({ id: r.id, status: "Rejected" })}
                      disabled={updateStatus.isPending}
                    >
                      Reject
                    </Button>
                  </div>
                )}
                {(r.status === "Processed" || r.status === "Rejected") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateStatus.mutate({ id: r.id, status: "Restocked" })}
                    disabled={updateStatus.isPending || r.status === "Rejected"}
                  >
                    Mark Restocked
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Cortex Hub Card ─────────────────────────────────────────────────────────
function CortexHubCard() {
  const utils = trpc.useUtils();
  const { data: config, isLoading } = trpc.cortexHub.getConfig.useQuery();

  const [form, setForm] = useState({
    cortexBaseUrl: "",
    cortexApiKey: "",
    geniusApiKey: "",
    syncIntervalMinutes: 5,
  });
  const [initialised, setInitialised] = useState(false);

  if (config && !initialised) {
    setForm({
      cortexBaseUrl: config.cortexBaseUrl ?? "",
      cortexApiKey: "", // masked — user must re-enter to change
      geniusApiKey: "", // masked — user must re-enter to change
      syncIntervalMinutes: config.syncIntervalMinutes ?? 5,
    });
    setInitialised(true);
  }

  const save = trpc.cortexHub.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("Cortex Hub config saved.");
      utils.cortexHub.getConfig.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const test = trpc.cortexHub.testConnection.useMutation({
    onSuccess: (d) => {
      toast.success(d.message);
      utils.cortexHub.getConfig.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const statusColor =
    config?.status === "connected" ? "bg-emerald-600" :
    config?.status === "error" ? "bg-red-600" : "bg-muted-foreground";

  return (
    <div className="space-y-6">
      {/* Status banner */}
      {config && (
        <div className="flex items-center gap-3 p-3 rounded-lg border">
          <span className={`h-2.5 w-2.5 rounded-full ${statusColor}`} />
          <span className="text-sm font-medium capitalize">{config.status ?? "disconnected"}</span>
          {config.lastHealthCheck && (
            <span className="text-xs text-muted-foreground ml-auto">
              Last checked: {new Date(config.lastHealthCheck).toLocaleString()}
            </span>
          )}
        </div>
      )}

      {/* Config form */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="hub-url">GD Cortex Base URL</Label>
          <Input
            id="hub-url"
            placeholder="https://cortex.yourdomain.com"
            value={form.cortexBaseUrl}
            onChange={(e) => setForm((f) => ({ ...f, cortexBaseUrl: e.target.value }))}
          />
        </div>

        <MaskedInput
          id="hub-cortex-key"
          label={config?.cortexApiKey ? `Cortex API Key (${config.cortexApiKey})` : "Cortex API Key"}
          placeholder="Key Cortex uses to authenticate to Genius"
          value={form.cortexApiKey}
          onChange={(v) => setForm((f) => ({ ...f, cortexApiKey: v }))}
        />

        <MaskedInput
          id="hub-genius-key"
          label={config?.geniusApiKey ? `Genius API Key (${config.geniusApiKey})` : "Genius API Key"}
          placeholder="Key Genius uses to authenticate to Cortex"
          value={form.geniusApiKey}
          onChange={(v) => setForm((f) => ({ ...f, geniusApiKey: v }))}
        />

        <div className="space-y-1.5">
          <Label htmlFor="hub-interval">Sync Interval (minutes)</Label>
          <Input
            id="hub-interval"
            type="number"
            min={1}
            max={60}
            value={form.syncIntervalMinutes}
            onChange={(e) => setForm((f) => ({ ...f, syncIntervalMinutes: Number(e.target.value) }))}
            className="w-32"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          onClick={() => save.mutate(form)}
          disabled={save.isPending || !form.cortexBaseUrl || !form.cortexApiKey || !form.geniusApiKey}
        >
          {save.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
          Save Config
        </Button>
        <Button
          variant="outline"
          onClick={() => test.mutate()}
          disabled={test.isPending || !config?.cortexBaseUrl}
        >
          {test.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Wifi className="h-4 w-4 mr-2" />}
          Test Connection
        </Button>
      </div>

      {/* Endpoint reference */}
      <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cortex Hub Endpoints (for Cortex config)</p>
        <div className="space-y-1 font-mono text-xs">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">GET</Badge>
            <span>/api/trpc/cortexHub.health</span>
            <span className="text-muted-foreground">— health check (no auth)</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">GET</Badge>
            <span>/api/trpc/cortexHub.getProduction</span>
            <span className="text-muted-foreground">— production jobs feed</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">GET</Badge>
            <span>/api/trpc/cortexHub.getMaterials</span>
            <span className="text-muted-foreground">— materials inventory feed</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">POST</Badge>
            <span>/api/trpc/cortexHub.receiveEvent</span>
            <span className="text-muted-foreground">— inbound events from Cortex</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Supervisor PINs Tab ─────────────────────────────────────────────────────
function SupervisorPinsTab() {
  const { data: pins = [], refetch } = trpc.smallParcel.listSupervisorPins.useQuery();

  const createMutation = trpc.smallParcel.createSupervisorPin.useMutation({
    onSuccess: () => { toast.success("Supervisor PIN created"); refetch(); setShowAdd(false); resetForm(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.smallParcel.updateSupervisorPin.useMutation({
    onSuccess: () => { toast.success("Supervisor PIN updated"); refetch(); setEditTarget(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.smallParcel.deleteSupervisorPin.useMutation({
    onSuccess: () => { toast.success("Supervisor PIN deleted"); refetch(); setDeleteTarget(null); },
    onError: (e) => toast.error(e.message),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<{ id: number; name: string; active: boolean } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");
  const [editName, setEditName] = useState("");
  const [editPin, setEditPin] = useState("");
  const [editActive, setEditActive] = useState(true);

  const resetForm = () => { setNewName(""); setNewPin(""); setNewPinConfirm(""); };

  const handleAdd = () => {
    if (!newName.trim()) return toast.error("Name is required");
    if (!newPin || !/^\d{4,8}$/.test(newPin)) return toast.error("PIN must be 4–8 digits");
    if (newPin !== newPinConfirm) return toast.error("PINs do not match");
    createMutation.mutate({ name: newName.trim(), pin: newPin });
  };

  const openEdit = (pin: { id: number; name: string | null; active: boolean }) => {
    setEditName(pin.name ?? "");
    setEditPin("");
    setEditActive(pin.active);
    setEditTarget({ id: pin.id, name: pin.name ?? "", active: pin.active });
  };

  const handleEdit = () => {
    if (!editTarget) return;
    if (!editName.trim()) return toast.error("Name is required");
    if (editPin && !/^\d{4,8}$/.test(editPin)) return toast.error("PIN must be 4–8 digits");
    updateMutation.mutate({ id: editTarget.id, name: editName.trim(), ...(editPin ? { pin: editPin } : {}), active: editActive });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Manage PINs required to approve manual overrides on high-value items.</p>
        <Button onClick={() => { setShowAdd(true); resetForm(); }} size="sm">
          <Plus className="w-4 h-4 mr-1.5" />
          Add Supervisor
        </Button>
      </div>

      {pins.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <KeyRound className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No supervisor PINs configured yet.</p>
          <p className="text-xs mt-1">Add a supervisor to enable PIN-protected overrides on high-value items.</p>
        </div>
      ) : (
        <div className="divide-y border rounded-lg">
          {pins.map((pin) => (
            <div key={pin.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-300">
                  {(pin.name ?? "?")[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-sm">{pin.name}</p>
                  <p className="text-xs text-muted-foreground">Added {new Date(pin.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={pin.active ? "default" : "secondary"} className="text-xs">{pin.active ? "Active" : "Inactive"}</Badge>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(pin)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ id: pin.id, name: pin.name ?? "" })}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-3">
        <p className="text-xs text-amber-800 dark:text-amber-300">
          <strong>How it works:</strong> When an operator attempts a manual override on a SKU flagged as high-value, they must enter a valid supervisor PIN before the override is accepted. The approving supervisor's name is recorded in the audit log.
        </p>
      </div>

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={(o) => { setShowAdd(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Supervisor PIN</DialogTitle>
            <DialogDescription>Create a PIN for a supervisor who can approve high-value item overrides.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5"><Label>Supervisor Name</Label><Input placeholder="e.g. John Smith" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label>PIN (4–8 digits)</Label><Input type="password" inputMode="numeric" maxLength={8} placeholder="Enter PIN" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} /></div>
            <div className="flex flex-col gap-1.5"><Label>Confirm PIN</Label><Input type="password" inputMode="numeric" maxLength={8} placeholder="Re-enter PIN" value={newPinConfirm} onChange={(e) => setNewPinConfirm(e.target.value.replace(/\D/g, ""))} /></div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowAdd(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleAdd} disabled={createMutation.isPending}>{createMutation.isPending ? "Creating…" : "Create PIN"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Supervisor PIN</DialogTitle>
            <DialogDescription>Update the name, PIN, or active status. Leave PIN blank to keep the current one.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5"><Label>Supervisor Name</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label>New PIN (leave blank to keep current)</Label><Input type="password" inputMode="numeric" maxLength={8} placeholder="New PIN (optional)" value={editPin} onChange={(e) => setEditPin(e.target.value.replace(/\D/g, ""))} /></div>
            <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={editActive} onCheckedChange={setEditActive} /></div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={updateMutation.isPending}>{updateMutation.isPending ? "Saving…" : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Supervisor PIN</DialogTitle>
            <DialogDescription>Remove the PIN for <strong>{deleteTarget?.name}</strong>? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? "Deleting…" : "Delete PIN"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CortexSettings() {
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">GD Cortex Integration</h1>
        <p className="text-muted-foreground text-sm">
          Configure connections between GD Genius and other Cortex platforms (GD ClearSight, GD OpFi).
          Genius acts as the processing hub — receiving return requests, updating statuses, and firing webhooks.
        </p>
      </div>

      {/* Architecture info banner */}
      <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-4">
        <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
          <p className="font-medium">How it works</p>
          <p>ClearSight pushes return requests to Genius via <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">POST /api/returns</code>. Genius processes them through the Returns workflow and fires status webhooks back to ClearSight. ClearSight can also poll <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">GET /api/returns/processed</code> for completed returns.</p>
        </div>
      </div>

      <Tabs defaultValue="clearsight">
        <TabsList>
          <TabsTrigger value="clearsight">GD ClearSight</TabsTrigger>
          <TabsTrigger value="opfi">GD OpFi</TabsTrigger>
          <TabsTrigger value="inbound">Inbound Returns Log</TabsTrigger>
          <TabsTrigger value="hub">Cortex Hub</TabsTrigger>
          <TabsTrigger value="supervisor-pins" className="gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />Supervisor PINs</TabsTrigger>
        </TabsList>

        <TabsContent value="clearsight">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">GD ClearSight Connection</CardTitle>
              <CardDescription>
                Configure the bidirectional connection between GD Genius and GD ClearSight for returns processing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConnectionCard platform="clearsight" label="ClearSight" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="opfi" className="space-y-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">GD OpFi Connection</CardTitle>
              <CardDescription>
                Configure the connection between GD Genius and GD OpFi for financial data exchange.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConnectionCard platform="opfi" label="OpFi" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inbound">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inbound Returns from ClearSight</CardTitle>
              <CardDescription>
                Return requests received from ClearSight. Update their status here or process them through the Returns workflow.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InboundReturnsLog />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="supervisor-pins">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Supervisor PINs
              </CardTitle>
              <CardDescription>
                Manage PINs required to approve manual overrides on high-value items in the Small Parcel workflow.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SupervisorPinsTab />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hub">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                GD Cortex Hub Connection
              </CardTitle>
              <CardDescription>
                Configure the Genius side of the Cortex Hub integration. GD Cortex polls Genius for production jobs and materials inventory via these credentials.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CortexHubCard />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

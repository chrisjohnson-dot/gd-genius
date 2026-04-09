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
  Wifi, WifiOff, Clock, Package, AlertCircle, Info
} from "lucide-react";
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
      toast.success(`${label} health check passed. Platform: ${(data.body as Record<string,string>)?.platform ?? "unknown"}`);
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
            disabled={test.isPending || !form.baseUrl}
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

// ─── Main Page ────────────────────────────────────────────────────────────────
// ─── Freight Rate Markup Card ─────────────────────────────────────────────────
function FreightMarkupCard() {
  const { data: settings, refetch } = trpc.smallParcel.getAllSettings.useQuery();
  const setSettingMutation = trpc.smallParcel.setSetting.useMutation({
    onSuccess: () => { refetch(); toast.success("Markup multiplier saved"); setEditing(false); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const currentMultiplier = settings?.rateMarkupMultiplier ?? 1.0;
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState("");

  const handleEdit = () => {
    setInputVal(currentMultiplier.toFixed(2));
    setEditing(true);
  };

  const handleSave = () => {
    const v = parseFloat(inputVal);
    if (!isFinite(v) || v < 1.0 || v > 3.0) {
      toast.error("Multiplier must be between 1.00 and 3.00");
      return;
    }
    setSettingMutation.mutate({ key: "rate_markup_multiplier", value: v.toFixed(4) });
  };

  const markupPct = ((currentMultiplier - 1) * 100).toFixed(1);
  const isMarkupActive = currentMultiplier > 1.0;

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Freight Rate Markup</CardTitle>
            <CardDescription>
              A hidden multiplier applied to all Rate Wizard carrier rates before they are displayed to operators.
              The sourced carrier cost is multiplied by this factor — the difference is GD's margin.
            </CardDescription>
          </div>
          {isMarkupActive ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5" /> +{markupPct}% margin active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-muted text-muted-foreground px-2.5 py-1 rounded-full">
              No markup (pass-through)
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-4">
          <div className="space-y-1.5 flex-1 max-w-xs">
            <Label htmlFor="markup-multiplier">Multiplier</Label>
            {editing ? (
              <Input
                id="markup-multiplier"
                type="number"
                step="0.01"
                min="1.00"
                max="3.00"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                className="font-mono"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
              />
            ) : (
              <div className="flex items-center gap-2 h-10 px-3 rounded-md border bg-muted/40">
                <span className="font-mono font-semibold text-lg">{currentMultiplier.toFixed(2)}×</span>
                <span className="text-muted-foreground text-sm ml-1">
                  {isMarkupActive ? `(carrier cost + ${markupPct}%)` : "(no markup — pass-through)"}
                </span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Example: a carrier rate of $10.00 × {currentMultiplier.toFixed(2)} = <strong>${(10 * currentMultiplier).toFixed(2)}</strong> shown to operator.
              Valid range: 1.00 – 3.00.
            </p>
          </div>
          <div className="flex gap-2 pb-7">
            {editing ? (
              <>
                <Button size="sm" onClick={handleSave} disabled={setSettingMutation.isPending}>
                  {setSettingMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={handleEdit}>Edit</Button>
            )}
          </div>
        </div>

        {/* Audit note */}
        <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md p-3">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            This multiplier is applied <strong>server-side</strong> and is never exposed to operators or customers.
            The displayed rate already includes the markup. The raw carrier cost is stored separately in the shipment record for reconciliation.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

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
          <FreightMarkupCard />
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
      </Tabs>
    </div>
  );
}

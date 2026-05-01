import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle, CheckCircle2, Copy, Database, Loader2, Pencil, Plus,
  RefreshCw, Save, Scale, Settings2, Stethoscope, Trash2, Upload, Webhook, X, XCircle,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ConfigForm {
  id?: number;
  name: string;
  clientId: string;
  clientSecret: string;
  tplGuid: string;
  userLoginId: string;
  baseUrl: string;
}

const emptyForm: ConfigForm = {
  name: "",
  clientId: "",
  clientSecret: "",
  tplGuid: "",
  userLoginId: "",
  baseUrl: "https://secure-wms.com",
};

const STATUS_LABELS: Record<number, string> = {
  0: "Open", 1: "Complete", 2: "Partial", 3: "Closed", 4: "Cancelled",
};

// ─── API Settings Tab ─────────────────────────────────────────────────────────
function ApiSettingsTab() {
  const utils = trpc.useUtils();
  const { data: configs, isLoading } = trpc.config.list.useQuery();
  const saveMutation = trpc.config.save.useMutation({
    onSuccess: () => { utils.config.list.invalidate(); toast.success("Configuration saved"); setOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.config.delete.useMutation({
    onSuccess: () => { utils.config.list.invalidate(); toast.success("Configuration deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const testMutation = trpc.config.testConnection.useMutation({
    onSuccess: (r) => {
      if (r.success) toast.success("Connection successful!");
      else toast.error(`Connection failed: ${r.error}`);
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ConfigForm>(emptyForm);

  const openNew = () => { setForm(emptyForm); setOpen(true); };
  const openEdit = (c: typeof configs extends (infer T)[] | undefined ? T : never) => {
    if (!c) return;
    setForm({
      id: (c as { id: number }).id,
      name: (c as { name: string }).name,
      clientId: (c as { clientId: string }).clientId,
      clientSecret: "",
      tplGuid: (c as { tplGuid: string }).tplGuid,
      userLoginId: String((c as { userLoginId: number }).userLoginId),
      baseUrl: (c as { baseUrl: string }).baseUrl,
    });
    setOpen(true);
  };

  const handleSave = () => {
    if (!form.name || !form.clientId || !form.clientSecret || !form.tplGuid || !form.userLoginId) {
      toast.error("All fields are required");
      return;
    }
    saveMutation.mutate({
      id: form.id,
      name: form.name,
      clientId: form.clientId,
      clientSecret: form.clientSecret,
      tplGuid: form.tplGuid,
      userLoginId: Number(form.userLoginId),
      baseUrl: form.baseUrl,
    });
  };

  const webhookUrl = `${window.location.origin}/api/webhooks/extensiv`;
  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl)
      .then(() => toast.success("Webhook URL copied to clipboard"))
      .catch(() => toast.error("Failed to copy — please copy manually"));
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Manage Extensiv (3PL Warehouse Manager) API connections.</p>
          <Button onClick={openNew} className="gap-1.5 shadow-sm">
            <Plus className="h-4 w-4" /> Add Configuration
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !configs || configs.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-12 text-center">
            <Settings2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground mb-4">No API configurations yet. Add your first Extensiv connection to get started.</p>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add Configuration</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {configs.map((c) => (
              <div key={c.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-6 py-4 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
                      style={{ background: c.isActive ? "#d1fae5" : "#f3f4f6" }}>
                      {c.isActive
                        ? <CheckCircle2 className="h-4 w-4" style={{ color: "#059669" }} />
                        : <XCircle className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-[15px]">{c.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Client ID: <span className="font-mono">{c.clientId}</span>
                        {" · "}TPL GUID: <span className="font-mono">{c.tplGuid}</span>
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0"
                    style={c.isActive
                      ? { background: "#d1fae5", color: "#059669" }
                      : { background: "#f3f4f6", color: "#6b7280" }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.isActive ? "#059669" : "#9ca3af" }} />
                    {c.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="px-6 pb-4 border-t border-border pt-3 flex items-center gap-2">
                  <Button variant="outline" size="sm" className="text-xs"
                    onClick={() => testMutation.mutate({ id: c.id })} disabled={testMutation.isPending}>
                    {testMutation.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Testing...</> : "Test Connection"}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => openEdit(c)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs gap-1 text-destructive hover:text-destructive"
                    onClick={() => { if (confirm("Delete this configuration?")) deleteMutation.mutate({ id: c.id }); }}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <p className="text-sm font-semibold text-blue-800 mb-1">Where to find your credentials</p>
          <p className="text-xs text-blue-700 leading-relaxed">
            Log into Extensiv 3PL Warehouse Manager → Admin → API Credentials. Your TPL GUID is found under Company Settings.
            The User Login ID is the numeric ID of the API user account.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Extensiv Order Cancellation Webhook</p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Register this URL in Extensiv 3PL Warehouse Manager under{" "}
            <span className="font-medium text-foreground">Customers → Event Notifications → New Webhook</span>.
            Select event type <span className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">Order</span> and
            event <span className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">OrderCancel</span>.
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 font-mono text-xs bg-muted rounded-lg px-3 py-2 text-muted-foreground truncate select-all">
              {webhookUrl}
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs shrink-0" onClick={copyWebhookUrl}>
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <span className="text-amber-600 text-xs mt-0.5">⚠</span>
            <p className="text-xs text-amber-700 leading-relaxed">
              Extensiv validates the destination URL with an HTTPS check before saving. Ensure this application is
              deployed and accessible at the URL above before registering the webhook in Extensiv.
            </p>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Configuration" : "Add Configuration"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Configuration Name</Label>
              <Input id="name" placeholder="e.g. Main Warehouse" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientId">Client ID</Label>
              <Input id="clientId" placeholder="OAuth Client ID" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientSecret">Client Secret</Label>
              <Input id="clientSecret" type="password" placeholder={form.id ? "Leave blank to keep existing" : "OAuth Client Secret"} value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tplGuid">TPL GUID</Label>
              <Input id="tplGuid" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={form.tplGuid} onChange={(e) => setForm({ ...form, tplGuid: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="userLoginId">User Login ID</Label>
              <Input id="userLoginId" type="number" placeholder="Numeric user ID" value={form.userLoginId} onChange={(e) => setForm({ ...form, userLoginId: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="baseUrl">Base URL</Label>
              <Input id="baseUrl" placeholder="https://secure-wms.com" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── API Diagnostics Tab ──────────────────────────────────────────────────────
function ApiDiagnosticsTab() {
  const [configId, setConfigId] = useState<number | null>(null);
  const [runDiag, setRunDiag] = useState(false);
  const [runSummary, setRunSummary] = useState(false);
  const [orderCustomerId, setOrderCustomerId] = useState<number | null>(null);
  const [orderFacilityId, setOrderFacilityId] = useState<number | null>(null);
  const [runOrderDiag, setRunOrderDiag] = useState(false);
  const [invCustomerId, setInvCustomerId] = useState<number | null>(null);
  const [invFacilityId, setInvFacilityId] = useState<number | null>(null);
  const [runInvDiag, setRunInvDiag] = useState(false);
  const [detailOrderId, setDetailOrderId] = useState<string>("");
  const [runDetailDiag, setRunDetailDiag] = useState(false);

  const { data: configs } = trpc.config.list.useQuery();

  const { data: diagData, isLoading, error, refetch } = trpc.extensiv.debugRaw.useQuery(
    { configId: configId! }, { enabled: !!configId && runDiag }
  );
  const { data: summaryData, isLoading: summaryLoading, error: summaryError, refetch: refetchSummary } = trpc.extensiv.debugSummary.useQuery(
    { configId: configId! }, { enabled: !!configId && runSummary }
  );
  const { data: orderDiagData, isLoading: orderDiagLoading, error: orderDiagError, refetch: refetchOrderDiag } = trpc.extensiv.debugOrders.useQuery(
    { configId: configId!, customerId: orderCustomerId!, facilityId: orderFacilityId! },
    { enabled: !!configId && !!orderCustomerId && !!orderFacilityId && runOrderDiag }
  );
  const { data: detailData, isLoading: detailLoading, error: detailError } = trpc.extensiv.debugOrderDetail.useQuery(
    { configId: configId!, orderId: parseInt(detailOrderId, 10) },
    { enabled: !!configId && runDetailDiag && !!detailOrderId && !isNaN(parseInt(detailOrderId, 10)) }
  );
  const { data: invDiagData, isLoading: invDiagLoading, error: invDiagError, refetch: refetchInvDiag } = trpc.extensiv.debugInventory.useQuery(
    { configId: configId!, customerId: invCustomerId!, facilityId: invFacilityId! },
    { enabled: !!configId && !!invCustomerId && !!invFacilityId && runInvDiag }
  );

  const handleRun = (id: number) => {
    setConfigId(id);
    setRunDiag(true);
    setRunSummary(true);
    setRunOrderDiag(false);
    setOrderCustomerId(null);
    setOrderFacilityId(null);
    if (configId === id) { refetch(); refetchSummary(); }
  };
  const handleRunOrderDiag = (custId: number, facId: number) => {
    setOrderCustomerId(custId); setOrderFacilityId(facId); setRunOrderDiag(true);
    if (orderCustomerId === custId && orderFacilityId === facId) refetchOrderDiag();
  };
  const handleRunInvDiag = (custId: number, facId: number) => {
    setInvCustomerId(custId); setInvFacilityId(facId); setRunInvDiag(true);
    if (invCustomerId === custId && invFacilityId === facId) refetchInvDiag();
  };

  const countItems = (obj: unknown, relKey: string): number => {
    if (!obj || typeof obj !== "object") return 0;
    const embedded = (obj as Record<string, unknown>)._embedded as Record<string, unknown> | undefined;
    if (!embedded) return 0;
    const arr = embedded[relKey];
    return Array.isArray(arr) ? arr.length : 0;
  };

  const facilitiesCount = diagData ? countItems(diagData.facilities, "http://api.3plCentral.com/rels/properties/facility") : null;
  const customersCount = diagData ? countItems(diagData.customers, "http://api.3plCentral.com/rels/customers/customer") : null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Test raw Extensiv API responses to diagnose connection and data issues.</p>

      <Card>
        <CardHeader><CardTitle className="text-base">Select API Configuration</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {!configs || configs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API configurations found. Add one in the Settings tab first.</p>
          ) : (
            configs.map((cfg) => (
              <Button key={cfg.id} variant={configId === cfg.id ? "default" : "outline"}
                onClick={() => handleRun(cfg.id)} disabled={isLoading || summaryLoading} className="gap-2">
                {(isLoading || summaryLoading) && configId === cfg.id && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                {cfg.name}
              </Button>
            ))
          )}
        </CardContent>
      </Card>

      {(error || summaryError) && (
        <Card className="border-destructive">
          <CardContent className="pt-4 flex items-start gap-2 text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm">Error</p>
              <p className="text-xs mt-1">{(error ?? summaryError)?.message}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {summaryData && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold">Step-by-Step Debug Summary</h2>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                Step 1: Raw /properties/facilities Structure
                {summaryData.step1_facilitiesError
                  ? <Badge variant="destructive" className="text-xs">Error</Badge>
                  : <Badge variant="outline" className="text-xs text-green-600">OK</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summaryData.step1_facilitiesError
                ? <p className="text-xs text-destructive">{summaryData.step1_facilitiesError}</p>
                : <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap break-all">{JSON.stringify(summaryData.step1_rawFacilitiesStructure, null, 2)}</pre>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                Step 2: Processed Facilities (what the app uses)
                {summaryData.step2_processedFacilitiesError
                  ? <Badge variant="destructive" className="text-xs">Error</Badge>
                  : summaryData.step2_processedFacilities.length > 0
                    ? <Badge className="text-xs bg-green-600">{summaryData.step2_processedFacilities.length} found</Badge>
                    : <Badge variant="destructive" className="text-xs">0 found — this is why no warehouses show!</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summaryData.step2_processedFacilitiesError
                ? <p className="text-xs text-destructive">{summaryData.step2_processedFacilitiesError}</p>
                : summaryData.step2_processedFacilities.length === 0
                  ? <p className="text-sm text-amber-600 font-medium">No facilities returned. The warehouse list will be empty.</p>
                  : <div className="space-y-1">
                    {summaryData.step2_processedFacilities.map((f) => (
                      <div key={f.id} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">id={f.id}</span>
                        <span>{f.name}</span>
                      </div>
                    ))}
                  </div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Step 3: Customers per Facility (after filtering)</CardTitle></CardHeader>
            <CardContent>
              {Object.keys(summaryData.step3_customersByFacility).length === 0
                ? <p className="text-sm text-amber-600">No facilities to check.</p>
                : <div className="space-y-4">
                  {Object.entries(summaryData.step3_customersByFacility).map(([facKey, custs]) => {
                    const [facIdStr] = facKey.split(":");
                    const facId = parseInt(facIdStr);
                    return (
                      <div key={facKey}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold text-muted-foreground uppercase">Facility: {facKey}</span>
                          {custs.length > 0
                            ? <Badge className="text-xs bg-green-600">{custs.length} customers</Badge>
                            : <Badge variant="destructive" className="text-xs">0 customers</Badge>}
                        </div>
                        {custs.length > 0 && (
                          <div className="space-y-2 ml-2">
                            {custs.slice(0, 20).map((c) => (
                              <div key={c.id} className="flex items-center gap-2">
                                <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">id={c.id}</span>
                                <span className="text-sm">{c.name}</span>
                                <div className="flex gap-1 ml-auto">
                                  <Button size="sm" variant="outline" className="h-6 text-xs px-2"
                                    onClick={() => handleRunOrderDiag(c.id, facId)}
                                    disabled={orderDiagLoading && orderCustomerId === c.id && orderFacilityId === facId}>
                                    {orderDiagLoading && orderCustomerId === c.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Debug Orders"}
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-6 text-xs px-2"
                                    onClick={() => handleRunInvDiag(c.id, facId)}
                                    disabled={invDiagLoading && invCustomerId === c.id && invFacilityId === facId}>
                                    {invDiagLoading && invCustomerId === c.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Debug Inventory"}
                                  </Button>
                                </div>
                              </div>
                            ))}
                            {custs.length > 20 && <p className="text-xs text-muted-foreground ml-1">...and {custs.length - 20} more</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>}
            </CardContent>
          </Card>
        </div>
      )}

      {(orderDiagData || orderDiagError) && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold">
            Order Diagnostics
            {orderCustomerId && <span className="text-muted-foreground font-normal text-sm ml-2">— customer {orderCustomerId}, facility {orderFacilityId}</span>}
          </h2>
          {orderDiagError && <Card className="border-destructive"><CardContent className="pt-4 text-destructive text-sm">{orderDiagError.message}</CardContent></Card>}
          {orderDiagData && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-3 flex-wrap">
                  Orders from /orders/summaries
                  <Badge variant="outline" className="text-xs">{orderDiagData.totalResultsAll} via RQL (correct)</Badge>
                  <Badge variant="outline" className="text-xs">{orderDiagData.totalResultsFiltered} via old customerid param</Badge>
                  <Badge className="text-xs bg-green-600">{orderDiagData.passCount} pass filter</Badge>
                  {orderDiagData.failCount > 0 && <Badge variant="destructive" className="text-xs">{orderDiagData.failCount} excluded</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(orderDiagData.fetchErrorAll || orderDiagData.fetchErrorFiltered) && (
                  <p className="text-xs text-destructive mb-2">{orderDiagData.fetchErrorAll ?? orderDiagData.fetchErrorFiltered}</p>
                )}
                {orderDiagData.uniqueFacilityIds.length > 0 && (
                  <div className="mb-3 p-2 bg-amber-50 dark:bg-amber-950/20 rounded text-xs">
                    <span className="font-medium">Facility IDs on these orders: </span>
                    {orderDiagData.uniqueFacilityIds.map(id => (
                      <span key={String(id)} className={`font-mono mr-2 px-1.5 py-0.5 rounded ${id === orderDiagData.sentFacilityId ? 'bg-green-200 dark:bg-green-800' : 'bg-muted'}`}>
                        {String(id)}{id === orderDiagData.sentFacilityId ? ' ✓ match' : ''}
                      </span>
                    ))}
                    {orderDiagData.facilityMatchCount === 0 && (
                      <span className="text-amber-700 dark:text-amber-400 font-medium ml-1">
                        — None match facilityId={orderDiagData.sentFacilityId}. The app now queries without facilityid and shows all orders.
                      </span>
                    )}
                  </div>
                )}
                {orderDiagData.orderSummaries.length === 0
                  ? <p className="text-sm text-amber-600">No orders returned from Extensiv for this customer (even without facility filter).</p>
                  : <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-1.5 pr-3">Order ID</th>
                          <th className="text-left py-1.5 pr-3">Ref #</th>
                          <th className="text-left py-1.5 pr-3">Status</th>
                          <th className="text-left py-1.5 pr-3">Closed?</th>
                          <th className="text-left py-1.5 pr-3">Allocated?</th>
                          <th className="text-left py-1.5 pr-3">Order Facility</th>
                          <th className="text-left py-1.5 pr-3">Created</th>
                          <th className="text-left py-1.5">Passes Filter?</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderDiagData.orderSummaries.map((o, i) => (
                          <tr key={i} className={`border-b ${o.passesFilter ? "" : "bg-red-50 dark:bg-red-950/20"}`}>
                            <td className="py-1.5 pr-3 font-mono">{o.orderId}</td>
                            <td className="py-1.5 pr-3">{o.referenceNum || "—"}</td>
                            <td className="py-1.5 pr-3"><span className="font-mono">{o.status}</span><span className="text-muted-foreground ml-1">({STATUS_LABELS[o.status ?? -1] ?? "Unknown"})</span></td>
                            <td className="py-1.5 pr-3">{o.isClosed ? <span className="text-red-600 font-medium">Yes</span> : <span className="text-green-600">No</span>}</td>
                            <td className="py-1.5 pr-3">{o.fullyAllocated ? <span className="text-red-600 font-medium">Yes</span> : <span className="text-green-600">No</span>}</td>
                            <td className="py-1.5 pr-3 font-mono text-muted-foreground">{o.orderFacilityId ? `${o.orderFacilityId} (${o.orderFacilityName ?? '?'})` : '—'}</td>
                            <td className="py-1.5 pr-3 text-muted-foreground">{o.creationDate ? new Date(o.creationDate).toLocaleDateString() : "—"}</td>
                            <td className="py-1.5">{o.passesFilter ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <XCircle className="h-3.5 w-3.5 text-red-500" />}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {(invDiagData || invDiagError) && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold">
            Inventory Diagnostics
            {invCustomerId && <span className="text-muted-foreground font-normal text-sm ml-2">— customer {invCustomerId}, facility {invFacilityId}</span>}
          </h2>
          {invDiagError && <Card className="border-destructive"><CardContent className="pt-4 text-destructive text-sm">{invDiagError.message}</CardContent></Card>}
          {invDiagData && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Endpoint Results (first working endpoint is used)</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {invDiagData.map((ep, i) => (
                    <div key={i} className={`p-3 rounded border text-xs ${ep.status === "success" ? "border-green-300 bg-green-50 dark:bg-green-950/20" : "border-red-300 bg-red-50 dark:bg-red-950/20"}`}>
                      <div className="flex items-center gap-2 mb-1">
                        {ep.status === "success" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                        <span className="font-medium">{ep.label}</span>
                        {ep.status === "success" && <Badge className="text-xs bg-green-600 ml-auto">{ep.totalResults} total, {ep.sampleCount} fetched</Badge>}
                      </div>
                      {ep.error && <p className="text-red-700 dark:text-red-400 mt-1 break-all">{ep.error}</p>}
                      {ep.embeddedKeys.length > 0 && <p className="text-muted-foreground mt-1">Embedded keys: {ep.embeddedKeys.join(", ")}</p>}
                      {ep.sampleRecord && <pre className="mt-2 bg-muted rounded p-2 overflow-auto max-h-32 whitespace-pre-wrap break-all">{ep.sampleRecord}</pre>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {diagData && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold">Raw API Responses</h2>
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Facilities (raw)</p>
                <div className="flex items-center gap-2">
                  {facilitiesCount !== null && facilitiesCount > 0 ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <AlertCircle className="h-4 w-4 text-amber-500" />}
                  <span className="text-2xl font-bold">{facilitiesCount ?? "?"}</span>
                </div>
                {diagData.facilitiesError != null && <p className="text-xs text-destructive mt-1">{String(diagData.facilitiesError)}</p>}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">All Customers (page 1)</p>
                <div className="flex items-center gap-2">
                  {customersCount !== null && customersCount > 0 ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <AlertCircle className="h-4 w-4 text-amber-500" />}
                  <span className="text-2xl font-bold">{customersCount ?? "?"}</span>
                </div>
                {diagData.customersError != null && <p className="text-xs text-destructive mt-1">{String(diagData.customersError)}</p>}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2">Facilities Raw Response<Badge variant="outline" className="text-xs">/properties/facilities</Badge></CardTitle></CardHeader>
            <CardContent><pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap break-all">{JSON.stringify(diagData.facilities, null, 2)}</pre></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2">All Customers Raw Response (page 1)<Badge variant="outline" className="text-xs">/customers</Badge></CardTitle></CardHeader>
            <CardContent><pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap break-all">{JSON.stringify(diagData.customers, null, 2)}</pre></CardContent>
          </Card>
        </div>
      )}

      {configId && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold">Order Detail Diagnostic</h2>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-3">Enter an Extensiv Order ID (the internal numeric ID, e.g. 3214839) to inspect the raw order detail response and check if line items are being returned.</p>
              <div className="flex gap-2 items-end">
                <div>
                  <label className="text-xs font-medium block mb-1">Extensiv Order ID</label>
                  <input type="number" className="border rounded px-2 py-1 text-sm w-40 bg-background" placeholder="e.g. 3214839"
                    value={detailOrderId} onChange={e => { setDetailOrderId(e.target.value); setRunDetailDiag(false); }} />
                </div>
                <Button size="sm" onClick={() => setRunDetailDiag(true)} disabled={!detailOrderId || detailLoading}>
                  {detailLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Fetch Order Detail"}
                </Button>
              </div>
            </CardContent>
          </Card>
          {detailError && <p className="text-sm text-destructive">Error: {detailError.message}</p>}
          {detailData && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground mb-1">HTTP Status</p><p className="text-xl font-bold">{detailData.httpStatus}</p></CardContent></Card>
                <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground mb-1">Direct orderItems</p><p className="text-xl font-bold">{detailData.directItemsCount}</p></CardContent></Card>
                <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground mb-1">Embedded Items</p><p className="text-xl font-bold">{detailData.embeddedItemsCount}</p></CardContent></Card>
                <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground mb-1">ETag</p><p className="text-xs font-mono break-all">{detailData.etag ?? "—"}</p></CardContent></Card>
              </div>
              <Card><CardHeader><CardTitle className="text-sm">Top-level Keys</CardTitle></CardHeader><CardContent><p className="text-xs font-mono">{detailData.topLevelKeys.join(", ")}</p></CardContent></Card>
              <Card><CardHeader><CardTitle className="text-sm">_embedded Keys</CardTitle></CardHeader><CardContent><p className="text-xs font-mono">{detailData.embeddedKeys.length > 0 ? detailData.embeddedKeys.join(", ") : "(none)"}</p></CardContent></Card>
              {detailData.embeddedItemKey && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">Embedded Item Key: <span className="font-mono text-green-600">{detailData.embeddedItemKey}</span></CardTitle></CardHeader>
                  <CardContent><pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-48 whitespace-pre-wrap break-all">{detailData.sampleEmbeddedItem}</pre></CardContent>
                </Card>
              )}
              {detailData.directItemsCount === 0 && detailData.embeddedItemsCount === 0 && (
                <Card className="border-destructive">
                  <CardContent className="pt-4 text-destructive text-sm">
                    <p className="font-medium mb-2">No order items found in either location. Raw response snippet:</p>
                    <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap break-all">{detailData.rawSnippet}</pre>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MU Cache Sync Tab ───────────────────────────────────────────────────────
function MuCacheSyncTab() {
  const [isTriggering, setIsTriggering] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [debugMu, setDebugMu] = useState("");
  const [debugInput, setDebugInput] = useState<{ sessionId: number; muLabel: string } | null>(null);
  const { data: debugData, isFetching: debugLoading, error: debugError } = trpc.qcScanner.debugMuLookup.useQuery(
    debugInput ?? { sessionId: 0, muLabel: "" },
    { enabled: !!debugInput, refetchOnMount: false, refetchOnWindowFocus: false }
  );
  const debugResult = debugData ?? (debugError ? { error: debugError.message } : null);
  const runDebug = () => {
    if (!debugMu.trim()) return;
    setDebugInput({ sessionId: 0, muLabel: debugMu.trim() });
  };

  const { data: status, refetch } = trpc.muSync.getStatus.useQuery(undefined, {
    refetchInterval: false,
  });

  const triggerMutation = trpc.muSync.triggerNow.useMutation({
    onSuccess: (res) => {
      toast.success(res.fullBackfill ? "Full backfill started" : "Incremental sync started");
      setIsTriggering(true);
    },
    onError: (e) => {
      toast.error(e.message);
      setIsTriggering(false);
    },
  });

  // Poll every 3 s while sync is running
  useEffect(() => {
    if (status?.syncRunning || isTriggering) {
      pollRef.current = setInterval(() => refetch(), 3000);
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      setIsTriggering(false);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status?.syncRunning, isTriggering, refetch]);

  const running = status?.syncRunning || isTriggering;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        The MU on-file cache stores MU label → SKU mappings from Extensiv receiver items so the QC scanner can resolve MU barcodes instantly without live API calls. The cache is refreshed automatically every night at 2:30 AM Eastern.
      </p>

      {/* Status card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            Sync Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            {running ? (
              <><Loader2 className="h-4 w-4 animate-spin text-blue-500" /><span className="text-sm font-medium text-blue-600">Sync in progress…</span></>
            ) : status?.lastSyncAt ? (
              <><CheckCircle2 className="h-4 w-4 text-green-500" /><span className="text-sm font-medium text-green-700">Last sync completed</span></>
            ) : (
              <><AlertCircle className="h-4 w-4 text-amber-500" /><span className="text-sm font-medium text-amber-700">Never synced</span></>
            )}
          </div>
          {status?.lastSyncAt && (
            <p className="text-xs text-muted-foreground">
              Completed: {new Date(status.lastSyncAt).toLocaleString()}
            </p>
          )}
          {status?.lastSyncSummary && (
            <p className="text-xs text-muted-foreground">{status.lastSyncSummary}</p>
          )}
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          onClick={() => triggerMutation.mutate({ fullBackfill: false })}
          disabled={running || triggerMutation.isPending}
          className="gap-2"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {running ? "Syncing…" : "Sync New Receivers"}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            if (confirm("This will reset the sync state and re-scan ALL receivers from Extensiv. This may take several minutes. Continue?")) {
              triggerMutation.mutate({ fullBackfill: true });
            }
          }}
          disabled={running || triggerMutation.isPending}
          className="gap-2"
        >
          <Database className="h-4 w-4" />
          Full Backfill (Reset Cache)
        </Button>
      </div>

      {/* MU Label Field Inspector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-muted-foreground" />
            MU Label Field Inspector
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Enter an MU barcode to inspect the raw Extensiv API response and identify the exact field name used for MU labels in your tenant.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. 199806"
              value={debugMu}
              onChange={(e) => setDebugMu(e.target.value)}
              className="max-w-xs font-mono text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && debugMu.trim()) {
                  runDebug();
                }
              }}
            />
            <Button
              size="sm"
              disabled={!debugMu.trim() || debugLoading}
              onClick={runDebug}
            >
              {debugLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Inspect"}
            </Button>
          </div>
          {debugResult !== null && (
            <div className="rounded border bg-slate-950 text-green-300 p-3 text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap">
              {JSON.stringify(debugResult, null, 2)}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 space-y-1">
        <p className="text-sm font-semibold text-blue-800">How it works</p>
        <p className="text-xs text-blue-700 leading-relaxed">
          <strong>Sync New Receivers</strong> fetches only receivers created since the last successful sync (incremental). Use this after a receiving day to pick up new MU labels quickly.
        </p>
        <p className="text-xs text-blue-700 leading-relaxed mt-1">
          <strong>Full Backfill</strong> resets the sync state and re-scans all receivers in Extensiv. Use this if MU labels are missing after a data migration or if the cache appears stale.
        </p>
      </div>
    </div>
  );
}

// ─── Weight Overrides Tab ────────────────────────────────────────────────────
function WeightOverridesTab() {
  const utils = trpc.useUtils();
  const { data: configs } = trpc.config.list.useQuery();
  const { data: rows, isLoading } = trpc.skuWeight.listAll.useQuery();

  // Build a lookup: configId → name
  const configName = (id: number) => configs?.find((c) => (c as { id: number }).id === id)?.name ?? `Config #${id}`;

  // Editing state: rowId → { cartonWeightLb, unitsPerCarton, note }
  const [editing, setEditing] = useState<Record<number, { cartonWeightLb: string; unitsPerCarton: string; note: string }>>({});

  const updateMutation = trpc.skuWeight.update.useMutation({
    onSuccess: (_, vars) => {
      toast.success(`Weight override #${vars.id} updated`);
      setEditing((prev) => { const n = { ...prev }; delete n[vars.id]; return n; });
      utils.skuWeight.listAll.invalidate();
    },
    onError: (e) => toast.error(`Update failed: ${e.message}`),
  });

  const deleteMutation = trpc.skuWeight.delete.useMutation({
    onSuccess: () => { toast.success('Override deleted'); utils.skuWeight.listAll.invalidate(); },
    onError: (e) => toast.error(`Delete failed: ${e.message}`),
  });

  // Track per-row push-to-Extensiv loading state
  const [pushingIds, setPushingIds] = useState<Set<number>>(new Set());
  const pushMutation = trpc.skuWeight.pushWeightToExtensiv.useMutation({
    onSuccess: (result, vars) => {
      if (result.pushedToExtensiv) {
        toast.success(`✓ Extensiv updated for ${vars.sku}: ${vars.cartonWeightLb} lbs${result.previousWeight != null ? ` (was ${result.previousWeight} lbs)` : ''}`);
      } else {
        toast(`Saved locally for ${vars.sku} — Extensiv update failed: ${result.error ?? 'unknown error'}`, { icon: '⚠️', duration: 8000 });
      }
      setPushingIds((prev) => { const n = new Set(prev); n.delete((vars as { _rowId?: number })._rowId ?? -1); return n; });
    },
    onError: (e, vars) => {
      toast.error(`Push failed for ${vars.sku}: ${e.message}`);
      setPushingIds((prev) => { const n = new Set(prev); n.delete((vars as { _rowId?: number })._rowId ?? -1); return n; });
    },
  });

  const startEdit = (row: { id: number; cartonWeightLb: string; unitsPerCarton: number | null; note: string | null }) => {
    setEditing((prev) => ({
      ...prev,
      [row.id]: {
        cartonWeightLb: String(row.cartonWeightLb),
        unitsPerCarton: row.unitsPerCarton != null ? String(row.unitsPerCarton) : '',
        note: row.note ?? '',
      },
    }));
  };

  const cancelEdit = (id: number) => setEditing((prev) => { const n = { ...prev }; delete n[id]; return n; });

  const saveEdit = (id: number) => {
    const e = editing[id];
    if (!e) return;
    const lb = parseFloat(e.cartonWeightLb);
    if (isNaN(lb) || lb <= 0) { toast.error('Enter a valid weight > 0'); return; }
    const upc = e.unitsPerCarton.trim() ? parseInt(e.unitsPerCarton, 10) : null;
    updateMutation.mutate({ id, cartonWeightLb: lb, unitsPerCarton: upc ?? null, note: e.note.trim() || null });
  };

  // Search / filter
  const [search, setSearch] = useState('');
  const filtered = (rows ?? []).filter((r) =>
    !search || r.sku.toLowerCase().includes(search.toLowerCase()) || configName(r.configId).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          All manually entered carton weights. These are used when Extensiv has no weight data for a SKU.
        </p>
        <div className="relative w-56">
          <input
            type="text"
            placeholder="Search SKU or config…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring pr-8"
          />
          {search && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearch('')}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <Scale className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">
            {search ? 'No overrides match your search.' : 'No weight overrides saved yet. They are created automatically when you enter weights in the QC Scanner.'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">SKU</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Config</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Customer ID</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Carton Wt (lbs)</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Units/Carton</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Note</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Updated</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((row) => {
                const e = editing[row.id];
                return (
                  <tr key={row.id} className={`hover:bg-muted/20 transition-colors ${e ? 'bg-blue-50/60 dark:bg-blue-950/20' : ''}`}>
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-foreground">{row.sku}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{configName(row.configId)}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">{row.customerId}</td>
                    {e ? (
                      <>
                        <td className="px-4 py-1.5">
                          <input
                            type="number" min="0.01" step="0.01"
                            className="w-20 text-xs border border-blue-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-right"
                            value={e.cartonWeightLb}
                            onChange={(ev) => setEditing((prev) => ({ ...prev, [row.id]: { ...prev[row.id], cartonWeightLb: ev.target.value } }))}
                          />
                        </td>
                        <td className="px-4 py-1.5">
                          <input
                            type="number" min="1" step="1"
                            className="w-16 text-xs border border-blue-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-right"
                            placeholder="—"
                            value={e.unitsPerCarton}
                            onChange={(ev) => setEditing((prev) => ({ ...prev, [row.id]: { ...prev[row.id], unitsPerCarton: ev.target.value } }))}
                          />
                        </td>
                        <td className="px-4 py-1.5" colSpan={2}>
                          <input
                            type="text" maxLength={256}
                            className="w-full text-xs border border-blue-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                            placeholder="Optional note…"
                            value={e.note}
                            onChange={(ev) => setEditing((prev) => ({ ...prev, [row.id]: { ...prev[row.id], note: ev.target.value } }))}
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2.5 text-xs text-right font-semibold tabular-nums">{Number(row.cartonWeightLb).toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-xs text-right text-muted-foreground tabular-nums">{row.unitsPerCarton ?? '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[160px] truncate" title={row.note ?? ''}>{row.note || <span className="opacity-40">—</span>}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{new Date(row.updatedAt).toLocaleDateString()}</td>
                      </>
                    )}
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {e ? (
                          <>
                            <Button size="sm" className="h-7 px-2 text-xs gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                              disabled={updateMutation.isPending}
                              onClick={() => saveEdit(row.id)}
                            >
                              <Save className="h-3 w-3" /> Save
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => cancelEdit(row.id)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              className="h-7 px-2 text-xs gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                              disabled={pushingIds.has(row.id) || pushMutation.isPending}
                              title="Push this weight to Extensiv item catalog"
                              onClick={() => {
                                setPushingIds((prev) => new Set(prev).add(row.id));
                                pushMutation.mutate({
                                  configId: row.configId,
                                  customerId: row.customerId,
                                  sku: row.sku,
                                  cartonWeightLb: Number(row.cartonWeightLb),
                                  _rowId: row.id,
                                } as Parameters<typeof pushMutation.mutate>[0] & { _rowId: number });
                              }}
                            >
                              {pushingIds.has(row.id)
                                ? <><Loader2 className="h-3 w-3 animate-spin" /> Pushing…</>
                                : <><Upload className="h-3 w-3" /> Push to Extensiv</>
                              }
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => startEdit(row)}>
                              <Pencil className="h-3 w-3" /> Edit
                            </Button>
                            <Button
                              size="sm" variant="outline"
                              className="h-7 px-2 text-xs gap-1 text-destructive hover:text-destructive"
                              disabled={deleteMutation.isPending}
                              onClick={() => { if (confirm(`Delete weight override for "${row.sku}"?`)) deleteMutation.mutate({ id: row.id }); }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-border bg-muted/20 text-xs text-muted-foreground">
            {filtered.length} override{filtered.length !== 1 ? 's' : ''}{search ? ` matching "${search}"` : ''}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ApiSettingsDiagnostics() {
  return (
    <div className="p-7 space-y-6 page-enter max-w-4xl">
      <div>
        <p className="page-breadcrumb">Configuration</p>
        <h1 className="page-title flex items-center gap-2">
          API Settings &amp; Diagnostics
        </h1>
      </div>

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            API Settings
          </TabsTrigger>
          <TabsTrigger value="diagnostics" className="gap-1.5">
            <Stethoscope className="h-3.5 w-3.5" />
            Diagnostics
          </TabsTrigger>
          <TabsTrigger value="mu-sync" className="gap-1.5">
            <Database className="h-3.5 w-3.5" />
            MU Cache Sync
          </TabsTrigger>
          <TabsTrigger value="weight-overrides" className="gap-1.5">
            <Scale className="h-3.5 w-3.5" />
            Weight Overrides
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="pt-4">
          <ApiSettingsTab />
        </TabsContent>

        <TabsContent value="diagnostics" className="pt-4">
          <ApiDiagnosticsTab />
        </TabsContent>

        <TabsContent value="mu-sync" className="pt-4">
          <MuCacheSyncTab />
        </TabsContent>

        <TabsContent value="weight-overrides" className="pt-4">
          <WeightOverridesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

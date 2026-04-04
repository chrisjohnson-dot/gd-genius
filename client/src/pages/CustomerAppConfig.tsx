import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { QrCode, Plus, Pencil, Trash2, Globe, Key, CheckCircle2, XCircle } from "lucide-react";

type CustomerApp = {
  id: number;
  customerId: string;
  customerName: string;
  appUrl: string;
  authHeader?: string | null;
  enabled: boolean;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const EMPTY_FORM = {
  customerId: "",
  customerName: "",
  appUrl: "",
  authHeader: "",
  enabled: true,
  notes: "",
};

export default function CustomerAppConfig() {
  const utils = trpc.useUtils();
  const { data: apps = [], isLoading } = trpc.qrScanning.listCustomerApps.useQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerApp | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const upsert = trpc.qrScanning.upsertCustomerApp.useMutation({
    onSuccess: () => {
      utils.qrScanning.listCustomerApps.invalidate();
      toast.success(editing ? "Customer app updated." : "Customer app added.");
      setDialogOpen(false);
      setEditing(null);
      setForm({ ...EMPTY_FORM });
    },
    onError: (err) => toast.error(err.message),
  });

  const del = trpc.qrScanning.deleteCustomerApp.useMutation({
    onSuccess: () => {
      utils.qrScanning.listCustomerApps.invalidate();
      toast.success("Customer app removed.");
      setDeleteConfirm(null);
    },
    onError: (err) => toast.error(err.message),
  });

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  }

  function openEdit(app: CustomerApp) {
    setEditing(app);
    setForm({
      customerId: app.customerId,
      customerName: app.customerName,
      appUrl: app.appUrl,
      authHeader: app.authHeader ?? "",
      enabled: app.enabled,
      notes: app.notes ?? "",
    });
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.customerId.trim() || !form.customerName.trim() || !form.appUrl.trim()) {
      toast.error("Customer ID, name, and app URL are required.");
      return;
    }
    upsert.mutate({
      customerId: form.customerId.trim(),
      customerName: form.customerName.trim(),
      appUrl: form.appUrl.trim(),
      authHeader: form.authHeader?.trim() || undefined,
      enabled: form.enabled,
      notes: form.notes?.trim() || undefined,
    });
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10">
            <QrCode className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Customer App Config</h1>
            <p className="text-sm text-muted-foreground">
              Configure customer app endpoints that receive QR scan events from the production line.
            </p>
          </div>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="h-4 w-4" /> Add Customer App
        </Button>
      </div>

      {/* How it works */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="pt-4 pb-3 px-4">
          <p className="text-sm text-blue-300 leading-relaxed">
            When QR scanning is enabled on the Production Line, each QR code found on a carton is
            forwarded in real time to the configured customer app URL as a <code className="bg-blue-500/10 px-1 rounded text-xs">POST</code> request
            with a JSON payload. The customer app receives the raw QR data, parsed fields (if structured),
            carton ID, and run metadata. Failed forwards are retried up to 3 times with exponential backoff.
          </p>
        </CardContent>
      </Card>

      {/* Customer app list */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : apps.length === 0 ? (
        <Card>
          <CardContent className="pt-10 pb-10 text-center">
            <QrCode className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No customer apps configured yet.</p>
            <Button variant="outline" onClick={openAdd} className="mt-4 gap-2">
              <Plus className="h-4 w-4" /> Add your first customer app
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {apps.map((app) => (
            <Card key={app.customerId} className="border-border/60">
              <CardContent className="pt-4 pb-4 px-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{app.customerName}</span>
                      <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                        {app.customerId}
                      </Badge>
                      {app.enabled ? (
                        <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-[10px] gap-1">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Active
                        </Badge>
                      ) : (
                        <Badge className="bg-red-600/20 text-red-400 border-red-600/30 text-[10px] gap-1">
                          <XCircle className="h-2.5 w-2.5" /> Disabled
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Globe className="h-3 w-3 shrink-0" />
                      <span className="truncate font-mono">{app.appUrl}</span>
                    </div>
                    {app.authHeader && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Key className="h-3 w-3 shrink-0" />
                        <span className="font-mono">{"•".repeat(Math.min(app.authHeader.length, 20))}</span>
                      </div>
                    )}
                    {app.notes && (
                      <p className="text-xs text-muted-foreground italic">{app.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(app as CustomerApp)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => setDeleteConfirm(app.customerId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setEditing(null); setForm({ ...EMPTY_FORM }); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Customer App" : "Add Customer App"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Customer ID *</Label>
                <Input
                  placeholder="e.g. ACME-001"
                  value={form.customerId}
                  onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}
                  disabled={!!editing}
                />
                {editing && <p className="text-[10px] text-muted-foreground">ID cannot be changed after creation.</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Customer Name *</Label>
                <Input
                  placeholder="e.g. Acme Corp"
                  value={form.customerName}
                  onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">App URL * (receives POST with QR scan events)</Label>
              <Input
                placeholder="https://customer-app.example.com/api/qr-events"
                value={form.appUrl}
                onChange={(e) => setForm((f) => ({ ...f, appUrl: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Authorization Header (optional)</Label>
              <Input
                placeholder="Bearer eyJhbGciOiJIUzI1NiJ9..."
                value={form.authHeader}
                onChange={(e) => setForm((f) => ({ ...f, authHeader: e.target.value }))}
              />
              <p className="text-[10px] text-muted-foreground">Sent as the <code>Authorization</code> header on every forwarded request.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Input
                placeholder="e.g. Production endpoint for Acme carton tracking"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              />
              <Label className="text-sm">Enabled — forward QR scans to this app</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={upsert.isPending}>
              {upsert.isPending ? "Saving..." : editing ? "Save Changes" : "Add App"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteConfirm} onOpenChange={(o) => { if (!o) setDeleteConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Customer App?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will remove the customer app configuration. Active QR scan sessions linked to this customer
            will stop forwarding. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={del.isPending}
              onClick={() => deleteConfirm && del.mutate({ customerId: deleteConfirm })}
            >
              {del.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

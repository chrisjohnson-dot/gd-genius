import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Pencil, Plus, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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

export default function Settings() {
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

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">API Settings</h1>
            <p className="text-muted-foreground text-sm mt-1">Configure your Extensiv WMS API connections</p>
          </div>
          <Button onClick={openNew} className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Configuration
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : !configs || configs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">No API configurations yet. Add your first Extensiv connection to get started.</p>
              <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add Configuration</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {configs.map((c) => (
              <Card key={c.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{c.name}</CardTitle>
                      <CardDescription className="mt-1">
                        Client ID: {c.clientId} · TPL GUID: {c.tplGuid}
                      </CardDescription>
                    </div>
                    <Badge className={c.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600"}>
                      {c.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testMutation.mutate({ id: c.id })}
                    disabled={testMutation.isPending}
                  >
                    {testMutation.isPending ? "Testing..." : "Test Connection"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => { if (confirm("Delete this configuration?")) deleteMutation.mutate({ id: c.id }); }}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Info card */}
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900">
          <CardContent className="py-4">
            <p className="text-sm text-blue-800 dark:text-blue-300 font-medium mb-1">Where to find your credentials</p>
            <p className="text-xs text-blue-700 dark:text-blue-400">
              Log into Extensiv 3PL Warehouse Manager → Admin → API Credentials. Your TPL GUID is found under Company Settings.
              The User Login ID is the numeric ID of the API user account.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
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
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

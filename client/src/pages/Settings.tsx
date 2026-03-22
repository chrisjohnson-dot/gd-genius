import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Loader2, Pencil, Plus, Settings2, Trash2, XCircle } from "lucide-react";
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
    <>

      <div className="p-7 space-y-6 page-enter max-w-3xl">
        {/* Page header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="page-breadcrumb">Configuration</p>
            <h1 className="page-title">API Settings</h1>
          </div>
          <Button onClick={openNew} className="gap-1.5 shadow-sm mt-1">
            <Plus className="h-4 w-4" /> Add Configuration
          </Button>
        </div>

        {/* Configs list */}
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
                    <div
                      className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
                      style={{ background: c.isActive ? "#d1fae5" : "#f3f4f6" }}
                    >
                      {c.isActive
                        ? <CheckCircle2 className="h-4 w-4" style={{ color: "#059669" }} />
                        : <XCircle className="h-4 w-4 text-muted-foreground" />
                      }
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-[15px]">{c.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Client ID: <span className="font-mono">{c.clientId}</span>
                        {" · "}TPL GUID: <span className="font-mono">{c.tplGuid}</span>
                      </p>
                    </div>
                  </div>
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0"
                    style={c.isActive
                      ? { background: "#d1fae5", color: "#059669" }
                      : { background: "#f3f4f6", color: "#6b7280" }
                    }
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: c.isActive ? "#059669" : "#9ca3af" }}
                    />
                    {c.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="px-6 pb-4 border-t border-border pt-3 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => testMutation.mutate({ id: c.id })}
                    disabled={testMutation.isPending}
                  >
                    {testMutation.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Testing...</> : "Test Connection"}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => openEdit(c)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1 text-destructive hover:text-destructive"
                    onClick={() => { if (confirm("Delete this configuration?")) deleteMutation.mutate({ id: c.id }); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Info panel */}
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <p className="text-sm font-semibold text-blue-800 mb-1">Where to find your credentials</p>
          <p className="text-xs text-blue-700 leading-relaxed">
            Log into Extensiv 3PL Warehouse Manager → Admin → API Credentials. Your TPL GUID is found under Company Settings.
            The User Login ID is the numeric ID of the API user account.
          </p>
        </div>
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
              {saveMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
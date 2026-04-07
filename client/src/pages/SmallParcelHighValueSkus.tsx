import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldAlert, Plus, Trash2, Package } from "lucide-react";

export default function SmallParcelHighValueSkus() {
  const { data: skus = [], refetch } = trpc.smallParcel.listHighValueSkus.useQuery();

  const addMutation = trpc.smallParcel.addHighValueSku.useMutation({
    onSuccess: () => { toast.success("High-value SKU added"); refetch(); setShowAdd(false); resetForm(); },
    onError: (e) => toast.error(e.message),
  });
  const removeMutation = trpc.smallParcel.removeHighValueSku.useMutation({
    onSuccess: () => { toast.success("SKU removed"); refetch(); setDeleteTarget(null); },
    onError: (e) => toast.error(e.message),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; sku: string } | null>(null);

  const [newSku, setNewSku] = useState("");
  const [newClient, setNewClient] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const resetForm = () => { setNewSku(""); setNewClient(""); setNewDesc(""); };

  const handleAdd = () => {
    if (!newSku.trim()) return toast.error("SKU is required");
    addMutation.mutate({
      sku: newSku.trim().toUpperCase(),
      clientName: newClient.trim() || undefined,
      description: newDesc.trim() || undefined,
    });
  };

  // Group by clientName for display
  const grouped = skus.reduce<Record<string, typeof skus>>((acc, s) => {
    const key = s.clientName ?? "All Clients";
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-2xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">High-Value SKUs</h1>
            <p className="text-sm text-muted-foreground">SKUs that require supervisor PIN approval for any manual override.</p>
          </div>
        </div>
        <Button onClick={() => { setShowAdd(true); resetForm(); }} size="sm">
          <Plus className="w-4 h-4 mr-1.5" />
          Add SKU
        </Button>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No high-value SKUs configured.</p>
            <p className="text-xs mt-1">Add SKUs that should require supervisor approval before a manual override is accepted.</p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([client, items]) => (
          <Card key={client}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {client}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {items.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-3">
                      <Badge variant="destructive" className="font-mono text-xs">{s.sku}</Badge>
                      {s.description && (
                        <span className="text-sm text-muted-foreground">{s.description}</span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget({ id: s.id, sku: s.sku })}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <Card className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs text-red-800 dark:text-red-300">
            <strong>How it works:</strong> When an operator tries to manually confirm a SKU listed here, the override dialog will require a valid supervisor PIN before the action is accepted. The supervisor's name is recorded in the audit log alongside the reason.
          </p>
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={(o) => { setShowAdd(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add High-Value SKU</DialogTitle>
            <DialogDescription>Flag a SKU to require supervisor PIN approval for any manual override.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>SKU <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. WIDGET-GOLD-001"
                value={newSku}
                onChange={(e) => setNewSku(e.target.value.toUpperCase())}
                className="font-mono"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Client (optional — leave blank to apply to all clients)</Label>
              <Input
                placeholder="e.g. Acme Corp"
                value={newClient}
                onChange={(e) => setNewClient(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Description (optional)</Label>
              <Input
                placeholder="e.g. Gold widget — high theft risk"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowAdd(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleAdd} disabled={addMutation.isPending}>
              {addMutation.isPending ? "Adding…" : "Add SKU"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove High-Value SKU</DialogTitle>
            <DialogDescription>
              Remove <span className="font-mono font-bold">{deleteTarget?.sku}</span> from the high-value list? Manual overrides on this SKU will no longer require supervisor approval.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && removeMutation.mutate({ id: deleteTarget.id })}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

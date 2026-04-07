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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ShieldCheck, Plus, Trash2, Pencil, KeyRound } from "lucide-react";

export default function SmallParcelSupervisorPins() {
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

  // Add form state
  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");

  // Edit form state
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
    updateMutation.mutate({
      id: editTarget.id,
      name: editName.trim(),
      ...(editPin ? { pin: editPin } : {}),
      active: editActive,
    });
  };

  return (
    <div className="p-6 max-w-2xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Supervisor PINs</h1>
            <p className="text-sm text-muted-foreground">Manage PINs required to approve manual overrides on high-value items.</p>
          </div>
        </div>
        <Button onClick={() => { setShowAdd(true); resetForm(); }} size="sm">
          <Plus className="w-4 h-4 mr-1.5" />
          Add Supervisor
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Configured Supervisors</CardTitle>
        </CardHeader>
        <CardContent>
          {pins.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <KeyRound className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No supervisor PINs configured yet.</p>
              <p className="text-xs mt-1">Add a supervisor to enable PIN-protected overrides on high-value items.</p>
            </div>
          ) : (
            <div className="divide-y">
              {pins.map((pin) => (
                <div key={pin.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-300">
                      {(pin.name ?? "?")[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{pin.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Added {new Date(pin.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={pin.active ? "default" : "secondary"} className="text-xs">
                      {pin.active ? "Active" : "Inactive"}
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(pin)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget({ id: pin.id, name: pin.name ?? "" })}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs text-amber-800 dark:text-amber-300">
            <strong>How it works:</strong> When an operator attempts a manual override on a SKU flagged as high-value, they must enter a valid supervisor PIN before the override is accepted. The approving supervisor's name is recorded in the audit log.
          </p>
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={(o) => { setShowAdd(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Supervisor PIN</DialogTitle>
            <DialogDescription>Create a PIN for a supervisor who can approve high-value item overrides.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Supervisor Name</Label>
              <Input
                placeholder="e.g. John Smith"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>PIN (4–8 digits)</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={8}
                placeholder="Enter PIN"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Confirm PIN</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={8}
                placeholder="Re-enter PIN"
                value={newPinConfirm}
                onChange={(e) => setNewPinConfirm(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowAdd(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleAdd} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create PIN"}
            </Button>
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
            <div className="flex flex-col gap-1.5">
              <Label>Supervisor Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>New PIN (leave blank to keep current)</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={8}
                placeholder="New PIN (optional)"
                value={editPin}
                onChange={(e) => setEditPin(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={editActive} onCheckedChange={setEditActive} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Supervisor PIN</DialogTitle>
            <DialogDescription>
              Remove the PIN for <strong>{deleteTarget?.name}</strong>? This cannot be undone. They will no longer be able to approve high-value overrides.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete PIN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

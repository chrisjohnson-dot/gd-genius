import { useState } from "react";
import { Settings, Plus, Trash2, Save } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

interface SettingRow {
  id: number;
  warehouseId: string;
  thresholdMinutes: number;
  enabled: boolean;
  notifyEmail: string | null;
}

interface EditableRow extends SettingRow {
  dirty: boolean;
}

export function PullAlertSettings() {
  const [open, setOpen] = useState(false);
  const [newWarehouse, setNewWarehouse] = useState("");
  const [newThreshold, setNewThreshold] = useState("120");
  const [rows, setRows] = useState<EditableRow[]>([]);

  const utils = trpc.useUtils();

  const { data: settings = [], isLoading } = trpc.pullAlerts.getSettings.useQuery(undefined, {
    enabled: open,
  });

  const saveSetting = trpc.pullAlerts.saveSetting.useMutation({
    onSuccess: () => {
      utils.pullAlerts.getSettings.invalidate();
      toast.success("Setting saved.");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteSetting = trpc.pullAlerts.deleteSetting.useMutation({
    onSuccess: () => {
      utils.pullAlerts.getSettings.invalidate();
      toast.success("Override removed.");
    },
    onError: (e) => toast.error(e.message),
  });

  function updateRow(warehouseId: string, patch: Partial<EditableRow>) {
    setRows((prev) =>
      prev.map((r) => (r.warehouseId === warehouseId ? { ...r, ...patch, dirty: true } : r))
    );
  }

  function saveRow(row: EditableRow) {
    saveSetting.mutate({
      warehouseId: row.warehouseId,
      thresholdMinutes: row.thresholdMinutes,
      enabled: row.enabled,
      notifyEmail: row.notifyEmail || null,
    });
    setRows((prev) =>
      prev.map((r) => (r.warehouseId === row.warehouseId ? { ...r, dirty: false } : r))
    );
  }

  function addOverride() {
    const wh = newWarehouse.trim();
    if (!wh) { toast.error("Enter a warehouse ID."); return; }
    if (rows.some((r) => r.warehouseId === wh)) { toast.error("Override already exists."); return; }
    const mins = parseInt(newThreshold, 10);
    if (isNaN(mins) || mins < 1) { toast.error("Enter a valid threshold."); return; }
    saveSetting.mutate({ warehouseId: wh, thresholdMinutes: mins, enabled: true });
    setNewWarehouse("");
    setNewThreshold("120");
  }

  // Sync rows when settings load (only when not dirty)
  const hasRows = rows.length > 0;
  if (settings.length > 0 && !hasRows) {
    setRows(settings.map((s) => ({ ...s, dirty: false })));
  }

  const globalRow = rows.find((r) => r.warehouseId === "all");
  const overrideRows = rows.filter((r) => r.warehouseId !== "all");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings className="h-4 w-4" />
          Alert Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Pull Session Alert Settings
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-5">
            {/* Global threshold */}
            {globalRow && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Global Default</h3>
                <p className="text-xs text-muted-foreground">
                  Applies to all warehouses unless overridden below.
                </p>
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Threshold (minutes)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={1440}
                      value={globalRow.thresholdMinutes}
                      onChange={(e) =>
                        updateRow("all", { thresholdMinutes: parseInt(e.target.value, 10) || 120 })
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2 pb-1">
                    <Switch
                      checked={globalRow.enabled}
                      onCheckedChange={(v) => updateRow("all", { enabled: v })}
                    />
                    <span className="text-xs text-muted-foreground">Enabled</span>
                  </div>
                  <Button
                    size="sm"
                    className="h-8 gap-1"
                    disabled={!globalRow.dirty || saveSetting.isPending}
                    onClick={() => saveRow(globalRow)}
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save
                  </Button>
                </div>
              </div>
            )}

            <Separator />

            {/* Per-warehouse overrides */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Per-Warehouse Overrides</h3>
              {overrideRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">No overrides yet — global default applies everywhere.</p>
              ) : (
                <div className="space-y-2">
                  {overrideRows.map((row) => (
                    <div key={row.warehouseId} className="flex items-end gap-2">
                      <div className="w-28 space-y-1">
                        <Label className="text-xs">Warehouse</Label>
                        <Input value={row.warehouseId} readOnly className="h-8 text-sm bg-muted" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Threshold (min)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={1440}
                          value={row.thresholdMinutes}
                          onChange={(e) =>
                            updateRow(row.warehouseId, { thresholdMinutes: parseInt(e.target.value, 10) || 60 })
                          }
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 pb-1">
                        <Switch
                          checked={row.enabled}
                          onCheckedChange={(v) => updateRow(row.warehouseId, { enabled: v })}
                        />
                      </div>
                      <Button
                        size="sm"
                        className="h-8 gap-1"
                        disabled={!row.dirty || saveSetting.isPending}
                        onClick={() => saveRow(row)}
                      >
                        <Save className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => deleteSetting.mutate({ warehouseId: row.warehouseId })}
                        disabled={deleteSetting.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new override */}
              <div className="flex items-end gap-2 pt-1">
                <div className="w-28 space-y-1">
                  <Label className="text-xs">Warehouse ID</Label>
                  <Input
                    placeholder="e.g. LAX"
                    value={newWarehouse}
                    onChange={(e) => setNewWarehouse(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Threshold (min)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={newThreshold}
                    onChange={(e) => setNewThreshold(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <Button
                  size="sm"
                  className="h-8 gap-1"
                  onClick={addOverride}
                  disabled={saveSetting.isPending}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

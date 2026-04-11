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
  reAlertMultiplier: number;
  enabled: boolean;
  notifyEmail: string | null;
}

interface EditableRow extends SettingRow {
  dirty: boolean;
}

const MULTIPLIER_OPTIONS = [
  { label: "1.5×", value: 1.5 },
  { label: "2×", value: 2 },
  { label: "3×", value: 3 },
  { label: "Off", value: 0 },
];

export function PullAlertSettings() {
  const [open, setOpen] = useState(false);
  const [newWarehouse, setNewWarehouse] = useState("");
  const [newThreshold, setNewThreshold] = useState("120");
  const [newMultiplier, setNewMultiplier] = useState(2);
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
      reAlertMultiplier: row.reAlertMultiplier > 0 ? row.reAlertMultiplier : 999,
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
    saveSetting.mutate({
      warehouseId: wh,
      thresholdMinutes: mins,
      reAlertMultiplier: newMultiplier > 0 ? newMultiplier : 999,
      enabled: true,
    });
    setNewWarehouse("");
    setNewThreshold("120");
    setNewMultiplier(2);
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Initial Alert (minutes)</Label>
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
                  <div className="space-y-1">
                    <Label className="text-xs">Re-alert At</Label>
                    <div className="flex gap-1">
                      {MULTIPLIER_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => updateRow("all", { reAlertMultiplier: opt.value })}
                          className={`flex-1 h-8 rounded text-xs font-medium border transition-colors ${
                            globalRow.reAlertMultiplier === opt.value ||
                            (opt.value === 0 && globalRow.reAlertMultiplier >= 10)
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background border-input hover:bg-accent"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={globalRow.enabled}
                      onCheckedChange={(v) => updateRow("all", { enabled: v })}
                    />
                    <span className="text-xs text-muted-foreground">Enabled</span>
                  </div>
                  {globalRow.reAlertMultiplier > 0 && globalRow.reAlertMultiplier < 10 && (
                    <p className="text-xs text-muted-foreground">
                      Escalation fires at {Math.round(globalRow.thresholdMinutes * globalRow.reAlertMultiplier)} min ({globalRow.reAlertMultiplier}×)
                    </p>
                  )}
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
                <div className="space-y-3">
                  {overrideRows.map((row) => (
                    <div key={row.warehouseId} className="space-y-2 rounded-md border p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{row.warehouseId}</span>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={row.enabled}
                            onCheckedChange={(v) => updateRow(row.warehouseId, { enabled: v })}
                          />
                          <Button
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            disabled={!row.dirty || saveSetting.isPending}
                            onClick={() => saveRow(row)}
                          >
                            <Save className="h-3 w-3" />
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => deleteSetting.mutate({ warehouseId: row.warehouseId })}
                            disabled={deleteSetting.isPending}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Initial Alert (min)</Label>
                          <Input
                            type="number"
                            min={1}
                            max={1440}
                            value={row.thresholdMinutes}
                            onChange={(e) =>
                              updateRow(row.warehouseId, { thresholdMinutes: parseInt(e.target.value, 10) || 60 })
                            }
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Re-alert At</Label>
                          <div className="flex gap-1">
                            {MULTIPLIER_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => updateRow(row.warehouseId, { reAlertMultiplier: opt.value })}
                                className={`flex-1 h-7 rounded text-xs font-medium border transition-colors ${
                                  row.reAlertMultiplier === opt.value ||
                                  (opt.value === 0 && row.reAlertMultiplier >= 10)
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background border-input hover:bg-accent"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new override */}
              <div className="space-y-2 rounded-md border border-dashed p-3">
                <h4 className="text-xs font-medium text-muted-foreground">Add Warehouse Override</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Warehouse ID</Label>
                    <Input
                      placeholder="e.g. LAX"
                      value={newWarehouse}
                      onChange={(e) => setNewWarehouse(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
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
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Re-alert At</Label>
                  <div className="flex gap-1">
                    {MULTIPLIER_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setNewMultiplier(opt.value)}
                        className={`flex-1 h-8 rounded text-xs font-medium border transition-colors ${
                          newMultiplier === opt.value
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-input hover:bg-accent"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <Button
                  size="sm"
                  className="w-full h-8 gap-1"
                  onClick={addOverride}
                  disabled={saveSetting.isPending}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Override
                </Button>
              </div>
            </div>

            <Separator />
            <p className="text-xs text-muted-foreground text-center">
              Auto-checking every 5 min · Escalation alerts are marked 🚨 in the bell
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, Clock, Info, Loader2, Play, RefreshCw, Users, XCircle } from "lucide-react";

const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Toronto", label: "Toronto (ET)" },
  { value: "America/Vancouver", label: "Vancouver (PT)" },
  { value: "America/Edmonton", label: "Edmonton (MT)" },
  { value: "UTC", label: "UTC" },
];

const PRESET_SCHEDULES = [
  { label: "Every hour (business hours)", cron: "0 0 8-17 * * 1-5" },
  { label: "Every 2 hours (business hours)", cron: "0 0 8,10,12,14,16 * * 1-5" },
  { label: "3x per day (8am, noon, 4pm)", cron: "0 0 8,12,16 * * 1-5" },
  { label: "Twice per day (8am, 2pm)", cron: "0 0 8,14 * * 1-5" },
  { label: "Once per day (8am)", cron: "0 0 8 * * 1-5" },
  { label: "Custom", cron: "custom" },
];

function StatusPill({ status }: { status: string | null | undefined }) {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    success: { bg: "#d1fae5", text: "#059669", dot: "#059669" },
    partial: { bg: "#fef9c3", text: "#b45309", dot: "#f59e0b" },
    error:   { bg: "#fee2e2", text: "#ef4444", dot: "#ef4444" },
  };
  const s = map[status ?? ""] ?? { bg: "#f3f4f6", text: "#6b7280", dot: "#9ca3af" };
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-semibold"
      style={{ background: s.bg, color: s.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {status ?? "unknown"}
    </span>
  );
}

export default function ScheduleSettings() {
  const utils = trpc.useUtils();

  const { data: configs = [] } = trpc.config.list.useQuery();
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);

  useEffect(() => {
    if (configs.length > 0 && !selectedConfigId) {
      setSelectedConfigId(configs[0]!.id);
    }
  }, [configs, selectedConfigId]);

  const { data: scheduleConfig, isLoading: scheduleLoading } = trpc.schedule.get.useQuery(
    { configId: selectedConfigId! },
    { enabled: !!selectedConfigId }
  );

  const { data: allCustomers = [] } = trpc.extensiv.customers.useQuery(
    { configId: selectedConfigId! },
    { enabled: !!selectedConfigId }
  );

  const { data: customerRulesList = [] } = trpc.customerRules.list.useQuery(
    { configId: selectedConfigId! },
    { enabled: !!selectedConfigId }
  );

  const [isEnabled, setIsEnabled] = useState(false);
  const [cronExpression, setCronExpression] = useState("0 0 8,12,16 * * 1-5");
  const [timezone, setTimezone] = useState("America/New_York");
  const [selectedPreset, setSelectedPreset] = useState("0 0 8,12,16 * * 1-5");

  useEffect(() => {
    if (scheduleConfig) {
      setIsEnabled(scheduleConfig.isEnabled);
      setCronExpression(scheduleConfig.cronExpression);
      setTimezone(scheduleConfig.timezone);
      setSelectedPreset(scheduleConfig.cronExpression);
    }
  }, [scheduleConfig]);

  const saveScheduleMutation = trpc.schedule.save.useMutation({
    onSuccess: () => {
      utils.schedule.get.invalidate();
      toast.success(isEnabled ? "Schedule enabled and saved." : "Schedule disabled.");
    },
    onError: (err) => toast.error(`Failed to save schedule: ${err.message}`),
  });

  const triggerNowMutation = trpc.schedule.triggerNow.useMutation({
    onSuccess: (data) => toast.success(data.message),
    onError: (err) => toast.error(`Trigger failed: ${err.message}`),
  });

  const saveRuleMutation = trpc.customerRules.save.useMutation({
    onSuccess: () => {
      utils.customerRules.list.invalidate();
      toast.success("Auto-run enrollment updated.");
    },
    onError: (err) => toast.error(`Failed to update: ${err.message}`),
  });

  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset);
    if (preset !== "custom") {
      setCronExpression(preset);
    }
  };

  const handleSaveSchedule = () => {
    if (!selectedConfigId) return;
    saveScheduleMutation.mutate({ configId: selectedConfigId, isEnabled, cronExpression, timezone });
  };

  const handleToggleAutoRun = (
    customer: { id: number; name: string; facilityId?: number | null; facilityName?: string | null },
    checked: boolean
  ) => {
    if (!selectedConfigId) return;
    const existingRule = customerRulesList.find((r) => r.customerId === customer.id);
    saveRuleMutation.mutate({
      configId: selectedConfigId,
      customerId: customer.id,
      customerName: customer.name,
      facilityId: customer.facilityId ?? undefined,
      facilityName: customer.facilityName ?? undefined,
      noLotMixing: existingRule?.noLotMixing ?? false,
      autoRun: checked,
    });
  };

  const autoRunCount = customerRulesList.filter((r) => r.autoRun).length;

  return (
    <AppLayout>
      <div className="p-7 space-y-6 page-enter max-w-4xl">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="page-breadcrumb">Configuration</p>
            <h1 className="page-title">Auto-Run Schedule</h1>
          </div>
          {configs.length > 1 && (
            <div className="flex items-center gap-2 mt-1">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Extensiv Config:</Label>
              <Select
                value={selectedConfigId?.toString() ?? ""}
                onValueChange={(v) => setSelectedConfigId(Number(v))}
              >
                <SelectTrigger className="w-52 h-8 text-xs">
                  <SelectValue placeholder="Select config" />
                </SelectTrigger>
                <SelectContent>
                  {configs.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Schedule Configuration Card */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-border flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4.5 w-4.5 text-primary" style={{ height: "1.125rem", width: "1.125rem" }} />
              <h3 className="text-[15px] font-bold">Schedule Configuration</h3>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-xs text-muted-foreground">{isEnabled ? "Enabled" : "Disabled"}</span>
              <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            <p className="text-xs text-muted-foreground -mt-1">
              Set when the auto-run should execute. Uses a 6-field cron expression (seconds minutes hours day month weekday).
            </p>

            {/* Preset selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Preset Schedule</Label>
              <Select value={selectedPreset} onValueChange={handlePresetChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a preset" />
                </SelectTrigger>
                <SelectContent>
                  {PRESET_SCHEDULES.map((p) => (
                    <SelectItem key={p.label} value={p.cron}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cron expression */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Cron Expression</Label>
              <Input
                value={cronExpression}
                onChange={(e) => { setCronExpression(e.target.value); setSelectedPreset("custom"); }}
                placeholder="0 0 8,12,16 * * 1-5"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Format: <span className="font-mono">seconds minutes hours day month weekday</span> — e.g.{" "}
                <span className="font-mono">0 0 8,12,16 * * 1-5</span> = Mon–Fri at 8am, noon, 4pm
              </p>
            </div>

            {/* Timezone */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Last run status */}
            {scheduleConfig?.lastRunAt && (
              <div className="rounded-xl bg-muted/40 border border-border px-4 py-3 space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground text-xs">Last run:</span>
                  <span className="text-xs font-medium">{new Date(scheduleConfig.lastRunAt).toLocaleString()}</span>
                  <StatusPill status={scheduleConfig.lastRunStatus} />
                </div>
                {scheduleConfig.lastRunSummary && (
                  <p className="text-xs text-muted-foreground pl-6">{scheduleConfig.lastRunSummary}</p>
                )}
              </div>
            )}

            <div className="border-t border-border pt-4 flex items-center gap-3">
              <Button
                onClick={handleSaveSchedule}
                disabled={saveScheduleMutation.isPending || !selectedConfigId}
                className="shadow-sm"
              >
                {saveScheduleMutation.isPending
                  ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                  : "Save Schedule"
                }
              </Button>
              <Button
                variant="outline"
                onClick={() => selectedConfigId && triggerNowMutation.mutate({ configId: selectedConfigId })}
                disabled={triggerNowMutation.isPending || !selectedConfigId}
              >
                {triggerNowMutation.isPending
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Triggering...</>
                  : <><Play className="h-4 w-4 mr-2" />Run Now</>
                }
              </Button>
            </div>
          </div>
        </div>

        {/* Auto-Run Customer Enrollment */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-border flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h3 className="text-[15px] font-bold">Auto-Run Customers</h3>
            </div>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
              style={{ background: "#dbeafe", color: "#1d4ed8" }}
            >
              {autoRunCount} of {allCustomers.length} enrolled
            </span>
          </div>

          <div className="px-6 py-5">
            <p className="text-xs text-muted-foreground mb-4">
              Select which customers are included in every scheduled auto-run. Their open, unallocated, non-hold orders will be allocated automatically.
            </p>

            {allCustomers.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No customers found. Make sure your Extensiv API is configured.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Select All / Deselect All */}
                <div className="flex items-center justify-between pb-3 mb-1 border-b border-border">
                  <span className="text-xs text-muted-foreground">Toggle all customers</span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        allCustomers.forEach((c) => {
                          const existingRule = customerRulesList.find((r) => r.customerId === c.id);
                          if (!existingRule?.autoRun) handleToggleAutoRun(c, true);
                        });
                      }}
                    >
                      Enroll All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        allCustomers.forEach((c) => {
                          const existingRule = customerRulesList.find((r) => r.customerId === c.id);
                          if (existingRule?.autoRun) handleToggleAutoRun(c, false);
                        });
                      }}
                    >
                      Remove All
                    </Button>
                  </div>
                </div>

                {/* Customer rows */}
                {allCustomers.map((customer) => {
                  const rule = customerRulesList.find((r) => r.customerId === customer.id);
                  const isAutoRun = rule?.autoRun ?? false;
                  return (
                    <div
                      key={customer.id}
                      className="flex items-center justify-between px-4 py-3 rounded-xl border transition-colors"
                      style={isAutoRun
                        ? { borderColor: "rgba(59,130,246,0.25)", background: "rgba(59,130,246,0.04)" }
                        : { borderColor: "var(--border)", background: "transparent" }
                      }
                    >
                      <div className="flex items-center gap-3">
                        {isAutoRun
                          ? <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "#3b82f6" }} />
                          : <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                        }
                        <div>
                          <p className="text-sm font-medium text-foreground">{customer.name}</p>
                          <p className="text-xs text-muted-foreground">ID: {customer.id}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {rule?.noLotMixing && (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold"
                            style={{ background: "#fee2e2", color: "#dc2626" }}
                          >
                            No Lot Mix
                          </span>
                        )}
                        <Switch
                          checked={isAutoRun}
                          onCheckedChange={(checked) => handleToggleAutoRun(customer, checked)}
                          disabled={saveRuleMutation.isPending}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Info panel */}
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Info className="h-4 w-4 text-blue-700 shrink-0" />
            <p className="text-sm font-semibold text-blue-800">How auto-run works</p>
          </div>
          <ul className="space-y-1 text-xs text-blue-700 list-disc list-inside leading-relaxed">
            <li>At each scheduled time, the system fetches all open, unallocated, non-hold orders for enrolled customers.</li>
            <li>The allocation engine applies FEFO, location priority, and your per-customer rules (no lot mixing, etc.).</li>
            <li>Orders that cannot be fully satisfied are skipped — no partial allocations are ever written.</li>
            <li>Confirmed allocations are written directly to Extensiv. You will receive a notification when the run completes.</li>
            <li>Each run is recorded in Run History with a full audit log.</li>
          </ul>
        </div>
      </div>
    </AppLayout>
  );
}

import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Clock, Play, Users, CheckCircle2, XCircle, CalendarClock, RefreshCw } from "lucide-react";

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
  { label: "Custom", cron: "" },
];

export default function ScheduleSettings() {
  const utils = trpc.useUtils();

  // Load configs
  const { data: configs = [] } = trpc.config.list.useQuery();
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);

  useEffect(() => {
    if (configs.length > 0 && !selectedConfigId) {
      setSelectedConfigId(configs[0]!.id);
    }
  }, [configs, selectedConfigId]);

  // Load schedule config
  const { data: scheduleConfig, isLoading: scheduleLoading } = trpc.schedule.get.useQuery(
    { configId: selectedConfigId! },
    { enabled: !!selectedConfigId }
  );

  // Load customers for this config
  const { data: allCustomers = [] } = trpc.extensiv.customers.useQuery(
    { configId: selectedConfigId! },
    { enabled: !!selectedConfigId }
  );

  // Load existing customer rules
  const { data: customerRulesList = [] } = trpc.customerRules.list.useQuery(
    { configId: selectedConfigId! },
    { enabled: !!selectedConfigId }
  );

  // Local schedule state
  const [isEnabled, setIsEnabled] = useState(false);
  const [cronExpression, setCronExpression] = useState("0 0 8,12,16 * * 1-5");
  const [timezone, setTimezone] = useState("America/New_York");
  const [selectedPreset, setSelectedPreset] = useState("0 0 8,12,16 * * 1-5");

  // Sync from DB
  useEffect(() => {
    if (scheduleConfig) {
      setIsEnabled(scheduleConfig.isEnabled);
      setCronExpression(scheduleConfig.cronExpression);
      setTimezone(scheduleConfig.timezone);
      setSelectedPreset(scheduleConfig.cronExpression);
    }
  }, [scheduleConfig]);

  // Save schedule mutation
  const saveScheduleMutation = trpc.schedule.save.useMutation({
    onSuccess: () => {
      utils.schedule.get.invalidate();
      toast.success(isEnabled ? "Schedule enabled and saved." : "Schedule disabled.");
    },
    onError: (err) => toast.error(`Failed to save schedule: ${err.message}`),
  });

  // Trigger now mutation
  const triggerNowMutation = trpc.schedule.triggerNow.useMutation({
    onSuccess: (data) => toast.success(data.message),
    onError: (err) => toast.error(`Trigger failed: ${err.message}`),
  });

  // Save customer autoRun flag
  const saveRuleMutation = trpc.customerRules.save.useMutation({
    onSuccess: () => {
      utils.customerRules.list.invalidate();
      toast.success("Auto-run enrollment updated.");
    },
    onError: (err) => toast.error(`Failed to update: ${err.message}`),
  });

  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset);
    if (preset !== "") {
      setCronExpression(preset);
    }
  };

  const handleSaveSchedule = () => {
    if (!selectedConfigId) return;
    saveScheduleMutation.mutate({
      configId: selectedConfigId,
      isEnabled,
      cronExpression,
      timezone,
    });
  };

  const handleToggleAutoRun = (customer: { id: number; name: string; facilityId?: number | null; facilityName?: string | null }, checked: boolean) => {
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
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Auto-Run Schedule</h1>
          <p className="text-muted-foreground mt-1">
            Configure scheduled allocation runs and select which customers are included automatically.
          </p>
        </div>

        {/* Config selector */}
        {configs.length > 1 && (
          <div className="flex items-center gap-3">
            <Label className="text-sm text-muted-foreground whitespace-nowrap">Extensiv Config:</Label>
            <Select
              value={selectedConfigId?.toString() ?? ""}
              onValueChange={(v) => setSelectedConfigId(Number(v))}
            >
              <SelectTrigger className="w-64">
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

        {/* Schedule Configuration Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-primary" />
                <CardTitle>Schedule Configuration</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {isEnabled ? "Enabled" : "Disabled"}
                </span>
                <Switch
                  checked={isEnabled}
                  onCheckedChange={setIsEnabled}
                />
              </div>
            </div>
            <CardDescription>
              Set when the auto-run should execute. Uses a 6-field cron expression (seconds minutes hours day month weekday).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Preset selector */}
            <div className="space-y-1.5">
              <Label>Preset Schedule</Label>
              <Select value={selectedPreset} onValueChange={handlePresetChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a preset" />
                </SelectTrigger>
                <SelectContent>
                  {PRESET_SCHEDULES.map((p) => (
                    <SelectItem key={p.label} value={p.cron || "custom"}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cron expression */}
            <div className="space-y-1.5">
              <Label>Cron Expression</Label>
              <Input
                value={cronExpression}
                onChange={(e) => {
                  setCronExpression(e.target.value);
                  setSelectedPreset("custom");
                }}
                placeholder="0 0 8,12,16 * * 1-5"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Format: <span className="font-mono">seconds minutes hours day month weekday</span> — e.g. <span className="font-mono">0 0 8,12,16 * * 1-5</span> = Mon–Fri at 8am, noon, 4pm
              </p>
            </div>

            {/* Timezone */}
            <div className="space-y-1.5">
              <Label>Timezone</Label>
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
              <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Last run:</span>
                  <span className="font-medium">{new Date(scheduleConfig.lastRunAt).toLocaleString()}</span>
                  <Badge
                    className={
                      scheduleConfig.lastRunStatus === "success"
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-0 text-xs"
                        : scheduleConfig.lastRunStatus === "partial"
                        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-0 text-xs"
                        : "bg-muted text-muted-foreground border-0 text-xs"
                    }
                  >
                    {scheduleConfig.lastRunStatus ?? "unknown"}
                  </Badge>
                </div>
                {scheduleConfig.lastRunSummary && (
                  <p className="text-xs text-muted-foreground pl-6">{scheduleConfig.lastRunSummary}</p>
                )}
              </div>
            )}

            <Separator />

            {/* Actions */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleSaveSchedule}
                disabled={saveScheduleMutation.isPending || !selectedConfigId}
              >
                {saveScheduleMutation.isPending ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  "Save Schedule"
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => selectedConfigId && triggerNowMutation.mutate({ configId: selectedConfigId })}
                disabled={triggerNowMutation.isPending || !selectedConfigId}
              >
                <Play className="h-4 w-4 mr-2" />
                {triggerNowMutation.isPending ? "Triggering..." : "Run Now"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Auto-Run Customer Enrollment */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <CardTitle>Auto-Run Customers</CardTitle>
              </div>
              <Badge variant="outline" className="text-sm">
                {autoRunCount} of {allCustomers.length} enrolled
              </Badge>
            </div>
            <CardDescription>
              Select which customers are included in every scheduled auto-run. Their open, unallocated, non-hold orders will be allocated automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {allCustomers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No customers found. Make sure your Extensiv API is configured.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Select All / Deselect All */}
                <div className="flex items-center justify-between pb-2 border-b">
                  <span className="text-sm text-muted-foreground">Toggle all customers</span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        allCustomers.forEach((c) => {
                          const existingRule = customerRulesList.find((r) => r.customerId === c.id);
                          if (!existingRule?.autoRun) {
                            handleToggleAutoRun(c, true);
                          }
                        });
                      }}
                    >
                      Enroll All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        allCustomers.forEach((c) => {
                          const existingRule = customerRulesList.find((r) => r.customerId === c.id);
                          if (existingRule?.autoRun) {
                            handleToggleAutoRun(c, false);
                          }
                        });
                      }}
                    >
                      Remove All
                    </Button>
                  </div>
                </div>

                {/* Customer list */}
                {allCustomers.map((customer) => {
                  const rule = customerRulesList.find((r) => r.customerId === customer.id);
                  const isAutoRun = rule?.autoRun ?? false;
                  return (
                    <div
                      key={customer.id}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        isAutoRun
                          ? "border-primary/30 bg-primary/5"
                          : "border-border bg-card hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {isAutoRun ? (
                          <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-foreground">{customer.name}</p>
                          <p className="text-xs text-muted-foreground">ID: {customer.id}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {rule?.noLotMixing && (
                          <Badge className="text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-0">
                            No Lot Mix
                          </Badge>
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
          </CardContent>
        </Card>

        {/* Info box */}
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4 text-sm text-blue-800 dark:text-blue-300">
          <p className="font-medium mb-1">How auto-run works</p>
          <ul className="space-y-1 text-xs list-disc list-inside">
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

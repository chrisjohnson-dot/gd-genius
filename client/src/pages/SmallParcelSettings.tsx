import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Settings, Timer, Save, Mail, CheckCircle2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const REPLENISHMENT_OPTIONS = [
  { weeks: 2, label: "2 weeks", description: "Fast-moving items or short supplier lead times" },
  { weeks: 4, label: "4 weeks", description: "Standard monthly replenishment cycle" },
  { weeks: 6, label: "6 weeks", description: "Slow-moving items or long supplier lead times" },
];

export default function SmallParcelSettings() {
  const utils = trpc.useUtils();

  // ── All settings (reprint countdown + replenishment weeks) ─────────────────
  const { data: settings, isLoading } = trpc.smallParcel.getAllSettings.useQuery();

  const [countdownSeconds, setCountdownSeconds] = useState<string>("");
  const [countdownInitialized, setCountdownInitialized] = useState(false);
  if (settings && !countdownInitialized) {
    setCountdownSeconds(String(settings.reprintCountdownSeconds));
    setCountdownInitialized(true);
  }

  const [replenishmentWeeks, setReplenishmentWeeks] = useState<number>(4);
  const [replenishmentInitialized, setReplenishmentInitialized] = useState(false);
  useEffect(() => {
    if (settings && !replenishmentInitialized) {
      setReplenishmentWeeks(settings.packagingReplenishmentWeeks);
      setReplenishmentInitialized(true);
    }
  }, [settings, replenishmentInitialized]);

  // ── Packaging accounting email ─────────────────────────────────────────────
  const { data: accountingEmailData, isLoading: emailLoading } =
    trpc.smallParcel.getSetting.useQuery({ key: "packaging_accounting_email" });
  const [accountingEmail, setAccountingEmail] = useState<string>("");
  const [emailInitialized, setEmailInitialized] = useState(false);
  useEffect(() => {
    if (!emailLoading && !emailInitialized) {
      setAccountingEmail(accountingEmailData?.value ?? "");
      setEmailInitialized(true);
    }
  }, [accountingEmailData, emailLoading, emailInitialized]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const setSetting = trpc.smallParcel.setSetting.useMutation({
    onSuccess: (_data, variables) => {
      utils.smallParcel.getAllSettings.invalidate();
      utils.smallParcel.getSetting.invalidate({ key: variables.key });
      if (variables.key === "reprint_countdown_seconds") {
        toast.success("Reprint countdown updated.");
      } else if (variables.key === "packaging_accounting_email") {
        toast.success("Accounting email address saved.");
      } else if (variables.key === "packaging_replenishment_weeks") {
        toast.success(`Replenishment window set to ${variables.value} weeks.`);
      } else {
        toast.success("Settings saved.");
      }
    },
    onError: (err) => {
      toast.error(`Save failed: ${err.message}`);
    },
  });

  function handleSaveCountdown() {
    const val = parseInt(countdownSeconds, 10);
    if (isNaN(val) || val < 3 || val > 120) {
      toast.error("Countdown must be between 3 and 120 seconds.");
      return;
    }
    setSetting.mutate({ key: "reprint_countdown_seconds", value: String(val) });
  }

  function handleSaveEmail() {
    const trimmed = accountingEmail.trim();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setSetting.mutate({ key: "packaging_accounting_email", value: trimmed });
  }

  function handleSaveReplenishment() {
    setSetting.mutate({ key: "packaging_replenishment_weeks", value: String(replenishmentWeeks) });
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Small Parcel Settings</h1>
          <p className="text-muted-foreground text-sm">
            Configure workflow behaviour for the Pack &amp; Ship screen and Packaging module.
          </p>
        </div>
      </div>

      {/* Label Purchase / Reprint */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Timer className="h-4 w-4" />
            Reprint Countdown Duration
          </CardTitle>
          <CardDescription>
            After a label is purchased, a reprint window appears before the screen automatically
            resets to the next order. Set how many seconds that window stays open.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="h-10 w-32 bg-muted animate-pulse rounded" />
          ) : (
            <div className="flex items-end gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="countdown-seconds">Countdown (seconds)</Label>
                <Input
                  id="countdown-seconds"
                  type="number"
                  min={3}
                  max={120}
                  step={1}
                  value={countdownSeconds}
                  onChange={(e) => setCountdownSeconds(e.target.value)}
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground">Min: 3 &nbsp;·&nbsp; Max: 120</p>
              </div>
              <Button
                onClick={handleSaveCountdown}
                disabled={setSetting.isPending}
                className="flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                {setSetting.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          )}
          {settings && (
            <p className="text-sm text-muted-foreground">
              Current setting:{" "}
              <span className="font-medium text-foreground">
                {settings.reprintCountdownSeconds} seconds
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Packaging — Replenishment Window */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="h-4 w-4" />
            Packaging Reorder — Replenishment Window
          </CardTitle>
          <CardDescription>
            Controls how many weeks of stock the auto-suggest formula targets when calculating
            reorder quantities. The formula is:{" "}
            <span className="font-mono text-xs bg-muted px-1 rounded">
              max(1, weeklyUse × weeks − onHand)
            </span>
            . Choose a window that matches your typical supplier lead time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 w-40 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : (
            <>
              <div className="flex gap-3 flex-wrap">
                {REPLENISHMENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.weeks}
                    type="button"
                    onClick={() => setReplenishmentWeeks(opt.weeks)}
                    className={cn(
                      "flex-1 min-w-[120px] rounded-lg border-2 p-4 text-left transition-colors",
                      replenishmentWeeks === opt.weeks
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/40"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-lg font-bold">{opt.label}</span>
                      {replenishmentWeeks === opt.weeks && (
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">{opt.description}</p>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between pt-1">
                <p className="text-sm text-muted-foreground">
                  Currently saved:{" "}
                  <span className="font-medium text-foreground">
                    {settings?.packagingReplenishmentWeeks ?? 4} weeks
                  </span>
                </p>
                <Button
                  onClick={handleSaveReplenishment}
                  disabled={
                    setSetting.isPending ||
                    replenishmentWeeks === (settings?.packagingReplenishmentWeeks ?? 4)
                  }
                  className="flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  {setSetting.isPending ? "Saving…" : "Save"}
                </Button>
              </div>

              {/* Live formula preview */}
              <div className="rounded-md bg-muted/50 border px-4 py-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Example: </span>
                If weekly use is <span className="font-medium text-foreground">40 units</span> and
                on-hand is <span className="font-medium text-foreground">50</span>, the suggested
                reorder qty will be{" "}
                <span className="font-semibold text-primary">
                  {Math.max(1, 40 * replenishmentWeeks - 50)} units
                </span>{" "}
                ({replenishmentWeeks}-week target of {40 * replenishmentWeeks} − 50 on hand).
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Packaging — Accounting Email */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" />
            Packaging Reorder — Accounting Email
          </CardTitle>
          <CardDescription>
            When production submits a packaging reorder request, a formatted email will be sent to
            this address so accounting can place the purchase order immediately. Leave blank to
            disable email notifications (in-app notifications are always sent).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {emailLoading ? (
            <div className="h-10 w-64 bg-muted animate-pulse rounded" />
          ) : (
            <div className="flex items-end gap-4">
              <div className="space-y-1.5 flex-1">
                <Label htmlFor="accounting-email">Accounting Email Address</Label>
                <Input
                  id="accounting-email"
                  type="email"
                  placeholder="accounting@example.com"
                  value={accountingEmail}
                  onChange={(e) => setAccountingEmail(e.target.value)}
                  className="max-w-sm"
                />
                <p className="text-xs text-muted-foreground">
                  The email will include the item name, requested qty, burn rate, days of stock
                  remaining, and who submitted the request.
                </p>
              </div>
              <Button
                onClick={handleSaveEmail}
                disabled={setSetting.isPending}
                className="flex items-center gap-2 shrink-0"
              >
                <Save className="h-4 w-4" />
                {setSetting.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          )}
          {accountingEmailData?.value && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                Reorder emails will be sent to{" "}
                <span className="font-medium">{accountingEmailData.value}</span>
              </span>
            </div>
          )}
          {!accountingEmailData?.value && !emailLoading && (
            <p className="text-sm text-muted-foreground italic">
              No accounting email configured — only in-app notifications will be sent.
            </p>
          )}
        </CardContent>
      </Card>

      {/* SMTP notice */}
      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <Mail className="h-4 w-4" />
            SMTP Configuration Required
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Email delivery requires SMTP credentials to be set as environment variables on the
            server:{" "}
            <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded text-xs">SMTP_HOST</code>,{" "}
            <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded text-xs">SMTP_USER</code>,{" "}
            <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded text-xs">SMTP_PASS</code>,{" "}
            <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded text-xs">SMTP_FROM</code>.
            Contact your system administrator to configure these. Until then, in-app notifications
            will continue to work normally.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

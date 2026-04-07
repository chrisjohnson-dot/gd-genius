import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Settings, Timer, Save } from "lucide-react";

export default function SmallParcelSettings() {
  const utils = trpc.useUtils();

  const { data: settings, isLoading } = trpc.smallParcel.getAllSettings.useQuery();

  const [countdownSeconds, setCountdownSeconds] = useState<string>("");

  // Populate the input once the data loads
  const [initialized, setInitialized] = useState(false);
  if (settings && !initialized) {
    setCountdownSeconds(String(settings.reprintCountdownSeconds));
    setInitialized(true);
  }

  const setSetting = trpc.smallParcel.setSetting.useMutation({
    onSuccess: () => {
      utils.smallParcel.getAllSettings.invalidate();
      toast.success("Settings saved — Small Parcel settings updated.");
    },
    onError: (err) => {
      toast.error(`Save failed: ${err.message}`);
    },
  });

  function handleSave() {
    const val = parseInt(countdownSeconds, 10);
    if (isNaN(val) || val < 3 || val > 120) {
      toast.error("Countdown must be between 3 and 120 seconds.");
      return;
    }
    setSetting.mutate({ key: "reprint_countdown_seconds", value: String(val) });
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Small Parcel Settings</h1>
          <p className="text-muted-foreground text-sm">Configure workflow behaviour for the Pack &amp; Ship screen.</p>
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
            After a label is purchased, a reprint window appears before the screen automatically resets to the next
            order. Set how many seconds that window stays open.
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
                onClick={handleSave}
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
              Current setting: <span className="font-medium text-foreground">{settings.reprintCountdownSeconds} seconds</span>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

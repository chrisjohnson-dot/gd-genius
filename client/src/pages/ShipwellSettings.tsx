import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Save, TestTube2, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function ShipwellSettings() {
  const { data: config, isLoading, refetch } = trpc.shipwell.getConfig.useQuery();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [showPassword, setShowPassword] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Pre-fill form when config loads
  const [formInitialized, setFormInitialized] = useState(false);
  if (config && !formInitialized) {
    setEmail(config.email);
    setEnvironment(config.environment as "sandbox" | "production");
    setFormInitialized(true);
  }

  const saveConfig = trpc.shipwell.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("Shipwell credentials saved.");
      setPassword(""); // clear password field after save
      refetch();
    },
    onError: (err) => toast.error(`Save failed: ${err.message}`),
  });

  const testConnection = trpc.shipwell.testConnection.useMutation({
    onSuccess: (data) => {
      setTestResult({ success: true, message: `Connected as ${data.user?.first_name} ${data.user?.last_name} (${data.user?.email})` });
      toast.success("Shipwell connection verified.");
    },
    onError: (err) => {
      setTestResult({ success: false, message: err.message });
      toast.error(`Connection test failed: ${err.message}`);
    },
  });

  const handleSave = () => {
    if (!email || !password) {
      toast.error("Email and password are required.");
      return;
    }
    saveConfig.mutate({ email, password, environment });
  };

  const handleTest = () => {
    if (!config) {
      toast.error("Save your credentials first before testing.");
      return;
    }
    setTestResult(null);
    testConnection.mutate();
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Zap className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Shipwell Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure your Shipwell TMS credentials to enable order dispatch from GD Genius.
            </p>
          </div>
        </div>

        {/* Current Status */}
        {!isLoading && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Connection Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {config ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-sm font-medium">{config.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Credentials saved &middot; Last updated {new Date(config.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={config.environment === "production" ? "default" : "secondary"}
                    className={config.environment === "production" ? "bg-green-600 text-white" : ""}
                  >
                    {config.environment === "production" ? "Production" : "Sandbox"}
                  </Badge>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  <p className="text-sm">No Shipwell credentials configured yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Credentials Form */}
        <Card>
          <CardHeader>
            <CardTitle>Credentials</CardTitle>
            <CardDescription>
              Enter your Shipwell account email and password. Use the Sandbox environment for testing
              before switching to Production.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sw-email">Email Address</Label>
              <Input
                id="sw-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sw-password">Password</Label>
              <div className="relative">
                <Input
                  id="sw-password"
                  type={showPassword ? "text" : "password"}
                  placeholder={config?.hasPassword ? "••••••••  (leave blank to keep current)" : "Enter password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {config?.hasPassword && !password && (
                <p className="text-xs text-muted-foreground">Password is saved. Enter a new one only if you want to change it.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="sw-env">Environment</Label>
              <Select value={environment} onValueChange={(v) => setEnvironment(v as "sandbox" | "production")}>
                <SelectTrigger id="sw-env">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />
                      Sandbox (testing)
                    </span>
                  </SelectItem>
                  <SelectItem value="production">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
                      Production (live)
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {environment === "sandbox"
                  ? "Sandbox: https://sandbox-api.shipwell.com — safe for testing, no real shipments created."
                  : "Production: https://api.shipwell.com — live environment, orders will be created for real."}
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleSave}
                disabled={saveConfig.isPending || !email || (!password && !config?.hasPassword)}
                className="gap-2"
              >
                {saveConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Credentials
              </Button>
              <Button
                variant="outline"
                onClick={handleTest}
                disabled={testConnection.isPending || !config}
                className="gap-2"
              >
                {testConnection.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
                Test Connection
              </Button>
            </div>

            {/* Test Result */}
            {testResult && (
              <div
                className={`flex items-start gap-3 rounded-lg p-3 text-sm border ${
                  testResult.success
                    ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300"
                    : "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300"
                }`}
              >
                {testResult.success
                  ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                  : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                <span>{testResult.message}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
          <CardContent className="pt-4">
            <div className="flex gap-3">
              <Zap className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
              <div className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
                <p className="font-medium">How Shipwell integration works</p>
                <p className="text-xs opacity-80">
                  When an order reaches <strong>Ship Ready</strong> status on the Pick Schedule, a
                  "Send to Shipwell" button appears on that order row. Clicking it creates a Purchase
                  Order in Shipwell using the order's ship-to address, PO number, and line item details.
                  The Shipwell PO ID is then stored and a direct link to the PO is shown in the row.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

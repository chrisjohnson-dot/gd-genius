/**
 * Printer Settings — Direct TCP/IP mode
 *
 * Sends ZPL directly to the Zebra ZT610 via a server-side TCP socket.
 * No Zebra BrowserPrint desktop app required.
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Printer,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Wifi,
  WifiOff,
  TestTube2,
  Save,
  Info,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const DEFAULT_IP = "10.90.1.218";
const DEFAULT_PORT = 9100;

const TEST_ZPL = `^XA
^FO50,60^A0N,48,48^FDZebra Test Print^FS
^FO50,130^A0N,32,32^FDGo Direct Logistics^FS
^FO50,180^A0N,26,26^FDZT610 — Direct TCP/IP^FS
^FO50,230^A0N,22,22^FD${new Date().toLocaleString()}^FS
^XZ`;

export default function SmallParcelPrinterSettings() {
  const { data: config, isLoading: configLoading } = trpc.smallParcel.getPrinterConfig.useQuery();

  const [ip, setIp] = useState(DEFAULT_IP);
  const [port, setPort] = useState(String(DEFAULT_PORT));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config) {
      setIp(config.printerIp || DEFAULT_IP);
      setPort(String(config.printerPort || DEFAULT_PORT));
      setSaved(!!config.printerIp);
    }
  }, [config]);

  const setConfigMutation = trpc.smallParcel.setPrinterConfig.useMutation({
    onSuccess: () => { setSaved(true); toast.success("Printer settings saved."); },
    onError: (err) => { toast.error(`Failed to save: ${err.message}`); },
  });

  const sendZplMutation = trpc.smallParcel.sendZpl.useMutation({
    onSuccess: () => { toast.success("Test label sent to printer!"); },
    onError: (err) => { toast.error(`Test print failed: ${err.message}`); },
  });

  const handleSave = () => {
    const portNum = parseInt(port, 10);
    if (!ip.trim()) { toast.error("Printer IP is required."); return; }
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) { toast.error("Port must be between 1 and 65535."); return; }
    setConfigMutation.mutate({ printerIp: ip.trim(), printerPort: portNum });
  };

  const handleTestPrint = () => {
    const portNum = parseInt(port, 10);
    if (!ip.trim()) { toast.error("Enter a printer IP first."); return; }
    sendZplMutation.mutate({ zpl: TEST_ZPL, printerIp: ip.trim(), printerPort: portNum || DEFAULT_PORT });
  };

  const isSaving = setConfigMutation.status === "pending";
  const isTesting = sendZplMutation.status === "pending";
  const isConfigured = saved && !!ip.trim();

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
          <Printer className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Printer Settings</h1>
          <p className="text-muted-foreground text-sm">Configure the Zebra ZT610 for automatic printing after Pack &amp; Ship.</p>
        </div>
      </div>

      <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3">
        <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 dark:text-blue-300">
          <p className="font-semibold">Direct TCP/IP printing — no desktop app required</p>
          <p className="mt-0.5 text-blue-700 dark:text-blue-400">
            ZPL labels are sent from the server directly to the Zebra printer over a raw TCP socket on port 9100.
            No Zebra BrowserPrint installation needed.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Active Printer</CardTitle>
        </CardHeader>
        <CardContent>
          {configLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Loading…</span></div>
          ) : isConfigured ? (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Wifi className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold">Zebra ZT610</p>
                  <p className="text-xs text-muted-foreground font-mono">{ip}:{port}</p>
                </div>
              </div>
              <Badge className="bg-green-600 text-white text-xs"><CheckCircle2 className="w-3 h-3 mr-1" />Configured</Badge>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-muted-foreground">
              <WifiOff className="w-5 h-5" />
              <p className="text-sm">No printer configured. Enter the IP address below and click Save.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Printer Network Address</CardTitle>
          <CardDescription className="text-xs mt-1">Enter the static IP address of the Zebra ZT610 on your warehouse network.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="printerIp" className="text-xs font-medium">IP Address</Label>
              <Input id="printerIp" value={ip} onChange={(e) => { setIp(e.target.value); setSaved(false); }} placeholder="e.g. 10.90.1.218" className="font-mono text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="printerPort" className="text-xs font-medium">Port</Label>
              <Input id="printerPort" value={port} onChange={(e) => { setPort(e.target.value); setSaved(false); }} placeholder="9100" className="font-mono text-sm" />
            </div>
          </div>
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
            <p><span className="font-medium">Model:</span> Zebra ZT610 · <span className="font-medium">DPI:</span> 203 · <span className="font-medium">Label:</span> 4″ × 6″ · <span className="font-medium">Protocol:</span> ZPL II / Raw TCP</p>
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={handleSave} disabled={isSaving} className="flex-1">
              {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : <><Save className="w-4 h-4 mr-2" />Save Printer Settings</>}
            </Button>
            <Button variant="outline" onClick={handleTestPrint} disabled={isTesting || !ip.trim()} title="Send a test ZPL label to verify connectivity">
              {isTesting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Printing…</> : <><TestTube2 className="w-4 h-4 mr-2" />Test Print</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {sendZplMutation.status === "success" && (
        <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3 text-sm text-green-800 dark:text-green-300">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          Test label sent successfully to {ip}:{port}
        </div>
      )}
      {sendZplMutation.status === "error" && (
        <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3 text-sm text-destructive">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Test print failed</p>
            <p className="text-xs mt-0.5">{sendZplMutation.error?.message}</p>
            <p className="text-xs mt-1 text-muted-foreground">Make sure the ZT610 is powered on, connected to the network, and reachable at {ip}:{port}.</p>
          </div>
        </div>
      )}
    </div>
  );
}


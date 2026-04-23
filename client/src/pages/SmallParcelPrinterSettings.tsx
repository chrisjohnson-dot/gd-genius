/**
 * Printer Settings — WebSocket Bridge mode
 *
 * Labels are sent from the BROWSER to the Zebra printers via a local
 * WebSocket bridge (zpl-bridge.js) running on the warehouse Mac.
 *
 * Architecture:
 *   Browser → ws://localhost:9101 → ZPL Bridge (warehouse Mac)
 *                                       → TCP 10.90.1.218:9100 → Zebra ZT610
 *                                       → TCP 10.90.1.21:9100  → Zebra ZT411
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
  Terminal,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useDirectPrint } from "@/hooks/useDirectPrint";

type PrinterKey = "printer1" | "printer2";

const DEFAULT_IP1         = "10.90.1.218";
const DEFAULT_IP2         = "10.90.1.21";
const DEFAULT_PORT        = 9100;
const DEFAULT_BRIDGE_PORT = 9101;

function makeTestZpl(printerName: string) {
  return `^XA
^FO50,60^A0N,48,48^FDZebra Test Print^FS
^FO50,130^A0N,32,32^FDGo Direct Logistics^FS
^FO50,180^A0N,26,26^FD${printerName}^FS
^FO50,230^A0N,22,22^FD${new Date().toLocaleString()}^FS
^XZ`;
}

export default function SmallParcelPrinterSettings() {
  const { data: config, isLoading: configLoading, refetch } = trpc.smallParcel.getPrinterConfig.useQuery();
  const { printZpl, printStatus, printError } = useDirectPrint();

  // Printer 1 state
  const [ip1, setIp1]     = useState(DEFAULT_IP1);
  const [port1, setPort1] = useState(String(DEFAULT_PORT));
  const [name1, setName1] = useState("Zebra ZT610");

  // Printer 2 state
  const [ip2, setIp2]     = useState(DEFAULT_IP2);
  const [port2, setPort2] = useState(String(DEFAULT_PORT));
  const [name2, setName2] = useState("Zebra ZT411");

  // Bridge
  const [bridgePort, setBridgePort] = useState(String(DEFAULT_BRIDGE_PORT));
  const [saved, setSaved]           = useState(false);

  // Bridge health
  const [bridgeStatus, setBridgeStatus]   = useState<"unknown" | "online" | "offline">("unknown");
  const [checkingBridge, setCheckingBridge] = useState(false);

  // Which printer we're currently test-printing to
  const [testingPrinter, setTestingPrinter] = useState<PrinterKey | null>(null);

  useEffect(() => {
    if (config) {
      setIp1(config.printerIp    || DEFAULT_IP1);
      setPort1(String(config.printerPort || DEFAULT_PORT));
      setName1(config.printerName || "Zebra ZT610");
      setIp2(config.printer2Ip   || DEFAULT_IP2);
      setPort2(String(config.printer2Port || DEFAULT_PORT));
      setName2(config.printer2Name || "Zebra ZT411");
      setBridgePort(String(config.bridgePort || DEFAULT_BRIDGE_PORT));
      setSaved(!!(config.printerIp));
    }
  }, [config]);

  const setConfigMutation = trpc.smallParcel.setPrinterConfig.useMutation({
    onSuccess: () => {
      setSaved(true);
      toast.success("Printer settings saved.");
      refetch();
    },
    onError: (err) => toast.error(`Failed to save: ${err.message}`),
  });

  const handleSave = () => {
    const p1 = parseInt(port1, 10);
    const p2 = parseInt(port2, 10);
    const bp = parseInt(bridgePort, 10);
    if (!ip1.trim()) { toast.error("Printer 1 IP is required."); return; }
    if (isNaN(p1) || p1 < 1 || p1 > 65535) { toast.error("Printer 1 port must be 1–65535."); return; }
    if (isNaN(bp) || bp < 1 || bp > 65535) { toast.error("Bridge port must be 1–65535."); return; }
    setConfigMutation.mutate({
      printerIp:    ip1.trim(),
      printerPort:  p1,
      printerName:  name1.trim() || "Zebra ZT610",
      printer2Ip:   ip2.trim(),
      printer2Port: isNaN(p2) ? DEFAULT_PORT : p2,
      printer2Name: name2.trim() || "Zebra ZT411",
      bridgePort:   bp,
    });
  };

  const handleCheckBridge = async () => {
    setCheckingBridge(true);
    setBridgeStatus("unknown");
    const bp = parseInt(bridgePort, 10) || DEFAULT_BRIDGE_PORT;
    try {
      const res = await fetch(`http://localhost:${bp}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        setBridgeStatus("online");
        toast.success("Bridge is running and reachable!");
      } else {
        setBridgeStatus("offline");
        toast.error("Bridge responded with unexpected status.");
      }
    } catch {
      setBridgeStatus("offline");
      toast.error(`Bridge not reachable at localhost:${bp}. Is zpl-bridge.js running?`);
    } finally {
      setCheckingBridge(false);
    }
  };

  const handleTestPrint = async (printer: PrinterKey) => {
    setTestingPrinter(printer);
    const label = printer === "printer1" ? name1 : name2;
    const ok = await printZpl(makeTestZpl(label), printer);
    if (ok) toast.success(`Test label sent to ${label}!`);
    setTestingPrinter(null);
  };

  const isSaving = setConfigMutation.status === "pending";
  const bridgeCmd = `node zpl-bridge.js --printer-ip ${ip1 || DEFAULT_IP1} --printer-port ${port1 || DEFAULT_PORT} --ws-port ${bridgePort || DEFAULT_BRIDGE_PORT}`;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
          <Printer className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Printer Settings</h1>
          <p className="text-muted-foreground text-sm">Configure Zebra ZT610 and ZT411 for direct label printing</p>
        </div>
      </div>

      {/* Architecture info */}
      <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
        <div>
          <p className="font-semibold">Browser-side printing via local bridge</p>
          <p className="mt-0.5 text-blue-700 dark:text-blue-400">
            Labels are sent <strong>from your browser</strong> to a small local agent (zpl-bridge.js) running on this Mac,
            which forwards them to the Zebra printer over raw TCP. The cloud server never touches your local network.
          </p>
          <p className="mt-1 font-mono text-xs bg-blue-100 dark:bg-blue-900/40 rounded px-2 py-1 inline-block">
            Browser → ws://localhost:{bridgePort || DEFAULT_BRIDGE_PORT} → Bridge → printer IP:9100 → ZT610 / ZT411
          </p>
        </div>
      </div>

      {/* Status summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Configured Printers</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {configLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Loading…</span>
            </div>
          ) : (
            <>
              {/* Printer 1 */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${ip1 ? "bg-green-100 dark:bg-green-900/30" : "bg-muted"}`}>
                    {ip1 ? <Wifi className="w-4 h-4 text-green-600" /> : <WifiOff className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{name1 || "Printer 1"}</p>
                    <p className="text-xs text-muted-foreground font-mono">{ip1 || "—"}:{port1}</p>
                  </div>
                </div>
                {ip1 ? (
                  <Badge className="bg-green-600 text-white text-xs"><CheckCircle2 className="w-3 h-3 mr-1" />Configured</Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">Not set</Badge>
                )}
              </div>
              {/* Printer 2 */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${ip2 ? "bg-green-100 dark:bg-green-900/30" : "bg-muted"}`}>
                    {ip2 ? <Wifi className="w-4 h-4 text-green-600" /> : <WifiOff className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{name2 || "Printer 2"}</p>
                    <p className="text-xs text-muted-foreground font-mono">{ip2 || "—"}:{port2}</p>
                  </div>
                </div>
                {ip2 ? (
                  <Badge className="bg-green-600 text-white text-xs"><CheckCircle2 className="w-3 h-3 mr-1" />Configured</Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">Not set</Badge>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Printer config form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Printer Network Addresses</CardTitle>
          <CardDescription className="text-xs mt-1">Static IPs of the Zebra printers on your warehouse network.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {/* Printer 1 */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Printer 1</p>
            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="name1" className="text-xs font-medium">Name</Label>
                <Input id="name1" value={name1} onChange={(e) => { setName1(e.target.value); setSaved(false); }} placeholder="Zebra ZT610" className="text-sm" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ip1" className="text-xs font-medium">IP Address</Label>
                <Input id="ip1" value={ip1} onChange={(e) => { setIp1(e.target.value); setSaved(false); }} placeholder="10.90.1.218" className="font-mono text-sm" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="port1" className="text-xs font-medium">Port</Label>
                <Input id="port1" value={port1} onChange={(e) => { setPort1(e.target.value); setSaved(false); }} placeholder="9100" className="font-mono text-sm" />
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => handleTestPrint("printer1")}
              disabled={testingPrinter !== null || !ip1.trim()}
            >
              {testingPrinter === "printer1"
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Printing…</>
                : <><TestTube2 className="w-3.5 h-3.5 mr-1.5" />Test Print — {name1 || "Printer 1"}</>}
            </Button>
          </div>

          <div className="border-t" />

          {/* Printer 2 */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Printer 2</p>
            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="name2" className="text-xs font-medium">Name</Label>
                <Input id="name2" value={name2} onChange={(e) => { setName2(e.target.value); setSaved(false); }} placeholder="Zebra ZT411" className="text-sm" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ip2" className="text-xs font-medium">IP Address</Label>
                <Input id="ip2" value={ip2} onChange={(e) => { setIp2(e.target.value); setSaved(false); }} placeholder="10.90.1.21" className="font-mono text-sm" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="port2" className="text-xs font-medium">Port</Label>
                <Input id="port2" value={port2} onChange={(e) => { setPort2(e.target.value); setSaved(false); }} placeholder="9100" className="font-mono text-sm" />
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => handleTestPrint("printer2")}
              disabled={testingPrinter !== null || !ip2.trim()}
            >
              {testingPrinter === "printer2"
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Printing…</>
                : <><TestTube2 className="w-3.5 h-3.5 mr-1.5" />Test Print — {name2 || "Printer 2"}</>}
            </Button>
          </div>

          <div className="border-t" />

          {/* Bridge port */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">WebSocket Bridge</p>
            <div className="flex items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bridgePort" className="text-xs font-medium">Bridge Port</Label>
                <Input
                  id="bridgePort"
                  value={bridgePort}
                  onChange={(e) => { setBridgePort(e.target.value); setSaved(false); }}
                  placeholder="9101"
                  className="font-mono text-sm w-28"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckBridge}
                disabled={checkingBridge}
              >
                {checkingBridge
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Checking…</>
                  : bridgeStatus === "online"
                    ? <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-green-600" />Bridge Online</>
                    : bridgeStatus === "offline"
                      ? <><AlertCircle className="w-3.5 h-3.5 mr-1.5 text-red-500" />Bridge Offline</>
                      : <><Wifi className="w-3.5 h-3.5 mr-1.5" />Check Bridge</>}
              </Button>
            </div>
          </div>

          {/* Print result feedback */}
          {printStatus === "error" && printError && (
            <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Print failed</p>
                <p className="text-xs mt-0.5">{printError}</p>
              </div>
            </div>
          )}
          {printStatus === "success" && (
            <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2 text-sm text-green-800 dark:text-green-300">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              Test label sent successfully!
            </div>
          )}

          <Button onClick={handleSave} disabled={isSaving} className="mt-1">
            {isSaving
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
              : <><Save className="w-4 h-4 mr-2" />Save All Printer Settings</>}
          </Button>
        </CardContent>
      </Card>

      {/* Bridge setup instructions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Terminal className="w-4 h-4" />
            Bridge Setup (one-time, on this Mac)
          </CardTitle>
          <CardDescription className="text-xs mt-1">
            Run the ZPL bridge once on this warehouse Mac. Keep it running in the background with pm2.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">1. Install Node.js if not already installed</p>
            <code className="bg-muted rounded px-3 py-2 text-xs font-mono">node --version  # should be v16 or higher</code>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">2. Download the bridge folder and install dependencies</p>
            <code className="bg-muted rounded px-3 py-2 text-xs font-mono">cd /path/to/bridge && npm install</code>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">3. Start the bridge (it handles both printers automatically)</p>
            <code className="bg-muted rounded px-3 py-2 text-xs font-mono break-all">{bridgeCmd}</code>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">4. (Recommended) Run as a background service with pm2</p>
            <code className="bg-muted rounded px-3 py-2 text-xs font-mono whitespace-pre-wrap">{`npm install -g pm2\npm2 start zpl-bridge.js --name gd-zpl-bridge -- --ws-port ${bridgePort || DEFAULT_BRIDGE_PORT}\npm2 save && pm2 startup`}</code>
          </div>
          <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <Info className="w-3.5 h-3.5 shrink-0" />
            The bridge must be running on the same Mac you use to open Genius in the browser. It handles both printers — the browser tells it which IP to target per print job.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

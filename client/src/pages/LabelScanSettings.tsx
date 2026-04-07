import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Printer,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Info,
  Download,
  Cpu,
  Network,
  Server,
  BookOpen,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

export default function LabelScanSettings() {
  const { data: settings, isLoading, refetch } = trpc.labelScan.getSettings.useQuery();
  const updateMutation = trpc.labelScan.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("Label scan settings saved");
      refetch();
    },
    onError: (err) => toast.error(`Save failed: ${err.message}`),
  });

  // ── Printer ──────────────────────────────────────────────────────────────────
  const [printerIp, setPrinterIp] = useState("");
  const [printerPort, setPrinterPort] = useState("9100");

  // ── Network topology ─────────────────────────────────────────────────────────
  const [appServerIp, setAppServerIp] = useState("192.168.1.10");
  const [edgeComputeIp, setEdgeComputeIp] = useState("192.168.1.20");
  const [zebraIp, setZebraIp] = useState("192.168.1.30");
  const [plcNetworkIp, setPlcNetworkIp] = useState("192.168.1.40");
  const [lpaServoIp, setLpaServoIp] = useState("192.168.1.50");

  // ── GS1 ──────────────────────────────────────────────────────────────────────
  const [gs1Prefix, setGs1Prefix] = useState("");

  // ── Label folder ─────────────────────────────────────────────────────────────
  const [labelFolderPath, setLabelFolderPath] = useState("");

  // ── PLC ──────────────────────────────────────────────────────────────────────
  const [plcProtocol, setPlcProtocol] = useState<"modbus" | "enip">("modbus");
  const [plcIp, setPlcIp] = useState("");
  const [plcPort, setPlcPort] = useState("502");
  const [plcUnitId, setPlcUnitId] = useState("1");
  const [plcStubMode, setPlcStubMode] = useState(true);

  // ── EtherNet/IP ──────────────────────────────────────────────────────────────
  const [enipSlot, setEnipSlot] = useState("0");
  const [enipPath, setEnipPath] = useState("");
  const [enipTagBeltStop, setEnipTagBeltStop] = useState("GD_BeltStop");
  const [enipTagTampFire, setEnipTagTampFire] = useState("GD_TampFire");
  const [enipTagDivertOn, setEnipTagDivertOn] = useState("GD_DivertOn");

  // ── Modbus coils (v3 full map) ────────────────────────────────────────────────
  // Output coils (App → PLC)
  const [coilDivert, setCoilDivert] = useState("0");       // C1
  const [coilBeltStop, setCoilBeltStop] = useState("1");   // C2
  const [coilTampFire, setCoilTampFire] = useState("2");   // C3
  const [coilStopPlate, setCoilStopPlate] = useState("3"); // C4
  const [coilSquareExtend, setCoilSquareExtend] = useState("4"); // C5
  const [coilSquareRetract, setCoilSquareRetract] = useState("5"); // C6
  // Input coils (PLC → App)
  const [coilTampReady, setCoilTampReady] = useState("9");         // C10
  const [coilBeltRunning, setCoilBeltRunning] = useState("10");    // C11
  const [coilSquareConfirmed, setCoilSquareConfirmed] = useState("11"); // C12
  const [coilSquareHome, setCoilSquareHome] = useState("12");      // C13
  // Data registers
  const [regTampX, setRegTampX] = useState("0");   // DS1
  const [regTampY, setRegTampY] = useState("1");   // DS2
  const [regEncoderPos, setRegEncoderPos] = useState("9"); // DS10

  // ── Tamp / squaring config ────────────────────────────────────────────────────
  const [tampXMmFixed, setTampXMmFixed] = useState("120");
  const [squaringTimeoutMs, setSquaringTimeoutMs] = useState("2000");
  const [tampReadyTimeoutMs, setTampReadyTimeoutMs] = useState("1000");

  // ── Camera C (post-apply verification) ──────────────────────────────────────
  const [camCIp, setCamCIp] = useState("");
  const [camCPort, setCamCPort] = useState("8080");

  // ── Scan image retention ─────────────────────────────────────────────────────
  const [scanImageRetentionDays, setScanImageRetentionDays] = useState("60");

  useEffect(() => {
    if (settings) {
      setPrinterIp(settings.printerIp ?? "");
      setPrinterPort(String(settings.printerPort ?? 9100));
      setGs1Prefix(settings.gs1Prefix ?? "");
      setLabelFolderPath(settings.labelFolderPath ?? "");
      setPlcProtocol((settings.plcProtocol as "modbus" | "enip") ?? "modbus");
      setPlcIp(settings.plcIp ?? "");
      setPlcPort(String(settings.plcPort ?? 502));
      setPlcUnitId(String(settings.plcUnitId ?? 1));
      setPlcStubMode(settings.plcStubMode ?? true);
      setEnipSlot(String(settings.enipSlot ?? 0));
      setEnipPath(settings.enipPath ?? "");
      setEnipTagBeltStop(settings.enipTagBeltStop ?? "GD_BeltStop");
      setEnipTagTampFire(settings.enipTagTampFire ?? "GD_TampFire");
      setEnipTagDivertOn(settings.enipTagDivertOn ?? "GD_DivertOn");
      // Network topology
      setAppServerIp(settings.qcAppIp ?? "192.168.1.10");
      setEdgeComputeIp(settings.edgeComputeIp ?? "192.168.1.20");
      setZebraIp(settings.zebraIp ?? "192.168.1.30");
      setPlcNetworkIp(settings.plcIp ?? "192.168.1.40");
      setLpaServoIp(settings.lpaIp ?? "192.168.1.50");
      // Modbus coils
      setCoilDivert(String(settings.modbusCoilDivert ?? 0));
      setCoilBeltStop(String(settings.modbusCoilBeltStop ?? 1));
      setCoilTampFire(String(settings.modbusCoilTampFire ?? 2));
      setCoilStopPlate(String(settings.modbusCoilStopPlate ?? 3));
      setCoilSquareExtend(String(settings.modbusCoilSquareExtend ?? 4));
      setCoilSquareRetract(String(settings.modbusCoilSquareRetract ?? 5));
      setCoilTampReady(String(settings.modbusCoilTampReady ?? 9));
      setCoilBeltRunning(String(settings.modbusCoilBeltRunning ?? 10));
      setCoilSquareConfirmed(String(settings.modbusCoilSquareConfirmed ?? 11));
      setCoilSquareHome(String(settings.modbusCoilSquareHome ?? 12));
      setRegTampX(String(settings.modbusRegTampX ?? 0));
      setRegTampY(String(settings.modbusRegTampY ?? 1));
      setRegEncoderPos(String(settings.modbusRegEncoderPos ?? 9));
      // Tamp / squaring
      setTampXMmFixed(String(settings.tampXMmFixed ?? 120));
      setSquaringTimeoutMs(String(settings.squaringTimeoutMs ?? 2000));
      setTampReadyTimeoutMs(String(settings.tampReadyTimeoutMs ?? 1000));
      // Camera C
      setCamCIp(settings.camCIp ?? "");
      setCamCPort(String(settings.camCPort ?? 8080));
      // Image retention
      setScanImageRetentionDays(String(settings.scanImageRetentionDays ?? 60));
    }
  }, [settings]);

  function handleProtocolChange(val: "modbus" | "enip") {
    setPlcProtocol(val);
    if (val === "enip" && plcPort === "502") setPlcPort("44818");
    if (val === "modbus" && plcPort === "44818") setPlcPort("502");
  }

  function handleSave() {
    const printerPortNum = parseInt(printerPort, 10);
    if (printerIp && (isNaN(printerPortNum) || printerPortNum < 1 || printerPortNum > 65535)) {
      toast.error("Printer port must be 1–65535");
      return;
    }
    const plcPortNum = parseInt(plcPort, 10);
    updateMutation.mutate({
      printerIp: printerIp.trim(),
      printerPort: isNaN(printerPortNum) ? 9100 : printerPortNum,
      gs1Prefix: gs1Prefix.trim(),
      labelFolderPath: labelFolderPath.trim(),
      plcProtocol,
      plcIp: plcIp.trim(),
      plcPort: isNaN(plcPortNum) ? (plcProtocol === "enip" ? 44818 : 502) : plcPortNum,
      plcUnitId: parseInt(plcUnitId, 10) || 1,
      plcStubMode,
      enipSlot: parseInt(enipSlot, 10) || 0,
      enipPath: enipPath.trim(),
      enipTagBeltStop: enipTagBeltStop.trim() || "GD_BeltStop",
      enipTagTampFire: enipTagTampFire.trim() || "GD_TampFire",
      enipTagDivertOn: enipTagDivertOn.trim() || "GD_DivertOn",
      // Network topology
      qcAppIp: appServerIp.trim() || "192.168.1.10",
      edgeComputeIp: edgeComputeIp.trim() || "192.168.1.20",
      zebraIp: zebraIp.trim() || "192.168.1.30",
      lpaIp: lpaServoIp.trim() || "192.168.1.50",
      modbusCoilDivert: parseInt(coilDivert, 10) || 0,
      modbusCoilBeltStop: parseInt(coilBeltStop, 10) || 1,
      modbusCoilTampFire: parseInt(coilTampFire, 10) || 2,
      modbusCoilStopPlate: parseInt(coilStopPlate, 10) || 3,
      modbusCoilSquareExtend: parseInt(coilSquareExtend, 10) || 4,
      modbusCoilSquareRetract: parseInt(coilSquareRetract, 10) || 5,
      modbusCoilTampReady: parseInt(coilTampReady, 10) || 9,
      modbusCoilBeltRunning: parseInt(coilBeltRunning, 10) || 10,
      modbusCoilSquareConfirmed: parseInt(coilSquareConfirmed, 10) || 11,
      modbusCoilSquareHome: parseInt(coilSquareHome, 10) || 12,
      modbusRegTampX: parseInt(regTampX, 10) || 0,
      modbusRegTampY: parseInt(regTampY, 10) || 1,
      modbusRegEncoderPos: parseInt(regEncoderPos, 10) || 9,
      tampXMmFixed: parseFloat(tampXMmFixed) || 120,
      squaringTimeoutMs: parseInt(squaringTimeoutMs, 10) || 2000,
      tampReadyTimeoutMs: parseInt(tampReadyTimeoutMs, 10) || 1000,
      // Camera C
      camCIp: camCIp.trim(),
      camCPort: parseInt(camCPort, 10) || 8080,
      // Image retention
      scanImageRetentionDays: parseInt(scanImageRetentionDays, 10) || 60,
    });
  }

  const agentScript = `#!/usr/bin/env node
// GD Label Sync Agent
// Watches a local folder and uploads new .zpl label files to the Go Direct app.
// Run: node gd-label-sync.mjs
// Requires: Node.js 18+

import fs from "fs";
import path from "path";
import https from "https";

const WATCH_FOLDER = ${JSON.stringify(labelFolderPath || "C:\\\\labels")};
const APP_URL      = "${typeof window !== "undefined" ? window.location.origin : ""}";
const API_KEY      = "YOUR_API_KEY_HERE"; // replace with your session token

const seen = new Set();

async function uploadFile(filePath) {
  const filename = path.basename(filePath);
  const barcode  = path.parse(filename).name;
  const content  = fs.readFileSync(filePath);
  const b64      = content.toString("base64");
  const body = JSON.stringify({ barcode, filename, fileBase64: b64, labelType: "ucc128" });
  return new Promise((resolve, reject) => {
    const url = new URL("/api/trpc/labelScan.uploadLabelFile", APP_URL);
    const req = https.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": \`Bearer \${API_KEY}\` },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => resolve(JSON.parse(data)));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

console.log(\`[GD Label Sync] Watching: \${WATCH_FOLDER}\`);
fs.watch(WATCH_FOLDER, async (event, filename) => {
  if (!filename || !filename.endsWith(".zpl")) return;
  const fullPath = path.join(WATCH_FOLDER, filename);
  if (seen.has(fullPath)) return;
  seen.add(fullPath);
  setTimeout(async () => {
    try {
      await uploadFile(fullPath);
      console.log(\`[GD Label Sync] Uploaded: \${filename}\`);
    } catch (err) {
      console.error(\`[GD Label Sync] Failed: \${filename}\`, err.message);
      seen.delete(fullPath);
    }
  }, 500);
});
`;

  function downloadAgent() {
    const blob = new Blob([agentScript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gd-label-sync.mjs";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Label Scan Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure the print-and-apply machine, PLC integration, network topology, and label file sync.
        </p>
      </div>

      <Tabs defaultValue="devices">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="devices" className="gap-1.5"><Network className="h-3.5 w-3.5" />Network</TabsTrigger>
          <TabsTrigger value="plc" className="gap-1.5"><Cpu className="h-3.5 w-3.5" />PLC</TabsTrigger>
          <TabsTrigger value="sync" className="gap-1.5"><Download className="h-3.5 w-3.5" />Label Sync</TabsTrigger>
          <TabsTrigger value="reference" className="gap-1.5"><BookOpen className="h-3.5 w-3.5" />Hardware Ref</TabsTrigger>
        </TabsList>

        {/* ── Network Topology Tab ─────────────────────────────────────────────── */}
        <TabsContent value="devices" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Server className="h-4 w-4" />
                Network Topology
              </CardTitle>
              <CardDescription>
                Static IP addresses for all five devices on the warehouse LAN (subnet 192.168.1.0/24 per v3 spec).
                These are for reference and are used by the app to route ZPL and PLC commands.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "QC App Server", value: appServerIp, set: setAppServerIp, placeholder: "192.168.1.10", note: "This server — port 3000" },
                  { label: "Edge Compute (Vision System)", value: edgeComputeIp, set: setEdgeComputeIp, placeholder: "192.168.1.20", note: "Sends POST /api/scan" },
                  { label: "Zebra ZE500 Printer", value: zebraIp, set: setZebraIp, placeholder: "192.168.1.30", note: "ZPL over TCP port 9100" },
                  { label: "AutomationDirect Click! PLC", value: plcNetworkIp, set: setPlcNetworkIp, placeholder: "192.168.1.40", note: "Modbus TCP port 502" },
                  { label: "LPA Servo Controller", value: lpaServoIp, set: setLpaServoIp, placeholder: "192.168.1.50", note: "Tamp Y height commands" },
                ].map(({ label, value, set, placeholder, note }) => (
                  <div key={label} className="space-y-1.5">
                    <Label className="text-sm">{label}</Label>
                    <Input
                      placeholder={placeholder}
                      value={value}
                      onChange={(e) => set(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">{note}</p>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="space-y-1.5">
                <Label htmlFor="printerIp">Zebra ZE500 — ZPL Dispatch IP</Label>
                <div className="flex gap-3">
                  <Input
                    id="printerIp"
                    placeholder="192.168.1.30"
                    value={printerIp}
                    onChange={(e) => setPrinterIp(e.target.value)}
                    className="max-w-xs"
                  />
                  <Input
                    placeholder="9100"
                    value={printerPort}
                    onChange={(e) => setPrinterPort(e.target.value)}
                    className="w-24"
                  />
                </div>
                {printerIp ? (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    ZPL will be sent to {printerIp}:{printerPort}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-amber-600">
                    <AlertCircle className="h-4 w-4" />
                    No printer IP set — label dispatch will be skipped
                  </div>
                )}
              </div>
              <Separator />
              {/* Tamp / squaring config */}
              <div>
                <div className="flex items-center gap-2 text-sm font-medium mb-3">
                  <Settings2 className="h-4 w-4" />
                  Tamp &amp; Squaring Station Config
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="tampXFixed">Tamp X Fixed (mm)</Label>
                    <Input
                      id="tampXFixed"
                      placeholder="120"
                      value={tampXMmFixed}
                      onChange={(e) => setTampXMmFixed(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Set once at commissioning — X is fixed mechanically</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="squaringTimeout">Squaring Timeout (ms)</Label>
                    <Input
                      id="squaringTimeout"
                      placeholder="2000"
                      value={squaringTimeoutMs}
                      onChange={(e) => setSquaringTimeoutMs(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Max wait for C12 SQUARE_CONFIRMED</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tampReadyTimeout">Tamp Ready Timeout (ms)</Label>
                    <Input
                      id="tampReadyTimeout"
                      placeholder="1000"
                      value={tampReadyTimeoutMs}
                      onChange={(e) => setTampReadyTimeoutMs(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Max wait for C10 TAMP_READY before firing</p>
                  </div>
                </div>
                <div className="mt-3 flex items-start gap-2 p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-lg text-xs text-blue-800 dark:text-blue-300">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    <strong>Overlap optimization (v3 §9.5):</strong> The app sends tamp_y_mm to the LPA servo
                    while the squaring cylinder is still extending, saving ~150ms per cycle. The PLC waits for
                    C10 TAMP_READY = 1 before firing C3 TAMP_FIRE.
                  </span>
                </div>
              </div>
              <Separator />
              {/* Camera C — Post-Apply Verification */}
              <div>
                <div className="flex items-center gap-2 text-sm font-medium mb-3">
                  <Server className="h-4 w-4" />
                  Camera C — Post-Apply Verification
                  {!camCIp && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                      <AlertCircle className="h-3 w-3" /> Not commissioned
                    </span>
                  )}
                  {camCIp && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-xs text-green-700 dark:text-green-400">
                      <CheckCircle2 className="h-3 w-3" /> Commissioned
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4 max-w-md">
                  <div className="space-y-1.5">
                    <Label htmlFor="camCIp">Camera C IP Address</Label>
                    <Input
                      id="camCIp"
                      placeholder="192.168.1.60"
                      value={camCIp}
                      onChange={(e) => setCamCIp(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Leave blank until camera is installed</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="camCPort">Camera C Port</Label>
                    <Input
                      id="camCPort"
                      placeholder="8080"
                      value={camCPort}
                      onChange={(e) => setCamCPort(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Edge compute HTTP port for Camera C</p>
                  </div>
                </div>
                <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg text-xs text-amber-800 dark:text-amber-300">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Camera C fires ~500ms after the tamp and photographs the applied label.
                    The edge compute calls <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">POST /api/scan/post-apply</code> with
                    the carton ID and S3 key. The seat is reserved — the endpoint returns 503 until this IP is set.
                  </span>
                </div>
              </div>
              <Separator />
              {/* Scan Image Retention */}
              <div>
                <div className="flex items-center gap-2 text-sm font-medium mb-3">
                  <Settings2 className="h-4 w-4" />
                  Scan Image Retention Policy
                </div>
                <div className="max-w-xs space-y-1.5">
                  <Label htmlFor="retentionDays">Retain images for (days)</Label>
                  <Select
                    value={scanImageRetentionDays}
                    onValueChange={setScanImageRetentionDays}
                  >
                    <SelectTrigger id="retentionDays">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="60">60 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                      <SelectItem value="180">180 days (6 months)</SelectItem>
                      <SelectItem value="365">365 days (1 year)</SelectItem>
                      <SelectItem value="0">Never purge</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Camera A, B, and C images older than this window are deleted from S3 nightly at 02:00 UTC.
                    Set to “Never purge” to retain all images indefinitely.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* GS1 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">GS1 Company Prefix</CardTitle>
              <CardDescription>Used to generate valid SSCC-18 barcodes for label generation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <Label htmlFor="gs1Prefix">GS1 Prefix</Label>
              <Input
                id="gs1Prefix"
                placeholder="e.g. 0614141"
                value={gs1Prefix}
                onChange={(e) => setGs1Prefix(e.target.value)}
                className="max-w-xs"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PLC Tab ──────────────────────────────────────────────────────────── */}
        <TabsContent value="plc" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Cpu className="h-4 w-4" />
                PLC Integration — AutomationDirect Click!
              </CardTitle>
              <CardDescription>
                Primary protocol is <strong>Modbus TCP port 502</strong> (AutomationDirect Click! PLC).
                EtherNet/IP is available for Allen-Bradley installations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Stub mode */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Stub Mode (Simulation)</Label>
                  <p className="text-xs text-muted-foreground">
                    PLC commands are logged but no network connection is made. Disable only when hardware is ready.
                  </p>
                </div>
                <Switch checked={plcStubMode} onCheckedChange={setPlcStubMode} />
              </div>

              {/* Protocol */}
              <div className="space-y-1.5">
                <Label>PLC Protocol</Label>
                <Select value={plcProtocol} onValueChange={(v) => handleProtocolChange(v as "modbus" | "enip")}>
                  <SelectTrigger className="w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="modbus">
                      <div className="flex flex-col">
                        <span>Modbus TCP (AutomationDirect Click!)</span>
                        <span className="text-xs text-muted-foreground">Default — port 502</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="enip">
                      <div className="flex flex-col">
                        <span>EtherNet/IP (Allen-Bradley)</span>
                        <span className="text-xs text-muted-foreground">ControlLogix / CompactLogix — port 44818</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* IP + Port */}
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="plcIp">PLC IP Address</Label>
                  <Input id="plcIp" placeholder="192.168.1.40" value={plcIp} onChange={(e) => setPlcIp(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plcPort">Port</Label>
                  <Input id="plcPort" placeholder={plcProtocol === "enip" ? "44818" : "502"} value={plcPort} onChange={(e) => setPlcPort(e.target.value)} />
                </div>
              </div>

              {/* Modbus-specific */}
              {plcProtocol === "modbus" && (
                <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Network className="h-4 w-4" />
                    Modbus TCP — Full Register Map (v3 spec)
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="plcUnitId">Unit ID</Label>
                      <Input id="plcUnitId" placeholder="1" value={plcUnitId} onChange={(e) => setPlcUnitId(e.target.value)} />
                      <p className="text-xs text-muted-foreground">Modbus slave address (usually 1)</p>
                    </div>
                  </div>
                  <Separator />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Output Coils (App → PLC)</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: "c1", label: "C1 — DIVERT", val: coilDivert, set: setCoilDivert, note: "Auto-reset divert solenoid" },
                      { id: "c2", label: "C2 — BELT_STOP", val: coilBeltStop, set: setCoilBeltStop, note: "Stop conveyor belt" },
                      { id: "c3", label: "C3 — TAMP_FIRE", val: coilTampFire, set: setCoilTampFire, note: "Fire tamp applicator" },
                      { id: "c4", label: "C4 — STOP_PLATE", val: coilStopPlate, set: setCoilStopPlate, note: "Raise/drop stop plate" },
                      { id: "c5", label: "C5 — SQUARE_EXTEND", val: coilSquareExtend, set: setCoilSquareExtend, note: "Extend squaring cylinder" },
                      { id: "c6", label: "C6 — SQUARE_RETRACT", val: coilSquareRetract, set: setCoilSquareRetract, note: "Retract squaring cylinder" },
                    ].map(({ id, label, val, set, note }) => (
                      <div key={id} className="space-y-1">
                        <Label htmlFor={id} className="text-xs font-mono">{label}</Label>
                        <Input id={id} value={val} onChange={(e) => set(e.target.value)} className="h-8 text-sm" />
                        <p className="text-xs text-muted-foreground">{note}</p>
                      </div>
                    ))}
                  </div>
                  <Separator />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Input Coils (PLC → App, read-back)</p>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { id: "c10", label: "C10 — TAMP_READY", val: coilTampReady, set: setCoilTampReady },
                      { id: "c11", label: "C11 — BELT_RUNNING", val: coilBeltRunning, set: setCoilBeltRunning },
                      { id: "c12", label: "C12 — SQUARE_CONFIRMED", val: coilSquareConfirmed, set: setCoilSquareConfirmed },
                      { id: "c13", label: "C13 — SQUARE_HOME", val: coilSquareHome, set: setCoilSquareHome },
                    ].map(({ id, label, val, set }) => (
                      <div key={id} className="space-y-1">
                        <Label htmlFor={id} className="text-xs font-mono">{label}</Label>
                        <Input id={id} value={val} onChange={(e) => set(e.target.value)} className="h-8 text-sm" />
                      </div>
                    ))}
                  </div>
                  <Separator />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Data Registers (Holding Registers)</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: "ds1", label: "DS1 — TAMP_X (fixed)", val: regTampX, set: setRegTampX, note: "Written once at commissioning" },
                      { id: "ds2", label: "DS2 — TAMP_Y (dynamic)", val: regTampY, set: setRegTampY, note: "Written per carton (tenths of mm)" },
                      { id: "ds10", label: "DS10 — ENCODER_POS", val: regEncoderPos, set: setRegEncoderPos, note: "Read-back encoder position" },
                    ].map(({ id, label, val, set, note }) => (
                      <div key={id} className="space-y-1">
                        <Label htmlFor={id} className="text-xs font-mono">{label}</Label>
                        <Input id={id} value={val} onChange={(e) => set(e.target.value)} className="h-8 text-sm" />
                        <p className="text-xs text-muted-foreground">{note}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* EtherNet/IP-specific */}
              {plcProtocol === "enip" && (
                <div className="space-y-4 rounded-lg border p-4 bg-blue-50/30 dark:bg-blue-950/20">
                  <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400">
                    <Network className="h-4 w-4" />
                    EtherNet/IP — Allen-Bradley Settings
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="enipSlot">Controller Slot</Label>
                      <Input id="enipSlot" placeholder="0" value={enipSlot} onChange={(e) => setEnipSlot(e.target.value)} />
                      <p className="text-xs text-muted-foreground">Backplane slot (usually 0)</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="enipPath">CIP Path (optional)</Label>
                      <Input id="enipPath" placeholder="e.g. 1,0" value={enipPath} onChange={(e) => setEnipPath(e.target.value)} />
                      <p className="text-xs text-muted-foreground">Leave blank for direct connection</p>
                    </div>
                  </div>
                  <Separator />
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tag Names (BOOL in your Logix program)</p>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="tagBeltStop">Belt Stop Tag</Label>
                      <Input id="tagBeltStop" placeholder="GD_BeltStop" value={enipTagBeltStop} onChange={(e) => setEnipTagBeltStop(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="tagTampFire">Tamp Fire Tag</Label>
                      <Input id="tagTampFire" placeholder="GD_TampFire" value={enipTagTampFire} onChange={(e) => setEnipTagTampFire(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="tagDivertOn">Divert On Tag</Label>
                      <Input id="tagDivertOn" placeholder="GD_DivertOn" value={enipTagDivertOn} onChange={(e) => setEnipTagDivertOn(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg text-xs text-blue-800 dark:text-blue-300">
                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>Tags must be <strong>BOOL</strong> type. App writes <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">1</code> to activate and <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">0</code> to deactivate via CIP Write Tag Service.</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Label Sync Tab ───────────────────────────────────────────────────── */}
        <TabsContent value="sync" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Label File Sync Agent</CardTitle>
              <CardDescription>
                A lightweight Node.js script that watches your network label folder and automatically uploads new .zpl files to this app.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="labelFolderPath">Label Folder Path (on your warehouse PC)</Label>
                <Input
                  id="labelFolderPath"
                  placeholder={`e.g. \\\\server\\labels or C:\\labels`}
                  value={labelFolderPath}
                  onChange={(e) => setLabelFolderPath(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  This path is embedded in the downloaded sync agent script. Update it here, then re-download the script.
                </p>
              </div>
              <Separator />
              <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg text-sm">
                <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="space-y-1 text-muted-foreground">
                  <p className="font-medium text-foreground">Setup Instructions</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Set the label folder path above and save settings</li>
                    <li>Download the sync agent script below</li>
                    <li>Copy it to any PC on your warehouse network</li>
                    <li>Run: <code className="bg-muted px-1 rounded">node gd-label-sync.mjs</code></li>
                    <li>The agent runs silently and uploads new .zpl files as they appear</li>
                  </ol>
                  <p className="mt-2">
                    Label files must be named by the manufacturer barcode (e.g. <code className="bg-muted px-1 rounded">012345678901.zpl</code>).
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={downloadAgent} className="gap-2">
                <Download className="h-4 w-4" />
                Download Sync Agent Script
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Hardware Reference Tab ───────────────────────────────────────────── */}
        <TabsContent value="reference" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4" />
                Hardware Reference (v3 Spec)
              </CardTitle>
              <CardDescription>
                Key hardware details for commissioning, troubleshooting, and ordering spares.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* BOM */}
              <div>
                <p className="text-sm font-semibold mb-2">Bill of Materials</p>
                <div className="rounded-lg border overflow-hidden text-sm">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Component</th>
                        <th className="text-left px-3 py-2 font-medium">Model / Part</th>
                        <th className="text-left px-3 py-2 font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {[
                        ["Print Engine", "Zebra ZE500-4 (203 dpi)", "4\" × 6\" labels, ZPL over TCP 9100"],
                        ["Tamp Applicator", "FOX IV 4000 series", "Pneumatic tamp-blow, 4\" × 6\" pad"],
                        ["LPA Servo", "Parker / SMC servo actuator", "Y-axis height control via IP"],
                        ["PLC", "AutomationDirect Click! CLICK", "Modbus TCP port 502, 24VDC I/O"],
                        ["Vision System", "Cognex In-Sight / Keyence", "Edge compute at 192.168.1.20"],
                        ["Conveyor", "Hytrol / Ashland", "Variable speed, 4-second carton spacing"],
                        ["Air Supply", "80–100 PSI regulated", "Required for tamp-blow applicator"],
                      ].map(([comp, model, note]) => (
                        <tr key={comp} className="hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium">{comp}</td>
                          <td className="px-3 py-2 text-muted-foreground">{model}</td>
                          <td className="px-3 py-2 text-muted-foreground">{note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <Separator />

              {/* Cycle time budget */}
              <div>
                <p className="text-sm font-semibold mb-2">Cycle Time Budget (per carton)</p>
                <div className="rounded-lg border overflow-hidden text-sm">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Step</th>
                        <th className="text-left px-3 py-2 font-medium">Time</th>
                        <th className="text-left px-3 py-2 font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {[
                        ["Vision scan + API response", "≤ 500ms", "App must respond within this window"],
                        ["ZPL print (ZE500)", "~300ms", "At 12 ips, 203 dpi"],
                        ["Squaring cylinder extend", "~400ms", "Overlap with LPA servo move"],
                        ["LPA servo Y move", "~300ms", "Runs in parallel with squaring"],
                        ["Tamp fire + retract", "~200ms", "After C10 TAMP_READY = 1"],
                        ["Total per carton", "~1,800ms", "4s spacing = 55% headroom"],
                      ].map(([step, time, note]) => (
                        <tr key={step} className="hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium">{step}</td>
                          <td className="px-3 py-2 font-mono text-blue-600 dark:text-blue-400">{time}</td>
                          <td className="px-3 py-2 text-muted-foreground">{note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <Separator />

              {/* Commissioning checklist */}
              <div>
                <p className="text-sm font-semibold mb-2">Commissioning Checklist</p>
                <div className="space-y-2 text-sm">
                  {[
                    "Air supply confirmed at 80–100 PSI",
                    "Tamp pad clearance verified (no obstruction at max Y travel)",
                    "Test print sent to ZE500 — label feeds and cuts cleanly",
                    "Barcode on test label verified with hand scanner",
                    "PLC Modbus connection tested (stub mode OFF, coil C2 belt stop toggled)",
                    "Vision system POST /api/scan test payload returns 200 pass verdict",
                    "Full carton run-through at slow speed before production rate",
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded border bg-muted/20">
                      <div className="h-4 w-4 mt-0.5 rounded border-2 border-muted-foreground/40 shrink-0" />
                      <span className="text-muted-foreground">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Key vendor questions */}
              <div>
                <p className="text-sm font-semibold mb-2">Key Questions for Vendors</p>
                <div className="space-y-2 text-sm text-muted-foreground">
                  {[
                    { vendor: "FOX IV / Tamp vendor", q: "What is the minimum tamp cycle time at 80 PSI? What is the pad size and maximum Y travel?" },
                    { vendor: "Vision system vendor", q: "What is the POST payload format for /api/scan? Does the system support cam_b_clear (opposite face check)?" },
                    { vendor: "AutomationDirect", q: "Confirm Click! PLC Modbus TCP coil addressing starts at 0 (not 1). Confirm 24VDC I/O voltage." },
                    { vendor: "Zebra", q: "Confirm ZE500 static IP setup via ZebraNet Bridge. Confirm ZPL ^PR and ^MD commands for speed/darkness tuning." },
                  ].map(({ vendor, q }) => (
                    <div key={vendor} className="p-3 rounded-lg border">
                      <p className="font-medium text-foreground text-xs uppercase tracking-wide mb-1">{vendor}</p>
                      <p>{q}</p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateMutation.isPending} className="gap-2">
          {updateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Settings
        </Button>
      </div>
    </div>
  );
}

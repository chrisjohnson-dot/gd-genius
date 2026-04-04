import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
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

  // Printer
  const [printerIp, setPrinterIp] = useState("");
  const [printerPort, setPrinterPort] = useState("9100");
  // GS1
  const [gs1Prefix, setGs1Prefix] = useState("");
  // Label folder
  const [labelFolderPath, setLabelFolderPath] = useState("");
  // PLC
  const [plcProtocol, setPlcProtocol] = useState<"modbus" | "enip">("modbus");
  const [plcIp, setPlcIp] = useState("");
  const [plcPort, setPlcPort] = useState("502");
  const [plcUnitId, setPlcUnitId] = useState("1");
  const [plcStubMode, setPlcStubMode] = useState(true);
  // EtherNet/IP
  const [enipSlot, setEnipSlot] = useState("0");
  const [enipPath, setEnipPath] = useState("");
  const [enipTagBeltStop, setEnipTagBeltStop] = useState("GD_BeltStop");
  const [enipTagTampFire, setEnipTagTampFire] = useState("GD_TampFire");
  const [enipTagDivertOn, setEnipTagDivertOn] = useState("GD_DivertOn");
  // Modbus coils
  const [modbusCoilBeltStop, setModbusCoilBeltStop] = useState("0");
  const [modbusCoilTampFire, setModbusCoilTampFire] = useState("1");
  const [modbusCoilDivertOn, setModbusCoilDivertOn] = useState("2");

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
      setModbusCoilBeltStop(String(settings.modbusCoilBeltStop ?? 0));
      setModbusCoilTampFire(String(settings.modbusCoilTampFire ?? 1));
      setModbusCoilDivertOn(String(settings.modbusCoilDivertOn ?? 2));
    }
  }, [settings]);

  // Auto-set default port when protocol changes
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
    if (plcIp && (isNaN(plcPortNum) || plcPortNum < 1 || plcPortNum > 65535)) {
      toast.error("PLC port must be 1–65535");
      return;
    }
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
      modbusCoilBeltStop: parseInt(modbusCoilBeltStop, 10) || 0,
      modbusCoilTampFire: parseInt(modbusCoilTampFire, 10) || 1,
      modbusCoilDivertOn: parseInt(modbusCoilDivertOn, 10) || 2,
    });
  }

  const agentScript = `#!/usr/bin/env node
// GD Label Sync Agent
// Watches a local folder and uploads new .zpl label files to the GD Allocation app.
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
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Label Scan Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure the print-and-apply machine, PLC integration, and label file sync for the QC Scan &amp; Label module.
        </p>
      </div>

      {/* Printer Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Printer className="h-4 w-4" />
            Print-and-Apply Machine (Zebra ZE500)
          </CardTitle>
          <CardDescription>
            ZPL is sent directly to the machine over your warehouse network. The machine must have a static IP address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="printerIp">Machine IP Address</Label>
              <Input
                id="printerIp"
                placeholder="e.g. 192.168.1.50"
                value={printerIp}
                onChange={(e) => setPrinterIp(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="printerPort">Port</Label>
              <Input
                id="printerPort"
                placeholder="9100"
                value={printerPort}
                onChange={(e) => setPrinterPort(e.target.value)}
              />
            </div>
          </div>
          {printerIp ? (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Will send ZPL to {printerIp}:{printerPort}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-amber-600">
              <AlertCircle className="h-4 w-4" />
              No printer IP set — label dispatch will be skipped until configured
            </div>
          )}
        </CardContent>
      </Card>

      {/* PLC Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cpu className="h-4 w-4" />
            PLC Integration
          </CardTitle>
          <CardDescription>
            The app writes belt stop, tamp fire, and divert signals to the line PLC. Supports Modbus TCP (generic)
            and EtherNet/IP (Allen-Bradley ControlLogix / CompactLogix).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Stub mode toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Stub Mode (Simulation)</Label>
              <p className="text-xs text-muted-foreground">
                When enabled, PLC commands are logged but no network connection is made. Disable only when hardware is ready.
              </p>
            </div>
            <Switch checked={plcStubMode} onCheckedChange={setPlcStubMode} />
          </div>

          {/* Protocol selector */}
          <div className="space-y-1.5">
            <Label>PLC Protocol</Label>
            <Select value={plcProtocol} onValueChange={(v) => handleProtocolChange(v as "modbus" | "enip")}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="modbus">
                  <div className="flex flex-col">
                    <span>Modbus TCP</span>
                    <span className="text-xs text-muted-foreground">Generic — default port 502</span>
                  </div>
                </SelectItem>
                <SelectItem value="enip">
                  <div className="flex flex-col">
                    <span>EtherNet/IP (Allen-Bradley)</span>
                    <span className="text-xs text-muted-foreground">ControlLogix / CompactLogix — default port 44818</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Common: IP + Port */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="plcIp">PLC IP Address</Label>
              <Input
                id="plcIp"
                placeholder="e.g. 192.168.1.10"
                value={plcIp}
                onChange={(e) => setPlcIp(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plcPort">Port</Label>
              <Input
                id="plcPort"
                placeholder={plcProtocol === "enip" ? "44818" : "502"}
                value={plcPort}
                onChange={(e) => setPlcPort(e.target.value)}
              />
            </div>
          </div>

          {/* Modbus-specific fields */}
          {plcProtocol === "modbus" && (
            <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Network className="h-4 w-4" />
                Modbus TCP Settings
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="plcUnitId">Unit ID</Label>
                  <Input
                    id="plcUnitId"
                    placeholder="1"
                    value={plcUnitId}
                    onChange={(e) => setPlcUnitId(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Modbus slave address (usually 1)</p>
                </div>
              </div>
              <Separator />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Coil Addresses</p>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="coilBeltStop">Belt Stop</Label>
                  <Input
                    id="coilBeltStop"
                    placeholder="0"
                    value={modbusCoilBeltStop}
                    onChange={(e) => setModbusCoilBeltStop(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="coilTampFire">Tamp Fire</Label>
                  <Input
                    id="coilTampFire"
                    placeholder="1"
                    value={modbusCoilTampFire}
                    onChange={(e) => setModbusCoilTampFire(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="coilDivertOn">Divert On</Label>
                  <Input
                    id="coilDivertOn"
                    placeholder="2"
                    value={modbusCoilDivertOn}
                    onChange={(e) => setModbusCoilDivertOn(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* EtherNet/IP-specific fields */}
          {plcProtocol === "enip" && (
            <div className="space-y-4 rounded-lg border p-4 bg-blue-50/30 dark:bg-blue-950/20">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400">
                <Network className="h-4 w-4" />
                EtherNet/IP — Allen-Bradley Settings
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="enipSlot">Controller Slot</Label>
                  <Input
                    id="enipSlot"
                    placeholder="0"
                    value={enipSlot}
                    onChange={(e) => setEnipSlot(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Backplane slot of the Logix controller (usually 0)</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="enipPath">CIP Path (optional)</Label>
                  <Input
                    id="enipPath"
                    placeholder="e.g. 1,0"
                    value={enipPath}
                    onChange={(e) => setEnipPath(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Leave blank for direct connection</p>
                </div>
              </div>
              <Separator />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tag Names (in your Logix program)</p>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="tagBeltStop">Belt Stop Tag</Label>
                  <Input
                    id="tagBeltStop"
                    placeholder="GD_BeltStop"
                    value={enipTagBeltStop}
                    onChange={(e) => setEnipTagBeltStop(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tagTampFire">Tamp Fire Tag</Label>
                  <Input
                    id="tagTampFire"
                    placeholder="GD_TampFire"
                    value={enipTagTampFire}
                    onChange={(e) => setEnipTagTampFire(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tagDivertOn">Divert On Tag</Label>
                  <Input
                    id="tagDivertOn"
                    placeholder="GD_DivertOn"
                    value={enipTagDivertOn}
                    onChange={(e) => setEnipTagDivertOn(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg text-xs text-blue-800 dark:text-blue-300">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <div>
                  These tags must be defined as <strong>BOOL</strong> type in your Allen-Bradley Logix program.
                  The app writes <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">1</code> to activate and{" "}
                  <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">0</code> to deactivate each tag via
                  CIP Write Tag Service over EtherNet/IP port 44818.
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* GS1 Prefix */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">GS1 Company Prefix</CardTitle>
          <CardDescription>
            Your GS1-assigned company prefix, used to generate valid SSCC-18 barcodes for future label generation.
          </CardDescription>
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

      {/* Label Folder / Sync Agent */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Label File Sync Agent</CardTitle>
          <CardDescription>
            A lightweight script that watches your network label folder and automatically uploads new .zpl files to this app.
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
          <div className="space-y-3">
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
          </div>
        </CardContent>
      </Card>

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

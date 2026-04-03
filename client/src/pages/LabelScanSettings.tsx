import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Printer, Save, Loader2, CheckCircle2, AlertCircle, Info, Download } from "lucide-react";
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

  const [printerIp, setPrinterIp] = useState("");
  const [printerPort, setPrinterPort] = useState("9100");
  const [gs1Prefix, setGs1Prefix] = useState("");
  const [labelFolderPath, setLabelFolderPath] = useState("");

  useEffect(() => {
    if (settings) {
      setPrinterIp(settings.printerIp ?? "");
      setPrinterPort(String(settings.printerPort ?? 9100));
      setGs1Prefix(settings.gs1Prefix ?? "");
      setLabelFolderPath(settings.labelFolderPath ?? "");
    }
  }, [settings]);

  function handleSave() {
    const port = parseInt(printerPort, 10);
    if (printerIp && (isNaN(port) || port < 1 || port > 65535)) {
      toast.error("Port must be a number between 1 and 65535");
      return;
    }
    updateMutation.mutate({
      printerIp: printerIp.trim(),
      printerPort: isNaN(port) ? 9100 : port,
      gs1Prefix: gs1Prefix.trim(),
      labelFolderPath: labelFolderPath.trim(),
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
const APP_URL      = "${window.location.origin}";
const API_KEY      = "YOUR_API_KEY_HERE"; // replace with your session token

const seen = new Set();

async function uploadFile(filePath) {
  const filename = path.basename(filePath);
  const barcode  = path.parse(filename).name; // filename without extension = barcode
  const content  = fs.readFileSync(filePath);
  const b64      = content.toString("base64");

  const body = JSON.stringify({
    barcode,
    filename,
    fileBase64: b64,
    labelType: "ucc128",
  });

  return new Promise((resolve, reject) => {
    const url = new URL("/api/trpc/labelScan.uploadLabelFile", APP_URL);
    const req = https.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": \`Bearer \${API_KEY}\`,
      },
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
      seen.delete(fullPath); // retry on next change
    }
  }, 500); // small delay to ensure file is fully written
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
          Configure the print-and-apply machine connection and label file sync for the QC Scan &amp; Label module.
        </p>
      </div>

      {/* Printer Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Printer className="h-4 w-4" />
            Print-and-Apply Machine
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

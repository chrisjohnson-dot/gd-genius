import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Printer,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Wifi,
  WifiOff,
  TestTube2,
  Info,
} from "lucide-react";
import { useBrowserPrint, type PrinterDevice } from "@/hooks/useBrowserPrint";
import { toast } from "sonner";

export default function SmallParcelPrinterSettings() {
  const {
    availablePrinters,
    selectedPrinter,
    setSelectedPrinter,
    printStatus,
    printError,
    isDiscovering,
    discoverError,
    discoverPrinters,
    testPrint,
    resetPrintStatus,
  } = useBrowserPrint();

  const [testingPrint, setTestingPrint] = useState(false);

  const handleSelectPrinter = (device: PrinterDevice) => {
    setSelectedPrinter({ name: device.name, uid: device.uid });
    toast.success(`Printer set to "${device.name}"`);
  };

  const handleClearPrinter = () => {
    setSelectedPrinter(null);
    toast.info("Printer selection cleared");
  };

  const handleTestPrint = async () => {
    setTestingPrint(true);
    resetPrintStatus();
    const ok = await testPrint();
    setTestingPrint(false);
    if (ok) {
      toast.success("Test label sent to printer!");
    } else {
      toast.error(printError ?? "Test print failed");
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
          <Printer className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Printer Settings</h1>
          <p className="text-muted-foreground text-sm">
            Configure the Zebra label printer for automatic printing after Pack &amp; Ship.
          </p>
        </div>
      </div>

      {/* BrowserPrint requirement notice */}
      <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3">
        <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-blue-800 dark:text-blue-300">Zebra BrowserPrint required</p>
          <p className="text-blue-700 dark:text-blue-400">
            The{" "}
            <a
              href="https://www.zebra.com/us/en/support-downloads/software/printer-software/browser-print.html"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
            >
              Zebra BrowserPrint desktop app
            </a>{" "}
            must be installed and running on this Windows workstation. It listens on{" "}
            <code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">localhost:9100</code>{" "}
            and bridges Chrome to your network Zebra printer.
          </p>
        </div>
      </div>

      {/* Current printer */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Active Printer
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedPrinter ? (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Wifi className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold">{selectedPrinter.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{selectedPrinter.uid}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTestPrint}
                  disabled={testingPrint}
                >
                  {testingPrint ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <TestTube2 className="w-3 h-3 mr-1" />
                  )}
                  Test Print
                </Button>
                <Button size="sm" variant="ghost" onClick={handleClearPrinter} className="text-destructive hover:text-destructive">
                  Clear
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-muted-foreground">
              <WifiOff className="w-5 h-5" />
              <p className="text-sm">No printer selected. Discover printers below and click to select one.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Discover printers */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Available Printers
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Printers discovered via Zebra BrowserPrint on this workstation.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={discoverPrinters}
              disabled={isDiscovering}
            >
              {isDiscovering ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3 mr-1" />
              )}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {discoverError && (
            <div className="flex items-start gap-2 text-destructive bg-destructive/10 px-3 py-2 rounded-lg mb-3 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Cannot connect to BrowserPrint</p>
                <p className="text-xs mt-0.5">{discoverError}</p>
              </div>
            </div>
          )}

          {!discoverError && availablePrinters.length === 0 && !isDiscovering && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No printers found. Make sure BrowserPrint is running and your Zebra printer is online.
            </p>
          )}

          {isDiscovering && (
            <div className="flex items-center gap-2 text-muted-foreground py-4 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Discovering printers…</span>
            </div>
          )}

          {!isDiscovering && availablePrinters.length > 0 && (
            <div className="divide-y">
              {availablePrinters.map((printer) => {
                const isSelected = selectedPrinter?.uid === printer.uid;
                return (
                  <div
                    key={printer.uid}
                    className={`flex items-center justify-between py-3 px-2 rounded-lg cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-blue-50 dark:bg-blue-900/20"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => handleSelectPrinter(printer)}
                  >
                    <div className="flex items-center gap-3">
                      <Printer
                        className={`w-5 h-5 ${isSelected ? "text-blue-600" : "text-muted-foreground"}`}
                      />
                      <div>
                        <p className={`font-medium text-sm ${isSelected ? "text-blue-700 dark:text-blue-300" : ""}`}>
                          {printer.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {printer.connection} · {printer.deviceType}
                        </p>
                      </div>
                    </div>
                    {isSelected ? (
                      <Badge className="bg-blue-600 text-white text-xs">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Selected
                      </Badge>
                    ) : (
                      <Button size="sm" variant="outline" className="text-xs h-7">
                        Select
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Print status feedback */}
      {printStatus === "success" && (
        <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3 text-sm text-green-800 dark:text-green-300">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          Test label sent successfully!
        </div>
      )}
      {printStatus === "error" && printError && (
        <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3 text-sm text-destructive">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {printError}
        </div>
      )}
    </div>
  );
}

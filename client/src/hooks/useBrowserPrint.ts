/**
 * useBrowserPrint
 *
 * React hook wrapping the Zebra BrowserPrint SDK for ZPL label printing.
 *
 * Prerequisites on each Windows workstation:
 *   - Zebra BrowserPrint desktop app must be installed and running
 *     (free download: https://www.zebra.com/us/en/support-downloads/software/printer-software/browser-print.html)
 *   - The app listens on http://localhost:9100 and bridges the browser to
 *     USB/Network Zebra printers.
 *
 * Printer config is persisted in localStorage under the key "zebraPrinterConfig".
 */

import { useState, useCallback, useEffect } from "react";
import ZebraBrowserPrintWrapper from "zebra-browser-print-wrapper";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PrinterDevice {
  name: string;
  deviceType: string;
  connection: string;
  uid: string;
  provider: string;
  manufacturer: string;
  version: number;
}

export interface PrinterConfig {
  /** Human-readable label shown in settings */
  name: string;
  /** UID from BrowserPrint device discovery */
  uid: string;
}

export type PrintStatus = "idle" | "printing" | "success" | "error";

const STORAGE_KEY = "zebraPrinterConfig";

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBrowserPrint() {
  const [availablePrinters, setAvailablePrinters] = useState<PrinterDevice[]>([]);
  const [selectedPrinter, setSelectedPrinterState] = useState<PrinterConfig | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as PrinterConfig) : null;
    } catch {
      return null;
    }
  });
  const [printStatus, setPrintStatus] = useState<PrintStatus>("idle");
  const [printError, setPrintError] = useState<string | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  /** Persist printer selection to localStorage */
  const setSelectedPrinter = useCallback((config: PrinterConfig | null) => {
    setSelectedPrinterState(config);
    if (config) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  /** Discover printers via BrowserPrint local agent */
  const discoverPrinters = useCallback(async () => {
    setIsDiscovering(true);
    setDiscoverError(null);
    try {
      const bp = new ZebraBrowserPrintWrapper();
      const printers: PrinterDevice[] = await bp.getAvailablePrinters();
      setAvailablePrinters(Array.isArray(printers) ? printers : []);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Cannot reach Zebra BrowserPrint. Is the desktop app running?";
      setDiscoverError(msg);
      setAvailablePrinters([]);
    } finally {
      setIsDiscovering(false);
    }
  }, []);

  /** Send raw ZPL string to the selected printer */
  const printZpl = useCallback(
    async (zpl: string): Promise<boolean> => {
      if (!selectedPrinter) {
        setPrintError("No printer configured. Go to Small Parcel → Printer Settings.");
        setPrintStatus("error");
        return false;
      }

      setPrintStatus("printing");
      setPrintError(null);

      try {
        const bp = new ZebraBrowserPrintWrapper();
        // Discover printers to find the matching device object
        const printers: PrinterDevice[] = await bp.getAvailablePrinters();
        const device = printers.find((p) => p.uid === selectedPrinter.uid);

        if (!device) {
          throw new Error(
            `Printer "${selectedPrinter.name}" not found. Check BrowserPrint is running and the printer is online.`
          );
        }

        bp.setPrinter(device as Parameters<typeof bp.setPrinter>[0]);

        const status = await bp.checkPrinterStatus();
        if (!status.isReadyToPrint) {
          throw new Error(`Printer not ready: ${status.errors}`);
        }

        await bp.print(zpl);
        setPrintStatus("success");
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Print failed";
        setPrintError(msg);
        setPrintStatus("error");
        return false;
      }
    },
    [selectedPrinter]
  );

  /** Send a test ZPL label to verify connectivity */
  const testPrint = useCallback(async () => {
    const testZpl = `^XA
^FO50,50^A0N,40,40^FDZebra Test Print^FS
^FO50,110^A0N,28,28^FDGo Direct Logistics^FS
^FO50,150^A0N,22,22^FD${new Date().toLocaleString()}^FS
^XZ`;
    return printZpl(testZpl);
  }, [printZpl]);

  /** Reset print status back to idle */
  const resetPrintStatus = useCallback(() => {
    setPrintStatus("idle");
    setPrintError(null);
  }, []);

  // Auto-discover on mount so settings page can show available printers immediately
  useEffect(() => {
    discoverPrinters();
  }, [discoverPrinters]);

  return {
    availablePrinters,
    selectedPrinter,
    setSelectedPrinter,
    printStatus,
    printError,
    isDiscovering,
    discoverError,
    discoverPrinters,
    printZpl,
    testPrint,
    resetPrintStatus,
  };
}

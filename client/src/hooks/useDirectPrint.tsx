/**
 * useDirectPrint
 *
 * Sends ZPL directly from the BROWSER to the Zebra printer via a local
 * WebSocket bridge (zpl-bridge.js) running on the warehouse Mac.
 *
 * Architecture:
 *   Browser → ws://localhost:9101 → ZPL Bridge → TCP 10.90.1.218:9100 → Zebra ZT610
 *                                               → TCP 10.90.1.21:9100  → Zebra ZT411
 *
 * The bridge runs on the same LAN as the printers, so it can reach private IPs.
 * The cloud server cannot (and should not) touch local network addresses.
 *
 * Bridge agent: /bridge/zpl-bridge.js  (run on warehouse Mac with `node zpl-bridge.js`)
 */
import { useState, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";

export type PrintStatus = "idle" | "printing" | "success" | "error";
export type PrinterKey = "printer1" | "printer2";

const DEFAULT_BRIDGE_PORT = 9101;
const BRIDGE_TIMEOUT_MS   = 10_000;

/**
 * Send ZPL to the local bridge via WebSocket.
 * The bridge forwards it to the printer via raw TCP.
 */
function sendViaBridge(
  zpl: string,
  bridgePort: number,
  printerIp: string,
  printerPort: number,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    let ws: WebSocket;
    try {
      ws = new WebSocket(`ws://localhost:${bridgePort}`);
    } catch (err) {
      return settle({
        ok: false,
        error: `Cannot open WebSocket: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    const timer = setTimeout(() => {
      ws.close();
      settle({
        ok: false,
        error: `Bridge connection timed out after ${BRIDGE_TIMEOUT_MS / 1000}s. Is zpl-bridge.js running on this computer?`,
      });
    }, BRIDGE_TIMEOUT_MS);

    ws.onopen = () => {
      // Send a JSON envelope so the bridge knows which printer to target
      ws.send(JSON.stringify({ zpl, printerIp, printerPort }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as { ok: boolean; error?: string };
        ws.close();
        settle(msg);
      } catch {
        ws.close();
        settle({ ok: false, error: "Invalid response from bridge" });
      }
    };

    ws.onerror = () => {
      settle({
        ok: false,
        error: `Cannot reach ZPL bridge at ws://localhost:${bridgePort}. Make sure zpl-bridge.js is running on this computer (see Printer Settings for setup instructions).`,
      });
    };

    ws.onclose = (event) => {
      if (!settled) {
        settle({ ok: false, error: event.reason || "Bridge connection closed unexpectedly" });
      }
    };
  });
}

const STORAGE_KEY = "genius_active_printer";

export function useDirectPrint() {
  const [printStatus, setPrintStatus]   = useState<PrintStatus>("idle");
  const [printError, setPrintError]     = useState<string | null>(null);
  const [activePrinter, setActivePrinterState] = useState<PrinterKey>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "printer1" || saved === "printer2") return saved;
    } catch { /* ignore SSR / private-mode errors */ }
    return "printer1";
  });

  const { data: printerConfig } = trpc.smallParcel.getPrinterConfig.useQuery(undefined, {
    staleTime: 60_000,
  });

  /**
   * Send a ZPL string to a specific printer via the local WebSocket bridge.
   * @param zpl      ZPL label content
   * @param printer  Which printer to use ("printer1" | "printer2"). Defaults to activePrinter.
   */
  const printZpl = useCallback(
    async (zpl: string, printer?: PrinterKey): Promise<boolean> => {
      setPrintStatus("printing");
      setPrintError(null);

      const target = printer ?? activePrinter;
      const bridgePort  = printerConfig?.bridgePort  ?? DEFAULT_BRIDGE_PORT;
      const printerIp   = target === "printer2"
        ? (printerConfig?.printer2Ip   ?? "")
        : (printerConfig?.printerIp    ?? "");
      const printerPort = target === "printer2"
        ? (printerConfig?.printer2Port ?? 9100)
        : (printerConfig?.printerPort  ?? 9100);

      if (!printerIp) {
        const msg = `No IP configured for ${target === "printer2" ? "Printer 2" : "Printer 1"}. Check Printer Settings.`;
        setPrintError(msg);
        setPrintStatus("error");
        return false;
      }

      const result = await sendViaBridge(zpl, bridgePort, printerIp, printerPort);

      if (result.ok) {
        setPrintStatus("success");
        return true;
      } else {
        setPrintError(result.error ?? "Unknown print error");
        setPrintStatus("error");
        return false;
      }
    },
    [activePrinter, printerConfig],
  );

  const setActivePrinter = useCallback((key: PrinterKey) => {
    setActivePrinterState(key);
    try { localStorage.setItem(STORAGE_KEY, key); } catch { /* ignore */ }
  }, []);

  const resetPrintStatus = useCallback(() => {
    setPrintStatus("idle");
    setPrintError(null);
  }, []);

  // Expose a "selectedPrinter" shape compatible with previous callers
  const selectedPrinter = printerConfig?.printerIp
    ? {
        name: activePrinter === "printer2"
          ? `${printerConfig.printer2Name} (${printerConfig.printer2Ip}:${printerConfig.printer2Port})`
          : `${printerConfig.printerName} (${printerConfig.printerIp}:${printerConfig.printerPort})`,
        uid: activePrinter === "printer2" ? printerConfig.printer2Ip : printerConfig.printerIp,
      }
    : null;

  return {
    /** Whether a printer IP is configured */
    selectedPrinter,
    /** Send a ZPL string to the printer via the local WebSocket bridge */
    printZpl,
    /** Current print status */
    printStatus,
    /** Error message if printStatus === "error" */
    printError,
    /** Reset status back to idle */
    resetPrintStatus,
    /** Raw printer config from DB */
    printerConfig,
    /** Which printer is currently active */
    activePrinter,
    /** Switch active printer */
    setActivePrinter,
  };
}

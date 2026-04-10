/**
 * useDirectPrint
 *
 * Drop-in replacement for useBrowserPrint that sends ZPL directly to the
 * Zebra ZT610 via a server-side TCP socket (trpc.smallParcel.sendZpl).
 *
 * No Zebra BrowserPrint desktop app required — the server opens the raw TCP
 * connection to the printer IP/port stored in small_parcel_settings.
 *
 * API surface is intentionally compatible with useBrowserPrint so callers
 * (SmallParcel.tsx, SmallParcelHistory.tsx) need minimal changes.
 */
import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";

export type PrintStatus = "idle" | "printing" | "success" | "error";

export function useDirectPrint() {
  const [printStatus, setPrintStatus] = useState<PrintStatus>("idle");
  const [printError, setPrintError] = useState<string | null>(null);

  // Load printer config so we can surface the printer name in the UI
  const { data: printerConfig } = trpc.smallParcel.getPrinterConfig.useQuery(undefined, {
    staleTime: 60_000,
  });

  const sendZplMutation = trpc.smallParcel.sendZpl.useMutation();

  /**
   * Send a ZPL string to the configured Zebra printer.
   * Returns true on success, false on failure.
   */
  const printZpl = useCallback(
    async (zpl: string): Promise<boolean> => {
      setPrintStatus("printing");
      setPrintError(null);
      try {
        await sendZplMutation.mutateAsync({ zpl });
        setPrintStatus("success");
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setPrintError(msg);
        setPrintStatus("error");
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sendZplMutation.mutateAsync]
  );

  const resetPrintStatus = useCallback(() => {
    setPrintStatus("idle");
    setPrintError(null);
  }, []);

  // Expose a "selectedPrinter" shape compatible with useBrowserPrint callers
  const selectedPrinter =
    printerConfig?.printerIp
      ? { name: `Zebra ZT610 (${printerConfig.printerIp}:${printerConfig.printerPort})`, uid: printerConfig.printerIp }
      : null;

  return {
    /** Whether a printer IP is configured */
    selectedPrinter,
    /** Send a ZPL string to the printer */
    printZpl,
    /** Current print status */
    printStatus,
    /** Error message if printStatus === "error" */
    printError,
    /** Reset status back to idle */
    resetPrintStatus,
    /** Raw printer config from DB */
    printerConfig,
  };
}

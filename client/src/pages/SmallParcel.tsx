import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Package,
  ScanBarcode,
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  ChevronRight,
  RotateCcw,
  MapPin,
  User,
  Hash,
  Printer,
  PackageCheck,
  ArrowRight,
  Settings,
  WifiOff,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { useBrowserPrint } from "@/hooks/useBrowserPrint";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────────────────
// Steps: 1=Scan TX ID, 2=Select Package Size, 3=Scan Items, 4=Pack & Ship
type Step = 1 | 2 | 3 | 4;

interface PackageSize {
  id: number;
  name: string;
  lengthCm: string | null;
  widthCm: string | null;
  heightCm: string | null;
  weightKg: string | null;
}

interface ScannedItem {
  sku: string;
  qty: number;
  scanned: number;
}

interface OrderData {
  extensivOrderId: number;
  referenceNum: string;
  clientId: number;
  clientName: string;
  facilityId: number;
  facilityName: string;
  status: number;
  isClosed: boolean;
  shipTo: {
    companyName?: string;
    name?: string;
    address1?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    phone?: string;
  } | null;
  orderItems: { sku: string; qty: number; lotNumber?: string | null }[];
}

// ─── Step Indicator ───────────────────────────────────────────────────────────
function StepIndicator({ current, step, label, onClick }: { current: Step; step: Step; label: string; onClick?: () => void }) {
  const done = current > step;
  const active = current === step;
  const clickable = done && !!onClick;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={clickable ? onClick : undefined}
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
          done
            ? `bg-green-500 text-white ${clickable ? "cursor-pointer hover:bg-green-600" : ""}`
            : active
            ? "bg-blue-600 text-white"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {done ? <CheckCircle2 className="w-4 h-4" /> : step}
      </button>
      <span
        className={`text-sm font-medium ${
          active ? "text-foreground" : done ? `text-green-600 ${clickable ? "cursor-pointer hover:underline" : ""}` : "text-muted-foreground"
        }`}
        onClick={clickable ? onClick : undefined}
      >
        {label}
      </span>
      {step < 4 && <ChevronRight className="w-4 h-4 text-muted-foreground mx-1" />}
    </div>
  );
}

// ─── Step 1: Scan Pick Ticket ─────────────────────────────────────────────────
function Step1ScanTicket({
  configId,
  onFound,
}: {
  configId: number;
  onFound: (ref: string, data: OrderData) => void;
}) {
  const [input, setInput] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [txIdToLookup, setTxIdToLookup] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, error, isSuccess } = trpc.smallParcel.lookupOrder.useQuery(
    { configId, transactionId: txIdToLookup },
    {
      enabled: enabled && txIdToLookup.length > 0,
      retry: false,
    }
  );

  // Handle success/error side effects
  const prevEnabledRef = useRef(false);
  if (enabled !== prevEnabledRef.current) {
    prevEnabledRef.current = enabled;
  }
  if (isSuccess && data && enabled) {
    setEnabled(false);
    // Use setTimeout to avoid setState during render
    setTimeout(() => onFound(txIdToLookup, data as OrderData), 0);
  }
  if (error && enabled) {
    setEnabled(false);
  }

  const handleScan = useCallback(() => {
    const val = input.trim();
    if (!val) return;
    setTxIdToLookup(val);
    setEnabled(true);
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleScan();
  };

  return (
    <div className="flex flex-col items-center gap-8 py-12">
      <div className="flex flex-col items-center gap-3">
        <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
          <ScanBarcode className="w-10 h-10 text-blue-600" />
        </div>
        <h2 className="text-2xl font-bold">Scan Transaction ID</h2>
        <p className="text-muted-foreground text-center max-w-sm">
          Scan or type the Extensiv Transaction ID to pull the order.
        </p>
      </div>

      <div className="flex gap-2 w-full max-w-md">
        <Input
          ref={inputRef}
          autoFocus
          placeholder="Transaction ID (e.g. 1234567)…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="text-lg h-12"
          disabled={isLoading}
        />
        <Button onClick={handleScan} disabled={isLoading || !input.trim()} className="h-12 px-6">
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-destructive bg-destructive/10 px-4 py-3 rounded-lg max-w-md w-full">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-sm">{(error as { message?: string }).message ?? "Order not found"}</span>
        </div>
      )}
    </div>
  );
}

// ─── Step 2: Select Package Size ─────────────────────────────────────────────
function Step2PackageSize({
  order,
  onSelect,
  onBack,
}: {
  order: OrderData;
  onSelect: (size: PackageSize) => void;
  onBack: () => void;
}) {
  const { data: sizes, isLoading } = trpc.smallParcel.listPackageSizes.useQuery(
    { clientId: order.clientId },
    { staleTime: 30_000 }
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Order summary banner */}
      <div className="flex flex-col gap-1 bg-muted/40 rounded-lg px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <Hash className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">TX</span>
          <span className="font-mono font-semibold">{order.extensivOrderId}</span>
          <span className="mx-1 text-muted-foreground">&bull;</span>
          <User className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-semibold">{order.clientName}</span>
          {order.shipTo && (
            <>
              <span className="mx-1 text-muted-foreground">&bull;</span>
              <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground truncate max-w-[160px]">
                {order.shipTo.companyName ?? order.shipTo.name ?? ""}{order.shipTo.city ? `, ${order.shipTo.city}` : ""}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Package className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Select Package Size</h2>
            <p className="text-muted-foreground text-sm">Choose the package type for this shipment.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !sizes || sizes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
            <AlertCircle className="w-8 h-8" />
            <p className="text-sm">No package sizes configured.</p>
            <Link href="/small-parcel/package-sizes" className="text-sm underline text-blue-600">
              Configure package sizes
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {sizes.map((size) => (
              <button
                key={size.id}
                type="button"
                onClick={() => onSelect(size as PackageSize)}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-border hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all p-5 text-center group"
              >
                <Package className="w-8 h-8 text-muted-foreground group-hover:text-blue-600 transition-colors" />
                <span className="font-semibold text-sm leading-tight">{size.name}</span>
                {(size.lengthCm || size.widthCm || size.heightCm) && (
                  <span className="text-xs text-muted-foreground">
                    {[size.lengthCm, size.widthCm, size.heightCm].filter(Boolean).join(" × ")} cm
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          <RotateCcw className="w-4 h-4 mr-2" />
          Back
        </Button>
      </div>
    </div>
  );
}

/// ─── Step 3: Scan Items ────────────────────────────────────────────────────
function Step3ScanItems({
  sessionId,
  extensivOrderId,
  clientName,
  items,
  onComplete,
  onBack,
}: {
  sessionId: number;
  extensivOrderId?: number;
  clientName?: string;
  items: ScannedItem[];
  onComplete: (items: ScannedItem[]) => void;
  onBack?: () => void;
}) {
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>(items);
  const [scanInput, setScanInput] = useState("");
  const scanInputRef = useRef<HTMLInputElement>(null);
  // Track which items were manually overridden (by index)
  const [manualOverrides, setManualOverrides] = useState<Set<number>>(new Set());
  // Show/hide the override warning banner
  const [overrideBannerDismissed, setOverrideBannerDismissed] = useState(false);
  // Per-row qty input state for manual entry
  const [qtyInputs, setQtyInputs] = useState<Record<number, string>>({});
  // Reason dialog state: pending confirmation awaiting a reason
  const [pendingConfirm, setPendingConfirm] = useState<{ itemIndex: number; remaining: number; sku: string } | null>(null);
  const [selectedReason, setSelectedReason] = useState<string>("");
  // Reason dialog for qty-set overrides
  const [pendingQtyConfirm, setPendingQtyConfirm] = useState<{ itemIndex: number; newScanned: number; prevScanned: number; sku: string } | null>(null);
  // PIN challenge state — set to true when the current pending override is for a high-value SKU
  const [pinRequired, setPinRequired] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinVerifying, setPinVerifying] = useState(false);
  const [approvedBySupervisor, setApprovedBySupervisor] = useState<string | null>(null);

  const OVERRIDE_REASONS = [
    "Barcode damaged / unreadable",
    "Scanner not available",
    "Item pre-verified by supervisor",
    "Barcode missing",
    "Item already counted",
    "Other",
  ];

  const updateMutation = trpc.smallParcel.updateScannedItems.useMutation();
  const logAuditMutation = trpc.smallParcel.logAuditEvent.useMutation();
  const verifySupervisorPinMutation = trpc.smallParcel.verifySupervisorPin.useMutation();
  const utils = trpc.useUtils();

  const allDone = scannedItems.every((item) => item.scanned >= item.qty);
  const hasManualOverrides = manualOverrides.size > 0;

  const handleScan = useCallback(() => {
    const sku = scanInput.trim().toUpperCase();
    if (!sku) return;

    const idx = scannedItems.findIndex(
      (item) => item.sku.toUpperCase() === sku && item.scanned < item.qty
    );

    if (idx === -1) {
      const knownSku = scannedItems.find((item) => item.sku.toUpperCase() === sku);
      if (knownSku) {
        toast.warning(`${sku} already fully scanned (${knownSku.qty}/${knownSku.qty})`);
      } else {
        toast.error(`SKU "${sku}" not found on this order`);
        // Log scan error
        logAuditMutation.mutate({
          sessionId,
          extensivOrderId,
          clientName,
          eventType: "scan_error",
          sku,
          notes: "SKU not found on order",
        });
      }
      setScanInput("");
      return;
    }

    const updated = scannedItems.map((item, i) =>
      i === idx ? { ...item, scanned: item.scanned + 1 } : item
    );
    setScannedItems(updated);
    updateMutation.mutate({ id: sessionId, scannedItems: updated });

    const item = updated[idx];
    if (item.scanned >= item.qty) {
      toast.success(`${sku} — all ${item.qty} scanned ✓`);
    } else {
      toast.info(`${sku} — ${item.scanned}/${item.qty}`);
    }

    setScanInput("");
    scanInputRef.current?.focus();
  }, [scanInput, scannedItems, sessionId, updateMutation, logAuditMutation, extensivOrderId, clientName]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleScan();
  };

  /** Open reason dialog before confirming manually (circle click) */
  const handleManualConfirm = async (i: number) => {
    const item = scannedItems[i];
    if (item.scanned >= item.qty) return;
    const remaining = item.qty - item.scanned;
    setSelectedReason("");
    setPinInput("");
    setPinError("");
    setApprovedBySupervisor(null);
    // Check if this SKU is flagged as high-value
    const result = await utils.smallParcel.checkHighValueSku.fetch({ sku: item.sku, clientName });
    setPinRequired(result.highValue);
    setPendingConfirm({ itemIndex: i, remaining, sku: item.sku });
  };

  /** Verify supervisor PIN for high-value SKU overrides */
  const handlePinVerify = async () => {
    if (!pinInput || pinVerifying) return;
    setPinVerifying(true);
    setPinError("");
    try {
      const result = await verifySupervisorPinMutation.mutateAsync({ pin: pinInput });
      if (result.valid && result.supervisorName) {
        setApprovedBySupervisor(result.supervisorName);
        setPinInput("");
        setPinError("");
      } else {
        setPinError("Incorrect PIN. Please try again or contact a supervisor.");
        setPinInput("");
      }
    } catch {
      setPinError("PIN verification failed. Please try again.");
    } finally {
      setPinVerifying(false);
    }
  };

  /** Called after operator selects a reason and confirms */
  const commitManualConfirm = () => {
    if (!pendingConfirm || !selectedReason) return;
    if (pinRequired && !approvedBySupervisor) return;
    const { itemIndex, remaining, sku } = pendingConfirm;
    const updated = scannedItems.map((it, idx) =>
      idx === itemIndex ? { ...it, scanned: it.qty } : it
    );
    setScannedItems(updated);
    updateMutation.mutate({ id: sessionId, scannedItems: updated });
    setManualOverrides((prev) => new Set(prev).add(itemIndex));
    setOverrideBannerDismissed(false);
    const supervisorNote = approvedBySupervisor ? ` Approved by supervisor: ${approvedBySupervisor}.` : "";
    logAuditMutation.mutate({
      sessionId,
      extensivOrderId,
      clientName,
      eventType: "manual_override",
      sku,
      qty: remaining,
      notes: `Reason: ${selectedReason}. Manually confirmed ${remaining} unit(s) without scanning.${supervisorNote}`,
    });
    toast.warning(`${sku} — manually confirmed (${remaining} unit${remaining !== 1 ? "s" : ""} not scanned)`);
    setPendingConfirm(null);
    setSelectedReason("");
    setPinRequired(false);
    setApprovedBySupervisor(null);
    scanInputRef.current?.focus();
  };

  /** Open reason dialog before committing a manual qty set */
  const handleManualQtySet = async (i: number) => {
    const raw = qtyInputs[i];
    if (!raw) return;
    const newScanned = Math.min(parseInt(raw, 10) || 0, scannedItems[i].qty);
    const item = scannedItems[i];
    const prevScanned = item.scanned;
    if (newScanned === prevScanned) {
      setQtyInputs((prev) => { const n = { ...prev }; delete n[i]; return n; });
      return;
    }
    if (newScanned > prevScanned) {
      // Requires reason (and possibly PIN)
      setSelectedReason("");
      setPinInput("");
      setPinError("");
      setApprovedBySupervisor(null);
      const result = await utils.smallParcel.checkHighValueSku.fetch({ sku: item.sku, clientName });
      setPinRequired(result.highValue);
      setPendingQtyConfirm({ itemIndex: i, newScanned, prevScanned, sku: item.sku });
    } else {
      // Decreasing qty — no reason required
      const updated = scannedItems.map((it, idx) =>
        idx === i ? { ...it, scanned: newScanned } : it
      );
      setScannedItems(updated);
      updateMutation.mutate({ id: sessionId, scannedItems: updated });
      setQtyInputs((prev) => { const n = { ...prev }; delete n[i]; return n; });
      scanInputRef.current?.focus();
    }
  };

  /** Called after operator selects a reason for a manual qty set */
  const commitManualQtySet = () => {
    if (!pendingQtyConfirm || !selectedReason) return;
    if (pinRequired && !approvedBySupervisor) return;
    const { itemIndex, newScanned, prevScanned, sku } = pendingQtyConfirm;
    const updated = scannedItems.map((it, idx) =>
      idx === itemIndex ? { ...it, scanned: newScanned } : it
    );
    setScannedItems(updated);
    updateMutation.mutate({ id: sessionId, scannedItems: updated });
    setQtyInputs((prev) => { const n = { ...prev }; delete n[itemIndex]; return n; });
    setManualOverrides((prev) => new Set(prev).add(itemIndex));
    setOverrideBannerDismissed(false);
    const supervisorNote = approvedBySupervisor ? ` Approved by supervisor: ${approvedBySupervisor}.` : "";
    logAuditMutation.mutate({
      sessionId,
      extensivOrderId,
      clientName,
      eventType: "manual_override",
      sku,
      qty: newScanned - prevScanned,
      notes: `Reason: ${selectedReason}. Manually set qty to ${newScanned}/${scannedItems[itemIndex].qty}.${supervisorNote}`,
    });
    setPendingQtyConfirm(null);
    setSelectedReason("");
    setPinRequired(false);
    setApprovedBySupervisor(null);
    scanInputRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
          <ScanBarcode className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Scan Items</h2>
          <p className="text-muted-foreground text-sm">Scan each item barcode — or click the circle to confirm manually.</p>
        </div>
      </div>

      {/* Manual override warning banner */}
      {hasManualOverrides && !overrideBannerDismissed && (
        <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-amber-800 dark:text-amber-300">Manual overrides are being tracked</p>
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {manualOverrides.size} item{manualOverrides.size !== 1 ? "s" : ""} confirmed without scanning. These are recorded in the Small Parcel Audit Log.
            </p>
          </div>
          <button
            className="text-amber-600 hover:text-amber-800 text-lg leading-none ml-2"
            onClick={() => setOverrideBannerDismissed(true)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Scan input */}
      <div className="flex gap-2">
        <Input
          ref={scanInputRef}
          autoFocus
          placeholder="Scan item barcode…"
          value={scanInput}
          onChange={(e) => setScanInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="text-lg h-12"
        />
        <Button onClick={handleScan} disabled={!scanInput.trim()} className="h-12 px-6">
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Item list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Items — {scannedItems.filter((i) => i.scanned >= i.qty).length}/{scannedItems.length} complete
            {hasManualOverrides && (
              <span className="ml-2 text-amber-600 font-normal">(manual overrides: {manualOverrides.size})</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {scannedItems.map((item, i) => {
              const done = item.scanned >= item.qty;
              const partial = item.scanned > 0 && !done;
              const isOverride = manualOverrides.has(i);
              const editingQty = qtyInputs[i] !== undefined;
              return (
                <div key={i} className={`flex items-center justify-between py-3 ${isOverride ? "bg-amber-50/50 dark:bg-amber-900/10 -mx-2 px-2 rounded" : ""}`}>
                  <div className="flex items-center gap-3">
                    {/* Clickable circle/check — click to manually confirm */}
                    <button
                      type="button"
                      className={`shrink-0 rounded-full transition-colors ${
                        done
                          ? "text-green-500 cursor-default"
                          : "text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 p-0.5 -m-0.5"
                      }`}
                      onClick={() => !done && handleManualConfirm(i)}
                      title={done ? "Complete" : "Click to manually confirm all remaining"}
                      disabled={done}
                    >
                      {done ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : partial ? (
                        <Circle className="w-5 h-5 text-yellow-500" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>
                    <div>
                      <span className={`font-mono text-sm font-semibold ${done ? "text-green-600" : ""}`}>
                        {item.sku}
                      </span>
                      {isOverride && (
                        <span className="ml-2 text-xs text-amber-600 font-medium">manual</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Inline qty editor */}
                    {!done && editingQty ? (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          max={item.qty}
                          className="w-16 h-7 text-sm text-center"
                          value={qtyInputs[i]}
                          autoFocus
                          onChange={(e) => setQtyInputs((prev) => ({ ...prev, [i]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleManualQtySet(i);
                            if (e.key === "Escape") setQtyInputs((prev) => { const n = { ...prev }; delete n[i]; return n; });
                          }}
                          onBlur={() => handleManualQtySet(i)}
                        />
                        <span className="text-xs text-muted-foreground">/ {item.qty}</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={`text-sm font-semibold tabular-nums ${
                          done ? "text-green-600" : partial ? "text-yellow-600 underline decoration-dotted cursor-pointer" : "text-muted-foreground underline decoration-dotted cursor-pointer"
                        }`}
                        onClick={() => !done && setQtyInputs((prev) => ({ ...prev, [i]: String(item.scanned) }))}
                        title={done ? undefined : "Click to enter qty manually"}
                        disabled={done}
                      >
                        {item.scanned} / {item.qty}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {allDone && (
        <div className="flex items-center gap-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          <div>
            <p className="font-semibold text-green-800 dark:text-green-300">All items confirmed!</p>
            <p className="text-sm text-green-700 dark:text-green-400">
              {hasManualOverrides
                ? `${manualOverrides.size} item${manualOverrides.size !== 1 ? "s" : ""} manually overridden — recorded in audit log.`
                : "All items scanned. Ready to pack and ship."}
            </p>
          </div>
          <Button onClick={() => onComplete(scannedItems)} className="ml-auto h-11 px-6 text-base bg-green-600 hover:bg-green-700">
            Pack &amp; Ship — Print Label
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}



      {/* ── Shared PIN section rendered inside both override dialogs ── */}
      {/* ── Manual Override Reason Dialog (circle-click confirm) ── */}
      <Dialog open={!!pendingConfirm} onOpenChange={(open) => { if (!open) { setPendingConfirm(null); setSelectedReason(""); setPinRequired(false); setPinInput(""); setPinError(""); setApprovedBySupervisor(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Manual Override{pinRequired ? " — High-Value Item" : " Required"}
            </DialogTitle>
            <DialogDescription>
              You are confirming <span className="font-semibold font-mono">{pendingConfirm?.sku}</span> without scanning{pendingConfirm && pendingConfirm.remaining > 0 ? ` (${pendingConfirm.remaining} unit${pendingConfirm.remaining !== 1 ? "s" : ""} remaining)` : ""}. Please select a reason — this will be recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Select value={selectedReason} onValueChange={setSelectedReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason…" />
              </SelectTrigger>
              <SelectContent>
                {OVERRIDE_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* PIN challenge for high-value SKUs */}
            {pinRequired && (
              <div className="flex flex-col gap-2 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  High-value item — supervisor PIN required
                </p>
                {approvedBySupervisor ? (
                  <p className="text-xs text-green-700 dark:text-green-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Approved by {approvedBySupervisor}
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      placeholder="Enter supervisor PIN"
                      value={pinInput}
                      onChange={(e) => { setPinInput(e.target.value); setPinError(""); }}
                      onKeyDown={(e) => { if (e.key === "Enter") handlePinVerify(); }}
                      className="flex-1 h-8 text-sm"
                      autoComplete="off"
                    />
                    <Button size="sm" onClick={handlePinVerify} disabled={!pinInput || pinVerifying} className="h-8">
                      {pinVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Verify"}
                    </Button>
                  </div>
                )}
                {pinError && <p className="text-xs text-red-600">{pinError}</p>}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setPendingConfirm(null); setSelectedReason(""); setPinRequired(false); setPinInput(""); setPinError(""); setApprovedBySupervisor(null); }}>
              Cancel
            </Button>
            <Button
              disabled={!selectedReason || (pinRequired && !approvedBySupervisor)}
              onClick={commitManualConfirm}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Confirm Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Manual Override Reason Dialog (qty input confirm) ── */}
      <Dialog open={!!pendingQtyConfirm} onOpenChange={(open) => { if (!open) { setPendingQtyConfirm(null); setSelectedReason(""); setPinRequired(false); setPinInput(""); setPinError(""); setApprovedBySupervisor(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Manual Override{pinRequired ? " — High-Value Item" : " Required"}
            </DialogTitle>
            <DialogDescription>
              You are manually setting <span className="font-semibold font-mono">{pendingQtyConfirm?.sku}</span> to {pendingQtyConfirm?.newScanned}/{pendingQtyConfirm && scannedItems[pendingQtyConfirm.itemIndex]?.qty} without scanning the additional units. Please select a reason — this will be recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Select value={selectedReason} onValueChange={setSelectedReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason…" />
              </SelectTrigger>
              <SelectContent>
                {OVERRIDE_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* PIN challenge for high-value SKUs */}
            {pinRequired && (
              <div className="flex flex-col gap-2 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  High-value item — supervisor PIN required
                </p>
                {approvedBySupervisor ? (
                  <p className="text-xs text-green-700 dark:text-green-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Approved by {approvedBySupervisor}
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      placeholder="Enter supervisor PIN"
                      value={pinInput}
                      onChange={(e) => { setPinInput(e.target.value); setPinError(""); }}
                      onKeyDown={(e) => { if (e.key === "Enter") handlePinVerify(); }}
                      className="flex-1 h-8 text-sm"
                      autoComplete="off"
                    />
                    <Button size="sm" onClick={handlePinVerify} disabled={!pinInput || pinVerifying} className="h-8">
                      {pinVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Verify"}
                    </Button>
                  </div>
                )}
                {pinError && <p className="text-xs text-red-600">{pinError}</p>}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setPendingQtyConfirm(null); setSelectedReason(""); setPinRequired(false); setPinInput(""); setPinError(""); setApprovedBySupervisor(null); setQtyInputs((prev) => { if (!pendingQtyConfirm) return prev; const n = { ...prev }; delete n[pendingQtyConfirm.itemIndex]; return n; }); }}>
              Cancel
            </Button>
            <Button
              disabled={!selectedReason || (pinRequired && !approvedBySupervisor)}
              onClick={commitManualQtySet}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Confirm Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Print Status Banner ──────────────────────────────────────────────────────
function PrintStatusBanner({
  status,
  error,
  printerName,
}: {
  status: "idle" | "printing" | "success" | "error";
  error: string | null;
  printerName: string | null;
}) {
  if (status === "idle") return null;
  if (status === "printing") {
    return (
      <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3">
        <Loader2 className="w-5 h-5 text-blue-600 shrink-0 animate-spin" />
        <div className="text-sm">
          <p className="font-semibold text-blue-800 dark:text-blue-300">Sending label to printer…</p>
          {printerName && (
            <p className="text-blue-700 dark:text-blue-400">Printer: {printerName}</p>
          )}
        </div>
      </div>
    );
  }
  if (status === "success") {
    return (
      <div className="flex items-center gap-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3">
        <Printer className="w-5 h-5 text-green-600 shrink-0" />
        <div className="text-sm">
          <p className="font-semibold text-green-800 dark:text-green-300">Label sent to printer!</p>
          {printerName && (
            <p className="text-green-700 dark:text-green-400">Printed on: {printerName}</p>
          )}
        </div>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3">
        <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-destructive">Print failed</p>
          <p className="text-destructive/80">{error}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            You can open the label URL manually or check{" "}
            <Link href="/small-parcel/printer-settings" className="underline">
              Printer Settings
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }
  return null;
}

// ─── Step 4: Pack & Ship ──────────────────────────────────────────────────────
function Step4PackShip({
  sessionId,
  order,
  selectedSizeName,
  onReset,
  onBack,
}: {
  sessionId: number;
  order: OrderData;
  selectedSizeName?: string | null;
  onReset: () => void;
  onBack?: () => void;
}) {
  const [weight, setWeight] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  // Store the ZPL from the last successful purchase for the Reprint button
  const [lastZpl, setLastZpl] = useState<string | null>(null);
  const [reprinting, setReprinting] = useState(false);

  const { selectedPrinter, printZpl, printStatus, printError, resetPrintStatus } = useBrowserPrint();

  const updateDimsMutation = trpc.smallParcel.updateDimensions.useMutation();
  const purchaseMutation = trpc.smallParcel.purchaseLabel.useMutation({
    onSuccess: async (data) => {
      // ── Extensiv status toast ──
      const packedOk = data.extensivMarkedPacked;
      const shippedOk = data.extensivMarkedShipped;
      if (packedOk && shippedOk) {
        toast.success("Label purchased!", { description: "Order marked as Packed and Shipped in Extensiv." });
      } else if (packedOk && !shippedOk) {
        toast.success("Label purchased!", { description: `Marked Packed in Extensiv. Shipped write-back failed: ${data.extensivShipError ?? "unknown"}` });
      } else if (!packedOk && shippedOk) {
        toast.success("Label purchased!", { description: `Marked Shipped in Extensiv. Packed write-back failed: ${data.extensivPackError ?? "unknown"}` });
      } else {
        toast.success("Label purchased!", { description: "Extensiv write-back pending — check order status manually." });
      }

      // ── Auto-print ZPL label ──
      const zpl = data.labelZpl;
      if (zpl) {
        setLastZpl(zpl);
        resetPrintStatus();
        try {
          await printZpl(zpl);
        } catch (err) {
          console.error("[SmallParcel] Auto-print error:", err);
        }
      }

      // ── Auto-reset to Step 1 after 2 seconds ──
      setTimeout(() => {
        onReset();
      }, 2000);
    },
    onError: (err) => {
      toast.error(`Label purchase failed: ${err.message}`);
    },
  });

  const handlePackShip = async () => {
    // Save dimensions first if provided
    if (weight || length || width || height) {
      await updateDimsMutation.mutateAsync({
        id: sessionId,
        weightKg: weight ? parseFloat(weight) : undefined,
        lengthCm: length ? parseFloat(length) : undefined,
        widthCm: width ? parseFloat(width) : undefined,
        heightCm: height ? parseFloat(height) : undefined,
      });
    }
    purchaseMutation.mutate({ id: sessionId });
  };

  const isLoading = updateDimsMutation.status === "pending" || purchaseMutation.status === "pending";
  const labelPurchased = purchaseMutation.status === "success";

  const handleReprint = async () => {
    if (!lastZpl) return;
    if (!selectedPrinter) {
      toast.error("No printer configured", { description: "Go to Printer Settings to set up your Zebra printer." });
      return;
    }
    setReprinting(true);
    resetPrintStatus();
    // Add DUPLICATE watermark
    const zplWithDuplicate = lastZpl.replace(/(\^XA\n?)/, `$1^FO480,30^A0N,28,28^FDDUPLICATE^FS\n`);
    await printZpl(zplWithDuplicate);
    setReprinting(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
          <PackageCheck className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Pack &amp; Ship</h2>
          <p className="text-muted-foreground text-sm">Enter package dimensions, then purchase the label.</p>
        </div>
      </div>

      {/* Printer status banner */}
      {selectedPrinter ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
          <Printer className="w-4 h-4 text-green-600 shrink-0" />
          <span>Label will print to <strong>{selectedPrinter.name}</strong></span>
          <Link href="/small-parcel/printer-settings" className="ml-auto text-xs underline text-muted-foreground hover:text-foreground">
            Change
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-amber-800 dark:text-amber-300">No printer configured — label will not auto-print.</span>
          <Link href="/small-parcel/printer-settings" className="ml-auto text-xs underline font-medium text-amber-700 dark:text-amber-400">
            <Settings className="w-3 h-3 inline mr-1" />
            Set up printer
          </Link>
        </div>
      )}

      {/* Selected package size badge */}
      {selectedSizeName && (
        <div className="flex items-center gap-2 text-sm bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
          <Package className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-blue-800 dark:text-blue-300">Package: <strong>{selectedSizeName}</strong></span>
        </div>
      )}

      {/* Ship-to summary */}
      {order.shipTo && (
        <Card className="bg-muted/40">
          <CardContent className="pt-4 flex items-start gap-3">
            <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold">{order.shipTo.companyName ?? order.shipTo.name}</p>
              <p className="text-muted-foreground">
                {[order.shipTo.address1, order.shipTo.city, order.shipTo.state, order.shipTo.zip]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Package dimensions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Package Dimensions (optional)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Weight (kg)</label>
              <Input
                type="number"
                placeholder="0.00"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Length (cm)</label>
              <Input
                type="number"
                placeholder="0"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                min="0"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Width (cm)</label>
              <Input
                type="number"
                placeholder="0"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                min="0"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Height (cm)</label>
              <Input
                type="number"
                placeholder="0"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                min="0"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Veeqo not configured notice */}
      <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-amber-800 dark:text-amber-300">Veeqo API key not yet configured</p>
          <p className="text-amber-700 dark:text-amber-400">
            Add your <code className="font-mono bg-amber-100 dark:bg-amber-900 px-1 rounded">VEEQO_API_KEY</code> in
            Settings → Secrets to enable label purchasing. The workflow and session data are fully ready.
          </p>
        </div>
      </div>

      {/* Print status */}
      <PrintStatusBanner
        status={printStatus}
        error={printError}
        printerName={selectedPrinter?.name ?? null}
      />

      {/* ── Confirmation screen after label purchase ── */}
      {labelPurchased && purchaseMutation.data && (
        <div className="flex flex-col gap-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-4 py-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            <p className="font-semibold text-green-800 dark:text-green-300">Label purchased successfully</p>
          </div>
          <div className="text-sm text-green-700 dark:text-green-400 flex flex-col gap-1">
            <span><strong>Tracking:</strong> {purchaseMutation.data.trackingNumber}</span>
            <span><strong>Carrier:</strong> {purchaseMutation.data.carrier} {purchaseMutation.data.serviceLevel}</span>
          </div>
          {lastZpl && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReprint}
              disabled={reprinting || printStatus === "printing"}
              className="self-start gap-2 border-green-300 dark:border-green-700 text-green-800 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40"
            >
              {reprinting || printStatus === "printing" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Printer className="w-3.5 h-3.5" />
              )}
              Reprint Label (DUPLICATE)
            </Button>
          )}
        </div>
      )}

      {!labelPurchased && (
        <Button
          onClick={handlePackShip}
          disabled={isLoading || printStatus === "printing"}
          className="w-full h-14 text-lg bg-blue-600 hover:bg-blue-700"
        >
          {isLoading || printStatus === "printing" ? (
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          ) : (
            <Printer className="w-5 h-5 mr-2" />
          )}
          Pack &amp; Ship — Print Label
        </Button>
      )}
    </div>
  );
}

// ─── Stub ZPL Builder ─────────────────────────────────────────────────────────
/**
 * Generates a minimal ZPL label for stub/development mode.
 * In production, the real ZPL comes directly from Veeqo.
 */
function buildStubZpl(params: {
  trackingNumber: string;
  carrier: string;
  serviceLevel: string;
  shipTo: OrderData["shipTo"];
  referenceNum: string;
}): string {
  const { trackingNumber, carrier, serviceLevel, shipTo, referenceNum } = params;
  const name = shipTo?.companyName ?? shipTo?.name ?? "";
  const addr = shipTo?.address1 ?? "";
  const city = [shipTo?.city, shipTo?.state, shipTo?.zip].filter(Boolean).join(", ");

  return `^XA
^FO30,30^A0N,28,28^FDGo Direct Logistics^FS
^FO30,70^A0N,22,22^FD${carrier} ${serviceLevel}^FS
^FO30,110^BY2,2,80^BCN,80,Y,N,N^FD${trackingNumber}^FS
^FO30,210^A0N,20,20^FDShip To:^FS
^FO30,235^A0N,24,24^FD${name}^FS
^FO30,265^A0N,20,20^FD${addr}^FS
^FO30,290^A0N,20,20^FD${city}^FS
^FO30,330^A0N,18,18^FDRef: ${referenceNum}^FS
^XZ`;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SmallParcel() {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [selectedSize, setSelectedSize] = useState<PackageSize | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);

  // Get the first available config
  const { data: configs } = trpc.config.list.useQuery();
  const configId = configs?.[0]?.id ?? 0;

  const createSessionMutation = trpc.smallParcel.createSession.useMutation({
    onSuccess: ({ id }) => {
      setSessionId(id);
      setStep(3);
    },
    onError: (err) => {
      toast.error(`Failed to create session: ${err.message}`);
    },
  });

  // Step 1 → 2: order found, go straight to package size selection
  const handleOrderFound = (_ref: string, data: OrderData) => {
    setOrderData(data);
    setStep(2);
  };

  // Step 2 → 3: package size chosen, create session
  const handlePackageSizeSelected = (size: PackageSize) => {
    if (!orderData) return;
    setSelectedSize(size);
    createSessionMutation.mutate({
      configId,
      facilityId: orderData.facilityId,
      facilityName: orderData.facilityName,
      extensivOrderId: orderData.extensivOrderId,
      referenceNum: orderData.referenceNum,
      clientId: orderData.clientId,
      clientName: orderData.clientName,
      shipToName: orderData.shipTo?.companyName ?? orderData.shipTo?.name,
      shipToAddress1: orderData.shipTo?.address1,
      shipToCity: orderData.shipTo?.city,
      shipToState: orderData.shipTo?.state,
      shipToZip: orderData.shipTo?.zip,
      shipToCountry: orderData.shipTo?.country,
      orderItems: orderData.orderItems,
      selectedPackageSizeId: size.id,
      selectedPackageSizeName: size.name,
    });
  };

  const handleScanComplete = (items: ScannedItem[]) => {
    setScannedItems(items);
    setStep(4);
  };

  const handleReset = () => {
    setStep(1);
    setOrderData(null);
    setSelectedSize(null);
    setSessionId(null);
    setScannedItems([]);
  };

  if (!user) return null;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
          <Package className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Small Parcel</h1>
          <p className="text-muted-foreground text-sm">Pack and ship D2C orders via Veeqo</p>
        </div>
      </div>

      {/* Step indicator — completed steps are clickable for back navigation */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        <StepIndicator current={step} step={1} label="Scan TX ID"
          onClick={step > 1 ? handleReset : undefined}
        />
        <StepIndicator current={step} step={2} label="Package Size"
          onClick={step > 2 ? () => { setStep(2); setSessionId(null); } : undefined}
        />
        <StepIndicator current={step} step={3} label="Scan Items"
          onClick={step > 3 ? () => setStep(3) : undefined}
        />
        <StepIndicator current={step} step={4} label="Pack & Ship" />
      </div>

      {/* Step content */}
      <Card>
        <CardContent className="pt-6">
          {step === 1 && configId > 0 && (
            <Step1ScanTicket configId={configId} onFound={handleOrderFound} />
          )}
          {step === 1 && configId === 0 && (
            <div className="flex flex-col items-center gap-4 py-12 text-muted-foreground">
              <AlertCircle className="w-10 h-10" />
              <p>No Extensiv configuration found. Please set up a connection in Settings first.</p>
            </div>
          )}
          {step === 2 && orderData && createSessionMutation.status !== "pending" && (
            <Step2PackageSize
              order={orderData}
              onSelect={handlePackageSizeSelected}
              onBack={handleReset}
            />
          )}
          {step === 2 && createSessionMutation.status === "pending" && (
            <div className="flex items-center justify-center gap-3 py-12">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <span className="text-muted-foreground">Creating session…</span>
            </div>
          )}
          {step === 3 && sessionId !== null && orderData && (
            <Step3ScanItems
              sessionId={sessionId}
              extensivOrderId={orderData.extensivOrderId}
              clientName={orderData.clientName}
              items={orderData.orderItems.map((item) => ({ sku: item.sku, qty: item.qty, scanned: 0 }))}
              onComplete={handleScanComplete}
              onBack={() => { setStep(2); setSessionId(null); }}
            />
          )}
          {step === 4 && sessionId !== null && orderData && (
            <Step4PackShip
              sessionId={sessionId}
              order={orderData}
              selectedSizeName={selectedSize?.name ?? null}
              onReset={handleReset}
              onBack={() => setStep(3)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

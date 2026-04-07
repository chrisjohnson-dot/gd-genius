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
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Step = 1 | 2 | 3 | 4;

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
function StepIndicator({ current, step, label }: { current: Step; step: Step; label: string }) {
  const done = current > step;
  const active = current === step;
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
          done
            ? "bg-green-500 text-white"
            : active
            ? "bg-blue-600 text-white"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {done ? <CheckCircle2 className="w-4 h-4" /> : step}
      </div>
      <span
        className={`text-sm font-medium ${
          active ? "text-foreground" : done ? "text-green-600" : "text-muted-foreground"
        }`}
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
  const [refToLookup, setRefToLookup] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, error, isSuccess } = trpc.smallParcel.lookupOrder.useQuery(
    { configId, referenceNum: refToLookup },
    {
      enabled: enabled && refToLookup.length > 0,
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
    setTimeout(() => onFound(refToLookup, data as OrderData), 0);
  }
  if (error && enabled) {
    setEnabled(false);
  }

  const handleScan = useCallback(() => {
    const val = input.trim();
    if (!val) return;
    setRefToLookup(val);
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
        <h2 className="text-2xl font-bold">Scan Pick Ticket</h2>
        <p className="text-muted-foreground text-center max-w-sm">
          Scan or type the pick ticket reference number to pull the order from Extensiv.
        </p>
      </div>

      <div className="flex gap-2 w-full max-w-md">
        <Input
          ref={inputRef}
          autoFocus
          placeholder="Pick ticket / reference number…"
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

// ─── Step 2: Confirm Order ────────────────────────────────────────────────────
function Step2ConfirmOrder({
  order,
  onConfirm,
  onBack,
}: {
  order: OrderData;
  onConfirm: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Order Found</h2>
          <p className="text-muted-foreground text-sm">Confirm this is the correct order before scanning items.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Order info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Order Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Reference</span>
              <span className="font-mono font-semibold ml-auto">{order.referenceNum}</span>
            </div>
            <div className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">TX #</span>
              <span className="font-mono font-semibold ml-auto">{order.extensivOrderId}</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Client</span>
              <span className="font-semibold ml-auto">{order.clientName}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Facility</span>
              <span className="font-semibold ml-auto">{order.facilityName}</span>
            </div>
          </CardContent>
        </Card>

        {/* Ship-to */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Ship To</CardTitle>
          </CardHeader>
          <CardContent>
            {order.shipTo ? (
              <div className="flex flex-col gap-1 text-sm">
                {order.shipTo.companyName && <span className="font-semibold">{order.shipTo.companyName}</span>}
                {order.shipTo.name && <span>{order.shipTo.name}</span>}
                {order.shipTo.address1 && <span className="text-muted-foreground">{order.shipTo.address1}</span>}
                <span className="text-muted-foreground">
                  {[order.shipTo.city, order.shipTo.state, order.shipTo.zip].filter(Boolean).join(", ")}
                </span>
                {order.shipTo.country && order.shipTo.country !== "US" && (
                  <span className="text-muted-foreground">{order.shipTo.country}</span>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No ship-to address on file</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Items ({order.orderItems.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {order.orderItems.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <div className="flex flex-col">
                  <span className="font-mono text-sm font-semibold">{item.sku}</span>
                  {item.lotNumber && (
                    <span className="text-xs text-muted-foreground">Lot: {item.lotNumber}</span>
                  )}
                </div>
                <Badge variant="secondary">Qty: {item.qty}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <RotateCcw className="w-4 h-4 mr-2" />
          Scan Different Ticket
        </Button>
        <Button onClick={onConfirm} className="flex-1">
          <CheckCircle2 className="w-4 h-4 mr-2" />
          Confirm & Start Scanning
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Scan Items ───────────────────────────────────────────────────────
function Step3ScanItems({
  sessionId,
  items,
  onComplete,
}: {
  sessionId: number;
  items: ScannedItem[];
  onComplete: (items: ScannedItem[]) => void;
}) {
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>(items);
  const [scanInput, setScanInput] = useState("");
  const [lastScan, setLastScan] = useState<{ sku: string; ok: boolean } | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const updateMutation = trpc.smallParcel.updateScannedItems.useMutation({
    onSuccess: (result) => {
      if (result.allScanned) {
        onComplete(scannedItems);
      }
    },
  });

  const handleScan = useCallback(() => {
    const sku = scanInput.trim().toUpperCase();
    if (!sku) return;
    setScanInput("");

    const idx = scannedItems.findIndex((item) => item.sku.toUpperCase() === sku);
    if (idx === -1) {
      setLastScan({ sku, ok: false });
      toast.error(`"${sku}" is not in this order's item list.`);
      return;
    }
    const item = scannedItems[idx];
    if (item.scanned >= item.qty) {
      setLastScan({ sku, ok: false });
      toast.error(`${sku} is already at ${item.qty}/${item.qty}.`);
      return;
    }

    const updated = scannedItems.map((it, i) =>
      i === idx ? { ...it, scanned: it.scanned + 1 } : it
    );
    setScannedItems(updated);
    setLastScan({ sku, ok: true });
    updateMutation.mutate({ id: sessionId, scannedItems: updated });
    scanInputRef.current?.focus();
  }, [scanInput, scannedItems, sessionId, updateMutation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleScan();
  };

  const allDone = scannedItems.every((item) => item.scanned >= item.qty);
  const totalScanned = scannedItems.reduce((s, i) => s + i.scanned, 0);
  const totalRequired = scannedItems.reduce((s, i) => s + i.qty, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Scan Items</h2>
          <p className="text-muted-foreground text-sm">Scan each item barcode to verify contents.</p>
        </div>
        <Badge variant={allDone ? "default" : "secondary"} className="text-base px-3 py-1">
          {totalScanned} / {totalRequired}
        </Badge>
      </div>

      {/* Scan input */}
      <div className="flex gap-2">
        <Input
          ref={scanInputRef}
          autoFocus
          placeholder="Scan item barcode (SKU)…"
          value={scanInput}
          onChange={(e) => setScanInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className={`text-lg h-12 font-mono ${
            lastScan?.ok === true
              ? "border-green-500 focus-visible:ring-green-500"
              : lastScan?.ok === false
              ? "border-destructive focus-visible:ring-destructive"
              : ""
          }`}
          disabled={allDone}
        />
        <Button onClick={handleScan} disabled={allDone || !scanInput.trim()} className="h-12 px-6">
          <ScanBarcode className="w-4 h-4" />
        </Button>
      </div>

      {/* Items list */}
      <Card>
        <CardContent className="pt-4">
          <div className="divide-y">
            {scannedItems.map((item, i) => {
              const done = item.scanned >= item.qty;
              const partial = item.scanned > 0 && !done;
              return (
                <div key={i} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    {done ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                    ) : partial ? (
                      <Circle className="w-5 h-5 text-yellow-500 shrink-0" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground shrink-0" />
                    )}
                    <span className={`font-mono font-semibold ${done ? "text-green-600" : ""}`}>
                      {item.sku}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-semibold ${
                        done ? "text-green-600" : partial ? "text-yellow-600" : "text-muted-foreground"
                      }`}
                    >
                      {item.scanned} / {item.qty}
                    </span>
                    {/* Manual increment button for accessibility */}
                    {!done && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          const updated = scannedItems.map((it, idx) =>
                            idx === i ? { ...it, scanned: it.scanned + 1 } : it
                          );
                          setScannedItems(updated);
                          updateMutation.mutate({ id: sessionId, scannedItems: updated });
                        }}
                      >
                        +1
                      </Button>
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
            <p className="font-semibold text-green-800 dark:text-green-300">All items scanned!</p>
            <p className="text-sm text-green-700 dark:text-green-400">Ready to pack and ship.</p>
          </div>
          <Button onClick={() => onComplete(scannedItems)} className="ml-auto bg-green-600 hover:bg-green-700">
            Continue to Pack &amp; Ship
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Step 4: Pack & Ship ──────────────────────────────────────────────────────
function Step4PackShip({
  sessionId,
  order,
  onReset,
}: {
  sessionId: number;
  order: OrderData;
  onReset: () => void;
}) {
  const [weight, setWeight] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");

  const updateDimsMutation = trpc.smallParcel.updateDimensions.useMutation();
  const purchaseMutation = trpc.smallParcel.purchaseLabel.useMutation({
    onSuccess: () => {
      toast.success("Label purchased! The shipping label is ready to print.");
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

      <div className="flex gap-3">
        <Button variant="outline" onClick={onReset} className="flex-1">
          <RotateCcw className="w-4 h-4 mr-2" />
          New Shipment
        </Button>
        <Button
          onClick={handlePackShip}
          disabled={isLoading}
          className="flex-1 bg-blue-600 hover:bg-blue-700"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Printer className="w-4 h-4 mr-2" />
          )}
          Pack &amp; Ship — Print Label
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SmallParcel() {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [orderData, setOrderData] = useState<OrderData | null>(null);
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

  const handleOrderFound = (_ref: string, data: OrderData) => {
    setOrderData(data);
    setStep(2);
  };

  const handleConfirmOrder = () => {
    if (!orderData) return;
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
    });
  };

  const handleScanComplete = (items: ScannedItem[]) => {
    setScannedItems(items);
    setStep(4);
  };

  const handleReset = () => {
    setStep(1);
    setOrderData(null);
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

      {/* Step indicator */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        <StepIndicator current={step} step={1} label="Scan Ticket" />
        <StepIndicator current={step} step={2} label="Confirm Order" />
        <StepIndicator current={step} step={3} label="Scan Items" />
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
          {step === 2 && orderData && (
            <Step2ConfirmOrder
              order={orderData}
              onConfirm={handleConfirmOrder}
              onBack={handleReset}
            />
          )}
          {step === 3 && sessionId !== null && orderData && (
            <Step3ScanItems
              sessionId={sessionId}
              items={orderData.orderItems.map((item) => ({ sku: item.sku, qty: item.qty, scanned: 0 }))}
              onComplete={handleScanComplete}
            />
          )}
          {step === 4 && sessionId !== null && orderData && (
            <Step4PackShip
              sessionId={sessionId}
              order={orderData}
              onReset={handleReset}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

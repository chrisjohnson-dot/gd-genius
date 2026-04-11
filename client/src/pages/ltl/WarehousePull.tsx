import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ScanBarcode,
  UserCheck,
  Play,
  Square,
  Package,
  Layers,
  Trash2,
  Clock,
  CheckCircle2,
  ChevronRight,
  AlertCircle,
  Loader2,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

type Step = "scan_ticket" | "enter_associate" | "active" | "complete";

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WarehousePull() {
  const [step, setStep] = useState<Step>("scan_ticket");
  const [pickTicket, setPickTicket] = useState("");
  const [associateId, setAssociateId] = useState("");
  const [associateName, setAssociateName] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [itemInput, setItemInput] = useState("");
  const [itemType, setItemType] = useState<"pallet" | "case" | "unit">("case");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);

  const ticketRef = useRef<HTMLInputElement>(null);
  const associateRef = useRef<HTMLInputElement>(null);
  const itemRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const utils = trpc.useUtils();

  const { data: session, isLoading: sessionLoading } = trpc.pullTracker.getSession.useQuery(
    { sessionId: sessionId! },
    { enabled: sessionId !== null, refetchInterval: 5000 }
  );

  const startSession = trpc.pullTracker.startSession.useMutation({
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setSessionStartedAt(Date.now());
      setStep("active");
      if (data.resumed) toast.info("Resumed existing active session for this pick ticket.");
      else toast.success("Session started! Scan items to begin tracking.");
    },
    onError: (err) => toast.error(err.message),
  });

  const endSession = trpc.pullTracker.endSession.useMutation({
    onSuccess: (data) => {
      setStep("complete");
      if (timerRef.current) clearInterval(timerRef.current);
      toast.success(
        `Session complete! ${data.totalItems} items in ${formatDuration(data.durationSeconds)}.` +
        (data.opfiPushed ? " Sent to OpFi ✓" : "")
      );
      utils.pullTracker.getSession.invalidate({ sessionId: sessionId! });
    },
    onError: (err) => toast.error(err.message),
  });

  const addItem = trpc.pullTracker.addItem.useMutation({
    onSuccess: () => {
      utils.pullTracker.getSession.invalidate({ sessionId: sessionId! });
      setItemInput("");
      itemRef.current?.focus();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeItem = trpc.pullTracker.removeItem.useMutation({
    onSuccess: () => utils.pullTracker.getSession.invalidate({ sessionId: sessionId! }),
    onError: (err) => toast.error(err.message),
  });

  // Timer
  useEffect(() => {
    if (step === "active" && sessionStartedAt) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - sessionStartedAt) / 1000));
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [step, sessionStartedAt]);

  // Auto-focus
  useEffect(() => {
    if (step === "scan_ticket") ticketRef.current?.focus();
    if (step === "enter_associate") associateRef.current?.focus();
    if (step === "active") itemRef.current?.focus();
  }, [step]);

  const handleTicketSubmit = useCallback(() => {
    if (!pickTicket.trim()) return;
    setStep("enter_associate");
  }, [pickTicket]);

  const handleAssociateSubmit = useCallback(() => {
    if (!associateId.trim()) return;
    startSession.mutate({
      pickTicket: pickTicket.trim(),
      associateId: associateId.trim(),
      associateName: associateName.trim() || undefined,
    });
  }, [associateId, associateName, pickTicket]);

  const handleItemScan = useCallback(() => {
    if (!itemInput.trim() || !sessionId) return;
    addItem.mutate({
      sessionId,
      itemType,
      barcode: itemInput.trim(),
      quantity: 1,
    });
  }, [itemInput, sessionId, itemType]);

  const handleReset = () => {
    setStep("scan_ticket");
    setPickTicket("");
    setAssociateId("");
    setAssociateName("");
    setSessionId(null);
    setItemInput("");
    setElapsedSeconds(0);
    setSessionStartedAt(null);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const palletCount = session?.items?.filter(i => i.itemType === "pallet").reduce((s, i) => s + i.quantity, 0) ?? 0;
  const caseCount = session?.items?.filter(i => i.itemType === "case").reduce((s, i) => s + i.quantity, 0) ?? 0;
  const unitCount = session?.items?.filter(i => i.itemType === "unit").reduce((s, i) => s + i.quantity, 0) ?? 0;

  return (
    <div className="min-h-screen bg-background p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-[#15527f] flex items-center justify-center">
          <ScanBarcode className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Warehouse Pull</h1>
          <p className="text-xs text-muted-foreground">LTL Pick Time Tracker</p>
        </div>
        {step === "active" && (
          <div className="ml-auto flex items-center gap-1.5 bg-green-500/10 border border-green-500/30 text-green-600 rounded-lg px-3 py-1.5 text-sm font-mono font-semibold">
            <Clock className="h-3.5 w-3.5" />
            {formatDuration(elapsedSeconds)}
          </div>
        )}
      </div>

      {/* ── Step 1: Scan Pick Ticket ─────────────────────────────────────── */}
      {step === "scan_ticket" && (
        <Card className="border-2 border-[#15527f]/30">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 text-[#15527f] font-semibold">
              <span className="w-6 h-6 rounded-full bg-[#15527f] text-white text-xs flex items-center justify-center font-bold">1</span>
              Scan Pick Ticket
            </div>
            <p className="text-sm text-muted-foreground">
              Scan or type the pick ticket / pull sheet barcode to begin.
            </p>
            <Input
              ref={ticketRef}
              placeholder="Scan or type pick ticket…"
              value={pickTicket}
              onChange={(e) => setPickTicket(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTicketSubmit()}
              className="font-mono text-base h-12"
              autoComplete="off"
            />
            <Button
              className="w-full h-12 bg-[#15527f] hover:bg-[#1a6699] text-white gap-2"
              disabled={!pickTicket.trim()}
              onClick={handleTicketSubmit}
            >
              Continue
              <ChevronRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Enter Associate ID ───────────────────────────────────── */}
      {step === "enter_associate" && (
        <Card className="border-2 border-[#15527f]/30">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 text-[#15527f] font-semibold">
              <span className="w-6 h-6 rounded-full bg-[#15527f] text-white text-xs flex items-center justify-center font-bold">2</span>
              Associate ID
            </div>
            <div className="bg-muted rounded-lg px-3 py-2 text-sm">
              <span className="text-muted-foreground">Pick Ticket: </span>
              <span className="font-mono font-semibold">{pickTicket}</span>
            </div>
            <Input
              ref={associateRef}
              placeholder="Scan or type associate ID…"
              value={associateId}
              onChange={(e) => setAssociateId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && associateId.trim() && (associateName ? handleAssociateSubmit() : associateRef.current?.blur())}
              className="font-mono text-base h-12"
              autoComplete="off"
            />
            <Input
              placeholder="Associate name (optional)"
              value={associateName}
              onChange={(e) => setAssociateName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAssociateSubmit()}
              className="text-base h-11"
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("scan_ticket")} className="flex-1">
                Back
              </Button>
              <Button
                className="flex-1 h-11 bg-[#15527f] hover:bg-[#1a6699] text-white gap-2"
                disabled={!associateId.trim() || startSession.isPending}
                onClick={handleAssociateSubmit}
              >
                {startSession.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Start Session
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Active Session ───────────────────────────────────────── */}
      {step === "active" && sessionId && (
        <div className="space-y-4">
          {/* Session info */}
          <div className="bg-muted rounded-xl p-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">Pick Ticket</span>
              <p className="font-mono font-semibold truncate">{pickTicket}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Associate</span>
              <p className="font-semibold truncate">{associateName || associateId}</p>
            </div>
          </div>

          {/* Counters */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Pallets", count: palletCount, icon: Layers, color: "text-purple-600 bg-purple-50 dark:bg-purple-950/30" },
              { label: "Cases", count: caseCount, icon: Package, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30" },
              { label: "Units", count: unitCount, icon: Package, color: "text-green-600 bg-green-50 dark:bg-green-950/30" },
            ].map(({ label, count, icon: Icon, color }) => (
              <div key={label} className={`rounded-xl p-3 text-center ${color}`}>
                <Icon className="h-5 w-5 mx-auto mb-1 opacity-70" />
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs font-medium">{label}</p>
              </div>
            ))}
          </div>

          {/* Item type selector */}
          <div className="flex gap-2">
            {(["pallet", "case", "unit"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setItemType(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors capitalize ${
                  itemType === t
                    ? "bg-[#15527f] text-white border-[#15527f]"
                    : "bg-background text-muted-foreground border-border hover:border-[#15527f]/50"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Scan input */}
          <div className="flex gap-2">
            <Input
              ref={itemRef}
              placeholder={`Scan ${itemType} barcode…`}
              value={itemInput}
              onChange={(e) => setItemInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleItemScan()}
              className="font-mono text-base h-12 flex-1"
              autoComplete="off"
            />
            <Button
              onClick={handleItemScan}
              disabled={!itemInput.trim() || addItem.isPending}
              className="h-12 px-4 bg-[#15527f] hover:bg-[#1a6699] text-white"
            >
              {addItem.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanBarcode className="h-5 w-5" />}
            </Button>
          </div>

          {/* Scanned items list */}
          {sessionLoading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading items…
            </div>
          ) : session?.items && session.items.length > 0 ? (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {[...session.items].reverse().map((item) => (
                <div key={item.id} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 text-sm">
                  <Badge variant="outline" className="capitalize text-xs shrink-0">{item.itemType}</Badge>
                  <span className="font-mono text-xs truncate flex-1 text-muted-foreground">{item.barcode || item.sku || "—"}</span>
                  <span className="font-semibold shrink-0">×{item.quantity}</span>
                  <button
                    onClick={() => removeItem.mutate({ itemId: item.id })}
                    className="text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-sm">
              <Package className="h-8 w-8 mb-2 opacity-30" />
              No items scanned yet. Scan a barcode above.
            </div>
          )}

          {/* End session */}
          <Button
            onClick={() => endSession.mutate({ sessionId })}
            disabled={endSession.isPending}
            className="w-full h-12 bg-red-600 hover:bg-red-700 text-white gap-2 mt-2"
            variant="destructive"
          >
            {endSession.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
            End Session
          </Button>
        </div>
      )}

      {/* ── Step 4: Complete ─────────────────────────────────────────────── */}
      {step === "complete" && session && (
        <div className="space-y-4">
          <div className="flex flex-col items-center py-8 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Session Complete!</h2>
            <p className="text-muted-foreground text-sm">
              Pick ticket <span className="font-mono font-semibold text-foreground">{session.pickTicket}</span> has been recorded.
            </p>
          </div>

          {/* Summary */}
          <div className="bg-muted rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Associate</span>
              <span className="font-semibold">{session.associateName || session.associateId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Duration</span>
              <span className="font-semibold font-mono">{formatDuration(session.durationSeconds ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pallets</span>
              <span className="font-semibold">{session.totalPallets}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cases</span>
              <span className="font-semibold">{session.totalCases}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Items</span>
              <span className="font-bold text-[#15527f]">{session.totalItems}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">OpFi</span>
              <span className={`font-semibold text-xs ${session.opfiPushed ? "text-green-600" : "text-amber-600"}`}>
                {session.opfiPushed ? "Sent ✓" : "Pending"}
              </span>
            </div>
          </div>

          <Button onClick={handleReset} className="w-full h-12 bg-[#15527f] hover:bg-[#1a6699] text-white gap-2">
            <ScanBarcode className="h-4 w-4" />
            Start New Session
          </Button>
        </div>
      )}
    </div>
  );
}

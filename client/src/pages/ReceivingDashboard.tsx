import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Inbox,
  RefreshCw,
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  PackageOpen,
  X,
  ChevronDown,
  ChevronUp,
  Warehouse,
  PlayCircle,
  Loader2,
  ArrowRight,
  ClipboardCheck,
  Package,
  Layers,
} from "lucide-react";
import { toast } from "sonner";

// ─── Status helpers ────────────────────────────────────────────────────────

const STATUS_MAP: Record<number, { label: string; color: string; icon: React.ElementType }> = {
  0: { label: "Expected",    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",   icon: Clock },
  1: { label: "In Progress", color: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: PackageOpen },
  2: { label: "Completed",   color: "bg-green-500/10 text-green-400 border-green-500/20", icon: CheckCircle2 },
};

function StatusBadge({ status }: { status: number }) {
  const s = STATUS_MAP[status] ?? {
    label: `Status ${status}`,
    color: "bg-muted text-muted-foreground border-border",
    icon: Clock,
  };
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border", s.color)}>
      <Icon className="h-3 w-3" />
      {s.label}
    </span>
  );
}

function fmt(d?: string) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString(); } catch { return d; }
}

function daysSince(dateStr?: string): number | null {
  if (!dateStr) return null;
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    return Math.floor(diff / 86_400_000);
  } catch { return null; }
}

function AgingBadge({ days }: { days: number }) {
  const color =
    days === 0
      ? "bg-green-500/10 text-green-400 border-green-500/20"
      : days <= 2
      ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
      : days <= 4
      ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
      : "bg-red-500/10 text-red-400 border-red-500/20";
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border", color)}>
      {days === 0 ? "Today" : `${days}d`}
    </span>
  );
}

// ─── Types ─────────────────────────────────────────────────────────────────

type Receiver = {
  readOnly: {
    transactionId: number;
    status: number;
    customerIdentifier: { id: number; name: string };
    facilityIdentifier: { id: number; name: string };
    creationDate: string;
    closedDate?: string;
  };
  referenceNum?: string;
  poNum?: string;
  expectedDate?: string;
  notes?: string;
  trackingNumber?: string;
  receiveItems?: Array<{
    receiverItemId: number;
    itemIdentifier: { sku: string; id: number };
    description?: string;
    expectedQty: number;
    receivedQty: number;
    lotNumber?: string;
    expirationDate?: string;
  }>;
};

// ─── Pallet Capture Sheet (embedded in Receiving Dashboard) ─────────────────

type PalletCaptureStep = "capture" | "complete" | "done";

function PalletCaptureSheet({
  open,
  onClose,
  transactionId,
  facilityId,
  facilityName,
  customerId,
  customerName,
  poNum,
  referenceNum,
}: {
  open: boolean;
  onClose: () => void;
  transactionId: number;
  facilityId: number;
  facilityName: string;
  customerId: number;
  customerName: string;
  poNum?: string;
  referenceNum?: string;
}) {
  const utils = trpc.useUtils();
  const [step, setStep] = useState<PalletCaptureStep>("capture");
  const [sessionId, setSessionId] = useState<number | null>(null);

  const { data: sessionData, refetch: refetchSession } = trpc.palletCapture.getSession.useQuery(
    { sessionId: sessionId! },
    { enabled: sessionId != null }
  );

  const startSession = trpc.palletCapture.startSession.useMutation({
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setStep("capture");
      if (data.resumed) {
        toast.info("Resumed existing open session for this transaction.");
      }
    },
    onError: (err) => {
      toast.error("Failed to start session", { description: err.message });
    },
  });

  const session = sessionData?.session;

  // Auto-start session when sheet opens
  const [autoStarted, setAutoStarted] = useState(false);
  if (open && !autoStarted && !startSession.isPending && sessionId == null) {
    setAutoStarted(true);
    startSession.mutate({ transactionId, facilityId, facilityName, customerId, customerName, poNum, referenceNum });
  }
  if (!open && autoStarted) {
    setAutoStarted(false);
    setSessionId(null);
    setStep("capture");
  }

  function handleClose() {
    utils.palletCapture.listSessions.invalidate();
    onClose();
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="flex items-center gap-2 text-base">
                <Layers className="h-5 w-5 text-muted-foreground" />
                Pallet Capture
              </SheetTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {referenceNum ? `Receipt — ${referenceNum}` : `TX #${transactionId}`}
                {" · "}{facilityName || `Facility ${facilityId}`}
              </p>
            </div>
            {sessionId && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                Session #{sessionId}
              </span>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Loading state while auto-starting */}
          {(startSession.isPending || (sessionId == null && step === "capture")) && (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Starting pallet session…
            </div>
          )}

          {/* Step indicator */}
          {session && step !== "done" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
              {(["capture", "complete"] as PalletCaptureStep[]).map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  {i > 0 && <div className="h-px w-6 bg-border" />}
                  <span className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded-full font-medium",
                    step === s ? "bg-primary/10 text-primary" :
                    ["capture", "complete"].indexOf(step) > i ? "text-green-400" : "text-muted-foreground"
                  )}>
                    {["capture", "complete"].indexOf(step) > i && <CheckCircle2 className="h-3 w-3" />}
                    {s === "capture" && "Capture Pallets"}
                    {s === "complete" && "Complete"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Inline pallet type buttons (capture step) */}
          {step === "capture" && sessionId != null && session && (
            <InlinePalletCapture
              sessionId={sessionId}
              session={{
                totalPallets: session.totalPallets,
                standardPallets: session.standardPallets,
                oversizePallets: session.oversizePallets,
                otherPallets: session.otherPallets,
                transactionId: session.transactionId,
                poNum: session.poNum,
                referenceNum: session.referenceNum,
                customerName: session.customerName,
                facilityName: session.facilityName,
              }}
              onRefresh={() => refetchSession()}
              onComplete={() => setStep("complete")}
            />
          )}

          {/* Complete step */}
          {step === "complete" && sessionId != null && session && (
            <InlineCompleteSession
              sessionId={sessionId}
              session={{
                totalPallets: session.totalPallets,
                standardPallets: session.standardPallets,
                oversizePallets: session.oversizePallets,
                otherPallets: session.otherPallets,
                transactionId: session.transactionId,
                poNum: session.poNum,
                customerName: session.customerName,
                facilityName: session.facilityName,
              }}
              onDone={() => { refetchSession(); setStep("done"); }}
              onBack={() => setStep("capture")}
            />
          )}

          {/* Done step */}
          {step === "done" && session && (
            <div className="max-w-lg mx-auto text-center space-y-6 py-4">
              <div className="space-y-2">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-2">
                  <CheckCircle2 className="h-8 w-8 text-green-400" />
                </div>
                <h2 className="text-2xl font-bold">Session Complete</h2>
                <p className="text-muted-foreground">
                  {session.totalPallets} pallet{session.totalPallets !== 1 ? "s" : ""} captured for TX #{session.transactionId}.
                </p>
              </div>
              <Button className="w-full" onClick={handleClose}>
                Close &amp; Return to Receipt
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Inline Pallet Capture (used inside PalletCaptureSheet) ──────────────────

type PalletType = "standard" | "oversize" | "other";

const PALLET_TYPE_OPTIONS = [
  { type: "standard" as PalletType, label: "Standard",  description: '48" × 40" GMA pallet',              color: "text-blue-400",   bg: "bg-blue-500/10 hover:bg-blue-500/20",     border: "border-blue-500/30 hover:border-blue-500/60" },
  { type: "oversize" as PalletType, label: "Oversize",  description: "Larger than standard dimensions",    color: "text-amber-400",  bg: "bg-amber-500/10 hover:bg-amber-500/20",   border: "border-amber-500/30 hover:border-amber-500/60" },
  { type: "other"    as PalletType, label: "Other",     description: "Slip sheet, floor load, non-standard", color: "text-purple-400", bg: "bg-purple-500/10 hover:bg-purple-500/20", border: "border-purple-500/30 hover:border-purple-500/60" },
];

function InlinePalletCapture({
  sessionId, session, onRefresh, onComplete,
}: {
  sessionId: number;
  session: { totalPallets: number; standardPallets: number; oversizePallets: number; otherPallets: number; transactionId: number; poNum?: string | null; referenceNum?: string | null; customerName: string; facilityName: string };
  onRefresh: () => void;
  onComplete: () => void;
}) {
  const [otherDescription, setOtherDescription] = useState("");
  const [otherNotes, setOtherNotes] = useState("");
  const [showOtherDialog, setShowOtherDialog] = useState(false);
  const [lastAdded, setLastAdded] = useState<PalletType | null>(null);

  const addPallet = trpc.palletCapture.addPallet.useMutation({
    onSuccess: (data) => {
      onRefresh();
      const num = data.session?.totalPallets ?? session.totalPallets + 1;
      toast.success(`Pallet #${num} captured`, { description: lastAdded ? `Type: ${lastAdded.charAt(0).toUpperCase() + lastAdded.slice(1)}` : undefined, duration: 2000 });
    },
    onError: (err) => toast.error("Failed to add pallet", { description: err.message }),
  });

  const undoPallet = trpc.palletCapture.undoLastPallet.useMutation({
    onSuccess: (data) => { if (data.removed) { onRefresh(); toast.info("Last pallet removed"); } else { toast.warning("Nothing to undo"); } },
    onError: (err) => toast.error("Undo failed", { description: err.message }),
  });

  function handleAdd(type: PalletType, description?: string, notes?: string) {
    setLastAdded(type);
    addPallet.mutate({ sessionId, palletType: type, description, notes });
  }

  return (
    <div className="space-y-5">
      {/* Count bar */}
      <div className="flex items-center gap-4 flex-wrap text-sm">
        <span className="font-semibold">{session.totalPallets} pallet{session.totalPallets !== 1 ? "s" : ""} captured</span>
        <span className="text-blue-400">{session.standardPallets} standard</span>
        <span className="text-amber-400">{session.oversizePallets} oversize</span>
        <span className="text-purple-400">{session.otherPallets} other</span>
      </div>

      {/* Pallet type buttons */}
      <div className="grid grid-cols-3 gap-3">
        {PALLET_TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.type}
            disabled={addPallet.isPending}
            onClick={() => {
              if (opt.type === "other") { setShowOtherDialog(true); }
              else { handleAdd(opt.type); }
            }}
            className={cn(
              "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer disabled:opacity-50",
              opt.bg, opt.border
            )}
          >
            <Package className={cn("h-7 w-7", opt.color)} />
            <span className={cn("text-sm font-semibold", opt.color)}>{opt.label}</span>
            <span className="text-[10px] text-muted-foreground text-center leading-tight">{opt.description}</span>
          </button>
        ))}
      </div>

      {/* Undo + Complete row */}
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1 gap-1.5" disabled={undoPallet.isPending || session.totalPallets === 0} onClick={() => undoPallet.mutate({ sessionId })}>
          {undoPallet.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          Undo Last
        </Button>
        <Button className="flex-1 gap-1.5" onClick={onComplete}>
          <CheckCircle2 className="h-4 w-4" />
          Complete Session
        </Button>
      </div>

      {/* Other pallet dialog */}
      {showOtherDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowOtherDialog(false)}>
          <div className="bg-card rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-base">Other Pallet Type</h3>
            <p className="text-sm text-muted-foreground">Describe the non-standard pallet type.</p>
            <div className="space-y-2">
              <label className="text-xs font-medium">Description <span className="text-destructive">*</span></label>
              <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="e.g. Slip sheet" value={otherDescription} onChange={(e) => setOtherDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Notes (optional)</label>
              <textarea className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none" rows={2} placeholder="Any additional notes…" value={otherNotes} onChange={(e) => setOtherNotes(e.target.value)} />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowOtherDialog(false)}>Cancel</Button>
              <Button className="flex-1" disabled={!otherDescription.trim()} onClick={() => { handleAdd("other", otherDescription, otherNotes || undefined); setOtherDescription(""); setOtherNotes(""); setShowOtherDialog(false); }}>Add Pallet</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InlineCompleteSession({
  sessionId, session, onDone, onBack,
}: {
  sessionId: number;
  session: { totalPallets: number; standardPallets: number; oversizePallets: number; otherPallets: number; transactionId: number; poNum?: string | null; customerName: string; facilityName: string };
  onDone: () => void;
  onBack: () => void;
}) {
  const [hasNonConforming, setHasNonConforming] = useState(false);
  const [hours, setHours] = useState("");
  const [reason, setReason] = useState("");

  const completeSession = trpc.palletCapture.completeSession.useMutation({
    onSuccess: () => { toast.success("Session completed", { description: "Pallet data saved and queued for OpFi." }); onDone(); },
    onError: (err) => toast.error("Failed to complete session", { description: err.message }),
  });

  const canComplete = !hasNonConforming || (hours.trim() !== "" && parseFloat(hours) > 0 && reason.trim() !== "");

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-3 text-center">
        {[
          { label: "Total",    value: session.totalPallets,    color: "text-foreground" },
          { label: "Standard", value: session.standardPallets, color: "text-blue-400" },
          { label: "Oversize", value: session.oversizePallets, color: "text-amber-400" },
          { label: "Other",    value: session.otherPallets,    color: "text-purple-400" },
        ].map((s) => (
          <div key={s.label} className="bg-muted/40 rounded-xl p-3">
            <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Non-conforming hours */}
      <div className="bg-muted/30 rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium">Non-conforming hours required?</p>
        <div className="flex gap-2">
          <Button size="sm" variant={hasNonConforming ? "default" : "outline"} onClick={() => setHasNonConforming(true)}>Yes</Button>
          <Button size="sm" variant={!hasNonConforming ? "default" : "outline"} onClick={() => { setHasNonConforming(false); setHours(""); setReason(""); }}>No</Button>
        </div>
        {hasNonConforming && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Hours <span className="text-destructive">*</span></label>
              <input type="number" min="0.5" max="24" step="0.5" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="e.g. 2.5" value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Reason <span className="text-destructive">*</span></label>
              <textarea rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none" placeholder="Explain why non-conforming hours were needed…" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          <ChevronDown className="h-4 w-4 mr-1.5 rotate-90" /> Back
        </Button>
        <Button className="flex-1" disabled={!canComplete || completeSession.isPending} onClick={() => completeSession.mutate({ sessionId, nonConformingHours: hasNonConforming ? parseFloat(hours) : null, nonConformingReason: hasNonConforming ? reason : null })}>
          {completeSession.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
          Complete &amp; Push to OpFi
        </Button>
      </div>
    </div>
  );
}

// ─── Detail Slide-over ────────────────────────────────────────────────────

function ReceiverDetailSheet({
  configId,
  receiver,
  onClose,
  onStarted,
}: {
  configId: number;
  receiver: Receiver | null;
  onClose: () => void;
  onStarted?: () => void;
}) {
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const [palletCaptureOpen, setPalletCaptureOpen] = useState(false);

  const { data, isLoading } = trpc.receiving.detail.useQuery(
    { configId, transactionId: receiver?.readOnly.transactionId ?? 0 },
    { enabled: receiver !== null }
  );

  const startReceiptMutation = trpc.receiving.startReceipt.useMutation({
    onSuccess: () => {
      toast.success(
        `Receipt ${receiver?.referenceNum ?? receiver?.readOnly.transactionId} started`,
        { description: "Status updated to In Progress in Extensiv." }
      );
      // Invalidate the receiving list and detail so the dashboard refreshes
      void utils.receiving.list.invalidate();
      void utils.receiving.detail.invalidate();
      void utils.receiving.kpis.invalidate();
      onStarted?.();
      onClose();
    },
    onError: (err) => {
      toast.error("Failed to start receipt", { description: err.message });
    },
  });

  const detail = data ?? receiver;
  const isOpen = receiver !== null;

  function handleStartReceipt() {
    if (!receiver) return;
    startReceiptMutation.mutate({
      configId,
      transactionId: receiver.readOnly.transactionId,
    });
  }

  const completeReceiptMutation = trpc.receiving.completeReceipt.useMutation({
    onSuccess: () => {
      toast.success(
        `Receipt ${receiver?.referenceNum ?? receiver?.readOnly.transactionId} completed`,
        { description: "Status updated to Closed/Complete in Extensiv." }
      );
      void utils.receiving.list.invalidate();
      void utils.receiving.detail.invalidate();
      void utils.receiving.kpis.invalidate();
      onStarted?.();
      onClose();
    },
    onError: (err) => {
      toast.error("Failed to complete receipt", { description: err.message });
    },
  });

  const starting = startReceiptMutation.isPending;
  const completing = completeReceiptMutation.isPending;

  function handleCompleteReceipt() {
    if (!receiver) return;
    completeReceiptMutation.mutate({
      configId,
      transactionId: receiver.readOnly.transactionId,
    });
  }

  const canStart = detail?.readOnly.status === 0; // Expected → can start
  const isInProgress = detail?.readOnly.status === 1; // In Progress → can complete
  const canComplete = isInProgress;

  // Fetch pallet session count for this specific transaction
  const txId = receiver?.readOnly.transactionId ?? 0;
  const { data: palletCountsMap } = trpc.palletCapture.batchSessionCounts.useQuery(
    { transactionIds: [txId] },
    { enabled: txId > 0, staleTime: 15_000, refetchInterval: 30_000 }
  );
  const palletInfo = txId > 0 ? palletCountsMap?.[txId] : undefined;
  const canPutAway = detail?.readOnly.status === 0 || detail?.readOnly.status === 1;
  const canConfirmItems = isInProgress; // Confirm items only when In Progress
  const canPalletCapture = detail?.readOnly.status === 0 || detail?.readOnly.status === 1;

  function handleConfirmItems() {
    if (!receiver || !detail) return;
    const p = new URLSearchParams({
      configId: String(configId),
      transactionId: String(detail.readOnly.transactionId),
      referenceNum: detail.referenceNum ?? "",
      facilityName: detail.readOnly.facilityIdentifier.name ?? "",
      facilityCode: String(detail.readOnly.facilityIdentifier.id),
    });
    onClose();
    navigate(`/receiving/confirm?${p.toString()}`);
  }

  function handlePutAway() {
    if (!receiver || !detail) return;
    const params = new URLSearchParams({
      configId: String(configId),
      facilityId: String(detail.readOnly.facilityIdentifier.id),
      customerId: String(detail.readOnly.customerIdentifier.id),
      transactionId: String(detail.readOnly.transactionId),
      referenceNum: detail.referenceNum ?? "",
    });
    onClose();
    navigate(`/receiving/put-away?${params.toString()}`);
  }

  return (
    <>
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto flex flex-col gap-0 p-0">
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="flex items-center gap-2 text-base">
                <PackageOpen className="h-5 w-5 text-muted-foreground" />
                {detail?.referenceNum
                  ? `Receipt — ${detail.referenceNum}`
                  : `Receipt #${detail?.readOnly.transactionId ?? "…"}`}
              </SheetTitle>
              {detail && (
                <p className="text-sm text-muted-foreground mt-1">
                  {detail.readOnly.customerIdentifier.name} &nbsp;·&nbsp; {detail.readOnly.facilityIdentifier.name}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {palletInfo && palletInfo.totalPallets > 0 && (
                <span className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border",
                  palletInfo.status === "completed"
                    ? "bg-green-500/10 text-green-400 border-green-500/20"
                    : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                )}>
                  <Layers className="h-3 w-3" />
                  {palletInfo.totalPallets} pallet{palletInfo.totalPallets !== 1 ? "s" : ""}
                  {palletInfo.status === "completed" && <span className="ml-0.5 opacity-70">✓</span>}
                </span>
              )}
              {detail && <StatusBadge status={detail.readOnly.status} />}
            </div>
          </div>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {isLoading && !detail && (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading details…
            </div>
          )}

          {detail && (
            <>
              {/* Discrepancy summary banner */}
              {(() => {
                const discrepantItems = (detail.receiveItems ?? []).filter(
                  (i) => i.expectedQty > 0 && i.receivedQty !== i.expectedQty
                );
                return discrepantItems.length > 0 ? (
                  <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/10">
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-semibold text-red-400">
                        {discrepantItems.length} quantity discrepanc{discrepantItems.length === 1 ? "y" : "ies"} detected
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {discrepantItems.map((i) => i.itemIdentifier.sku).join(", ")}
                      </p>
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Meta grid */}
              <div className="grid grid-cols-2 gap-2.5 text-sm">
                {[
                  ["Transaction ID", String(detail.readOnly.transactionId)],
                  ["PO #", detail.poNum || "—"],
                  ["Reference #", detail.referenceNum || "—"],
                  ["Tracking #", detail.trackingNumber || "—"],
                  ["Expected Date", fmt(detail.expectedDate)],
                  ["Created", fmt(detail.readOnly.creationDate)],
                ].map(([label, val]) => (
                  <div key={label} className="bg-muted/40 rounded-xl p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
                    <p className="font-medium text-foreground text-sm">{val}</p>
                  </div>
                ))}
              </div>

              {/* Notes */}
              {detail.notes && (
                <div className="bg-muted/40 rounded-xl p-3 text-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Notes</p>
                  <p className="text-foreground">{detail.notes}</p>
                </div>
              )}

              {/* Line items */}
              <div>
                <p className="text-sm font-semibold text-foreground mb-2">
                  Line Items
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    ({(detail.receiveItems ?? []).length} SKUs)
                  </span>
                </p>
                {(detail.receiveItems ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No line items — click Start Receipt to load them from Extensiv.
                  </p>
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>SKU</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Expected</TableHead>
                          <TableHead className="text-right">Received</TableHead>
                          <TableHead className="text-right">Variance</TableHead>
                          <TableHead>Lot</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(detail.receiveItems ?? []).map((item) => {
                          const variance = item.receivedQty - item.expectedQty;
                          const isDiscrepant = item.expectedQty > 0 && item.receivedQty !== item.expectedQty;
                          return (
                            <TableRow key={item.receiverItemId} className={isDiscrepant ? "bg-red-500/5 border-l-2 border-l-red-500/50" : ""}>
                              <TableCell className="font-mono text-xs">{item.itemIdentifier.sku}</TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">
                                {item.description || "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{item.expectedQty}</TableCell>
                              <TableCell className="text-right tabular-nums">{item.receivedQty}</TableCell>
                              <TableCell className={cn(
                                "text-right tabular-nums font-semibold",
                                variance === 0 ? "text-muted-foreground" :
                                variance > 0 ? "text-blue-400" : "text-red-400"
                              )}>
                                {variance > 0 ? `+${variance}` : variance === 0 ? "—" : variance}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{item.lotNumber || "—"}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer — action buttons */}
        {detail && (canStart || canComplete || canPutAway || canConfirmItems || canPalletCapture) && (
          <div className="px-6 py-4 border-t border-border bg-card space-y-2">
            {canStart && (
              <Button
                className="w-full gap-2 h-10 text-sm font-semibold"
                onClick={handleStartReceipt}
                disabled={starting}
              >
                {starting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PlayCircle className="h-4 w-4" />
                )}
                {starting ? "Starting Receipt…" : "Start Receipt"}
              </Button>
            )}
            {canConfirmItems && (
              <Button
                className="w-full gap-2 h-10 text-sm font-semibold"
                onClick={handleConfirmItems}
              >
                <ClipboardCheck className="h-4 w-4" />
                Confirm Items &amp; Generate MUs
              </Button>
            )}
            {canComplete && (
              <Button
                className="w-full gap-2 h-10 text-sm font-semibold bg-green-600 hover:bg-green-700 text-white"
                onClick={handleCompleteReceipt}
                disabled={completing}
              >
                {completing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {completing ? "Completing Receipt…" : "Complete Receipt"}
              </Button>
            )}
            {canPutAway && (
              <Button
                variant="outline"
                className="w-full gap-2 h-10 text-sm font-semibold bg-primary/5 border-primary/30 text-primary hover:bg-primary/10"
                onClick={handlePutAway}
              >
                <ArrowRight className="h-4 w-4" />
                Put Away Items
              </Button>
            )}
            {canPalletCapture && (
              <Button
                variant="outline"
                className="w-full gap-2 h-10 text-sm font-semibold"
                onClick={() => setPalletCaptureOpen(true)}
              >
                <Layers className="h-4 w-4" />
                Pallet Capture
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>

    {/* Pallet Capture Sheet — opens on top of the detail sheet */}
    {detail && (
      <PalletCaptureSheet
        open={palletCaptureOpen}
        onClose={() => setPalletCaptureOpen(false)}
        transactionId={detail.readOnly.transactionId}
        facilityId={detail.readOnly.facilityIdentifier.id}
        facilityName={detail.readOnly.facilityIdentifier.name ?? ""}
        customerId={detail.readOnly.customerIdentifier.id}
        customerName={detail.readOnly.customerIdentifier.name ?? ""}
        poNum={detail.poNum ?? undefined}
        referenceNum={detail.referenceNum ?? undefined}
      />
    )}
    </>
  );
}

// ─── Client Group (inside a warehouse) ──────────────────────────────────────

function ClientGroup({
  clientName,
  clientId,
  facilityId,
  receivers,
  onSelect,
  palletCounts,
}: {
  clientName: string;
  clientId: number;
  facilityId: number;
  receivers: Receiver[];
  onSelect: (r: Receiver) => void;
  palletCounts?: Record<number, { totalPallets: number; status: string }>;
}) {
  const storageKey = `receiving-client-expanded-${facilityId}-${clientId}`;
  const [expanded, setExpandedRaw] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored !== null ? JSON.parse(stored) : true; // default open
    } catch { return true; }
  });
  function setExpanded(v: boolean | ((prev: boolean) => boolean)) {
    setExpandedRaw((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const openCount = receivers.filter((r) => r.readOnly.status !== 2).length;
  const inProgressCount = receivers.filter((r) => r.readOnly.status === 1).length;

  return (
    <div className="border-b border-border/60 last:border-b-0">
      {/* Client header row */}
      <button
        className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-muted/20 transition-colors text-left bg-muted/10"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-foreground">{clientName}</span>
          <span className="text-[10px] text-muted-foreground">
            {openCount} receipt{openCount !== 1 ? "s" : ""}
            {inProgressCount > 0 && (
              <span className="ml-1.5 text-amber-400">{inProgressCount} in progress</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge className="bg-muted text-muted-foreground border-border text-[10px] tabular-nums h-4 px-1.5">
            {openCount}
          </Badge>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Receipt rows — sorted oldest first */}
      {expanded && (
        <div className="divide-y divide-border/40">
          {[...receivers]
            .sort((a, b) => {
              const da = a.readOnly.creationDate ? new Date(a.readOnly.creationDate).getTime() : 0;
              const db = b.readOnly.creationDate ? new Date(b.readOnly.creationDate).getTime() : 0;
              return da - db; // ascending = oldest first
            })
            .map((r) => {
            const skuCount = (r.receiveItems ?? []).length;
            const discrepancyCount = (r.receiveItems ?? []).filter(
              (i) => i.expectedQty > 0 && i.receivedQty !== i.expectedQty
            ).length;
            const hasDiscrepancy = discrepancyCount > 0;
            return (
              <button
                key={r.readOnly.transactionId}
                className="w-full flex items-center gap-4 px-6 py-3 hover:bg-muted/30 transition-colors text-left group"
                onClick={() => onSelect(r)}
              >
                {/* Status dot */}
                <div className={cn(
                  "h-2 w-2 rounded-full shrink-0 mt-0.5",
                  r.readOnly.status === 0 ? "bg-blue-400" :
                  r.readOnly.status === 1 ? "bg-amber-400" : "bg-green-400"
                )} />

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-foreground">
                      {r.referenceNum || `Txn #${r.readOnly.transactionId}`}
                    </span>
                    {r.poNum && (
                      <span className="text-xs text-muted-foreground">PO: {r.poNum}</span>
                    )}
                    {hasDiscrepancy && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {discrepancyCount} discrepanc{discrepancyCount === 1 ? "y" : "ies"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                    {r.readOnly.creationDate && (() => {
                      const d = daysSince(r.readOnly.creationDate);
                      return (
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-2.5 w-2.5" />
                          Set up {fmt(r.readOnly.creationDate)}
                          {d !== null && <AgingBadge days={d} />}
                        </span>
                      );
                    })()}
                    {r.expectedDate && <span>Expected {fmt(r.expectedDate)}</span>}
                    {skuCount > 0 && <span>{skuCount} SKU{skuCount !== 1 ? "s" : ""}</span>}
                  </div>
                </div>

                {/* Status + pallet badge + arrow */}
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={r.readOnly.status} />
                  {(() => {
                    const pc = palletCounts?.[r.readOnly.transactionId];
                    if (!pc || pc.totalPallets === 0) return null;
                    return (
                      <span className={cn(
                        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border",
                        pc.status === "completed"
                          ? "bg-green-500/10 text-green-400 border-green-500/20"
                          : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                      )}>
                        <Layers className="h-2.5 w-2.5" />
                        {pc.totalPallets} pallet{pc.totalPallets !== 1 ? "s" : ""}
                      </span>
                    );
                  })()}
                  <span className="text-muted-foreground group-hover:text-foreground transition-colors text-xs">View →</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Warehouse Card ────────────────────────────────────────────────────────

function WarehouseCard({
  facilityName,
  facilityId,
  receivers,
  onSelect,
  palletCounts,
}: {
  facilityName: string;
  facilityId: number;
  receivers: Receiver[];
  onSelect: (r: Receiver) => void;
  palletCounts?: Record<number, { totalPallets: number; status: string }>;
}) {
  // Persist expanded state per facility in localStorage
  const storageKey = `receiving-warehouse-expanded-${facilityId}`;
  const [expanded, setExpandedRaw] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored !== null ? JSON.parse(stored) : false;
    } catch { return false; }
  });
  function setExpanded(v: boolean | ((prev: boolean) => boolean)) {
    setExpandedRaw((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
      return next;
    });
  }
  const [search, setSearch] = useState("");

  const openCount = receivers.filter((r) => r.readOnly.status !== 2).length;
  const inProgressCount = receivers.filter((r) => r.readOnly.status === 1).length;

  // Group by client
  const clientGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? receivers.filter(
          (r) =>
            (r.referenceNum ?? "").toLowerCase().includes(q) ||
            (r.poNum ?? "").toLowerCase().includes(q) ||
            r.readOnly.customerIdentifier.name.toLowerCase().includes(q) ||
            String(r.readOnly.transactionId).includes(q)
        )
      : receivers;
    const map = new Map<number, { clientId: number; clientName: string; receivers: Receiver[] }>();
    for (const r of list) {
      const cid = r.readOnly.customerIdentifier.id;
      if (!map.has(cid)) {
        map.set(cid, {
          clientId: cid,
          clientName: r.readOnly.customerIdentifier.name || `Client ${cid}`,
          receivers: [],
        });
      }
      map.get(cid)!.receivers.push(r);
    }
    return Array.from(map.values()).sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [receivers, search]);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Warehouse header */}
      <button
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="rounded-xl bg-primary/10 p-2 shrink-0">
          <Warehouse className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm">{facilityName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {openCount} open receipt{openCount !== 1 ? "s" : ""}
            {inProgressCount > 0 && (
              <span className="ml-2 text-amber-400">{inProgressCount} in progress</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {openCount > 0 && (
            <Badge className="bg-primary/15 text-primary border-primary/30 text-xs tabular-nums">
              {openCount}
            </Badge>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Client groups */}
      {expanded && (
        <div className="border-t border-border">
          {/* Search within warehouse */}
          {receivers.length > 5 && (
            <div className="px-4 py-2.5 border-b border-border/60">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  className="pl-7 h-7 text-xs"
                  placeholder="Search receipts…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {clientGroups.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              No receipts match your search.
            </div>
          ) : (
            <div>
              {clientGroups.map((cg) => (
                <ClientGroup
                  key={cg.clientId}
                  clientName={cg.clientName}
                  clientId={cg.clientId}
                  facilityId={facilityId}
                  receivers={cg.receivers}
                  onSelect={onSelect}
                  palletCounts={palletCounts}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}



// ─── Main Page ─────────────────────────────────────────────────────────────

function isoDateDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

export default function ReceivingDashboard() {
  const { data: configs } = trpc.config.list.useQuery();
  const [configId, setConfigId] = useState<number | null>(null);
  const activeConfigId = configId ?? (configs?.[0]?.id ?? null);

  // Load all open receipts (status 0 + 1) from the last 30 days
  const createdAfter = isoDateDaysAgo(30);

  const { data: listData, isLoading, refetch } = trpc.receiving.list.useQuery(
    { configId: activeConfigId!, createdAfter, pgsiz: 500, pgnum: 1 },
    { enabled: activeConfigId !== null, staleTime: 60_000 }
  );

  const [selectedReceiver, setSelectedReceiver] = useState<Receiver | null>(null);
  const [globalSearch, setGlobalSearch] = useState("");

  const allReceivers: Receiver[] = (listData?.receivers ?? []) as Receiver[];

  // Filter to open receipts only (Expected + In Progress) unless search is active
  const displayReceivers = useMemo(() => {
    let list = allReceivers;
    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase();
      list = list.filter(
        (r) =>
          (r.referenceNum ?? "").toLowerCase().includes(q) ||
          (r.poNum ?? "").toLowerCase().includes(q) ||
          r.readOnly.customerIdentifier.name.toLowerCase().includes(q) ||
          r.readOnly.facilityIdentifier.name.toLowerCase().includes(q) ||
          String(r.readOnly.transactionId).includes(q)
      );
    } else {
      // Default: show open receipts only (status 0 = Expected, 1 = In Progress)
      list = list.filter((r) => r.readOnly.status !== 2);
    }
    return list;
  }, [allReceivers, globalSearch]);

  // Group by warehouse (facilityIdentifier)
  const warehouseGroups = useMemo(() => {
    const map = new Map<string, { facilityId: number; facilityName: string; receivers: Receiver[] }>();
    for (const r of displayReceivers) {
      const key = String(r.readOnly.facilityIdentifier.id);
      if (!map.has(key)) {
        map.set(key, {
          facilityId: r.readOnly.facilityIdentifier.id,
          facilityName: r.readOnly.facilityIdentifier.name || `Facility ${r.readOnly.facilityIdentifier.id}`,
          receivers: [],
        });
      }
      map.get(key)!.receivers.push(r);
    }
    // Sort warehouses alphabetically
    return Array.from(map.values()).sort((a, b) =>
      a.facilityName.localeCompare(b.facilityName)
    );
  }, [displayReceivers]);

  // Batch-fetch pallet session counts for all visible receipts
  const allTransactionIds = useMemo(
    () => allReceivers.map((r) => r.readOnly.transactionId),
    [allReceivers]
  );
  const { data: palletCountsRaw } = trpc.palletCapture.batchSessionCounts.useQuery(
    { transactionIds: allTransactionIds },
    { enabled: allTransactionIds.length > 0, staleTime: 30_000, refetchInterval: 60_000 }
  );
  const palletCounts: Record<number, { totalPallets: number; status: string }> = palletCountsRaw ?? {};

  // KPI summary from all open receipts
  const openCount = allReceivers.filter((r) => r.readOnly.status === 0).length;
  const inProgressCount = allReceivers.filter((r) => r.readOnly.status === 1).length;
  const discrepancyCount = allReceivers.filter((r) =>
    (r.receiveItems ?? []).some((i) => i.expectedQty > 0 && i.receivedQty !== i.expectedQty)
  ).length;

  const noConfig = activeConfigId === null;

  return (
    <div className="p-5 space-y-5 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="page-breadcrumb">Receiving</p>
          <h1 className="page-title">Receiving Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Open receipts grouped by warehouse.</p>
        </div>
        <div className="flex items-center gap-2">
          {configs && configs.length > 1 && (
            <Select
              value={String(activeConfigId ?? "")}
              onValueChange={(v) => setConfigId(Number(v))}
            >
              <SelectTrigger className="w-44 h-9 text-sm">
                <SelectValue placeholder="Select config" />
              </SelectTrigger>
              <SelectContent>
                {configs.map((c: { id: number; name: string }) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {noConfig ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-24 text-center">
          <Inbox className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-base font-semibold text-foreground">No Extensiv connection configured</p>
          <p className="text-sm text-muted-foreground mt-1">Configure an Extensiv API connection in Settings first.</p>
        </div>
      ) : (
        <>
          {/* Summary strip */}
          {!isLoading && allReceivers.length > 0 && (
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <div className="flex items-center gap-1.5 text-blue-400">
                <Clock className="h-4 w-4" />
                <span className="font-semibold tabular-nums">{openCount}</span>
                <span className="text-muted-foreground">expected</span>
              </div>
              <div className="flex items-center gap-1.5 text-amber-400">
                <PackageOpen className="h-4 w-4" />
                <span className="font-semibold tabular-nums">{inProgressCount}</span>
                <span className="text-muted-foreground">in progress</span>
              </div>
              {discrepancyCount > 0 && (
                <div className="flex items-center gap-1.5 text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-semibold tabular-nums">{discrepancyCount}</span>
                  <span className="text-muted-foreground">with discrepancies</span>
                </div>
              )}
              <div className="ml-auto flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-8 h-8 text-xs w-56"
                    placeholder="Search all receipts…"
                    value={globalSearch}
                    onChange={(e) => setGlobalSearch(e.target.value)}
                  />
                  {globalSearch && (
                    <button
                      onClick={() => setGlobalSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading receipts…</span>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && warehouseGroups.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-20 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-400/40 mb-3" />
              <p className="text-sm font-medium text-foreground">
                {globalSearch ? "No receipts match your search." : "No open receipts"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {globalSearch ? "Try a different search term." : "All receipts are completed or none have been created yet."}
              </p>
            </div>
          )}

          {/* Warehouse groups */}
          {!isLoading && warehouseGroups.length > 0 && (
            <div className="space-y-4">
              {warehouseGroups.map((group) => (
                <WarehouseCard
                  key={group.facilityId}
                  facilityName={group.facilityName}
                  facilityId={group.facilityId}
                  receivers={group.receivers}
                  onSelect={setSelectedReceiver}
                  palletCounts={palletCounts}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Detail slide-over */}
      {activeConfigId !== null && (
        <ReceiverDetailSheet
          configId={activeConfigId}
          receiver={selectedReceiver}
          onClose={() => setSelectedReceiver(null)}
          onStarted={() => void refetch()}
        />
      )}

      {/* Pallet Session History */}
      <PalletSessionHistory />
    </div>
  );
}

// ─── Pallet Session History Panel ────────────────────────────────────────────
function PalletSessionHistory() {
  const { data: sessions, isLoading } = trpc.palletCapture.listSessions.useQuery(
    { facilityId: 0, limit: 20 },
    { refetchInterval: 60_000 }
  );

  if (isLoading) return null;
  if (!sessions || sessions.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Package className="h-4 w-4 text-muted-foreground" />
        Recent Pallet Sessions
      </h2>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Transaction ID</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Facility</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Pallets</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">OpFi Push</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Completed</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sessions.map((s) => (
              <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-2.5 font-mono text-xs text-foreground">{s.transactionId ?? "—"}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{s.facilityName ?? String(s.facilityId)}</td>
                <td className="px-4 py-2.5 text-right text-xs font-medium text-foreground">{s.totalPallets}</td>
                <td className="px-4 py-2.5">
                  <span className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium",
                    s.status === "completed" ? "bg-green-500/10 text-green-600" :
                    s.status === "open" ? "bg-blue-500/10 text-blue-600" :
                    "bg-muted text-muted-foreground"
                  )}>
                    {s.status === "completed" ? "Completed" : s.status === "open" ? "In Progress" : s.status}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium",
                    s.opfiPushStatus === "sent" ? "bg-green-500/10 text-green-600" :
                    s.opfiPushStatus === "failed" ? "bg-red-500/10 text-red-600" :
                    s.opfiPushStatus === "pending" ? "bg-amber-500/10 text-amber-600" :
                    "bg-muted text-muted-foreground"
                  )}>
                    {s.opfiPushStatus === "sent" ? "Sent" :
                     s.opfiPushStatus === "failed" ? "Failed" :
                     s.opfiPushStatus === "pending" ? "Pending" :
                     s.opfiPushStatus === "skipped" ? "Skipped" : "—"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  {s.completedAt ? new Date(s.completedAt).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{s.completedBy ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

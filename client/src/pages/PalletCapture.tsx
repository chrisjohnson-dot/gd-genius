import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Package,
  PackageOpen,
  Truck,
  CheckCircle2,
  Undo2,
  AlertTriangle,
  Clock,
  Loader2,
  ChevronLeft,
  ClipboardCheck,
  BarChart3,
  Info,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────────
type PalletType = "standard" | "oversize" | "other";

interface PalletTypeOption {
  type: PalletType;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
}

const PALLET_TYPES: PalletTypeOption[] = [
  {
    type: "standard",
    label: "Standard",
    description: "48\" × 40\" GMA pallet",
    icon: Package,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 hover:bg-blue-500/20",
    borderColor: "border-blue-500/30 hover:border-blue-500/60",
  },
  {
    type: "oversize",
    label: "Oversize",
    description: "Larger than standard dimensions",
    icon: Truck,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 hover:bg-amber-500/20",
    borderColor: "border-amber-500/30 hover:border-amber-500/60",
  },
  {
    type: "other",
    label: "Other",
    description: "Slip sheet, floor load, or non-standard",
    icon: PackageOpen,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10 hover:bg-purple-500/20",
    borderColor: "border-purple-500/30 hover:border-purple-500/60",
  },
];

// ─── Step: Start Session ────────────────────────────────────────────────────
function StartSessionStep({
  onStart,
}: {
  onStart: (params: {
    transactionId: number;
    facilityId: number;
    facilityName: string;
    customerId: number;
    customerName: string;
    poNum?: string;
    referenceNum?: string;
  }) => void;
}) {
  const [transactionId, setTransactionId] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [facilityName, setFacilityName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [poNum, setPoNum] = useState("");
  const [referenceNum, setReferenceNum] = useState("");

  // Fetch configs for facility/customer dropdowns
  const { data: configs } = trpc.config.list.useQuery();

  const canStart =
    transactionId.trim() !== "" &&
    facilityId.trim() !== "" &&
    customerId.trim() !== "";

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-2">
          <ClipboardCheck className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-xl font-semibold">Start Pallet Capture Session</h2>
        <p className="text-sm text-muted-foreground">
          Enter the receiving transaction details to begin capturing pallet information.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="txId">
              Transaction ID <span className="text-destructive">*</span>
            </Label>
            <Input
              id="txId"
              placeholder="e.g. 1234567"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="facilityId">
                Facility ID <span className="text-destructive">*</span>
              </Label>
              <Input
                id="facilityId"
                placeholder="Facility ID"
                value={facilityId}
                onChange={(e) => setFacilityId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="facilityName">Facility Name</Label>
              <Input
                id="facilityName"
                placeholder="e.g. Columbus"
                value={facilityName}
                onChange={(e) => setFacilityName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="customerId">
                Customer ID <span className="text-destructive">*</span>
              </Label>
              <Input
                id="customerId"
                placeholder="Customer ID"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerName">Customer Name</Label>
              <Input
                id="customerName"
                placeholder="e.g. Acme Corp"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="poNum">PO Number</Label>
              <Input
                id="poNum"
                placeholder="Optional"
                value={poNum}
                onChange={(e) => setPoNum(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="refNum">Reference Number</Label>
              <Input
                id="refNum"
                placeholder="Optional"
                value={referenceNum}
                onChange={(e) => setReferenceNum(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button
        className="w-full"
        size="lg"
        disabled={!canStart}
        onClick={() =>
          onStart({
            transactionId: parseInt(transactionId, 10),
            facilityId: parseInt(facilityId, 10),
            facilityName,
            customerId: parseInt(customerId, 10),
            customerName,
            poNum: poNum || undefined,
            referenceNum: referenceNum || undefined,
          })
        }
      >
        <ClipboardCheck className="h-4 w-4 mr-2" />
        Start Session
      </Button>
    </div>
  );
}

// ─── Pallet Counter Bar ─────────────────────────────────────────────────────
function PalletCountBar({
  total,
  standard,
  oversize,
  other,
}: {
  total: number;
  standard: number;
  oversize: number;
  other: number;
}) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-1.5">
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{total} pallet{total !== 1 ? "s" : ""} captured</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-400" />
          {standard} standard
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
          {oversize} oversize
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-purple-400" />
          {other} other
        </span>
      </div>
    </div>
  );
}

// ─── Step: Capture Pallets ──────────────────────────────────────────────────
function CapturePalletsStep({
  sessionId,
  session,
  onRefresh,
  onComplete,
}: {
  sessionId: number;
  session: {
    totalPallets: number;
    standardPallets: number;
    oversizePallets: number;
    otherPallets: number;
    transactionId: number;
    poNum?: string | null;
    referenceNum?: string | null;
    customerName: string;
    facilityName: string;
  };
  onRefresh: () => void;
  onComplete: () => void;
}) {
  const [otherDescription, setOtherDescription] = useState("");
  const [otherNotes, setOtherNotes] = useState("");
  const [showOtherDialog, setShowOtherDialog] = useState(false);
  const [lastAdded, setLastAdded] = useState<PalletType | null>(null);

  const utils = trpc.useUtils();

  const addPallet = trpc.palletCapture.addPallet.useMutation({
    onSuccess: (data) => {
      onRefresh();
      const type = lastAdded;
      const num = data.session?.totalPallets ?? session.totalPallets + 1;
      toast.success(`Pallet #${num} captured`, {
        description: type ? `Type: ${type.charAt(0).toUpperCase() + type.slice(1)}` : undefined,
        duration: 2000,
      });
    },
    onError: (err) => {
      toast.error("Failed to add pallet", { description: err.message });
    },
  });

  const undoPallet = trpc.palletCapture.undoLastPallet.useMutation({
    onSuccess: (data) => {
      if (data.removed) {
        onRefresh();
        toast.info("Last pallet removed");
      } else {
        toast.warning("Nothing to undo");
      }
    },
    onError: (err) => {
      toast.error("Undo failed", { description: err.message });
    },
  });

  const handleAddPallet = useCallback(
    (type: PalletType, description?: string, notes?: string) => {
      setLastAdded(type);
      addPallet.mutate({
        sessionId,
        palletType: type,
        description,
        notes,
      });
    },
    [sessionId, addPallet]
  );

  const handleOtherConfirm = () => {
    if (!otherDescription.trim()) {
      toast.warning("Please enter a description for the other pallet type");
      return;
    }
    handleAddPallet("other", otherDescription, otherNotes || undefined);
    setOtherDescription("");
    setOtherNotes("");
    setShowOtherDialog(false);
  };

  const isAdding = addPallet.isPending;
  const isUndoing = undoPallet.isPending;

  return (
    <div className="space-y-6">
      {/* Session header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">
            TX #{session.transactionId}
            {session.poNum && (
              <span className="text-muted-foreground font-normal ml-2 text-sm">
                PO: {session.poNum}
              </span>
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            {session.customerName}
            {session.facilityName && ` · ${session.facilityName}`}
          </p>
        </div>
        <PalletCountBar
          total={session.totalPallets}
          standard={session.standardPallets}
          oversize={session.oversizePallets}
          other={session.otherPallets}
        />
      </div>

      {/* Pallet type selection */}
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-3">
          Select pallet type to capture:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PALLET_TYPES.map((opt) => {
            const Icon = opt.icon;
            const isOther = opt.type === "other";
            return (
              <button
                key={opt.type}
                disabled={isAdding}
                onClick={() => {
                  if (isOther) {
                    setShowOtherDialog(true);
                  } else {
                    handleAddPallet(opt.type);
                  }
                }}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                  opt.bgColor,
                  opt.borderColor
                )}
              >
                {isAdding && lastAdded === opt.type ? (
                  <Loader2 className={cn("h-8 w-8 animate-spin", opt.color)} />
                ) : (
                  <Icon className={cn("h-8 w-8", opt.color)} />
                )}
                <div className="text-center">
                  <p className="font-semibold text-sm">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
        <Button
          variant="outline"
          size="sm"
          disabled={isUndoing || session.totalPallets === 0}
          onClick={() => undoPallet.mutate({ sessionId })}
        >
          {isUndoing ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Undo2 className="h-4 w-4 mr-1.5" />
          )}
          Undo Last
        </Button>

        <Button
          size="sm"
          disabled={session.totalPallets === 0}
          onClick={onComplete}
        >
          <CheckCircle2 className="h-4 w-4 mr-1.5" />
          Complete Session
        </Button>
      </div>

      {/* "Other" description dialog */}
      <Dialog open={showOtherDialog} onOpenChange={setShowOtherDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Other Pallet Type</DialogTitle>
            <DialogDescription>
              Describe the non-standard pallet (e.g. slip sheet, floor load, half pallet).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="otherDesc">
                Description <span className="text-destructive">*</span>
              </Label>
              <Input
                id="otherDesc"
                placeholder="e.g. Slip sheet, floor load…"
                value={otherDescription}
                onChange={(e) => setOtherDescription(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleOtherConfirm()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="otherNotes">Notes (optional)</Label>
              <Textarea
                id="otherNotes"
                placeholder="Any additional notes…"
                rows={2}
                value={otherNotes}
                onChange={(e) => setOtherNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOtherDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleOtherConfirm} disabled={!otherDescription.trim()}>
              <PackageOpen className="h-4 w-4 mr-1.5" />
              Capture Pallet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Step: Complete Session ─────────────────────────────────────────────────
function CompleteSessionStep({
  sessionId,
  session,
  onDone,
  onBack,
}: {
  sessionId: number;
  session: {
    totalPallets: number;
    standardPallets: number;
    oversizePallets: number;
    otherPallets: number;
    transactionId: number;
    poNum?: string | null;
    customerName: string;
    facilityName: string;
  };
  onDone: () => void;
  onBack: () => void;
}) {
  const [hasNonConforming, setHasNonConforming] = useState(false);
  const [hours, setHours] = useState("");
  const [reason, setReason] = useState("");

  const completeSession = trpc.palletCapture.completeSession.useMutation({
    onSuccess: () => {
      toast.success("Session completed", {
        description: "Pallet data has been saved and queued for OpFi.",
      });
      onDone();
    },
    onError: (err) => {
      toast.error("Failed to complete session", { description: err.message });
    },
  });

  const canComplete =
    !hasNonConforming ||
    (hours.trim() !== "" && parseFloat(hours) > 0 && reason.trim() !== "");

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-500/10 mb-2">
          <CheckCircle2 className="h-7 w-7 text-green-400" />
        </div>
        <h2 className="text-xl font-semibold">Complete Session</h2>
        <p className="text-sm text-muted-foreground">
          Review the pallet summary and confirm any non-conforming hours before completing.
        </p>
      </div>

      {/* Summary card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Session Summary</CardTitle>
          <CardDescription>
            TX #{session.transactionId}
            {session.poNum && ` · PO: ${session.poNum}`}
            {" · "}
            {session.customerName}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3 text-center">
            {[
              { label: "Total", value: session.totalPallets, color: "text-foreground" },
              { label: "Standard", value: session.standardPallets, color: "text-blue-400" },
              { label: "Oversize", value: session.oversizePallets, color: "text-amber-400" },
              { label: "Other", value: session.otherPallets, color: "text-purple-400" },
            ].map((s) => (
              <div key={s.label} className="space-y-1">
                <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Non-conforming hours */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Non-Conforming Hours</CardTitle>
          </div>
          <CardDescription>
            Were any hours outside the standard receiving window required for this receipt?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Button
              variant={hasNonConforming ? "default" : "outline"}
              size="sm"
              onClick={() => setHasNonConforming(true)}
            >
              Yes
            </Button>
            <Button
              variant={!hasNonConforming ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setHasNonConforming(false);
                setHours("");
                setReason("");
              }}
            >
              No
            </Button>
          </div>

          {hasNonConforming && (
            <div className="space-y-3 pt-1">
              <div className="space-y-2">
                <Label htmlFor="ncHours">
                  Hours <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="ncHours"
                  type="number"
                  min="0.5"
                  max="24"
                  step="0.5"
                  placeholder="e.g. 2.5"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ncReason">
                  Reason <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="ncReason"
                  placeholder="Explain why non-conforming hours were needed…"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1.5" />
          Back
        </Button>
        <Button
          className="flex-1"
          disabled={!canComplete || completeSession.isPending}
          onClick={() =>
            completeSession.mutate({
              sessionId,
              nonConformingHours: hasNonConforming ? parseFloat(hours) : null,
              nonConformingReason: hasNonConforming ? reason : null,
            })
          }
        >
          {completeSession.isPending ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
          )}
          Complete &amp; Push to OpFi
        </Button>
      </div>
    </div>
  );
}

// ─── Step: Done ─────────────────────────────────────────────────────────────
function DoneStep({
  session,
  onNewSession,
  onViewHistory,
}: {
  session: {
    totalPallets: number;
    standardPallets: number;
    oversizePallets: number;
    otherPallets: number;
    transactionId: number;
    poNum?: string | null;
    customerName: string;
    opfiPushStatus?: string | null;
  };
  onNewSession: () => void;
  onViewHistory: () => void;
}) {
  const opfiStatus = session.opfiPushStatus;
  return (
    <div className="max-w-lg mx-auto text-center space-y-6">
      <div className="space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-2">
          <CheckCircle2 className="h-8 w-8 text-green-400" />
        </div>
        <h2 className="text-2xl font-bold">Session Complete</h2>
        <p className="text-muted-foreground">
          {session.totalPallets} pallet{session.totalPallets !== 1 ? "s" : ""} captured for TX #{session.transactionId}
          {session.poNum && ` (PO: ${session.poNum})`}.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-4 gap-3 text-center mb-4">
            {[
              { label: "Total", value: session.totalPallets, color: "text-foreground" },
              { label: "Standard", value: session.standardPallets, color: "text-blue-400" },
              { label: "Oversize", value: session.oversizePallets, color: "text-amber-400" },
              { label: "Other", value: session.otherPallets, color: "text-purple-400" },
            ].map((s) => (
              <div key={s.label} className="space-y-1">
                <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          {/* OpFi push status */}
          <div className="flex items-center justify-center gap-2 pt-3 border-t border-border">
            {opfiStatus === "sent" && (
              <Badge className="bg-green-500/10 text-green-400 border-green-500/20 gap-1">
                <CheckCircle2 className="h-3 w-3" /> Pushed to OpFi
              </Badge>
            )}
            {opfiStatus === "pending" && (
              <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 gap-1">
                <Clock className="h-3 w-3" /> OpFi push queued
              </Badge>
            )}
            {opfiStatus === "failed" && (
              <Badge className="bg-red-500/10 text-red-400 border-red-500/20 gap-1">
                <AlertTriangle className="h-3 w-3" /> OpFi push failed — will retry
              </Badge>
            )}
            {opfiStatus === "skipped" && (
              <Badge className="bg-muted text-muted-foreground gap-1">
                <Info className="h-3 w-3" /> OpFi not configured
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onViewHistory}>
          View History
        </Button>
        <Button className="flex-1" onClick={onNewSession}>
          New Session
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────
type Step = "start" | "capture" | "complete" | "done";

export default function PalletCapture() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("start");
  const [sessionId, setSessionId] = useState<number | null>(null);

  const utils = trpc.useUtils();

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

  const handleStart = (params: Parameters<typeof startSession.mutate>[0]) => {
    startSession.mutate(params);
  };

  const handleRefresh = () => {
    refetchSession();
  };

  const handleReset = () => {
    setSessionId(null);
    setStep("start");
    utils.palletCapture.listSessions.invalidate();
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/receiving")}
          className="text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Receiving
        </Button>
        <div className="h-4 w-px bg-border" />
        <h1 className="text-xl font-semibold">Pallet Capture</h1>
        {step !== "start" && session && (
          <Badge variant="outline" className="ml-auto">
            Session #{sessionId}
          </Badge>
        )}
      </div>

      {/* Step indicator */}
      {step !== "done" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {(["start", "capture", "complete"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className="h-px w-6 bg-border" />}
              <span
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full font-medium",
                  step === s
                    ? "bg-primary/10 text-primary"
                    : ["start", "capture", "complete"].indexOf(step) > i
                    ? "text-green-400"
                    : "text-muted-foreground"
                )}
              >
                {["start", "capture", "complete"].indexOf(step) > i && (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                {s === "start" && "Setup"}
                {s === "capture" && "Capture Pallets"}
                {s === "complete" && "Complete"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Steps */}
      {step === "start" && (
        <StartSessionStep
          onStart={(params) => {
            if (startSession.isPending) return;
            handleStart(params);
          }}
        />
      )}

      {step === "capture" && sessionId != null && session && (
        <CapturePalletsStep
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
          onRefresh={handleRefresh}
          onComplete={() => setStep("complete")}
        />
      )}

      {step === "capture" && startSession.isPending && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {step === "complete" && sessionId != null && session && (
        <CompleteSessionStep
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
          onDone={() => {
            refetchSession();
            setStep("done");
          }}
          onBack={() => setStep("capture")}
        />
      )}

      {step === "done" && session && (
        <DoneStep
          session={{
            totalPallets: session.totalPallets,
            standardPallets: session.standardPallets,
            oversizePallets: session.oversizePallets,
            otherPallets: session.otherPallets,
            transactionId: session.transactionId,
            poNum: session.poNum,
            customerName: session.customerName,
            opfiPushStatus: session.opfiPushStatus,
          }}
          onNewSession={handleReset}
          onViewHistory={() => navigate("/receiving/pallet-history")}
        />
      )}
    </div>
  );
}

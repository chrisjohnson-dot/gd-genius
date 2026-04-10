import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  MessageSquare,
  Package,
  PackageSearch,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Users,
  Warehouse,
  X,
  Truck,
  FlaskConical,
  ClipboardCheck,
  ShipIcon,
  ChevronRight,
  ChevronLeft,
  UserCheck,
  Maximize2,
  Minimize2,
  ArrowLeft,
  BellOff,
  TrendingUp,
  AlertCircle,
  CalendarPlus,
  CalendarX,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { FileDown, FileText } from "lucide-react";
import { OrderDetailDrawer } from "@/components/OrderDetailDrawer";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Lifecycle status config ──────────────────────────────────────────────────
type LifecycleStatus = "unallocated" | "allocated" | "picking" | "qc" | "qc_complete" | "ship_ready";

const LIFECYCLE_CONFIG: Record<
  LifecycleStatus,
  { label: string; bg: string; text: string; border: string; icon: React.ReactNode; nextStatus: LifecycleStatus | null; nextLabel: string | null }
> = {
  unallocated: {
    label: "Unalloc.",
    bg: "#dbeafe", text: "#1d4ed8", border: "#bfdbfe",
    icon: <Package className="h-2.5 w-2.5" />,
    nextStatus: "allocated", nextLabel: "Mark Allocated",
  },
  allocated: {
    label: "Allocated",
    bg: "#e0e7ff", text: "#4338ca", border: "#c7d2fe",
    icon: <ClipboardCheck className="h-2.5 w-2.5" />,
    nextStatus: "picking", nextLabel: "Give to Associate →",
  },
  picking: {
    label: "Picking",
    bg: "#fef3c7", text: "#b45309", border: "#fde68a",
    icon: <Truck className="h-2.5 w-2.5" />,
    nextStatus: "qc", nextLabel: "Start QC →",
  },
  qc: {
    label: "QC",
    bg: "#fce7f3", text: "#be185d", border: "#fbcfe8",
    icon: <FlaskConical className="h-2.5 w-2.5" />,
    nextStatus: "qc_complete", nextLabel: "QC Complete →",
  },
  qc_complete: {
    label: "QC Done",
    bg: "#d1fae5", text: "#065f46", border: "#a7f3d0",
    icon: <CheckCircle2 className="h-2.5 w-2.5" />,
    nextStatus: "ship_ready", nextLabel: "Ship Ready →",
  },
  ship_ready: {
    label: "Ship Ready",
    bg: "#dcfce7", text: "#15803d", border: "#bbf7d0",
    icon: <ShipIcon className="h-2.5 w-2.5" />,
    nextStatus: null, nextLabel: null,
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────
type TrackedOrder = {
  id: number;
  extensivOrderId: number;
  referenceNum: string | null;
  poNum: string | null;
  clientId: number;
  clientName: string;
  facilityId: number;
  facilityName: string | null;
  shipToName: string | null;
  shipToCity: string | null;
  totalPieces: number | null;
  skuCount: number | null;
  notes: string | null;
  extensivStatus: number | null;
  creationDate: string | null;
  lifecycleStatus: LifecycleStatus;
  firstSeenAt: string | Date;
  lastSyncedAt: string | Date;
  allocatedAt: string | Date | null;
  pickingAt: string | Date | null;
  qcAt: string | Date | null;
  qcCompleteAt: string | Date | null;
  shipReadyAt: string | Date | null;
  assignedAssociate: string | null;
  shipwellOrderId: string | null;
  shipwellShipmentId: string | null;
  shipwellPoUrl: string | null;
  shipwellShipmentUrl: string | null;
  shipwellStatus: string | null;
  shipwellBidCount: number | null;
  shipwellQuotingStartedAt: string | Date | null;
  shipwellZeroBidNotifiedAt: string | Date | null;
  shipwellSentAt: string | Date | null;
  shipwellStatusUpdatedAt: string | Date | null;
  requiredShipDate: string | null;
  slaExtensionDays: number | null;
  slaExtensionNote: string | null;
};

type LaneThresholdEntry = {
  id: number;
  laneName: string;
  facilityCode: string | null;
  destinationRegion: string | null;
  thresholdHours: number;
  isActive: boolean;
};

type FacilityGroup = {
  facilityId: number;
  facilityName: string;
  orders: TrackedOrder[];
};

// ─── Status pill ──────────────────────────────────────────────────────────────
function LifecyclePill({ status }: { status: LifecycleStatus }) {
  const cfg = LIFECYCLE_CONFIG[status];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ─── Send to Shipwell button ─────────────────────────────────────────────────
function SendToShipwellButton({
  order,
  onSent,
}: {
  order: TrackedOrder;
  onSent: () => void;
}) {
  const utils = trpc.useUtils();
  const sendOrder = trpc.shipwell.sendOrder.useMutation({
    onSuccess: (data) => {
      toast.success(`Order sent to Shipwell. PO ID: ${data.shipwellOrderId}`);
      utils.pickSchedule.listByChannel.invalidate();
      onSent();
    },
    onError: (err) => {
      toast.error(`Shipwell error: ${err.message}`);
    },
  });

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-[10px] h-6 px-2 font-semibold whitespace-nowrap text-blue-600 hover:text-blue-700 hover:bg-blue-50"
      disabled={sendOrder.isPending}
      onClick={(e) => {
        e.stopPropagation();
        sendOrder.mutate({ extensivOrderId: order.extensivOrderId });
      }}
      title="Create purchase order in Shipwell"
    >
      {sendOrder.isPending ? (
        <RefreshCw className="h-3 w-3 animate-spin" />
      ) : (
        <>
          <Send className="h-2.5 w-2.5 mr-1" />
          Send to Shipwell
        </>
      )}
    </Button>
  );
}

// ─── Required ship date badge ───────────────────────────────────────────────
function RequiredShipDateBadge({ dateStr }: { dateStr: string }) {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return <span className="text-muted-foreground text-xs">{dateStr}</span>;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  // Urgency tiers: overdue (red), today (orange), tomorrow (amber), within 3 days (yellow), future (muted)
  let bg = "transparent";
  let color = "#64748b"; // muted
  let border = "transparent";
  let title = `Required ship date: ${date.toLocaleDateString()}`;

  if (diffDays < 0) {
    bg = "#fef2f2"; color = "#b91c1c"; border = "#fecaca";
    title = `OVERDUE by ${Math.abs(diffDays)}d — required ship date was ${date.toLocaleDateString()}`;
  } else if (diffDays === 0) {
    bg = "#fff7ed"; color = "#c2410c"; border = "#fed7aa";
    title = `Ships TODAY — ${date.toLocaleDateString()}`;
  } else if (diffDays === 1) {
    bg = "#fffbeb"; color = "#b45309"; border = "#fde68a";
    title = `Ships TOMORROW — ${date.toLocaleDateString()}`;
  } else if (diffDays <= 3) {
    bg = "#fefce8"; color = "#a16207"; border = "#fef08a";
    title = `Ships in ${diffDays} days — ${date.toLocaleDateString()}`;
  } else {
    title = `Ships in ${diffDays} days — ${date.toLocaleDateString()}`;
  }

  return (
    <span
      className="inline-flex items-center text-[10px] font-semibold rounded px-1.5 py-0.5 whitespace-nowrap"
      style={{ background: bg, color, border: `1px solid ${border}` }}
      title={title}
    >
      {diffDays < 0 && <AlertTriangle className="h-2.5 w-2.5 mr-0.5 shrink-0" />}
      {label}
      {diffDays < 0 && <span className="ml-0.5 font-bold">({Math.abs(diffDays)}d late)</span>}
    </span>
  );
}

// ─── Shipwell live status badge ─────────────────────────────────────────────
const SHIPWELL_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  quoting:           { label: "Quoting",          bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  tendered:          { label: "Tendered",         bg: "#fefce8", text: "#a16207", border: "#fde68a" },
  carrier_confirmed: { label: "Carrier Confirmed",bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
  in_transit:        { label: "In Transit",       bg: "#f0fdf4", text: "#166534", border: "#86efac" },
  cancelled:         { label: "Cancelled",        bg: "#fef2f2", text: "#b91c1c", border: "#fecaca" },
  unknown:           { label: "In Shipwell",      bg: "#f8fafc", text: "#475569", border: "#e2e8f0" },
};

function ShipwellStatusBadge({ order, thresholdHours = 2 }: { order: TrackedOrder; thresholdHours?: number }) {
  const status = order.shipwellStatus ?? "unknown";
  const cfg = SHIPWELL_STATUS_CONFIG[status] ?? SHIPWELL_STATUS_CONFIG.unknown;
  const href = order.shipwellShipmentUrl ?? order.shipwellPoUrl ?? "#";
  const isQuoting = status === "quoting";
  const bidCount = order.shipwellBidCount ?? 0;

  // Determine if zero-bid warning should show using per-lane threshold
  const thresholdMs = thresholdHours * 60 * 60 * 1000;
  const quotingStarted = order.shipwellQuotingStartedAt
    ? new Date(order.shipwellQuotingStartedAt)
    : null;
  const quotingAgeMs = quotingStarted ? Date.now() - quotingStarted.getTime() : 0;
  const showZeroBidWarning = isQuoting && bidCount === 0 && quotingAgeMs >= thresholdMs;
  const hoursInQuoting = quotingStarted ? Math.floor(quotingAgeMs / (60 * 60 * 1000)) : 0;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-[10px] font-bold rounded px-1.5 py-0.5 whitespace-nowrap hover:opacity-80 transition-opacity"
      style={{
        background: showZeroBidWarning ? "#fff7ed" : cfg.bg,
        color: showZeroBidWarning ? "#c2410c" : cfg.text,
        border: `1px solid ${showZeroBidWarning ? "#fed7aa" : cfg.border}`,
      }}
      title={
        showZeroBidWarning
          ? `⚠️ Zero bids for ${hoursInQuoting}h — action required (threshold: ${thresholdHours}h)`
          : `Shipwell status: ${cfg.label}${isQuoting ? ` — ${bidCount} bid${bidCount !== 1 ? "s" : ""} received` : ""}${order.shipwellStatusUpdatedAt ? ` (updated ${new Date(order.shipwellStatusUpdatedAt).toLocaleString()})` : ""}`
      }
    >
      {showZeroBidWarning ? (
        <AlertTriangle className="h-2.5 w-2.5 text-orange-500" />
      ) : (
        <ExternalLink className="h-2.5 w-2.5" />
      )}
      {cfg.label}
      {isQuoting && (
        <span
          className="ml-0.5 inline-flex items-center justify-center rounded-full text-[9px] font-bold min-w-[16px] h-4 px-1"
          style={{
            background: showZeroBidWarning ? "#ea580c" : bidCount > 0 ? "#1d4ed8" : "#94a3b8",
            color: "#fff",
          }}
          title={`${bidCount} carrier bid${bidCount !== 1 ? "s" : ""} received`}
        >
          {bidCount}
        </span>
      )}
    </a>
  );
}

// ─── Advance button ───────────────────────────────────────────────────────────
function AdvanceButton({
  order,
  onAdvanced,
}: {
  order: TrackedOrder;
  onAdvanced: () => void;
}) {
  const cfg = LIFECYCLE_CONFIG[order.lifecycleStatus];
  const utils = trpc.useUtils();
  const [showDialog, setShowDialog] = useState(false);
  const [associateName, setAssociateName] = useState("");

  const updateStatus = trpc.pickSchedule.updateStatus.useMutation({
    onSuccess: () => {
      utils.pickSchedule.listByChannel.invalidate();
      setShowDialog(false);
      setAssociateName("");
      onAdvanced();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  if (!cfg.nextStatus) return null;

  const needsAssociate = cfg.nextStatus === "picking";

  function handleAdvance() {
    if (needsAssociate) {
      setShowDialog(true);
    } else {
      updateStatus.mutate({ extensivOrderId: order.extensivOrderId, status: cfg.nextStatus! });
    }
  }

  function handleConfirmAssociate() {
    if (!associateName.trim()) return;
    updateStatus.mutate({
      extensivOrderId: order.extensivOrderId,
      status: "picking",
      assignedAssociate: associateName.trim(),
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-[10px] h-6 px-2 font-semibold whitespace-nowrap"
        style={{ color: cfg.text }}
        disabled={updateStatus.isPending}
        onClick={(e) => {
          e.stopPropagation();
          handleAdvance();
        }}
      >
        {updateStatus.isPending && !showDialog ? (
          <RefreshCw className="h-3 w-3 animate-spin" />
        ) : (
          <>
            {cfg.nextLabel}
            <ChevronRight className="h-3 w-3 ml-0.5" />
          </>
        )}
      </Button>

      {/* Associate name dialog — shown only when advancing to Picking */}
      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) { setShowDialog(false); setAssociateName(""); } }}>
        <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-amber-500" />
              Assign to Associate
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Order <span className="font-semibold text-foreground">TX#{order.extensivOrderId}</span> is being given to an associate for picking.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="associate-name" className="text-xs font-semibold">Associate Name</Label>
              <Input
                id="associate-name"
                placeholder="Enter associate name…"
                value={associateName}
                onChange={(e) => setAssociateName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && associateName.trim()) handleConfirmAssociate(); }}
                autoFocus
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setShowDialog(false); setAssociateName(""); }}>Cancel</Button>
            <Button
              size="sm"
              disabled={!associateName.trim() || updateStatus.isPending}
              onClick={handleConfirmAssociate}
              className="gap-1.5"
            >
              {updateStatus.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />}
              Assign & Start Picking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Sort helpers ─────────────────────────────────────────────────────────────
type SortKey = "clientName" | "extensivOrderId" | "ageDays" | "lifecycleStatus" | "totalPieces" | "shipToName" | "shipToCity" | "poNum" | "requiredShipDate";
type SortDir = "asc" | "desc";
const STATUS_RANK: Record<LifecycleStatus, number> = {
  unallocated: 0, allocated: 1, picking: 2, qc: 3, qc_complete: 4, ship_ready: 5,
};

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30 inline" />;
  return sortDir === "asc"
    ? <ChevronUp className="h-3 w-3 ml-1 inline" />
    : <ChevronDown className="h-3 w-3 ml-1 inline" />;
}

function getAgeDays(order: TrackedOrder): number {
  const d = order.firstSeenAt ? new Date(order.firstSeenAt) : null;
  if (!d || isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

// ─── Undo / step-back button ────────────────────────────────────────────────
function UndoButton({ order, onUndone }: { order: TrackedOrder; onUndone: () => void }) {
  const utils = trpc.useUtils();
  const PREV_STATUS: Partial<Record<LifecycleStatus, string>> = {
    allocated: "Unallocated",
    picking: "Allocated",
    qc: "Picking",
    qc_complete: "QC",
    ship_ready: "QC Complete",
  };
  const prevLabel = PREV_STATUS[order.lifecycleStatus];
  if (!prevLabel) return null; // unallocated has no previous stage

  const undoStatus = trpc.pickSchedule.undoStatus.useMutation({
    onSuccess: () => {
      utils.pickSchedule.listByChannel.invalidate();
      onUndone();
      toast.success(`Order moved back to ${prevLabel}`);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <button
      disabled={undoStatus.isPending}
      onClick={(e) => {
        e.stopPropagation();
        undoStatus.mutate({ extensivOrderId: order.extensivOrderId });
      }}
      title={`Undo — move back to ${prevLabel}`}
      className="inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
    >
      {undoStatus.isPending
        ? <RefreshCw className="h-3 w-3 animate-spin" />
        : <ChevronLeft className="h-3.5 w-3.5" />}
    </button>
  );
}
// ─── SLA Extension button ──────────────────────────────────────────────────
function SlaExtensionButton({
  order,
  onChanged,
}: {
  order: TrackedOrder;
  onChanged: () => void;
}) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<number>(order.slaExtensionDays ?? 1);
  const [note, setNote] = useState<string>(order.slaExtensionNote ?? "");

  const hasExtension = (order.slaExtensionDays ?? 0) > 0;

  const setExt = trpc.sla.setExtension.useMutation({
    onSuccess: () => {
      utils.pickSchedule.listByChannel.invalidate();
      onChanged();
      setOpen(false);
      toast.success(`SLA extended by ${days} day${days !== 1 ? "s" : ""} for order TX#${order.extensivOrderId}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const clearExt = trpc.sla.clearExtension.useMutation({
    onSuccess: () => {
      utils.pickSchedule.listByChannel.invalidate();
      onChanged();
      toast.success(`SLA extension cleared for order TX#${order.extensivOrderId}`);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <>
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => { e.stopPropagation(); setDays(order.slaExtensionDays ?? 1); setNote(order.slaExtensionNote ?? ""); setOpen(true); }}
              className={`inline-flex items-center justify-center h-6 w-6 rounded transition-colors ${
                hasExtension
                  ? "text-purple-600 bg-purple-50 hover:bg-purple-100"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              title={hasExtension ? `SLA extended +${order.slaExtensionDays}d${order.slaExtensionNote ? `: ${order.slaExtensionNote}` : ""}` : "Extend SLA deadline"}
            >
              <CalendarPlus className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-xs">
            {hasExtension
              ? `SLA extended +${order.slaExtensionDays}d${order.slaExtensionNote ? ` - ${order.slaExtensionNote}` : ""}`
              : "Extend SLA deadline for this order"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="h-4 w-4 text-purple-600" />
              Extend SLA Deadline
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Order <span className="font-semibold text-foreground">TX#{order.extensivOrderId}</span>
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Additional Days</Label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDays((d) => Math.max(1, d - 1))}
                  className="h-8 w-8 rounded border flex items-center justify-center hover:bg-muted"
                >-</button>
                <span className="w-10 text-center font-semibold text-lg">{days}</span>
                <button
                  onClick={() => setDays((d) => d + 1)}
                  className="h-8 w-8 rounded border flex items-center justify-center hover:bg-muted"
                >+</button>
                <span className="text-xs text-muted-foreground ml-1">day{days !== 1 ? "s" : ""}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason (optional)</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Customer requested later date"
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            {hasExtension && (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 mr-auto"
                disabled={clearExt.isPending}
                onClick={() => clearExt.mutate({ extensivOrderId: order.extensivOrderId })}
              >
                <CalendarX className="h-3.5 w-3.5 mr-1" />
                Clear Extension
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={setExt.isPending}
              onClick={() => setExt.mutate({ extensivOrderId: order.extensivOrderId, extensionDays: days, note: note || null })}
            >
              {setExt.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Apply Extension
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Dismiss zero-bid warning button ────────────────────────────────────────
function DismissWarningButton({
  order,
  onDismissed,
}: {
  order: TrackedOrder;
  onDismissed: () => void;
}) {
  const utils = trpc.useUtils();

  // Only show when the order is in Shipwell quoting with zero bids and a notification was sent
  const isQuoting = order.shipwellStatus === "quoting";
  const bidCount = order.shipwellBidCount ?? 0;
  const wasNotified = !!order.shipwellZeroBidNotifiedAt;

  if (!isQuoting || bidCount > 0 || !wasNotified) return null;

  const dismiss = trpc.pickSchedule.dismissZeroBidWarning.useMutation({
    onSuccess: () => {
      utils.pickSchedule.listByChannel.invalidate();
      onDismissed();
      toast.success("Warning dismissed — clock reset. Alert will re-fire after the next threshold period.");
    },
    onError: (err) => toast.error(`Failed to dismiss warning: ${err.message}`),
  });

  return (
    <button
      disabled={dismiss.isPending}
      onClick={(e) => {
        e.stopPropagation();
        dismiss.mutate({ extensivOrderId: order.extensivOrderId });
      }}
      title="Dismiss zero-bid warning — resets the notification clock after manual outreach"
      className="inline-flex items-center justify-center h-6 w-6 rounded text-orange-500 hover:text-orange-700 hover:bg-orange-50 transition-colors disabled:opacity-40"
    >
      {dismiss.isPending
        ? <RefreshCw className="h-3 w-3 animate-spin" />
        : <BellOff className="h-3 w-3" />}
    </button>
  );
}

// ─── Per-warehouse card ──────────────────────────────────────────────────────
function WarehouseCard({
  facility,
  onStatusChanged,
  fullScreen = false,
  onClose,
  drillDown = false,
  onDrillDown,
  laneThresholds = [],
  initialClientFilter = "all",
  overdueCount = 0,
}: {
  facility: FacilityGroup;
  onStatusChanged: () => void;
  fullScreen?: boolean;
  onClose?: () => void;
  drillDown?: boolean;
  onDrillDown?: () => void;
  laneThresholds?: LaneThresholdEntry[];
  initialClientFilter?: string;
  overdueCount?: number;
}) {
  const [search, setSearch]             = useState("");
  const [clientFilter, setClientFilter] = useState(initialClientFilter);
  const [statusFilter, setStatusFilter] = useState<LifecycleStatus | "all" | "needs_attention">("all");
  const [sortKey, setSortKey]           = useState<SortKey>("requiredShipDate");
  const [sortDir, setSortDir]           = useState<SortDir>("asc");
  const [expanded, setExpanded]         = useState(drillDown);
  const [groupByClient, setGroupByClient] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(fullScreen);

  const clientOptions = useMemo(
    () => Array.from(new Map(facility.orders.map((o) => [o.clientId, o.clientName])).entries()),
    [facility.orders]
  );

  // Helper: resolve per-lane threshold for a given facilityName
  const resolveThreshold = (facilityName: string | null): number => {
    if (laneThresholds.length === 0) return 2;
    const active = laneThresholds.filter((t) => t.isActive);
    if (facilityName) {
      const specific = active.find((t) => t.facilityCode === facilityName);
      if (specific) return specific.thresholdHours;
    }
    const global = active.find((t) => !t.facilityCode);
    return global?.thresholdHours ?? 2;
  };

  // Helper: is this order showing the zero-bid warning?
  const isZeroBidWarning = (o: TrackedOrder) => {
    if (o.shipwellStatus !== "quoting") return false;
    if ((o.shipwellBidCount ?? 0) > 0) return false;
    const started = o.shipwellQuotingStartedAt ? new Date(o.shipwellQuotingStartedAt as string).getTime() : 0;
    const thresholdMs = resolveThreshold(o.facilityName ?? null) * 60 * 60 * 1000;
    return started > 0 && (Date.now() - started) >= thresholdMs;
  };

  const filteredOrders = useMemo(() => {
    let rows = facility.orders;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (o) =>
          (o.referenceNum ?? "").toLowerCase().includes(q) ||
          o.clientName.toLowerCase().includes(q) ||
          (o.shipToName ?? "").toLowerCase().includes(q) ||
          (o.poNum ?? "").toLowerCase().includes(q) ||
          (o.shipToCity ?? "").toLowerCase().includes(q) ||
          (o.notes ?? "").toLowerCase().includes(q)
      );
    }
    if (clientFilter !== "all") rows = rows.filter((o) => String(o.clientId) === clientFilter);
    if (statusFilter === "needs_attention") rows = rows.filter((o) => isZeroBidWarning(o));
    else if (statusFilter !== "all") rows = rows.filter((o) => o.lifecycleStatus === statusFilter);
    return [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "ageDays")            cmp = getAgeDays(a) - getAgeDays(b);
      else if (sortKey === "lifecycleStatus") cmp = STATUS_RANK[a.lifecycleStatus] - STATUS_RANK[b.lifecycleStatus];
      else if (sortKey === "totalPieces")   cmp = (a.totalPieces ?? 0) - (b.totalPieces ?? 0);
      else cmp = String(a[sortKey as keyof TrackedOrder] ?? "").localeCompare(String(b[sortKey as keyof TrackedOrder] ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [facility.orders, search, clientFilter, statusFilter, sortKey, sortDir]);

  // Group orders by client
  const groupedByClient = useMemo(() => {
    const map = new Map<number, { clientId: number; clientName: string; orders: TrackedOrder[] }>();
    for (const o of filteredOrders) {
      if (!map.has(o.clientId)) map.set(o.clientId, { clientId: o.clientId, clientName: o.clientName, orders: [] });
      map.get(o.clientId)!.orders.push(o);
    }
    const groups = Array.from(map.values()).sort((a, b) => a.clientName.localeCompare(b.clientName));
    // Within each group, always sort by Required Ship Date ascending (nulls last)
    for (const g of groups) {
      g.orders.sort((a, b) => {
        if (!a.requiredShipDate && !b.requiredShipDate) return 0;
        if (!a.requiredShipDate) return 1;
        if (!b.requiredShipDate) return -1;
        return new Date(a.requiredShipDate).getTime() - new Date(b.requiredShipDate).getTime();
      });
    }
    return groups;
  }, [filteredOrders]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const hasFilters = search || clientFilter !== "all" || statusFilter !== "all";

  function fmtDate(d: string | Date | null | undefined) {
    if (!d) return "—";
    const dt = new Date(d as string);
    if (isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // KPI counts
  const counts = useMemo(() => {
    const c: Record<LifecycleStatus, number> = { unallocated: 0, allocated: 0, picking: 0, qc: 0, qc_complete: 0, ship_ready: 0 };
    for (const o of facility.orders) c[o.lifecycleStatus]++;
    return c;
  }, [facility.orders]);

  const needsAttentionCount = useMemo(
    () => facility.orders.filter((o) => isZeroBidWarning(o)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [facility.orders]
  );

  const hasUrgent = facility.orders.some((o) => getAgeDays(o) >= 7);
  const hasHigh   = !hasUrgent && facility.orders.some((o) => getAgeDays(o) >= 3);

  const tableHeader = (showClient: boolean) => (
    <thead>
      <tr>
        <th className="w-[120px]">
          <button onClick={() => toggleSort("lifecycleStatus")} className="cursor-pointer select-none flex items-center gap-0.5">
            Status <SortIcon col="lifecycleStatus" sortKey={sortKey} sortDir={sortDir} />
          </button>
        </th>
        <th onClick={() => toggleSort("extensivOrderId")} className="cursor-pointer select-none">
          TX # <SortIcon col="extensivOrderId" sortKey={sortKey} sortDir={sortDir} />
        </th>
        <th onClick={() => toggleSort("poNum")} className="cursor-pointer select-none">
          PO # <SortIcon col="poNum" sortKey={sortKey} sortDir={sortDir} />
        </th>
        {showClient && (
          <th onClick={() => toggleSort("clientName")} className="cursor-pointer select-none">
            Client <SortIcon col="clientName" sortKey={sortKey} sortDir={sortDir} />
          </th>
        )}
        <th onClick={() => toggleSort("shipToName")} className="cursor-pointer select-none">
          Ship To <SortIcon col="shipToName" sortKey={sortKey} sortDir={sortDir} />
        </th>
        <th onClick={() => toggleSort("shipToCity")} className="cursor-pointer select-none">
          City <SortIcon col="shipToCity" sortKey={sortKey} sortDir={sortDir} />
        </th>
        <th onClick={() => toggleSort("requiredShipDate")} className="cursor-pointer select-none">
          Req. Ship <SortIcon col="requiredShipDate" sortKey={sortKey} sortDir={sortDir} />
        </th>
        <th className="text-right">Overdue</th>
        <th onClick={() => toggleSort("ageDays")} className="cursor-pointer select-none text-right">
          Age <SortIcon col="ageDays" sortKey={sortKey} sortDir={sortDir} />
        </th>
        <th onClick={() => toggleSort("totalPieces")} className="cursor-pointer select-none text-right">
          Pcs <SortIcon col="totalPieces" sortKey={sortKey} sortDir={sortDir} />
        </th>
        <th className="text-right">SKUs</th>
        <th className="w-8"></th>
        <th className="w-[140px]">Associate</th>
        <th className="w-[130px]"></th>
      </tr>
    </thead>
  );

  const orderRow = (o: TrackedOrder, showClient: boolean) => {
    const age = getAgeDays(o);
    const isUrgent = age >= 7;
    const isHigh   = age >= 3 && age < 7;
    return (
      <tr
        key={o.extensivOrderId}
        onClick={() => setSelectedOrderId(o.id)}
        className="cursor-pointer hover:bg-muted/40 transition-colors"
        style={
          isUrgent
            ? { background: "rgba(239,68,68,0.04)", borderLeft: "3px solid #ef4444" }
            : isHigh
            ? { background: "rgba(245,158,11,0.04)", borderLeft: "3px solid #f59e0b" }
            : { borderLeft: "3px solid transparent" }
        }
      >
        <td className="py-1.5">
          <LifecyclePill status={o.lifecycleStatus} />
        </td>
        <td className="font-semibold text-foreground text-xs">
          {o.extensivOrderId}
        </td>
        <td className="text-muted-foreground text-xs font-mono">
          {o.poNum ?? "—"}
        </td>
        {showClient && (
          <td className="text-muted-foreground text-xs">{o.clientName}</td>
        )}
        <td className="text-muted-foreground text-xs max-w-[140px] truncate" title={o.shipToName ?? ""}>
          {o.shipToName ?? "—"}
        </td>
        <td className="text-muted-foreground text-xs">
          {o.shipToCity ?? "—"}
        </td>
        <td className="text-xs whitespace-nowrap">
          {o.requiredShipDate ? (
            <RequiredShipDateBadge dateStr={o.requiredShipDate} />
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="text-right">
          {(() => {
            if (!o.requiredShipDate) return <span className="text-muted-foreground text-xs">—</span>;
            const today = new Date(); today.setHours(0,0,0,0);
            const target = new Date(o.requiredShipDate); target.setHours(0,0,0,0);
            const diff = Math.round((today.getTime() - target.getTime()) / 86400000);
            if (diff <= 0) return <span className="text-muted-foreground text-xs">—</span>;
            const cls = diff >= 3
              ? "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200"
              : "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200";
            return <span className={cls}>{diff}d</span>;
          })()}
        </td>
        <td className="text-muted-foreground text-xs text-right">
          {age === 0 ? "Today" : `${age}d`}
        </td>
        <td className="text-muted-foreground text-xs text-right">
          {(o.totalPieces ?? 0) > 0 ? (o.totalPieces ?? 0).toLocaleString() : "—"}
        </td>
        <td className="text-muted-foreground text-xs text-right">
          {(o.skuCount ?? 0) > 0 ? o.skuCount : "—"}
        </td>
        <td className="text-center">
          {o.notes ? (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <MessageSquare className="h-3.5 w-3.5 text-blue-400 cursor-default inline" />
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[220px] text-xs">
                  {o.notes}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </td>
        <td className="text-xs">
          {o.assignedAssociate ? (
            <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 font-medium whitespace-nowrap">
              <UserCheck className="h-3 w-3 shrink-0" />
              {o.assignedAssociate}
            </span>
          ) : null}
        </td>
        <td className="text-right">
          <div className="flex items-center justify-end gap-1">
            {/* Send to Shipwell appears at QC Complete stage; live status badge for orders already in Shipwell */}
            {o.shipwellShipmentId ? (
              <>
                <ShipwellStatusBadge order={o} thresholdHours={resolveThreshold(o.facilityName ?? null)} />
                <DismissWarningButton order={o} onDismissed={onStatusChanged} />
              </>
            ) : o.lifecycleStatus === "qc_complete" ? (
              o.shipwellOrderId ? (
                <a
                  href={o.shipwellPoUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5 hover:bg-green-100 transition-colors whitespace-nowrap"
                  onClick={(e) => e.stopPropagation()}
                  title={`Shipwell PO: ${o.shipwellOrderId}`}
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                  In Shipwell
                </a>
              ) : (
                <SendToShipwellButton order={o} onSent={onStatusChanged} />
              )
            ) : null}
            <AdvanceButton order={o} onAdvanced={onStatusChanged} />
            <UndoButton order={o} onUndone={onStatusChanged} />
            <SlaExtensionButton order={o} onChanged={onStatusChanged} />
          </div>
        </td>
      </tr>
    );
  };

  // When in full-screen mode, always show the table expanded
  const tableExpanded = isFullScreen ? true : expanded;

  if (isFullScreen) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col bg-background"
        style={{ overflow: "hidden" }}
      >
        {/* Full-screen header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0"
          style={{
            borderLeft: hasUrgent ? "4px solid #ef4444" : hasHigh ? "4px solid #f59e0b" : "4px solid transparent",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Warehouse className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-foreground">{facility.facilityName}</h2>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                {facility.orders.length} order{facility.orders.length !== 1 ? "s" : ""} · {clientOptions.length} client{clientOptions.length !== 1 ? "s" : ""}
                {(() => {
                  const unalloc = facility.orders.filter((o) => o.lifecycleStatus === "unallocated").length;
                  return unalloc > 0 ? (
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold"
                      style={{ background: "#dbeafe", color: "#1d4ed8", border: "1px solid #bfdbfe" }}
                      title={`${unalloc} unallocated order${unalloc !== 1 ? "s" : ""}`}
                    >
                      {unalloc} unalloc.
                    </span>
                  ) : null;
                })()}
                {overdueCount > 0 && (
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold"
                    style={{ background: "#fee2e2", color: "#b91c1c", border: "1px solid #fecaca" }}
                    title={`${overdueCount} order${overdueCount !== 1 ? "s" : ""} out of SLA`}
                  >
                    {overdueCount} overdue
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Lifecycle KPI row in header */}
            <div className="hidden md:flex items-center gap-2">
              {(Object.entries(LIFECYCLE_CONFIG) as [LifecycleStatus, typeof LIFECYCLE_CONFIG[LifecycleStatus]][]).map(([status, cfg]) => (
                <div
                  key={status}
                  className="rounded-lg px-3 py-1.5 text-center border cursor-pointer transition-opacity"
                  style={{ background: cfg.bg, borderColor: cfg.border, opacity: statusFilter === status ? 1 : statusFilter === "all" ? 1 : 0.45 }}
                  onClick={() => setStatusFilter((f) => (f === status ? "all" : status))}
                >
                  <p className="text-[15px] font-extrabold leading-none" style={{ color: cfg.text }}>{counts[status]}</p>
                  <p className="text-[8px] mt-0.5 font-medium uppercase tracking-wide" style={{ color: cfg.text }}>{cfg.label}</p>
                </div>
              ))}
              {needsAttentionCount > 0 && (
                <div
                  className="rounded-lg px-3 py-1.5 text-center border cursor-pointer transition-opacity"
                  style={{
                    background: statusFilter === "needs_attention" ? "#fff7ed" : "#fff7ed",
                    borderColor: "#fed7aa",
                    opacity: statusFilter === "needs_attention" ? 1 : statusFilter === "all" ? 1 : 0.45,
                    outline: statusFilter === "needs_attention" ? "2px solid #ea580c" : "none",
                  }}
                  onClick={() => setStatusFilter((f) => (f === "needs_attention" ? "all" : "needs_attention"))}
                  title="Orders in Quoting with zero bids for 2+ hours"
                >
                  <p className="text-[15px] font-extrabold leading-none text-orange-600 flex items-center justify-center gap-0.5">
                    <AlertTriangle className="h-3 w-3" />{needsAttentionCount}
                  </p>
                  <p className="text-[8px] mt-0.5 font-medium uppercase tracking-wide text-orange-600">Attention</p>
                </div>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => {
                const rows = filteredOrders.map((o) => [
                  LIFECYCLE_CONFIG[o.lifecycleStatus]?.label ?? o.lifecycleStatus,
                  o.referenceNum ?? "",
                  o.poNum ?? "",
                  o.clientName,
                  o.shipToName ?? "",
                  o.shipToCity ?? "",
                  o.creationDate ? new Date(o.creationDate as string).toLocaleDateString() : "",
                  String(getAgeDays(o)) + "d",
                  String(o.totalPieces ?? 0),
                  String(o.skuCount ?? 0),
                  o.assignedAssociate ?? "",
                  o.notes ?? "",
                ]);
                const header = ["Status","Transaction ID","PO #","Client","Ship To","City","Create Date","Age","Pieces","SKUs","Associate","Notes"];
                const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `${facility.facilityName.replace(/[^a-z0-9]/gi, "_")}_orders.csv`;
                a.click();
                URL.revokeObjectURL(a.href);
                toast.success("CSV exported");
              }}
            >
              <FileDown className="h-3.5 w-3.5" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => {
                const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
                doc.setFontSize(14);
                doc.text(`${facility.facilityName} — Open Orders`, 40, 36);
                doc.setFontSize(9);
                doc.text(`Exported ${new Date().toLocaleString()} · ${filteredOrders.length} orders`, 40, 52);
                autoTable(doc, {
                  startY: 64,
                  head: [["Status","Transaction ID","PO #","Client","Ship To","City","Date","Age","Pcs","SKUs","Associate"]],
                  body: filteredOrders.map((o) => [
                    LIFECYCLE_CONFIG[o.lifecycleStatus]?.label ?? o.lifecycleStatus,
                    o.referenceNum ?? "",
                    o.poNum ?? "",
                    o.clientName,
                    o.shipToName ?? "",
                    o.shipToCity ?? "",
                    o.creationDate ? new Date(o.creationDate as string).toLocaleDateString() : "",
                    String(getAgeDays(o)) + "d",
                    String(o.totalPieces ?? 0),
                    String(o.skuCount ?? 0),
                    o.assignedAssociate ?? "",
                  ]),
                  styles: { fontSize: 7, cellPadding: 3 },
                  headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
                  alternateRowStyles: { fillColor: [248, 250, 252] },
                  margin: { left: 40, right: 40 },
                });
                doc.save(`${facility.facilityName.replace(/[^a-z0-9]/gi, "_")}_orders.pdf`);
                toast.success("PDF exported");
              }}
            >
              <FileText className="h-3.5 w-3.5" />
              PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => { setIsFullScreen(false); if (onClose) onClose(); }}
            >
              <Minimize2 className="h-3.5 w-3.5" />
              Exit Full Screen
            </Button>
          </div>
        </div>

        {/* Filters row */}
        <div className="px-5 py-2.5 border-b border-border flex flex-wrap items-center gap-2 bg-muted/10 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search order, client, PO, city…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-8 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 w-52"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="py-1.5 px-2.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">All Clients</option>
            {clientOptions.map(([id, name]) => (
              <option key={id} value={String(id)}>{name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as LifecycleStatus | "all")}
            className="py-1.5 px-2.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">All Statuses</option>
            {(Object.entries(LIFECYCLE_CONFIG) as [LifecycleStatus, typeof LIFECYCLE_CONFIG[LifecycleStatus]][]).map(([s, c]) => (
              <option key={s} value={s}>{c.label}</option>
            ))}
          </select>
          <button
            onClick={() => setGroupByClient((g) => !g)}
            className={`py-1.5 px-2.5 text-xs rounded-lg border transition-colors flex items-center gap-1.5 ${
              groupByClient
                ? "bg-primary/10 border-primary/30 text-primary font-semibold"
                : "border-border bg-background text-muted-foreground"
            }`}
          >
            <Users className="h-3 w-3" />
            Group by Client
          </button>
          {hasFilters && (
            <button
              onClick={() => { setSearch(""); setClientFilter("all"); setStatusFilter("all"); }}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {hasFilters ? `${filteredOrders.length} of ${facility.orders.length}` : facility.orders.length} orders
          </span>
        </div>

        {/* Scrollable table */}
        <div className="flex-1 overflow-auto">
          {filteredOrders.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <p className="text-sm font-medium">No orders match your filters.</p>
              <button onClick={() => { setSearch(""); setClientFilter("all"); setStatusFilter("all"); }} className="text-xs text-primary hover:underline mt-1">Clear filters</button>
            </div>
          ) : groupByClient ? (
            <table className="w-full data-table">
              {tableHeader(false)}
              <tbody>
                {groupedByClient.map((group) => {
                  const groupPieces = group.orders.reduce((s, o) => s + (o.totalPieces ?? 0), 0);
                  const unallocCount = group.orders.filter((o) => o.lifecycleStatus === "unallocated").length;
                  return [
                    <tr key={`hdr-${group.clientId}`} style={{ background: "#111827", borderLeft: "3px solid #374151" }}>
                      <td colSpan={2} className="py-2 px-3">
                        <span className="inline-flex items-center gap-2">
                          <span className="text-[11px] font-bold text-white uppercase tracking-wider">{group.clientName}</span>
                          {unallocCount > 0 && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold"
                              style={{ background: "#1d4ed8", color: "#fff" }}
                              title={`${unallocCount} unallocated order${unallocCount !== 1 ? "s" : ""}`}
                            >
                              {unallocCount} unalloc.
                            </span>
                          )}
                          {unallocCount === 0 && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                              style={{ background: "#374151", color: "#9ca3af" }}
                              title="No unallocated orders"
                            >
                              0 unalloc.
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-[10px] text-gray-400 font-medium">PO #</td>
                      <td className="py-2 px-3 text-[10px] text-gray-400 font-medium">Ship To</td>
                      <td className="py-2 px-3 text-[10px] text-gray-400 font-medium">City</td>
                      <td className="py-2 px-3 text-[10px] text-gray-400 font-medium text-right">Age</td>
                      <td className="py-2 px-3 text-[10px] text-gray-400 font-medium text-right">{groupPieces > 0 ? groupPieces.toLocaleString() : ""}</td>
                      <td className="py-2 px-3 text-[10px] text-gray-400 font-medium text-right">{group.orders.length} ord</td>
                      <td colSpan={2}></td>
                    </tr>,
                    ...group.orders.map((o) => orderRow(o, false)),
                  ];
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full data-table">
              {tableHeader(true)}
              <tbody>{filteredOrders.map((o) => orderRow(o, true))}</tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-card rounded-xl overflow-hidden"
      style={{
        border: hasUrgent ? "2px solid #ef4444" : hasHigh ? "2px solid #f59e0b" : "1px solid hsl(var(--border))",
        boxShadow: hasUrgent
          ? "0 0 0 1px rgba(239,68,68,0.15), 0 4px 16px rgba(239,68,68,0.10)"
          : hasHigh
          ? "0 0 0 1px rgba(245,158,11,0.15), 0 4px 16px rgba(245,158,11,0.10)"
          : undefined,
      }}
    >
      {/* Warehouse header */}
      <div
        className={`px-5 py-4 select-none bg-card border-b border-border ${onDrillDown ? "cursor-pointer hover:bg-muted/30 transition-colors" : "cursor-pointer"}`}
        onClick={() => {
          if (onDrillDown) {
            onDrillDown();
          } else {
            setExpanded((e) => !e);
          }
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Warehouse className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">{facility.facilityName}</h3>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                {facility.orders.length} order{facility.orders.length !== 1 ? "s" : ""} · {clientOptions.length} client{clientOptions.length !== 1 ? "s" : ""}
                {(() => {
                  const unalloc = facility.orders.filter((o) => o.lifecycleStatus === "unallocated").length;
                  return unalloc > 0 ? (
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold"
                      style={{ background: "#dbeafe", color: "#1d4ed8", border: "1px solid #bfdbfe" }}
                      title={`${unalloc} unallocated order${unalloc !== 1 ? "s" : ""}`}
                    >
                      {unalloc} unalloc.
                    </span>
                  ) : null;
                })()}
                {overdueCount > 0 && (
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold"
                    style={{ background: "#fee2e2", color: "#b91c1c", border: "1px solid #fecaca" }}
                    title={`${overdueCount} order${overdueCount !== 1 ? "s" : ""} out of SLA`}
                  >
                    {overdueCount} overdue
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!drillDown && !onDrillDown && (
              <button
                onClick={(e) => { e.stopPropagation(); setIsFullScreen(true); }}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Expand to full screen"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            )}
            {onDrillDown
              ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
              : expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>

        {/* Lifecycle KPI row */}
        <div className="flex flex-wrap gap-1.5">
          {(Object.entries(LIFECYCLE_CONFIG) as [LifecycleStatus, typeof LIFECYCLE_CONFIG[LifecycleStatus]][]).map(([status, cfg]) => (
            <div
              key={status}
              className="rounded-xl px-2 py-2 text-center border cursor-pointer transition-opacity flex-1 min-w-[72px]"
              style={{ background: cfg.bg, borderColor: cfg.border, opacity: statusFilter === status ? 1 : statusFilter === "all" ? 1 : 0.45 }}
              onClick={(e) => {
                e.stopPropagation();
                setStatusFilter((f) => (f === status ? "all" : status));
                if (!expanded) setExpanded(true);
              }}
            >
              <p className="text-[16px] font-extrabold leading-none" style={{ color: cfg.text }}>{counts[status]}</p>
              <p className="text-[9px] mt-0.5 font-medium uppercase tracking-[0.04em] truncate" style={{ color: cfg.text }}>{cfg.label}</p>
            </div>
          ))}
          {needsAttentionCount > 0 && (
            <div
              className="rounded-xl px-2 py-2 text-center border cursor-pointer transition-opacity flex-1 min-w-[72px]"
              style={{
                background: "#fff7ed",
                borderColor: statusFilter === "needs_attention" ? "#ea580c" : "#fed7aa",
                opacity: statusFilter === "needs_attention" ? 1 : statusFilter === "all" ? 1 : 0.45,
                outline: statusFilter === "needs_attention" ? "2px solid #ea580c" : "none",
              }}
              onClick={(e) => {
                e.stopPropagation();
                setStatusFilter((f) => (f === "needs_attention" ? "all" : "needs_attention"));
                if (!expanded) setExpanded(true);
              }}
              title="Orders in Quoting with zero bids for 2+ hours"
            >
              <p className="text-[16px] font-extrabold leading-none text-orange-600 flex items-center justify-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />{needsAttentionCount}
              </p>
              <p className="text-[9px] mt-1 font-medium uppercase tracking-wide text-orange-600">Attention</p>
            </div>
          )}
        </div>
      </div>

      {/* Collapsible order table */}
      {expanded && (
        <>
          {/* Filters row */}
          <div className="px-5 py-2.5 border-b border-border flex flex-wrap items-center gap-2 bg-muted/10">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search order, client, PO, city…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-8 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 w-52"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="py-1.5 px-2.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">All Clients</option>
              {clientOptions.map(([id, name]) => (
                <option key={id} value={String(id)}>{name}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as LifecycleStatus | "all")}
              className="py-1.5 px-2.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">All Statuses</option>
              {(Object.entries(LIFECYCLE_CONFIG) as [LifecycleStatus, typeof LIFECYCLE_CONFIG[LifecycleStatus]][]).map(([s, c]) => (
                <option key={s} value={s}>{c.label}</option>
              ))}
            </select>

            {/* Group by client toggle */}
            <button
              onClick={(e) => { e.stopPropagation(); setGroupByClient((g) => !g); }}
              className={`py-1.5 px-2.5 text-xs rounded-lg border transition-colors flex items-center gap-1.5 ${
                groupByClient
                  ? "bg-primary/10 border-primary/30 text-primary font-semibold"
                  : "border-border bg-background text-muted-foreground"
              }`}
            >
              <Users className="h-3 w-3" />
              Group by Client
            </button>

            {hasFilters && (
              <button
                onClick={() => { setSearch(""); setClientFilter("all"); setStatusFilter("all"); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}

            <span className="text-xs text-muted-foreground ml-auto">
              {hasFilters ? `${filteredOrders.length} of ${facility.orders.length}` : facility.orders.length} orders
            </span>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              {facility.orders.length === 0 ? (
                <p className="text-sm font-medium">No orders tracked yet. Sync will run shortly.</p>
              ) : (
                <>
                  <p className="text-sm font-medium">No orders match your filters.</p>
                  <button
                    onClick={() => { setSearch(""); setClientFilter("all"); setStatusFilter("all"); }}
                    className="text-xs text-primary hover:underline mt-1"
                  >
                    Clear filters
                  </button>
                </>
              )}
            </div>
          ) : groupByClient ? (
            /* ── Grouped by client ── */
            <div className="overflow-x-auto">
              <table className="w-full data-table">
                {tableHeader(false)}
                <tbody>
                  {groupedByClient.map((group) => {
                    const groupPieces = group.orders.reduce((s, o) => s + (o.totalPieces ?? 0), 0);
                    return [
                      <tr
                        key={`hdr-${group.clientId}`}
                        style={{ background: "#111827", borderLeft: "3px solid #374151" }}
                      >
                        <td colSpan={2} className="py-2 px-3">
                          <span className="text-[11px] font-bold text-white uppercase tracking-wider">{group.clientName}</span>
                        </td>
                        <td className="py-2 px-3 text-[10px] text-gray-400 font-medium">PO #</td>
                        <td className="py-2 px-3 text-[10px] text-gray-400 font-medium">Ship To</td>
                        <td className="py-2 px-3 text-[10px] text-gray-400 font-medium">City</td>
                        <td className="py-2 px-3 text-[10px] text-gray-400 font-medium text-right">Age</td>
                        <td className="py-2 px-3 text-[10px] text-gray-400 font-medium text-right">
                          {groupPieces > 0 ? groupPieces.toLocaleString() : ""}
                        </td>
                        <td className="py-2 px-3 text-[10px] text-gray-400 font-medium text-right">{group.orders.length} ord</td>
                        <td colSpan={2}></td>
                      </tr>,
                      ...group.orders.map((o) => orderRow(o, false)),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* ── Flat table ── */
            <div className="overflow-x-auto">
              <table className="w-full data-table">
                {tableHeader(true)}
                <tbody>
                  {filteredOrders.map((o) => orderRow(o, true))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <OrderDetailDrawer
        orderId={selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
      />
    </div>
  );
}
// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const { data, isLoading, refetch, isFetching } = trpc.pickSchedule.listByChannel.useQuery({ channel: "b2b" });
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);

  const syncNow = trpc.pickSchedule.syncNow.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      setTimeout(() => refetch(), 3000);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const orders: TrackedOrder[] = (data?.orders ?? []) as TrackedOrder[];
  const lastSyncAt = data?.lastSyncAt ? new Date(data.lastSyncAt as string | Date) : null;
  const syncRunning = data?.syncRunning ?? false;

  // Group by facility
  const facilities: FacilityGroup[] = useMemo(() => {
    const map = new Map<number, FacilityGroup>();
    for (const o of orders) {
      const fid = o.facilityId;
      if (!map.has(fid)) {
        map.set(fid, {
          facilityId: fid,
          facilityName: o.facilityName ?? `Warehouse ${fid}`,
          orders: [],
        });
      }
      map.get(fid)!.orders.push(o);
    }
    return Array.from(map.values()).sort((a, b) => a.facilityName.localeCompare(b.facilityName));
  }, [orders]);

  // Per-facility overdue counts from breach data
  const { data: breachData } = trpc.sla.clientBreachSummary.useQuery();

  // Unresolved verification issues (mismatch/partial/failed confirmed runs)
  const { data: verifData } = trpc.allocation.unresolvedVerificationCount.useQuery();
  const facilityOverdueCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const g of breachData ?? []) {
      if (g.facilityId != null) {
        map.set(g.facilityId, (map.get(g.facilityId) ?? 0) + g.breachCount);
      }
    }
    return map;
  }, [breachData]);

  // Global KPIs
  const kpis = useMemo(() => {
    const c: Record<LifecycleStatus, number> = { unallocated: 0, allocated: 0, picking: 0, qc: 0, qc_complete: 0, ship_ready: 0 };
    for (const o of orders) c[o.lifecycleStatus]++;
    return c;
  }, [orders]);

  const selectedFacility = selectedFacilityId !== null
    ? facilities.find((f) => f.facilityId === selectedFacilityId) ?? null
    : null;

  const [pendingClientFilter, setPendingClientFilter] = useState<string>("all");

  const handleBackToGrid = () => {
    setSelectedFacilityId(null);
    setPendingClientFilter("all");
  };

   return (
      <div className="flex flex-col h-full page-enter">
        {/* Sticky page header */}
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border px-5 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selectedFacility && (
              <button
                onClick={handleBackToGrid}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                All Warehouses
              </button>
            )}
            <div>
              <p className="page-breadcrumb">
                {selectedFacility ? `Open Orders › ${selectedFacility.facilityName}` : "Overview"}
              </p>
              <h1 className="page-title">
                {selectedFacility ? selectedFacility.facilityName : "Open Orders — B2B"}
              </h1>
              {lastSyncAt && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Last synced {lastSyncAt.toLocaleString()}
                  {syncRunning && <span className="ml-2 text-amber-500 font-medium animate-pulse">· Syncing…</span>}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncNow.mutate()}
              disabled={syncNow.isPending || syncRunning}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncNow.isPending || syncRunning ? "animate-spin" : ""}`} />
              Sync Now
            </Button>
            <Button asChild className="shadow-sm">
              <Link href="/allocate" className="flex items-center gap-2">
                <PackageSearch className="h-4 w-4" />
                Run Allocation Tool
              </Link>
            </Button>
           </div>
        </div>
        </div>{/* end sticky header */}
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Verification Issues KPI card — only shown when there are unresolved issues */}
        {!selectedFacility && (verifData?.count ?? 0) > 0 && (
          <Link href="/history">
            <div
              className="flex items-center gap-3 rounded-xl px-4 py-3 border cursor-pointer hover:opacity-90 transition-opacity"
              style={{ background: "#fee2e2", borderColor: "#fca5a5" }}
            >
              <ShieldAlert className="h-5 w-5 shrink-0" style={{ color: "#dc2626" }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold" style={{ color: "#991b1b" }}>
                  {verifData!.count} Allocation Run{verifData!.count !== 1 ? "s" : ""} with Verification Issues
                </p>
                <p className="text-xs mt-0.5" style={{ color: "#b91c1c" }}>
                  Extensiv reported a mismatch or partial allocation — review in Run History
                </p>
              </div>
              <span className="text-xs font-semibold shrink-0" style={{ color: "#dc2626" }}>View →</span>
            </div>
          </Link>
        )}

        {/* Loading skeletons */}
        {isLoading && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="h-36 bg-muted animate-pulse" />
                <div className="p-5 space-y-3">
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="h-10 bg-muted rounded-xl animate-pulse" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No orders yet */}
        {!isLoading && orders.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <Warehouse className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No orders tracked yet.</p>
            <p className="text-xs mt-1 opacity-70">
              Click <strong>Sync Now</strong> to pull open orders from Extensiv, or wait for the hourly auto-sync.
              Make sure an Extensiv connection is configured in{" "}
              <Link href="/settings" className="text-primary hover:underline">API Settings</Link>.
            </p>
          </div>
        )}

        {/* Drill-down: single warehouse expanded */}
        {!isLoading && selectedFacility && (
          <WarehouseCard
            key={`${selectedFacility.facilityId}-${pendingClientFilter}`}
            facility={selectedFacility}
            onStatusChanged={() => refetch()}
            drillDown
            laneThresholds={(data?.laneThresholds ?? []) as LaneThresholdEntry[]}
            initialClientFilter={pendingClientFilter}
            overdueCount={facilityOverdueCounts.get(selectedFacility.facilityId) ?? 0}
          />
        )}

        {/* Warehouse grid (no warehouse selected) */}
        {!isLoading && !selectedFacility && facilities.length > 0 && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {facilities.map((f) => (
              <WarehouseCard
                key={f.facilityId}
                facility={f}
                onStatusChanged={() => refetch()}
                onDrillDown={() => setSelectedFacilityId(f.facilityId)}
                laneThresholds={(data?.laneThresholds ?? []) as LaneThresholdEntry[]}
                overdueCount={facilityOverdueCounts.get(f.facilityId) ?? 0}
              />
            ))}
          </div>
        )}

        {/* SLA Breach Summary (only on grid view) */}
        {!isLoading && !selectedFacility && (
          <SlaBreachSummarySection
            onClientClick={(clientId, facilityId) => {
              if (facilityId) setSelectedFacilityId(facilityId);
              setPendingClientFilter(String(clientId));
            }}
          />
        )}
        </div>{/* end scrollable content */}
      </div>
  );
}
// ─── SLA Breach Summaryry ───────────────────────────────────────────────────────
function SlaBreachSummarySection({ onClientClick }: {
  onClientClick: (clientId: number, facilityId: number | null) => void;
}) {
  const { data: breachGroups, isLoading } = trpc.sla.clientBreachSummary.useQuery();
  const [collapsedWarehouses, setCollapsedWarehouses] = useState<Set<string>>(new Set());
  const toggleWarehouse = (name: string) => setCollapsedWarehouses(prev => {
    const next = new Set(prev);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <h3 className="text-[15px] font-bold">Orders Out of SLA</h3>
        </div>
        <div className="text-muted-foreground text-xs">Loading SLA data…</div>
      </div>
    );
  }

  if (!breachGroups || breachGroups.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <h3 className="text-[15px] font-bold">Orders Out of SLA</h3>
        </div>
        <div className="flex items-center gap-2 text-green-600 text-sm">
          <CheckCircle2 className="h-4 w-4" />
          <span>All orders are within SLA — great work!</span>
        </div>
      </div>
    );
  }

  const totalBreached = breachGroups.reduce((s, g) => s + g.breachCount, 0);

  // Group by warehouse, then sort clients within each warehouse by worstDaysOverdue desc
  const warehouseMap = new Map<string, { facilityName: string; facilityId: number | null; totalBreached: number; worstDaysOverdue: number; clients: typeof breachGroups }>();
  for (const g of breachGroups) {
    const key = g.facilityName ?? "Unknown";
    if (!warehouseMap.has(key)) {
      warehouseMap.set(key, { facilityName: key, facilityId: g.facilityId ?? null, totalBreached: 0, worstDaysOverdue: 0, clients: [] });
    }
    const wh = warehouseMap.get(key)!;
    wh.clients.push(g);
    wh.totalBreached += g.breachCount;
    wh.worstDaysOverdue = Math.max(wh.worstDaysOverdue, g.worstDaysOverdue);
  }
  // Sort warehouses by worst days overdue desc, clients within each by worst days overdue desc
  const warehouses = Array.from(warehouseMap.values())
    .sort((a, b) => b.worstDaysOverdue - a.worstDaysOverdue)
    .map(wh => ({ ...wh, clients: [...wh.clients].sort((a, b) => b.worstDaysOverdue - a.worstDaysOverdue) }));

  return (
    <div className="bg-card border-2 border-red-200 rounded-2xl overflow-hidden" style={{ boxShadow: "0 0 0 1px rgba(239,68,68,0.1), 0 4px 16px rgba(239,68,68,0.08)" }}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-red-50/40">
        <div className="flex items-center gap-2.5">
          <AlertCircle className="h-4.5 w-4.5 text-red-500" />
          <h3 className="text-[15px] font-bold text-foreground">Orders Out of SLA</h3>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">
            {totalBreached} order{totalBreached !== 1 ? "s" : ""}
          </span>
        </div>
        <Link href="/sla-performance">
          <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 text-xs font-medium">
            View SLA Tracker →
          </Button>
        </Link>
      </div>

      {/* Warehouse sections */}
      <div className="divide-y divide-border">
        {warehouses.map((wh) => {
          const isCollapsed = collapsedWarehouses.has(wh.facilityName);
          return (
            <div key={wh.facilityName}>
              {/* Warehouse header row */}
              <button
                onClick={() => toggleWarehouse(wh.facilityName)}
                className="w-full flex items-center justify-between px-6 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex items-center gap-2.5">
                  {isCollapsed
                    ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span className="text-[13px] font-bold text-foreground">{wh.facilityName}</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                    {wh.totalBreached} order{wh.totalBreached !== 1 ? "s" : ""}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{wh.clients.length} client{wh.clients.length !== 1 ? "s" : ""}</span>
                </div>
                <span className="text-red-600 font-bold text-xs">{wh.worstDaysOverdue}d worst overdue</span>
              </button>

              {/* Client rows table */}
              {!isCollapsed && (
                <table className="w-full data-table">
                  <thead>
                    <tr>
                      <th className="pl-10">Client</th>
                      <th className="text-center">Breached Orders</th>
                      <th className="text-right">Worst Overdue</th>
                      <th>Most Overdue Order</th>
                      <th>Stage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wh.clients.map((group) => {
                      const worst = group.orders[0];
                      return (
                        <tr key={group.clientId}>
                          <td className="pl-10">
                            <button
                              onClick={() => onClientClick(group.clientId, group.facilityId ?? null)}
                              className="font-semibold text-primary hover:underline hover:text-primary/80 transition-colors text-left cursor-pointer"
                              title={`Filter Open Orders for ${group.clientName}`}
                            >
                              {group.clientName}
                            </button>
                          </td>
                          <td className="text-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">
                              <TrendingUp className="h-2.5 w-2.5" />
                              {group.breachCount}
                            </span>
                          </td>
                          <td className="text-right">
                            <span className="text-red-600 font-bold text-xs">{group.worstDaysOverdue}d overdue</span>
                          </td>
                          <td className="text-muted-foreground font-mono text-xs">
                            {worst ? `TX#${worst.extensivOrderId}` : "—"}
                            {worst?.requiredShipDate && (
                              <span className="ml-1.5 text-[10px] text-muted-foreground/70">
                                (req. {new Date(worst.requiredShipDate).toLocaleDateString()})
                              </span>
                            )}
                          </td>
                          <td>
                            {worst && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground capitalize">
                                {worst.lifecycleStatus.replace("_", " ")}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

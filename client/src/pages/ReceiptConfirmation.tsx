import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  AlertTriangle,
  Flag,
  ArrowLeft,
  Loader2,
  PackageOpen,
  Boxes,
  ChevronRight,
  RotateCcw,
  Tag,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReceiveItem {
  receiverItemId: number;
  itemIdentifier: { sku: string; id: number };
  description?: string;
  expectedQty: number;
  receivedQty: number;
  lotNumber?: string;
}

type ItemStatus = "pending" | "confirmed" | "adjusted" | "flagged";

interface ItemState {
  status: ItemStatus;
  confirmedQty: number;
  note: string;
}

// ─── Status badge ────────────────────────────────────────────────────────────

function ItemStatusBadge({ status }: { status: ItemStatus }) {
  const map: Record<ItemStatus, { label: string; color: string }> = {
    pending:   { label: "Pending",   color: "bg-muted text-muted-foreground border-border" },
    confirmed: { label: "Confirmed", color: "bg-green-500/10 text-green-400 border-green-500/20" },
    adjusted:  { label: "Adjusted",  color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    flagged:   { label: "Flagged",   color: "bg-red-500/10 text-red-400 border-red-500/20" },
  };
  const s = map[status];
  return (
    <Badge className={cn("text-xs border px-2 py-0.5 rounded-full font-medium", s.color)}>
      {s.label}
    </Badge>
  );
}

// ─── Adjust Dialog ───────────────────────────────────────────────────────────

function AdjustDialog({
  item,
  open,
  onClose,
  onSave,
}: {
  item: ReceiveItem | null;
  open: boolean;
  onClose: () => void;
  onSave: (qty: number, note: string, status: "adjusted" | "flagged") => void;
}) {
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [flag, setFlag] = useState(false);

  useEffect(() => {
    if (open && item) {
      setQty(String(item.receivedQty > 0 ? item.receivedQty : item.expectedQty));
      setNote("");
      setFlag(false);
    }
  }, [open, item]);

  if (!item) return null;

  const parsedQty = parseInt(qty, 10);
  const valid = !isNaN(parsedQty) && parsedQty >= 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            Adjust Quantity — {item.itemIdentifier.sku}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-muted/40 rounded-xl p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Expected</p>
              <p className="font-semibold text-foreground tabular-nums">{item.expectedQty}</p>
            </div>
            <div className="bg-muted/40 rounded-xl p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Extensiv Received</p>
              <p className="font-semibold text-foreground tabular-nums">{item.receivedQty}</p>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Confirmed Quantity
            </label>
            <Input
              type="number"
              min={0}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="h-10"
              autoFocus
            />
            {valid && parsedQty !== item.expectedQty && (
              <p className="text-xs text-amber-400 mt-1">
                Variance: {parsedQty - item.expectedQty > 0 ? "+" : ""}{parsedQty - item.expectedQty} vs expected
              </p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Note <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              placeholder="Reason for adjustment, damage notes, etc."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="resize-none h-20 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={flag}
              onChange={(e) => setFlag(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-foreground">Flag this item for supervisor review</span>
          </label>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!valid}
            onClick={() => onSave(parsedQty, note, flag ? "flagged" : "adjusted")}
            className={flag ? "bg-red-600 hover:bg-red-700 text-white" : ""}
          >
            {flag ? <Flag className="h-4 w-4 mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
            {flag ? "Flag Item" : "Save Adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── MU Labels Dialog ────────────────────────────────────────────────────────

function MuLabelsDialog({
  open,
  labels,
  onClose,
  onComplete,
  completing,
}: {
  open: boolean;
  labels: Array<{ sku: string; muLabel: string; qty: number }>;
  onClose: () => void;
  onComplete: () => void;
  completing: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" />
            MU Labels Generated
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            {labels.length} MU label{labels.length !== 1 ? "s" : ""} have been generated and embedded in Extensiv.
            Print and attach these labels to the corresponding pallets before put-away.
          </p>
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>MU Label</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {labels.map((l) => (
                  <TableRow key={l.muLabel}>
                    <TableCell className="font-mono text-xs">{l.sku}</TableCell>
                    <TableCell className="font-mono text-xs font-semibold text-primary">{l.muLabel}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.qty}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button
            className="bg-green-600 hover:bg-green-700 text-white gap-2"
            onClick={onComplete}
            disabled={completing}
          >
            {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {completing ? "Completing…" : "Complete Receipt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ReceiptConfirmation() {
  const [, navigate] = useLocation();

  // Parse URL params
  const params = useMemo(() => {
    const sp = new URLSearchParams(window.location.search);
    return {
      configId: Number(sp.get("configId") ?? "0"),
      transactionId: Number(sp.get("transactionId") ?? "0"),
      referenceNum: sp.get("referenceNum") ?? "",
      facilityName: sp.get("facilityName") ?? "",
      facilityCode: sp.get("facilityCode") ?? "",
    };
  }, []);

  const { configId, transactionId, referenceNum, facilityName, facilityCode } = params;
  const valid = configId > 0 && transactionId > 0;

  // Load receipt detail
  const { data: detail, isLoading } = trpc.receiving.detail.useQuery(
    { configId, transactionId },
    { enabled: valid, staleTime: 30_000 }
  );

  // Load existing confirmations
  const { data: existingConfirmations, refetch: refetchConfirmations } =
    trpc.receiving.getConfirmations.useQuery(
      { configId, transactionId },
      { enabled: valid }
    );

  const items: ReceiveItem[] = (detail?.receiveItems ?? []) as ReceiveItem[];

  // Per-item local state
  const [itemStates, setItemStates] = useState<Record<number, ItemState>>({});

  // Seed from existing confirmations once loaded
  useEffect(() => {
    if (!existingConfirmations || existingConfirmations.length === 0) return;
    setItemStates((prev) => {
      const next = { ...prev };
      for (const c of existingConfirmations) {
        next[c.receiverItemId] = {
          status: c.status as ItemStatus,
          confirmedQty: c.confirmedQty,
          note: c.note ?? "",
        };
      }
      return next;
    });
  }, [existingConfirmations]);

  // Adjust dialog
  const [adjustTarget, setAdjustTarget] = useState<ReceiveItem | null>(null);

  // MU labels dialog
  const [muLabels, setMuLabels] = useState<Array<{ sku: string; muLabel: string; qty: number }>>([]);
  const [showMuDialog, setShowMuDialog] = useState(false);

  const utils = trpc.useUtils();

  // Mutations
  const confirmItemMutation = trpc.receiving.confirmItem.useMutation({
    onError: (err) => toast.error("Failed to save confirmation", { description: err.message }),
  });

  const generateMusMutation = trpc.receiving.generateMUs.useMutation({
    onSuccess: (result) => {
      setMuLabels(result.labels);
      setShowMuDialog(true);
      if (!result.syncedToExtensiv) {
        toast.warning("MU labels generated locally", {
          description: "Could not sync to Extensiv — labels saved locally only.",
        });
      } else {
        toast.success("MU labels generated and synced to Extensiv");
      }
    },
    onError: (err) => toast.error("Failed to generate MUs", { description: err.message }),
  });

  const completeReceiptMutation = trpc.receiving.completeReceipt.useMutation({
    onSuccess: () => {
      toast.success("Receipt completed", { description: "Status updated to Closed in Extensiv." });
      void utils.receiving.list.invalidate();
      void utils.receiving.kpis.invalidate();
      setShowMuDialog(false);
      navigate("/receiving");
    },
    onError: (err) => toast.error("Failed to complete receipt", { description: err.message }),
  });

  const resetMutation = trpc.receiving.resetConfirmations.useMutation({
    onSuccess: () => {
      setItemStates({});
      void refetchConfirmations();
      toast.info("Confirmations reset");
    },
  });

  // Derived counts
  const totalItems = items.length;
  const confirmedCount = items.filter((i) => {
    const s = itemStates[i.receiverItemId];
    return s && s.status !== "pending";
  }).length;
  const flaggedCount = items.filter((i) => itemStates[i.receiverItemId]?.status === "flagged").length;
  const allConfirmed = totalItems > 0 && confirmedCount === totalItems;

  // Confirm a single item at expected qty
  function handleConfirm(item: ReceiveItem) {
    const newState: ItemState = {
      status: "confirmed",
      confirmedQty: item.expectedQty,
      note: "",
    };
    setItemStates((prev) => ({ ...prev, [item.receiverItemId]: newState }));
    confirmItemMutation.mutate({
      configId,
      transactionId,
      receiverItemId: item.receiverItemId,
      sku: item.itemIdentifier.sku,
      expectedQty: item.expectedQty,
      confirmedQty: item.expectedQty,
      status: "confirmed",
    });
  }

  // Save an adjustment or flag
  function handleSaveAdjust(qty: number, note: string, status: "adjusted" | "flagged") {
    if (!adjustTarget) return;
    const item = adjustTarget;
    const newState: ItemState = { status, confirmedQty: qty, note };
    setItemStates((prev) => ({ ...prev, [item.receiverItemId]: newState }));
    confirmItemMutation.mutate({
      configId,
      transactionId,
      receiverItemId: item.receiverItemId,
      sku: item.itemIdentifier.sku,
      expectedQty: item.expectedQty,
      confirmedQty: qty,
      status,
      note,
    });
    setAdjustTarget(null);
  }

  function handleGenerateMUs() {
    generateMusMutation.mutate({ configId, transactionId, facilityCode: facilityCode || "WH" });
  }

  function handleCompleteReceipt() {
    completeReceiptMutation.mutate({ configId, transactionId });
  }

  if (!valid) {
    return (
      <div className="p-5 flex flex-col items-center justify-center py-32 text-center">
        <AlertTriangle className="h-10 w-10 text-red-400/60 mb-3" />
        <p className="text-base font-semibold text-foreground">Invalid receipt parameters</p>
        <p className="text-sm text-muted-foreground mt-1">Missing configId or transactionId in URL.</p>
        <Button variant="outline" className="mt-4 gap-2" onClick={() => navigate("/receiving")}>
          <ArrowLeft className="h-4 w-4" /> Back to Receiving
        </Button>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-5 page-enter max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <button
            onClick={() => navigate("/receiving")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Receiving Dashboard
          </button>
          <div className="flex items-center gap-2">
            <PackageOpen className="h-5 w-5 text-muted-foreground" />
            <h1 className="page-title">
              {referenceNum ? `Receipt — ${referenceNum}` : `Receipt #${transactionId}`}
            </h1>
          </div>
          {facilityName && (
            <p className="text-sm text-muted-foreground mt-1">{facilityName}</p>
          )}
        </div>

        {/* Progress pill */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-muted/40 rounded-xl px-4 py-2 text-sm">
            <span className="text-muted-foreground">Progress:</span>
            <span className={cn(
              "font-semibold tabular-nums",
              allConfirmed ? "text-green-400" : "text-foreground"
            )}>
              {confirmedCount} / {totalItems}
            </span>
            {flaggedCount > 0 && (
              <span className="text-red-400 text-xs">· {flaggedCount} flagged</span>
            )}
          </div>
          {confirmedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-8"
              onClick={() => resetMutation.mutate({ configId, transactionId })}
              disabled={resetMutation.isPending}
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Instructions banner */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-primary/20 bg-primary/5 text-sm">
        <ChevronRight className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p className="text-muted-foreground">
          For each SKU, click <strong className="text-foreground">Confirm</strong> if the quantity matches,
          or <strong className="text-foreground">Adjust</strong> to enter the actual count and add a note.
          Once all items are confirmed, generate MU labels and complete the receipt.
        </p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading receipt details…</span>
        </div>
      )}

      {/* Items table */}
      {!isLoading && items.length > 0 && (
        <div className="rounded-2xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-8">#</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Confirmed</TableHead>
                <TableHead>Lot</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, idx) => {
                const state = itemStates[item.receiverItemId];
                const status: ItemStatus = state?.status ?? "pending";
                const confirmedQty = state?.confirmedQty ?? item.expectedQty;
                const variance = state ? confirmedQty - item.expectedQty : 0;
                const rowColor =
                  status === "flagged"   ? "bg-red-500/5 border-l-2 border-l-red-500/50" :
                  status === "adjusted"  ? "bg-amber-500/5 border-l-2 border-l-amber-500/30" :
                  status === "confirmed" ? "bg-green-500/5 border-l-2 border-l-green-500/30" :
                  "";

                return (
                  <TableRow key={item.receiverItemId} className={rowColor}>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">{idx + 1}</TableCell>
                    <TableCell className="font-mono text-xs font-semibold">{item.itemIdentifier.sku}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">
                      {item.description || "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{item.expectedQty}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {state ? (
                        <span className={cn(
                          "font-semibold",
                          variance === 0 ? "text-foreground" :
                          variance > 0 ? "text-blue-400" : "text-red-400"
                        )}>
                          {confirmedQty}
                          {variance !== 0 && (
                            <span className="text-xs ml-1">
                              ({variance > 0 ? "+" : ""}{variance})
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.lotNumber || "—"}</TableCell>
                    <TableCell><ItemStatusBadge status={status} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {status === "pending" || status === "confirmed" ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2.5 text-xs gap-1 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                              onClick={() => handleConfirm(item)}
                              disabled={confirmItemMutation.isPending}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Confirm
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2.5 text-xs gap-1 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                              onClick={() => setAdjustTarget(item)}
                            >
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Adjust
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2.5 text-xs gap-1 text-muted-foreground hover:text-foreground"
                            onClick={() => setAdjustTarget(item)}
                          >
                            Edit
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-20 text-center">
          <Boxes className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No line items found</p>
          <p className="text-xs text-muted-foreground mt-1">
            This receipt has no items loaded. Start the receipt in Extensiv first.
          </p>
        </div>
      )}

      {/* Action footer */}
      {!isLoading && items.length > 0 && (
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border flex-wrap">
          <div className="text-sm text-muted-foreground">
            {allConfirmed ? (
              <span className="text-green-400 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                All {totalItems} items confirmed — ready to generate MUs
              </span>
            ) : (
              <span>{totalItems - confirmedCount} item{totalItems - confirmedCount !== 1 ? "s" : ""} remaining</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="gap-2 h-10 text-sm"
              onClick={() => navigate("/receiving")}
            >
              <ArrowLeft className="h-4 w-4" />
              Save & Exit
            </Button>
            <Button
              className="gap-2 h-10 text-sm font-semibold"
              disabled={!allConfirmed || generateMusMutation.isPending}
              onClick={handleGenerateMUs}
            >
              {generateMusMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Tag className="h-4 w-4" />
              )}
              {generateMusMutation.isPending ? "Generating MUs…" : "Generate MUs"}
            </Button>
          </div>
        </div>
      )}

      {/* Adjust dialog */}
      <AdjustDialog
        item={adjustTarget}
        open={adjustTarget !== null}
        onClose={() => setAdjustTarget(null)}
        onSave={handleSaveAdjust}
      />

      {/* MU Labels dialog */}
      <MuLabelsDialog
        open={showMuDialog}
        labels={muLabels}
        onClose={() => setShowMuDialog(false)}
        onComplete={handleCompleteReceipt}
        completing={completeReceiptMutation.isPending}
      />
    </div>
  );
}

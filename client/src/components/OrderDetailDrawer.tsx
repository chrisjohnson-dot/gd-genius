/**
 * OrderDetailDrawer
 * Slide-in right panel showing full details for a single tracked order.
 * Tabs: Overview · Line Items · Lifecycle Timeline · Shipwell
 */
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  X,
  Package,
  Truck,
  FlaskConical,
  CheckCircle2,
  ShipIcon,
  ClipboardCheck,
  ExternalLink,
  RefreshCw,
  MapPin,
  Calendar,
  Hash,
  Building2,
  User,
  AlertTriangle,
  Clock,
  Layers,
  Info,
} from "lucide-react";
import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type LifecycleStatus =
  | "unallocated"
  | "allocated"
  | "picking"
  | "qc"
  | "qc_complete"
  | "ship_ready";

const LIFECYCLE_STEPS: Array<{
  key: LifecycleStatus;
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  tsField: string;
}> = [
  { key: "unallocated", label: "Unallocated", icon: <Package className="h-3.5 w-3.5" />, color: "#1d4ed8", bg: "#dbeafe", tsField: "firstSeenAt" },
  { key: "allocated", label: "Allocated", icon: <ClipboardCheck className="h-3.5 w-3.5" />, color: "#4338ca", bg: "#e0e7ff", tsField: "allocatedAt" },
  { key: "picking", label: "Picking", icon: <Truck className="h-3.5 w-3.5" />, color: "#b45309", bg: "#fef3c7", tsField: "pickingAt" },
  { key: "qc", label: "QC", icon: <FlaskConical className="h-3.5 w-3.5" />, color: "#be185d", bg: "#fce7f3", tsField: "qcAt" },
  { key: "qc_complete", label: "QC Done", icon: <CheckCircle2 className="h-3.5 w-3.5" />, color: "#065f46", bg: "#d1fae5", tsField: "qcCompleteAt" },
  { key: "ship_ready", label: "Ship Ready", icon: <ShipIcon className="h-3.5 w-3.5" />, color: "#15803d", bg: "#dcfce7", tsField: "shipReadyAt" },
];

const LIFECYCLE_INDEX: Record<LifecycleStatus, number> = {
  unallocated: 0, allocated: 1, picking: 2, qc: 3, qc_complete: 4, ship_ready: 5,
};

function fmtDate(val: string | Date | null | undefined): string {
  if (!val) return "—";
  const d = new Date(val as string);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtDateShort(val: string | null | undefined): string {
  if (!val) return "—";
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysAgo(val: string | Date | null | undefined): string {
  if (!val) return "";
  const d = new Date(val as string);
  if (isNaN(d.getTime())) return "";
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "1 day ago";
  return `${diff} days ago`;
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────
const TABS = ["Overview", "Line Items", "Timeline", "Shipwell"] as const;
type Tab = typeof TABS[number];

// ─── Stat row helper ──────────────────────────────────────────────────────────
function Row({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground shrink-0 w-36">{label}</span>
      <span className={`text-xs font-medium text-right break-all ${mono ? "font-mono" : ""}`}>{value ?? "—"}</span>
    </div>
  );
}

// ─── Main drawer ──────────────────────────────────────────────────────────────
interface Props {
  orderId: number | null;
  onClose: () => void;
}

export function OrderDetailDrawer({ orderId, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("Overview");

  const { data, isLoading, error, refetch } = trpc.pickSchedule.getOrderDetail.useQuery(
    { id: orderId! },
    { enabled: orderId !== null, staleTime: 30_000 }
  );

  if (orderId === null) return null;

  const order = data?.order;
  const lineItems = data?.lineItems ?? [];
  const shipTo = data?.shipTo;
  const shipFrom = data?.shipFrom;
  const savedElements = data?.savedElements ?? [];
  const currentIdx = order ? LIFECYCLE_INDEX[order.lifecycleStatus] : -1;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[520px] bg-background shadow-2xl flex flex-col border-l border-border">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="min-w-0">
            {isLoading ? (
              <div className="h-5 w-48 bg-muted rounded animate-pulse mb-1" />
            ) : order ? (
              <>
                <p className="text-xs text-muted-foreground mb-0.5">{order.clientName} · {order.facilityName}</p>
                <h2 className="text-base font-bold truncate">
                  Order #{order.extensivOrderId}
                  {order.referenceNum && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">ref {order.referenceNum}</span>
                  )}
                </h2>
                {order.poNum && <p className="text-xs text-muted-foreground mt-0.5">PO: {order.poNum}</p>}
              </>
            ) : (
              <h2 className="text-base font-bold">Order Detail</h2>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <button
              onClick={() => refetch()}
              className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Status badge row */}
        {order && (
          <div className="px-5 py-2.5 border-b border-border shrink-0 flex items-center gap-2 flex-wrap">
            {LIFECYCLE_STEPS.map((step, i) => {
              const done = i < currentIdx;
              const active = i === currentIdx;
              return (
                <span
                  key={step.key}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                  style={{
                    background: active ? step.bg : done ? "#f1f5f9" : "transparent",
                    color: active ? step.color : done ? "#64748b" : "#94a3b8",
                    border: `1px solid ${active ? step.color + "40" : done ? "#e2e8f0" : "#e2e8f0"}`,
                    opacity: i > currentIdx ? 0.4 : 1,
                  }}
                >
                  {step.icon}
                  {step.label}
                </span>
              );
            })}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex border-b border-border shrink-0 px-5 gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-xs font-medium px-3 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
                tab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
              {t === "Line Items" && lineItems.length > 0 && (
                <span className="ml-1.5 bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[9px] font-bold">
                  {lineItems.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-8 bg-muted rounded animate-pulse" />
              ))}
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mb-2 text-destructive/60" />
              <p className="text-sm font-medium">Failed to load order details</p>
              <p className="text-xs mt-1 opacity-70">{error.message}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          )}

          {/* ── OVERVIEW TAB ── */}
          {!isLoading && !error && order && tab === "Overview" && (
            <div className="space-y-5">
              {/* Order identifiers */}
              <section>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Hash className="h-3 w-3" /> Order Info
                </h3>
                <div className="bg-muted/30 rounded-xl px-4 py-1">
                  <Row label="Extensiv Order ID" value={<span className="font-mono">{order.extensivOrderId}</span>} />
                  <Row label="Reference #" value={order.referenceNum} />
                  <Row label="PO #" value={order.poNum} />
                  <Row label="Created" value={fmtDateShort(order.creationDate)} />
                  <Row label="Required Ship Date" value={
                    order.requiredShipDate ? (
                      <span className={new Date(order.requiredShipDate) < new Date() ? "text-red-600 font-semibold" : ""}>
                        {fmtDateShort(order.requiredShipDate)}
                      </span>
                    ) : "—"
                  } />
                  <Row label="First Seen" value={`${fmtDate(order.firstSeenAt)} (${daysAgo(order.firstSeenAt)})`} />
                  <Row label="Last Synced" value={fmtDate(order.lastSyncedAt)} />
                </div>
              </section>

              {/* Client & facility */}
              <section>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Building2 className="h-3 w-3" /> Client & Facility
                </h3>
                <div className="bg-muted/30 rounded-xl px-4 py-1">
                  <Row label="Client" value={order.clientName} />
                  <Row label="Facility" value={order.facilityName} />
                  {order.assignedAssociate && <Row label="Associate" value={order.assignedAssociate} />}
                </div>
              </section>

              {/* Ship-to */}
              <section>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" /> Ship-To
                </h3>
                <div className="bg-muted/30 rounded-xl px-4 py-1">
                  {shipTo ? (
                    <>
                      <Row label="Company" value={shipTo.companyName} />
                      <Row label="Contact" value={shipTo.name} />
                      <Row label="Address" value={shipTo.address1} />
                      <Row label="City / State" value={[shipTo.city, shipTo.state, shipTo.zip].filter(Boolean).join(", ")} />
                      <Row label="Country" value={shipTo.country} />
                      <Row label="Phone" value={shipTo.phone} />
                    </>
                  ) : (
                    <>
                      <Row label="Ship-To Name" value={order.shipToName} />
                      <Row label="City" value={order.shipToCity} />
                    </>
                  )}
                </div>
              </section>

              {/* Quantities */}
              <section>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Layers className="h-3 w-3" /> Quantities
                </h3>
                <div className="bg-muted/30 rounded-xl px-4 py-1">
                  <Row label="Total Pieces" value={order.totalPieces ?? "—"} />
                  <Row label="SKU Count" value={order.skuCount ?? "—"} />
                  {order.lifecycleStatus === "ship_ready" && (
                    <>
                      <Row label="Pallet Count" value={order.palletCount ?? "—"} />
                      <Row label="Outbound Location" value={order.outboundLocation ?? "—"} />
                    </>
                  )}
                </div>
              </section>

              {/* SLA extension */}
              {(order.slaExtensionDays ?? 0) > 0 && (
                <section>
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" /> SLA Extension
                  </h3>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-1">
                    <Row label="Extension Days" value={`+${order.slaExtensionDays} days`} />
                    <Row label="Note" value={order.slaExtensionNote} />
                  </div>
                </section>
              )}

              {/* Notes */}
              {order.notes && (
                <section>
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Info className="h-3 w-3" /> Notes
                  </h3>
                  <div className="bg-muted/30 rounded-xl px-4 py-3">
                    <p className="text-xs leading-relaxed whitespace-pre-wrap">{order.notes}</p>
                  </div>
                </section>
              )}

              {/* Saved elements */}
              {savedElements.length > 0 && (
                <section>
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Info className="h-3 w-3" /> Custom Fields
                  </h3>
                  <div className="bg-muted/30 rounded-xl px-4 py-1">
                    {savedElements.map((el, i) => (
                      <Row key={i} label={el.name} value={el.value} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ── LINE ITEMS TAB ── */}
          {!isLoading && !error && tab === "Line Items" && (
            <div>
              {lineItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <Package className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm font-medium">No line items available</p>
                  <p className="text-xs mt-1 opacity-70">Line items are fetched live from Extensiv. Check your connection.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 text-muted-foreground">
                        <th className="text-left px-3 py-2 font-semibold">SKU</th>
                        <th className="text-right px-3 py-2 font-semibold">Qty</th>
                        <th className="text-left px-3 py-2 font-semibold">Lot</th>
                        <th className="text-left px-3 py-2 font-semibold">Exp Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((item, i) => (
                        <tr key={i} className="border-t border-border hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-2 font-mono font-semibold">{item.sku}</td>
                          <td className="px-3 py-2 text-right font-semibold">{item.qty.toLocaleString()}</td>
                          <td className="px-3 py-2 text-muted-foreground">{item.lotNumber ?? "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{item.expirationDate ? fmtDateShort(item.expirationDate) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/30">
                        <td className="px-3 py-2 font-bold text-muted-foreground">Total</td>
                        <td className="px-3 py-2 text-right font-bold">
                          {lineItems.reduce((s, i) => s + i.qty, 0).toLocaleString()}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── TIMELINE TAB ── */}
          {!isLoading && !error && order && tab === "Timeline" && (
            <div className="space-y-1">
              {LIFECYCLE_STEPS.map((step, i) => {
                const ts = (order as Record<string, unknown>)[step.tsField] as string | Date | null | undefined;
                const done = i <= currentIdx;
                const active = i === currentIdx;
                return (
                  <div key={step.key} className="flex gap-3">
                    {/* Connector line */}
                    <div className="flex flex-col items-center">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2"
                        style={{
                          background: done ? step.bg : "transparent",
                          borderColor: done ? step.color : "#e2e8f0",
                          color: done ? step.color : "#94a3b8",
                        }}
                      >
                        {step.icon}
                      </div>
                      {i < LIFECYCLE_STEPS.length - 1 && (
                        <div
                          className="w-0.5 flex-1 my-1 min-h-[20px]"
                          style={{ background: i < currentIdx ? step.color + "60" : "#e2e8f0" }}
                        />
                      )}
                    </div>
                    {/* Content */}
                    <div className="pb-4 min-w-0">
                      <p
                        className="text-sm font-semibold"
                        style={{ color: done ? (active ? step.color : "#1e293b") : "#94a3b8" }}
                      >
                        {step.label}
                        {active && (
                          <span
                            className="ml-2 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                            style={{ background: step.bg, color: step.color }}
                          >
                            Current
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {ts ? `${fmtDate(ts)} · ${daysAgo(ts)}` : (done ? "—" : "Not reached yet")}
                      </p>
                      {step.key === "picking" && order.assignedAssociate && (
                        <p className="text-xs mt-0.5 flex items-center gap-1 text-muted-foreground">
                          <User className="h-3 w-3" /> {order.assignedAssociate}
                        </p>
                      )}
                      {step.key === "ship_ready" && order.outboundLocation && (
                        <p className="text-xs mt-0.5 flex items-center gap-1 text-muted-foreground">
                          <MapPin className="h-3 w-3" /> {order.outboundLocation}
                          {order.palletCount ? ` · ${order.palletCount} pallets` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── SHIPWELL TAB ── */}
          {!isLoading && !error && order && tab === "Shipwell" && (
            <div className="space-y-5">
              {!order.shipwellOrderId ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <Truck className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm font-medium">Not yet sent to Shipwell</p>
                  <p className="text-xs mt-1 opacity-70">This order has not been submitted to the Shipwell TMS.</p>
                </div>
              ) : (
                <>
                  <section>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Truck className="h-3 w-3" /> Shipwell Status
                    </h3>
                    <div className="bg-muted/30 rounded-xl px-4 py-1">
                      <Row label="Status" value={
                        <span className="capitalize font-semibold">{order.shipwellStatus?.replace(/_/g, " ") ?? "—"}</span>
                      } />
                      <Row label="Carrier" value={data?.carrierName} />
                      <Row label="Ship Via" value={data?.shipVia} />
                      <Row label="Tracking #" value={data?.trackingNumber} mono />
                      <Row label="BOL #" value={data?.bolNumber} mono />
                      <Row label="Total Weight" value={data?.totalWeight ? `${data.totalWeight} lbs` : null} />
                      <Row label="Bid Count" value={order.shipwellBidCount ?? "—"} />
                    </div>
                  </section>

                  <section>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Clock className="h-3 w-3" /> Shipwell Timestamps
                    </h3>
                    <div className="bg-muted/30 rounded-xl px-4 py-1">
                      <Row label="Sent to Shipwell" value={fmtDate(order.shipwellSentAt)} />
                      <Row label="Quoting Started" value={fmtDate(order.shipwellQuotingStartedAt)} />
                      <Row label="Status Updated" value={fmtDate(order.shipwellStatusUpdatedAt)} />
                    </div>
                  </section>

                  <section>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                      <ExternalLink className="h-3 w-3" /> Links
                    </h3>
                    <div className="flex flex-col gap-2">
                      {order.shipwellPoUrl && (
                        <a
                          href={order.shipwellPoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-xs font-medium text-primary hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          View Purchase Order in Shipwell
                        </a>
                      )}
                      {order.shipwellShipmentUrl && (
                        <a
                          href={order.shipwellShipmentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-xs font-medium text-primary hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          View Shipment in Shipwell
                        </a>
                      )}
                    </div>
                  </section>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

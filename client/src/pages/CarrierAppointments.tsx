import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  CalendarDays, Clock, Truck, User, Phone, Mail, Hash, FileText,
  Plus, CheckCircle, XCircle, AlertCircle, ChevronLeft, ChevronRight,
  Search, Eye, Edit2, Trash2, Download, Printer, Package, MapPin,
  RefreshCw, ExternalLink
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type AppointmentStatus = "scheduled" | "confirmed" | "cancelled" | "completed";

interface Appointment {
  id: number;
  extensivOrderId: number;
  clientName: string | null;
  facilityId: number | null;
  facilityName: string | null;
  outboundLocation: string | null;
  palletCount: number | null;
  scheduledDate: string;
  scheduledTimeStart: string | null;
  scheduledTimeEnd: string | null;
  carrierName: string | null;
  driverName: string | null;
  trailerNumber: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  bolNumber: string | null;
  proNumber: string | null;
  notes: string | null;
  status: AppointmentStatus;
  bolDocUrl: string | null;
  packingListDocUrl: string | null;
  documentsGeneratedAt: string | null;
  createdByName: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<AppointmentStatus, { label: string; color: string; icon: React.ElementType }> = {
  scheduled:  { label: "Scheduled",  color: "bg-blue-100 text-blue-800 border-blue-200",   icon: CalendarDays },
  confirmed:  { label: "Confirmed",  color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle },
  cancelled:  { label: "Cancelled",  color: "bg-red-100 text-red-800 border-red-200",       icon: XCircle },
  completed:  { label: "Completed",  color: "bg-gray-100 text-gray-700 border-gray-200",    icon: CheckCircle },
};

function StatusBadge({ status }: { status: AppointmentStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

// ─── Book Appointment Dialog ──────────────────────────────────────────────────

function BookAppointmentDialog({
  open,
  onClose,
  prefillOrderId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  prefillOrderId?: number;
  onSuccess: () => void;
}) {
  const [orderId, setOrderId] = useState(prefillOrderId?.toString() ?? "");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [timeStart, setTimeStart] = useState("08:00");
  const [timeEnd, setTimeEnd] = useState("10:00");
  const [carrierName, setCarrierName] = useState("");
  const [driverName, setDriverName] = useState("");
  const [trailerNumber, setTrailerNumber] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [bolNumber, setBolNumber] = useState("");
  const [proNumber, setProNumber] = useState("");
  const [notes, setNotes] = useState("");

  // Look up order details when orderId changes
  const orderQuery = trpc.carrierAppointments.getOrderDetails.useQuery(
    { extensivOrderId: parseInt(orderId) },
    { enabled: orderId.length > 4 && !isNaN(parseInt(orderId)) }
  );
  const order = orderQuery.data;

  const createMutation = trpc.carrierAppointments.create.useMutation({
    onSuccess: () => {
      toast.success("Appointment booked — carrier appointment has been scheduled.");
      onSuccess();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!orderId || !date) return;
    // Auto-fill from order lookup if available
    createMutation.mutate({
      extensivOrderId: parseInt(orderId),
      clientName: order?.clientName ?? "Unknown",
      facilityId: order?.facilityId ?? 0,
      facilityName: order?.facilityName ?? undefined,
      outboundLocation: order?.outboundLocation ?? undefined,
      palletCount: order?.palletCount ?? undefined,
      referenceNum: order?.referenceNum ?? undefined,
      shipToName: order?.shipToName ?? undefined,
      scheduledDate: date,
      scheduledTimeStart: timeStart || undefined,
      scheduledTimeEnd: timeEnd || undefined,
      carrierName: carrierName || undefined,
      driverName: driverName || undefined,
      trailerNumber: trailerNumber || undefined,
      contactPhone: contactPhone || undefined,
      contactEmail: contactEmail || undefined,
      bolNumber: bolNumber || undefined,
      proNumber: proNumber || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-blue-600" />
            Book Carrier Appointment
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Order lookup */}
          <div className="space-y-2">
            <Label>Order / Transaction ID *</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Enter Extensiv order ID..."
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="flex-1"
              />
              {orderQuery.isFetching && <RefreshCw className="h-4 w-4 animate-spin self-center text-muted-foreground" />}
            </div>
            {order && (
              <div className="rounded-lg border bg-blue-50/50 p-3 text-sm space-y-1">
                <div className="font-semibold text-blue-900">{order.clientName}</div>
                <div className="text-muted-foreground flex gap-4 flex-wrap">
                  <span className="flex items-center gap-1"><Package className="h-3 w-3" /> {order.palletCount ?? "—"} pallets</span>
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {order.outboundLocation ?? "No dock assigned"}</span>
                  {order.facilityName && <span>{order.facilityName}</span>}
                </div>
              </div>
            )}
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2 col-span-1">
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Arrival Window Start</Label>
              <Input type="time" value={timeStart} onChange={(e) => setTimeStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Arrival Window End</Label>
              <Input type="time" value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} />
            </div>
          </div>

          {/* Carrier info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Carrier Name</Label>
              <Input placeholder="e.g. FedEx Freight" value={carrierName} onChange={(e) => setCarrierName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Trailer Number</Label>
              <Input placeholder="e.g. TRL-4821" value={trailerNumber} onChange={(e) => setTrailerNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Driver Name</Label>
              <Input placeholder="Driver full name" value={driverName} onChange={(e) => setDriverName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Driver Phone</Label>
              <Input placeholder="+1 (555) 000-0000" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Contact Email</Label>
              <Input type="email" placeholder="dispatch@carrier.com" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>BOL Number</Label>
              <Input placeholder="BOL reference" value={bolNumber} onChange={(e) => setBolNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>PRO Number</Label>
              <Input placeholder="PRO / tracking number" value={proNumber} onChange={(e) => setProNumber(e.target.value)} />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea placeholder="Special instructions, dock requirements, etc." value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!orderId || !date || createMutation.isPending}
          >
            {createMutation.isPending ? "Booking..." : "Book Appointment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Appointment Detail Dialog ────────────────────────────────────────────────

function AppointmentDetailDialog({
  appointment,
  onClose,
  onRefresh,
}: {
  appointment: Appointment;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const confirmMutation = trpc.carrierAppointments.confirm.useMutation({
    onSuccess: () => { toast.success("Appointment confirmed"); onRefresh(); },
    onError: (err) => toast.error(err.message),
  });

  const cancelMutation = trpc.carrierAppointments.cancel.useMutation({
    onSuccess: () => { toast.success("Appointment cancelled"); onRefresh(); onClose(); },
    onError: (err) => toast.error(err.message),
  });

  const generateDocsMutation = trpc.carrierAppointments.generateDocuments.useMutation({
    onSuccess: () => { toast.success("Documents generated — BOL and packing list are ready."); onRefresh(); },
    onError: (err) => toast.error(err.message),
  });

  const handleStartPickup = () => {
    navigate(`/shipping/carrier-pickup?orderId=${appointment.extensivOrderId}`);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-blue-600" />
              Appointment #{appointment.id}
            </span>
            <StatusBadge status={appointment.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          {/* Order info */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <div className="font-semibold text-base">{appointment.clientName ?? "Unknown Client"}</div>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <span className="flex items-center gap-1"><Hash className="h-3 w-3" /> Order {appointment.extensivOrderId}</span>
              {appointment.facilityName && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {appointment.facilityName}</span>}
              {appointment.palletCount && <span className="flex items-center gap-1"><Package className="h-3 w-3" /> {appointment.palletCount} pallets</span>}
              {appointment.outboundLocation && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> Dock: {appointment.outboundLocation}</span>}
            </div>
          </div>

          {/* Schedule */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Scheduled Date</div>
              <div className="font-medium flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5 text-blue-500" /> {appointment.scheduledDate}</div>
            </div>
            {appointment.scheduledTimeStart && (
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Arrival Window</div>
                <div className="font-medium flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-blue-500" />
                  {appointment.scheduledTimeStart}{appointment.scheduledTimeEnd ? ` – ${appointment.scheduledTimeEnd}` : ""}
                </div>
              </div>
            )}
          </div>

          {/* Carrier */}
          <div className="grid grid-cols-2 gap-3">
            {appointment.carrierName && (
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Carrier</div>
                <div className="font-medium flex items-center gap-1"><Truck className="h-3.5 w-3.5" /> {appointment.carrierName}</div>
              </div>
            )}
            {appointment.driverName && (
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Driver</div>
                <div className="font-medium flex items-center gap-1"><User className="h-3.5 w-3.5" /> {appointment.driverName}</div>
              </div>
            )}
            {appointment.trailerNumber && (
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Trailer</div>
                <div className="font-medium">{appointment.trailerNumber}</div>
              </div>
            )}
            {appointment.contactPhone && (
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Phone</div>
                <div className="font-medium flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {appointment.contactPhone}</div>
              </div>
            )}
            {appointment.bolNumber && (
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">BOL #</div>
                <div className="font-medium">{appointment.bolNumber}</div>
              </div>
            )}
            {appointment.proNumber && (
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">PRO #</div>
                <div className="font-medium">{appointment.proNumber}</div>
              </div>
            )}
          </div>

          {appointment.notes && (
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Notes</div>
              <div className="text-sm bg-muted/40 rounded p-2">{appointment.notes}</div>
            </div>
          )}

          {/* Documents */}
          <div className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-medium flex items-center gap-1.5"><FileText className="h-4 w-4 text-blue-500" /> Pickup Documents</div>
              {appointment.documentsGeneratedAt ? (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Ready
                </span>
              ) : (
                <span className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Not generated
                </span>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {appointment.bolDocUrl ? (
                <a href={appointment.bolDocUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Download className="h-3.5 w-3.5" /> BOL
                  </Button>
                </a>
              ) : null}
              {appointment.packingListDocUrl ? (
                <a href={appointment.packingListDocUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Download className="h-3.5 w-3.5" /> Packing List
                  </Button>
                </a>
              ) : null}
              {appointment.status !== "cancelled" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => generateDocsMutation.mutate({ id: appointment.id })}
                  disabled={generateDocsMutation.isPending}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${generateDocsMutation.isPending ? "animate-spin" : ""}`} />
                  {appointment.documentsGeneratedAt ? "Regenerate" : "Generate Docs"}
                </Button>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {appointment.status === "scheduled" && (
            <Button
              variant="outline"
              className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
              onClick={() => cancelMutation.mutate({ id: appointment.id })}
              disabled={cancelMutation.isPending}
            >
              <XCircle className="h-4 w-4" /> Cancel
            </Button>
          )}
          {appointment.status === "scheduled" && (
            <Button
              variant="outline"
              className="gap-1.5 border-green-200 text-green-700 hover:bg-green-50"
              onClick={() => confirmMutation.mutate({ id: appointment.id })}
              disabled={confirmMutation.isPending}
            >
              <CheckCircle className="h-4 w-4" /> Confirm Appointment
            </Button>
          )}
          {(appointment.status === "confirmed" || appointment.status === "scheduled") && (
            <Button className="gap-1.5" onClick={handleStartPickup}>
              <Truck className="h-4 w-4" /> Start Carrier Pickup
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CarrierAppointments() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | AppointmentStatus>("active");  // default: hide completed
  const [searchQuery, setSearchQuery] = useState("");
  const [showBookDialog, setShowBookDialog] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [, navigate] = useLocation();

  // "active" is a client-side filter: fetch all then exclude completed + cancelled
  // Refetch every 2 minutes instead of 30s — reduces server load significantly
  const listQuery = trpc.carrierAppointments.list.useQuery(
    { status: statusFilter === "active" ? "all" : statusFilter },
    { refetchInterval: 120_000 }
  );

  const appointments: Appointment[] = (listQuery.data ?? []) as unknown as Appointment[];

  const filtered = useMemo(() => {
    let base = appointments;
    // "active" filter: exclude completed and cancelled appointments
    if (statusFilter === "active") {
      base = base.filter(a => a.status !== "completed" && a.status !== "cancelled");
    }
    // Client-side date filter (faster than round-tripping to server on every date change)
    if (selectedDate) {
      base = base.filter(a => !a.scheduledDate || a.scheduledDate === selectedDate);
    }
    if (!searchQuery.trim()) return base;
    const q = searchQuery.toLowerCase();
    return base.filter(a =>
      (a.clientName?.toLowerCase().includes(q)) ||
      (a.extensivOrderId?.toString().includes(q)) ||
      (a.bolNumber?.toLowerCase().includes(q)) ||
      (a.proNumber?.toLowerCase().includes(q)) ||
      (a.carrierName?.toLowerCase().includes(q)) ||
      (a.driverName?.toLowerCase().includes(q)) ||
      (a.trailerNumber?.toLowerCase().includes(q))
    );
  }, [appointments, searchQuery]);

  // Navigate date
  const shiftDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const today = new Date().toISOString().split("T")[0];

  // Summary counts
  const counts = useMemo(() => ({
    scheduled: appointments.filter(a => a.status === "scheduled").length,
    confirmed: appointments.filter(a => a.status === "confirmed").length,
    noDocuments: appointments.filter(a => !a.documentsGeneratedAt && a.status !== "cancelled").length,
  }), [appointments]);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-blue-600" />
            Carrier Appointments
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Schedule and manage carrier pickup appointments</p>
        </div>
        <Button onClick={() => setShowBookDialog(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Book Appointment
        </Button>
      </div>

      {/* Summary KPIs */}
      {appointments.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border bg-blue-50 p-4">
            <div className="text-2xl font-bold text-blue-700">{counts.scheduled}</div>
            <div className="text-sm text-blue-600">Awaiting Confirmation</div>
          </div>
          <div className="rounded-xl border bg-green-50 p-4">
            <div className="text-2xl font-bold text-green-700">{counts.confirmed}</div>
            <div className="text-sm text-green-600">Confirmed Today</div>
          </div>
          <div className={`rounded-xl border p-4 ${counts.noDocuments > 0 ? "bg-amber-50" : "bg-gray-50"}`}>
            <div className={`text-2xl font-bold ${counts.noDocuments > 0 ? "text-amber-700" : "text-gray-500"}`}>{counts.noDocuments}</div>
            <div className={`text-sm ${counts.noDocuments > 0 ? "text-amber-600" : "text-gray-500"}`}>Documents Pending</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Date navigator */}
        <div className="flex items-center gap-1 border rounded-lg px-2 py-1">
          <button onClick={() => shiftDate(-1)} className="p-1 hover:bg-muted rounded">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border-0 shadow-none w-36 text-sm p-0 h-auto focus-visible:ring-0"
          />
          <button onClick={() => shiftDate(1)} className="p-1 hover:bg-muted rounded">
            <ChevronRight className="h-4 w-4" />
          </button>
          {selectedDate !== today && (
            <button
              onClick={() => setSelectedDate(today)}
              className="text-xs text-blue-600 px-2 hover:underline"
            >
              Today
            </button>
          )}
        </div>

        {/* Status filter */}
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by client, order, BOL, carrier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Button variant="outline" size="icon" onClick={() => listQuery.refetch()}>
          <RefreshCw className={`h-4 w-4 ${listQuery.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Appointment list */}
      {listQuery.isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading appointments...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border rounded-xl bg-muted/20">
          <CalendarDays className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <div className="font-medium text-lg">No appointments</div>
          <div className="text-muted-foreground text-sm mt-1">
            {searchQuery ? "No appointments match your search." : `No appointments scheduled for ${selectedDate}.`}
          </div>
          <Button className="mt-4 gap-2" onClick={() => setShowBookDialog(true)}>
            <Plus className="h-4 w-4" /> Book First Appointment
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((appt) => (
            <div
              key={appt.id}
              className="border rounded-xl p-4 bg-card hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedAppointment(appt)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-base">{appt.clientName ?? "Unknown Client"}</span>
                    <StatusBadge status={appt.status} />
                    {!appt.documentsGeneratedAt && appt.status !== "cancelled" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                        <AlertCircle className="h-3 w-3" /> Docs pending
                      </span>
                    )}
                    {appt.documentsGeneratedAt && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                        <FileText className="h-3 w-3" /> Docs ready
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Hash className="h-3 w-3" /> Order {appt.extensivOrderId}
                    </span>
                    {appt.scheduledTimeStart && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {appt.scheduledTimeStart}{appt.scheduledTimeEnd ? ` – ${appt.scheduledTimeEnd}` : ""}
                      </span>
                    )}
                    {appt.carrierName && (
                      <span className="flex items-center gap-1">
                        <Truck className="h-3 w-3" /> {appt.carrierName}
                      </span>
                    )}
                    {appt.driverName && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" /> {appt.driverName}
                      </span>
                    )}
                    {appt.outboundLocation && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> Dock: {appt.outboundLocation}
                      </span>
                    )}
                    {appt.palletCount && (
                      <span className="flex items-center gap-1">
                        <Package className="h-3 w-3" /> {appt.palletCount} pallets
                      </span>
                    )}
                  </div>
                </div>

                {/* Quick actions */}
                <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {appt.bolDocUrl && (
                    <a href={appt.bolDocUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="gap-1 text-xs">
                        <Download className="h-3 w-3" /> BOL
                      </Button>
                    </a>
                  )}
                  {(appt.status === "confirmed" || appt.status === "scheduled") && (
                    <Button
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => navigate(`/shipping/carrier-pickup?orderId=${appt.extensivOrderId}`)}
                    >
                      <Truck className="h-3 w-3" /> Start Pickup
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialogs */}
      {showBookDialog && (
        <BookAppointmentDialog
          open={showBookDialog}
          onClose={() => setShowBookDialog(false)}
          onSuccess={() => listQuery.refetch()}
        />
      )}

      {selectedAppointment && (
        <AppointmentDetailDialog
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
          onRefresh={() => { listQuery.refetch(); setSelectedAppointment(null); }}
        />
      )}
    </div>
  );
}

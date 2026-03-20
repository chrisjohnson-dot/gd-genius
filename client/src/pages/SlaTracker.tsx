import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit2,
  MessageSquare,
  Plus,
  RefreshCw,
  Timer,
  Trash2,
  Warehouse,
  ArrowUpDown,
  Maximize2,
  Minimize2,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
type SlaOrder = {
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
  creationDate: string | null;
  lifecycleStatus: string;
  notes: string | null;
  assignedAssociate: string | null;
  slaDays: number;
  ageCalendarDays: number;
  slaStatus: "in_sla" | "out_of_sla";
  daysRemaining: number;
};

type SlaRequirement = {
  id: number;
  clientId: number;
  clientName: string;
  slaDays: number;
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

// ─── SLA pill ─────────────────────────────────────────────────────────────────
function SlaPill({ status, daysRemaining }: { status: "in_sla" | "out_of_sla"; daysRemaining: number }) {
  if (status === "in_sla") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap bg-green-100 text-green-700 border border-green-200">
        <CheckCircle2 className="h-2.5 w-2.5" />
        In SLA {daysRemaining > 0 ? `(${daysRemaining}d left)` : "(today)"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap bg-red-100 text-red-700 border border-red-200">
      <AlertTriangle className="h-2.5 w-2.5" />
      Out of SLA ({Math.abs(daysRemaining)}d overdue)
    </span>
  );
}

// ─── Warehouse card ───────────────────────────────────────────────────────────
type SortKey = "clientName" | "referenceNum" | "ageCalendarDays" | "slaStatus" | "shipToName";
type SortDir = "asc" | "desc";

function WarehouseSlaCard({ facilityName, orders }: { facilityName: string; orders: SlaOrder[] }) {
  const [expanded, setExpanded] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("slaStatus");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filterStatus, setFilterStatus] = useState<"all" | "in_sla" | "out_of_sla">("all");
  const [isFullScreen, setIsFullScreen] = useState(false);

  const inSlaCount = orders.filter((o) => o.slaStatus === "in_sla").length;
  const outOfSlaCount = orders.filter((o) => o.slaStatus === "out_of_sla").length;

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const filtered = useMemo(() => {
    let list = filterStatus === "all" ? orders : orders.filter((o) => o.slaStatus === filterStatus);
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "ageCalendarDays") cmp = a.ageCalendarDays - b.ageCalendarDays;
      else if (sortKey === "slaStatus") {
        // out_of_sla first when asc
        cmp = a.slaStatus === b.slaStatus ? 0 : a.slaStatus === "out_of_sla" ? -1 : 1;
      } else {
        cmp = String(a[sortKey as keyof SlaOrder] ?? "").localeCompare(String(b[sortKey as keyof SlaOrder] ?? ""));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [orders, filterStatus, sortKey, sortDir]);

  function SortIcon({ col }: { col: SortKey }) {
    if (col !== sortKey) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30 inline" />;
    return sortDir === "asc"
      ? <ChevronUp className="h-3 w-3 ml-1 text-blue-500 inline" />
      : <ChevronDown className="h-3 w-3 ml-1 text-blue-500 inline" />;
  }

  const hasBreaches = outOfSlaCount > 0;

  // ── Full-screen overlay ──
  if (isFullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background" style={{ overflow: "hidden" }}>
        {/* Full-screen header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0"
          style={{ borderLeft: hasBreaches ? "4px solid #ef4444" : "4px solid transparent" }}
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center">
              <Warehouse className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-foreground">{facilityName}</h2>
                {hasBreaches && (
                  <Badge className="bg-red-100 text-red-700 border border-red-200 text-[10px] font-bold">
                    <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                    {outOfSlaCount} Breached
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{orders.length} orders tracked</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* KPI pills in header */}
            <div className="hidden md:flex items-center gap-2">
              <button
                className={`rounded-lg px-3 py-1.5 text-center border cursor-pointer transition-all ${filterStatus === "in_sla" ? "ring-2 ring-green-400" : ""}`}
                style={{ background: "#dcfce7", border: "1px solid #bbf7d0" }}
                onClick={() => setFilterStatus(filterStatus === "in_sla" ? "all" : "in_sla")}
              >
                <p className="text-[15px] font-extrabold leading-none text-green-700">{inSlaCount}</p>
                <p className="text-[8px] mt-0.5 font-semibold uppercase tracking-wide text-green-600">In SLA</p>
              </button>
              <button
                className={`rounded-lg px-3 py-1.5 text-center border cursor-pointer transition-all ${filterStatus === "out_of_sla" ? "ring-2 ring-red-400" : ""}`}
                style={{ background: "#fee2e2", border: "1px solid #fecaca" }}
                onClick={() => setFilterStatus(filterStatus === "out_of_sla" ? "all" : "out_of_sla")}
              >
                <p className="text-[15px] font-extrabold leading-none text-red-700">{outOfSlaCount}</p>
                <p className="text-[8px] mt-0.5 font-semibold uppercase tracking-wide text-red-600">Out of SLA</p>
              </button>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setIsFullScreen(false)}>
              <Minimize2 className="h-3.5 w-3.5" />
              Exit Full Screen
            </Button>
          </div>
        </div>

        {/* Scrollable table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px] cursor-pointer whitespace-nowrap" onClick={() => handleSort("slaStatus")}>SLA Status <SortIcon col="slaStatus" /></th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px] cursor-pointer whitespace-nowrap" onClick={() => handleSort("referenceNum")}>Order # <SortIcon col="referenceNum" /></th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">PO #</th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px] cursor-pointer whitespace-nowrap" onClick={() => handleSort("clientName")}>Client <SortIcon col="clientName" /></th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px] cursor-pointer whitespace-nowrap" onClick={() => handleSort("shipToName")}>Ship To <SortIcon col="shipToName" /></th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Create Date</th>
                <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider text-[10px] cursor-pointer whitespace-nowrap" onClick={() => handleSort("ageCalendarDays")}>Age <SortIcon col="ageCalendarDays" /></th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Stage</th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">SLA Days</th>
                <th className="px-4 py-2.5 text-center font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground text-xs">No orders match the current filter.</td></tr>
              ) : (
                filtered.map((o) => (
                  <tr key={o.extensivOrderId} style={o.slaStatus === "out_of_sla" ? { background: "rgba(239,68,68,0.04)", borderLeft: "3px solid #ef4444" } : { borderLeft: "3px solid transparent" }}>
                    <td className="px-4 py-2"><SlaPill status={o.slaStatus} daysRemaining={o.daysRemaining} /></td>
                    <td className="px-4 py-2 font-semibold text-foreground">{o.referenceNum || `#${o.extensivOrderId}`}</td>
                    <td className="px-4 py-2 text-muted-foreground font-mono">{o.poNum ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{o.clientName}</td>
                    <td className="px-4 py-2 text-muted-foreground max-w-[140px] truncate" title={o.shipToName ?? ""}>{o.shipToName ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{o.creationDate ? new Date(o.creationDate).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground text-right whitespace-nowrap">{o.ageCalendarDays === 0 ? "Today" : `${o.ageCalendarDays}d`}</td>
                    <td className="px-4 py-2"><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground capitalize">{o.lifecycleStatus.replace("_", " ")}</span></td>
                    <td className="px-4 py-2 text-muted-foreground text-center">{o.slaDays}d</td>
                    <td className="px-4 py-2 text-center">
                      {o.notes ? (
                        <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild><MessageSquare className="h-3.5 w-3.5 text-blue-400 cursor-default inline" /></TooltipTrigger><TooltipContent side="left" className="max-w-[220px] text-xs">{o.notes}</TooltipContent></Tooltip></TooltipProvider>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-card rounded-2xl overflow-hidden"
      style={{
        border: hasBreaches ? "2px solid #ef4444" : "1px solid hsl(var(--border))",
        boxShadow: hasBreaches ? "0 0 0 1px rgba(239,68,68,0.15), 0 4px 16px rgba(239,68,68,0.10)" : undefined,
      }}
    >
      {/* Card header */}
      <div
        className="px-6 py-5 cursor-pointer select-none bg-card border-b border-border"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center">
              <Warehouse className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-[15px] leading-tight">{facilityName}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{orders.length} orders tracked</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasBreaches && (
              <Badge className="bg-red-100 text-red-700 border border-red-200 text-[10px] font-bold">
                <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                {outOfSlaCount} Breached
              </Badge>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setIsFullScreen(true); }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Expand to full screen"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 gap-3">
          <button
            className={`rounded-xl p-3 text-center transition-all border cursor-pointer ${filterStatus === "in_sla" ? "ring-2 ring-green-400" : ""}`}
            style={{ background: "#dcfce7", border: "1px solid #bbf7d0" }}
            onClick={(e) => { e.stopPropagation(); setFilterStatus(filterStatus === "in_sla" ? "all" : "in_sla"); if (!expanded) setExpanded(true); }}
          >
            <p className="text-2xl font-bold text-green-700">{inSlaCount}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-green-600 mt-0.5">In SLA</p>
          </button>
          <button
            className={`rounded-xl p-3 text-center transition-all border cursor-pointer ${filterStatus === "out_of_sla" ? "ring-2 ring-red-400" : ""}`}
            style={{ background: "#fee2e2", border: "1px solid #fecaca" }}
            onClick={(e) => { e.stopPropagation(); setFilterStatus(filterStatus === "out_of_sla" ? "all" : "out_of_sla"); if (!expanded) setExpanded(true); }}
          >
            <p className="text-2xl font-bold text-red-700">{outOfSlaCount}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-red-600 mt-0.5">Out of SLA</p>
          </button>
        </div>
      </div>

      {/* Order table */}
      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px] cursor-pointer whitespace-nowrap" onClick={() => handleSort("slaStatus")}>
                  SLA Status <SortIcon col="slaStatus" />
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px] cursor-pointer whitespace-nowrap" onClick={() => handleSort("referenceNum")}>
                  Order # <SortIcon col="referenceNum" />
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">PO #</th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px] cursor-pointer whitespace-nowrap" onClick={() => handleSort("clientName")}>
                  Client <SortIcon col="clientName" />
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px] cursor-pointer whitespace-nowrap" onClick={() => handleSort("shipToName")}>
                  Ship To <SortIcon col="shipToName" />
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Create Date</th>
                <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider text-[10px] cursor-pointer whitespace-nowrap" onClick={() => handleSort("ageCalendarDays")}>
                  Age <SortIcon col="ageCalendarDays" />
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Stage</th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">SLA Days</th>
                <th className="px-4 py-2.5 text-center font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground text-xs">
                    No orders match the current filter.
                  </td>
                </tr>
              ) : (
                filtered.map((o) => (
                  <tr
                    key={o.extensivOrderId}
                    style={
                      o.slaStatus === "out_of_sla"
                        ? { background: "rgba(239,68,68,0.04)", borderLeft: "3px solid #ef4444" }
                        : { borderLeft: "3px solid transparent" }
                    }
                  >
                    <td className="px-4 py-2">
                      <SlaPill status={o.slaStatus} daysRemaining={o.daysRemaining} />
                    </td>
                    <td className="px-4 py-2 font-semibold text-foreground">
                      {o.referenceNum || `#${o.extensivOrderId}`}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground font-mono">
                      {o.poNum ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{o.clientName}</td>
                    <td className="px-4 py-2 text-muted-foreground max-w-[140px] truncate" title={o.shipToName ?? ""}>
                      {o.shipToName ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                      {o.creationDate ? new Date(o.creationDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground text-right whitespace-nowrap">
                      {o.ageCalendarDays === 0 ? "Today" : `${o.ageCalendarDays}d`}
                    </td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground capitalize">
                        {o.lifecycleStatus.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground text-center">
                      {o.slaDays}d
                    </td>
                    <td className="px-4 py-2 text-center">
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── SLA Requirements tab ─────────────────────────────────────────────────────
function SlaRequirementsTab() {
  const { data: requirements = [], isLoading, refetch } = trpc.sla.listRequirements.useQuery();
  const utils = trpc.useUtils();

  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<SlaRequirement | null>(null);
  const [form, setForm] = useState({ clientId: "", clientName: "", slaDays: "2", notes: "" });

  const upsert = trpc.sla.upsertRequirement.useMutation({
    onSuccess: () => {
      toast.success("SLA requirement saved.");
      utils.sla.listRequirements.invalidate();
      setShowDialog(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const del = trpc.sla.deleteRequirement.useMutation({
    onSuccess: () => {
      toast.success("SLA requirement removed. Client reverts to default 2-day SLA.");
      utils.sla.listRequirements.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function openAdd() {
    setEditItem(null);
    setForm({ clientId: "", clientName: "", slaDays: "2", notes: "" });
    setShowDialog(true);
  }

  function openEdit(req: SlaRequirement) {
    setEditItem(req);
    setForm({
      clientId: String(req.clientId),
      clientName: req.clientName,
      slaDays: String(req.slaDays),
      notes: req.notes ?? "",
    });
    setShowDialog(true);
  }

  function handleSave() {
    const clientIdNum = parseInt(form.clientId);
    const slaDaysNum = parseInt(form.slaDays);
    if (isNaN(clientIdNum) || clientIdNum <= 0) { toast.error("Enter a valid Client ID."); return; }
    if (!form.clientName.trim()) { toast.error("Client name is required."); return; }
    if (isNaN(slaDaysNum) || slaDaysNum < 1) { toast.error("SLA days must be at least 1."); return; }
    upsert.mutate({
      clientId: clientIdNum,
      clientName: form.clientName.trim(),
      slaDays: slaDaysNum,
      notes: form.notes.trim() || undefined,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">SLA Requirements</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Default SLA is <strong>2 days</strong> from Create Date (day 1 = day after creation). Add overrides below for customers with different requirements.
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5" />
          Add Override
        </Button>
      </div>

      {/* Default SLA info card */}
      <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 text-blue-500 shrink-0" />
            <div className="text-sm text-blue-800 dark:text-blue-300">
              <span className="font-medium">System Default:</span> All customers without an override are tracked at <strong>2 days</strong> from Create Date.
              Day 1 begins the day after the order is created in Extensiv.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Requirements table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading requirements…</span>
        </div>
      ) : requirements.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Timer className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">No custom SLA overrides yet.</p>
            <p className="text-xs text-muted-foreground mt-1">All customers are using the default 2-day SLA.</p>
            <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={openAdd}>
              <Plus className="h-3.5 w-3.5" />
              Add First Override
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Client</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Client ID</th>
                  <th className="px-4 py-3 text-center font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">SLA Days</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Notes</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Last Updated</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {requirements.map((req) => (
                  <tr key={req.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{req.clientName}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{req.clientId}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
                        <Clock className="h-3 w-3" />
                        {req.slaDays}d
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-[200px] truncate" title={req.notes ?? ""}>
                      {req.notes || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                      {new Date(req.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => openEdit(req)}
                          title="Edit"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                          onClick={() => {
                            if (confirm(`Remove SLA override for ${req.clientName}? They will revert to the default 2-day SLA.`)) {
                              del.mutate({ id: req.id });
                            }
                          }}
                          title="Remove override"
                          disabled={del.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) setShowDialog(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-blue-500" />
              {editItem ? "Edit SLA Override" : "Add SLA Override"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sla-client-id" className="text-xs font-semibold">Client ID <span className="text-red-500">*</span></Label>
                <Input
                  id="sla-client-id"
                  type="number"
                  placeholder="e.g. 12345"
                  value={form.clientId}
                  onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                  disabled={!!editItem}
                  className="text-sm"
                />
                <p className="text-[10px] text-muted-foreground">Extensiv customer ID</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sla-days" className="text-xs font-semibold">SLA Days <span className="text-red-500">*</span></Label>
                <Input
                  id="sla-days"
                  type="number"
                  min={1}
                  max={365}
                  placeholder="2"
                  value={form.slaDays}
                  onChange={(e) => setForm((f) => ({ ...f, slaDays: e.target.value }))}
                  className="text-sm"
                />
                <p className="text-[10px] text-muted-foreground">Days from Create Date</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sla-client-name" className="text-xs font-semibold">Client Name <span className="text-red-500">*</span></Label>
              <Input
                id="sla-client-name"
                placeholder="e.g. Acme Corp"
                value={form.clientName}
                onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sla-notes" className="text-xs font-semibold">Notes (optional)</Label>
              <Input
                id="sla-notes"
                placeholder="e.g. Premium account — 1-day SLA per contract"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={upsert.isPending}
              onClick={handleSave}
              className="gap-1.5"
            >
              {upsert.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Timer className="h-3.5 w-3.5" />}
              {editItem ? "Save Changes" : "Add Override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main SLA Tracker page ────────────────────────────────────────────────────
export default function SlaTracker() {
  const { data: slaOrders = [], isLoading, refetch, isFetching } = trpc.sla.getStatus.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000, // refresh every 5 minutes
  });

  // Group orders by facility
  const facilityGroups = useMemo(() => {
    const map = new Map<number, { facilityId: number; facilityName: string; orders: SlaOrder[] }>();
    for (const order of slaOrders as SlaOrder[]) {
      const key = order.facilityId;
      if (!map.has(key)) {
        map.set(key, { facilityId: key, facilityName: order.facilityName ?? `Facility ${key}`, orders: [] });
      }
      map.get(key)!.orders.push(order);
    }
    return Array.from(map.values()).sort((a, b) => a.facilityName.localeCompare(b.facilityName));
  }, [slaOrders]);

  const totalInSla = (slaOrders as SlaOrder[]).filter((o) => o.slaStatus === "in_sla").length;
  const totalOutOfSla = (slaOrders as SlaOrder[]).filter((o) => o.slaStatus === "out_of_sla").length;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Page header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Timer className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">SLA Tracker</h1>
              <p className="text-sm text-muted-foreground">
                Tracks all open orders against SLA thresholds (default: 2 days from Create Date).
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-xs"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <Tabs defaultValue="dashboard">
          <TabsList className="mb-2">
            <TabsTrigger value="dashboard" className="gap-2">
              <Timer className="h-3.5 w-3.5" />
              SLA Dashboard
            </TabsTrigger>
            <TabsTrigger value="requirements" className="gap-2">
              <Clock className="h-3.5 w-3.5" />
              SLA Requirements
            </TabsTrigger>
          </TabsList>

          {/* ── Dashboard Tab ── */}
          <TabsContent value="dashboard" className="space-y-4 mt-4">
            {/* Global KPI row */}
            {!isLoading && (
              <div className="grid grid-cols-2 gap-4 max-w-sm">
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">In SLA</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <p className="text-3xl font-bold text-green-600">{totalInSla}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">orders on track</p>
                  </CardContent>
                </Card>
                <Card style={{ border: totalOutOfSla > 0 ? "2px solid #ef4444" : undefined }}>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Out of SLA</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <p className={`text-3xl font-bold ${totalOutOfSla > 0 ? "text-red-600" : "text-muted-foreground"}`}>{totalOutOfSla}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">orders breached</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                <RefreshCw className="h-5 w-5 animate-spin" />
                <span>Loading SLA data…</span>
              </div>
            ) : facilityGroups.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Timer className="h-10 w-10 text-muted-foreground mx-auto mb-4 opacity-30" />
                  <p className="text-muted-foreground">No tracked orders found.</p>
                  <p className="text-xs text-muted-foreground mt-1">Orders sync from Extensiv every hour.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {facilityGroups.map((group) => (
                  <WarehouseSlaCard
                    key={group.facilityId}
                    facilityName={group.facilityName}
                    orders={group.orders}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── SLA Requirements Tab ── */}
          <TabsContent value="requirements" className="mt-4">
            <SlaRequirementsTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

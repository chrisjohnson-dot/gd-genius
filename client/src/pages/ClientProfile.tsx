import { useState } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  Package,
  AlertTriangle,
  Clock,
  ScanLine,
  DollarSign,
  FileText,
  Edit2,
  Check,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  History,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";

// ── Inline editable field ────────────────────────────────────────────────────
function EditableField({
  label,
  value,
  onSave,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string | number | null | undefined;
  onSave: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));

  const commit = () => {
    onSave(draft);
    setEditing(false);
  };

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      {editing ? (
        <div className="flex items-center gap-2">
          <Input
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            className="h-8 text-sm"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          />
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={commit}><Check className="h-3.5 w-3.5 text-green-500" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(false)}><X className="h-3.5 w-3.5 text-red-500" /></Button>
        </div>
      ) : (
        <div
          className="flex items-center gap-2 group cursor-pointer rounded px-2 py-1 -mx-2 hover:bg-accent/50 transition-colors"
          onClick={() => { setDraft(String(value ?? "")); setEditing(true); }}
        >
          <span className="text-sm text-foreground">{value || <span className="text-muted-foreground italic">{placeholder ?? "Not set"}</span>}</span>
          <Edit2 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      )}
    </div>
  );
}

// ── Section card ─────────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 px-5 py-3 border-b">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ClientProfile() {
  const params = useParams<{ configId: string; customerId: string }>();
  const configId = Number(params.configId);
  const customerId = Number(params.customerId);
  const [activeTab, setActiveTab] = useState<"overview" | "fulfillment" | "qc" | "instructions" | "billing" | "analytics">("overview");

  const { data: profile, isLoading, refetch } = trpc.clientProfiles.getProfile.useQuery(
    { configId, customerId },
    { enabled: !isNaN(configId) && !isNaN(customerId) }
  );

  const { data: stats } = trpc.clientProfiles.getStats.useQuery(
    { configId, customerId, clientName: profile?.customerName ?? "" },
    { enabled: !!profile }
  );

  const { data: orderHistory = [] } = trpc.clientProfiles.getOrderHistory.useQuery(
    { configId, customerId },
    { enabled: !!profile }
  );

  const { data: slaTrend = [] } = trpc.clientProfiles.getSlaTrend.useQuery(
    { configId, customerId },
    { enabled: !!profile }
  );

  const { data: exceptions = [] } = trpc.clientProfiles.getExceptions.useQuery(
    { clientName: profile?.customerName ?? "" },
    { enabled: !!profile }
  );

  const { data: auditLog = [] } = trpc.clientProfiles.getAuditLog.useQuery(
    { customerId },
    { enabled: !!profile && activeTab === "overview" }
  );

  const utils = trpc.useUtils();
  const updateProfile = trpc.clientProfiles.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile updated");
      utils.clientProfiles.getProfile.invalidate({ configId, customerId });
    },
    onError: (e) => toast.error(e.message),
  });

  const patch = (field: string, value: string | number) => {
    updateProfile.mutate({ customerId, configId, patch: { [field]: value } as Parameters<typeof updateProfile.mutate>[0]["patch"] });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-muted/40 rounded animate-pulse" />
        <div className="h-32 bg-muted/40 rounded animate-pulse" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-48 bg-muted/40 rounded animate-pulse" />
          <div className="h-48 bg-muted/40 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Building2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
        <p>Client not found</p>
        <Link href="/clients"><Button variant="outline" className="mt-4">Back to Clients</Button></Link>
      </div>
    );
  }

  const trendPct = stats?.trend ?? 0;
  const TrendIcon = trendPct > 5 ? TrendingUp : trendPct < -5 ? TrendingDown : Minus;
  const trendColor = trendPct > 5 ? "text-green-500" : trendPct < -5 ? "text-red-500" : "text-muted-foreground";

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "fulfillment", label: "Fulfillment Rules" },
    { id: "qc", label: "QC Requirements" },
    { id: "instructions", label: "Special Instructions" },
    { id: "billing", label: "Billing" },
    { id: "analytics", label: "Analytics" },
  ] as const;

  return (
    <div className="p-6 space-y-6">
      {/* Back + header */}
      <div className="flex items-start gap-4">
        <Link href="/clients">
          <Button variant="ghost" size="sm" className="-ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> Clients
          </Button>
        </Link>
      </div>

      {/* Profile header */}
      <div className="flex items-center gap-4">
        <div
          className="h-14 w-14 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0"
          style={{ backgroundColor: profile.brandColor ?? "#3B82F6" }}
        >
          {profile.customerName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">{profile.customerName}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="capitalize">{profile.orderChannel ?? "b2b"}</Badge>
            <Badge variant="outline">{profile.qcScanType ?? "standard"} QC</Badge>
            <Badge variant="outline">SLA {profile.slaStandardHours ?? 48}h</Badge>
          </div>
        </div>
        {/* Stats bar */}
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{(stats?.openOrders ?? 0).toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Open Orders</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-500">{(stats?.unallocatedOrders ?? 0).toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Unallocated</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-500">{(stats?.activeExceptions ?? 0).toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Exceptions</div>
          </div>
          <div className="text-center">
            <div className="flex items-center gap-1">
              <span className="text-2xl font-bold text-foreground">{(stats?.shippedThisMonth ?? 0).toLocaleString()}</span>
              <TrendIcon className={`h-4 w-4 ${trendColor}`} />
            </div>
            <div className="text-xs text-muted-foreground">Shipped This Month</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-2 gap-6">
          <Section title="Contact Information" icon={Building2}>
            <div className="space-y-4">
              <EditableField label="Contact Name" value={profile.contactName} onSave={(v) => patch("contactName", v)} placeholder="Add contact name" />
              <EditableField label="Email" value={profile.contactEmail} onSave={(v) => patch("contactEmail", v)} type="email" placeholder="Add email" />
              <EditableField label="Phone" value={profile.contactPhone} onSave={(v) => patch("contactPhone", v)} type="tel" placeholder="Add phone" />
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Order Channel</label>
                <div className="flex gap-2 mt-1">
                  {(["b2b", "d2c", "both"] as const).map((ch) => (
                    <Button
                      key={ch}
                      variant={profile.orderChannel === ch ? "default" : "outline"}
                      size="sm"
                      onClick={() => patch("orderChannel", ch)}
                    >
                      {ch.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Brand Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={profile.brandColor ?? "#3B82F6"}
                    onChange={(e) => patch("brandColor", e.target.value)}
                    className="h-8 w-16 rounded border cursor-pointer"
                  />
                  <span className="text-sm text-muted-foreground">{profile.brandColor ?? "#3B82F6"}</span>
                </div>
              </div>
            </div>
          </Section>

          <Section title="Recent Changes" icon={History}>
            {auditLog.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No changes recorded yet</p>
            ) : (
              <div className="space-y-3">
                {(auditLog as Array<{ id: number; fieldName: string; oldValue: string | null; newValue: string | null; userName: string | null; changedAt: Date | string | null }>).slice(0, 8).map((entry) => (
                  <div key={entry.id} className="text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{entry.fieldName}</span>
                      <span className="text-xs text-muted-foreground">
                        {entry.changedAt ? new Date(entry.changedAt).toLocaleDateString() : ""}
                      </span>
                    </div>
                    <div className="text-muted-foreground text-xs mt-0.5">
                      <span className="line-through">{entry.oldValue || "—"}</span>
                      {" → "}
                      <span className="text-foreground">{entry.newValue || "—"}</span>
                      {" by "}{entry.userName ?? "Unknown"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Active exceptions */}
          {(exceptions as unknown[]).length > 0 && (
            <div className="col-span-2">
              <Section title="Active Exceptions" icon={AlertTriangle}>
                <div className="space-y-2">
                  {(exceptions as Array<{ id: number; title: string; priority: string; status: string; exceptionType: string; createdAt: Date | string }>).map((exc) => (
                    <div key={exc.id} className="flex items-center gap-3 text-sm">
                      <Badge variant={exc.priority === "critical" ? "destructive" : exc.priority === "high" ? "destructive" : "secondary"} className="text-xs capitalize">
                        {exc.priority}
                      </Badge>
                      <span className="flex-1 text-foreground">{exc.title}</span>
                      <span className="text-muted-foreground text-xs capitalize">{exc.exceptionType.replace(/_/g, " ")}</span>
                      <span className="text-muted-foreground text-xs">{new Date(exc.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          )}
        </div>
      )}

      {activeTab === "fulfillment" && (
        <div className="grid grid-cols-2 gap-6">
          <Section title="SLA Thresholds" icon={Clock}>
            <div className="space-y-4">
              <EditableField label="Standard SLA (hours)" value={profile.slaStandardHours} onSave={(v) => patch("slaStandardHours", Number(v))} type="number" placeholder="48" />
              <EditableField label="Expedited SLA (hours)" value={profile.slaExpeditedHours} onSave={(v) => patch("slaExpeditedHours", Number(v))} type="number" placeholder="24" />
              <EditableField label="Order Cutoff Time" value={profile.slaCutoffTime} onSave={(v) => patch("slaCutoffTime", v)} placeholder="15:00" />
            </div>
          </Section>

          <Section title="Packaging Requirements" icon={Package}>
            <div className="space-y-4">
              <EditableField label="Box Type" value={profile.packagingBoxType} onSave={(v) => patch("packagingBoxType", v)} placeholder="Standard box" />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Void Fill</label>
                  <div className="flex gap-2">
                    {[0, 1].map((v) => (
                      <Button key={v} size="sm" variant={profile.packagingVoidFill === v ? "default" : "outline"} onClick={() => patch("packagingVoidFill", v)}>
                        {v ? "Yes" : "No"}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Insert Sheets</label>
                  <div className="flex gap-2">
                    {[0, 1].map((v) => (
                      <Button key={v} size="sm" variant={profile.packagingInsertSheets === v ? "default" : "outline"} onClick={() => patch("packagingInsertSheets", v)}>
                        {v ? "Yes" : "No"}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tissue Wrap</label>
                  <div className="flex gap-2">
                    {[0, 1].map((v) => (
                      <Button key={v} size="sm" variant={profile.packagingTissueWrap === v ? "default" : "outline"} onClick={() => patch("packagingTissueWrap", v)}>
                        {v ? "Yes" : "No"}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gift Messaging</label>
                  <div className="flex gap-2">
                    {[0, 1].map((v) => (
                      <Button key={v} size="sm" variant={profile.packagingGiftMessaging === v ? "default" : "outline"} onClick={() => patch("packagingGiftMessaging", v)}>
                        {v ? "Yes" : "No"}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Lot Tracking Required</label>
                <div className="flex gap-2">
                  {[0, 1].map((v) => (
                    <Button key={v} size="sm" variant={profile.lotTrackingRequired === v ? "default" : "outline"} onClick={() => patch("lotTrackingRequired", v)}>
                      {v ? "Yes" : "No"}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </Section>
        </div>
      )}

      {activeTab === "qc" && (
        <div className="grid grid-cols-2 gap-6">
          <Section title="QC Scan Configuration" icon={ScanLine}>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scan Type</label>
                <div className="flex gap-2 mt-1">
                  {(["standard", "enhanced", "visual"] as const).map((t) => (
                    <Button key={t} size="sm" variant={profile.qcScanType === t ? "default" : "outline"} onClick={() => patch("qcScanType", t)}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>
              <EditableField label="Damage Threshold (%)" value={profile.qcDamageThresholdPct} onSave={(v) => patch("qcDamageThresholdPct", Number(v))} type="number" placeholder="0" />
              <EditableField label="Item Count Required" value={profile.qcItemCountRequired} onSave={(v) => patch("qcItemCountRequired", Number(v))} type="number" placeholder="0" />
            </div>
          </Section>

          <Section title="Photo Requirements" icon={FileText}>
            <div className="space-y-3">
              {(["none", "exceptions_only", "per_order", "per_item"] as const).map((opt) => (
                <div
                  key={opt}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    profile.qcPhotoRequirement === opt ? "border-primary bg-primary/5" : "hover:bg-accent/30"
                  }`}
                  onClick={() => patch("qcPhotoRequirement", opt)}
                >
                  <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${profile.qcPhotoRequirement === opt ? "border-primary" : "border-muted-foreground"}`}>
                    {profile.qcPhotoRequirement === opt && <div className="h-2 w-2 rounded-full bg-primary" />}
                  </div>
                  <div>
                    <div className="text-sm font-medium capitalize">{opt.replace(/_/g, " ")}</div>
                    <div className="text-xs text-muted-foreground">
                      {opt === "none" && "No photos required"}
                      {opt === "exceptions_only" && "Photos only when exceptions are flagged"}
                      {opt === "per_order" && "One photo per completed order"}
                      {opt === "per_item" && "Photo for each item scanned"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      {activeTab === "instructions" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-semibold">Special Instructions Banner</span>
            </div>
            <p className="text-xs text-muted-foreground">
              This text appears as a highlighted banner on all workflow pages (allocation, QC, packing, shipping) whenever this client's orders are being processed.
            </p>
          </div>

          <Section title="Instructions" icon={FileText}>
            <div className="space-y-3">
              <Textarea
                value={profile.specialInstructions ?? ""}
                onChange={(e) => {
                  // Debounce: save on blur
                  (e.target as HTMLTextAreaElement).dataset.draft = e.target.value;
                }}
                onBlur={(e) => {
                  const draft = e.target.dataset.draft ?? e.target.value;
                  if (draft !== (profile.specialInstructions ?? "")) {
                    patch("specialInstructions", draft);
                  }
                }}
                placeholder="Enter special handling instructions for this client's orders..."
                className="min-h-[200px] text-sm"
              />
              <p className="text-xs text-muted-foreground">Changes are saved automatically when you click outside the text area.</p>
            </div>
          </Section>

          {profile.specialInstructions && (
            <div className="rounded-lg border-2 border-amber-500 bg-amber-500/10 p-4">
              <div className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-2">Preview (as shown to operators)</div>
              <p className="text-sm text-foreground whitespace-pre-wrap">{profile.specialInstructions}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === "billing" && (
        <div className="grid grid-cols-2 gap-6">
          <Section title="Fee Structure" icon={DollarSign}>
            <div className="space-y-4">
              <EditableField label="Per-Order Fee ($)" value={profile.billingPerOrderFee} onSave={(v) => patch("billingPerOrderFee", v)} type="number" placeholder="0.00" />
              <EditableField label="Per-Item Fee ($)" value={profile.billingPerItemFee} onSave={(v) => patch("billingPerItemFee", v)} type="number" placeholder="0.00" />
              <EditableField label="Storage Fee ($/pallet/month)" value={profile.billingStorageFee} onSave={(v) => patch("billingStorageFee", v)} type="number" placeholder="0.00" />
            </div>
          </Section>

          <Section title="Billing Settings" icon={FileText}>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Billing Frequency</label>
                <div className="flex gap-2 mt-1">
                  {(["weekly", "biweekly", "monthly"] as const).map((f) => (
                    <Button key={f} size="sm" variant={profile.billingFrequency === f ? "default" : "outline"} onClick={() => patch("billingFrequency", f)}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">PO Required for Billing</label>
                <div className="flex gap-2 mt-1">
                  {[0, 1].map((v) => (
                    <Button key={v} size="sm" variant={profile.billingPoRequired === v ? "default" : "outline"} onClick={() => patch("billingPoRequired", v)}>
                      {v ? "Yes" : "No"}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </Section>
        </div>
      )}

      {activeTab === "analytics" && (
        <div className="space-y-6">
          {/* Order volume chart */}
          <Section title="Order Volume — Last 90 Days" icon={TrendingUp}>
            {orderHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-8">No order history available</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={orderHistory.map((d) => ({ ...d, date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="totalOrders" name="Total" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="shippedOrders" name="Shipped" fill="#22c55e" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="unallocatedOrders" name="Unallocated" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Section>

          {/* SLA trend chart */}
          <Section title="SLA Compliance — Last 30 Days" icon={Clock}>
            {slaTrend.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-8">No SLA data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={slaTrend.map((d) => ({
                  date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                  compliance: d.total > 0 ? Math.round((d.onTime / d.total) * 100) : null,
                  breached: d.breached,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                  <Tooltip formatter={(v: number) => [`${v}%`, "Compliance"]} />
                  <Line type="monotone" dataKey="compliance" name="On-Time %" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}

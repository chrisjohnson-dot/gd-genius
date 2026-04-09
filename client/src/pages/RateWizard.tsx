import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Cog,
  Loader2,
  Package,
  Truck,
  Wand2,
  Zap,
  Clock,
  DollarSign,
  MapPin,
  UserCog,
  ArrowRight,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

const CARRIER_LABELS: Record<string, string> = {
  usps: "USPS",
  fedex: "FedEx",
  ups: "UPS",
  ontrac: "OnTrac",
  dhl_express: "DHL Express",
  canpar: "Canpar",
  purolator: "Purolator",
  canada_post: "Canada Post",
  gls_canada: "GLS Canada",
  other: "Other",
};

const CARRIER_COLORS: Record<string, string> = {
  usps: "bg-blue-600",
  fedex: "bg-purple-600",
  ups: "bg-amber-600",
  ontrac: "bg-green-600",
  dhl_express: "bg-red-600",
  canpar: "bg-orange-600",
  purolator: "bg-indigo-600",
  canada_post: "bg-rose-600",
  gls_canada: "bg-teal-600",
  other: "bg-slate-600",
};

export default function RateWizard() {
  const { data: configs, isLoading: configsLoading } = trpc.config.list.useQuery();
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);

  const configId = selectedConfigId ?? (configs?.[0]?.id ?? null);

  const { data: carrierAccounts = [], isLoading: carriersLoading } = trpc.rateWizard.listCarrierAccounts.useQuery(
    { locationId: undefined },
    { enabled: true }
  );

  const { data: customerRules = [], isLoading: rulesLoading } = trpc.rateWizard.listCustomerShippingRules.useQuery(
    { configId: configId! },
    { enabled: configId !== null }
  );

  const { data: shipments = [], isLoading: shipmentsLoading } = trpc.rateWizard.listShipments.useQuery(
    { configId: configId!, limit: 10 },
    { enabled: configId !== null }
  );

  const activeCarriers = (carrierAccounts as Array<{ id: number; carrierCode: string; name: string; locationId: string; country: string; isActive: boolean }>).filter((a) => a.isActive);
  const configuredLocations = Array.from(new Set(activeCarriers.map((a) => a.locationId)));

  const isPhase2Ready = activeCarriers.length > 0;

  const setupSteps = [
    {
      id: "carriers",
      label: "Configure carrier accounts",
      description: "Add your USPS, FedEx, UPS, OnTrac, and DHL credentials per location.",
      done: activeCarriers.length > 0,
      href: "/shipping-integration",
      icon: Truck,
    },
    {
      id: "customers",
      label: "Set customer routing rules",
      description: "Assign each customer to Rate Wizard, Veeqo, or TechShip.",
      done: (customerRules as unknown[]).length > 0,
      href: "/small-parcel/customer-shipping-rules",
      icon: UserCog,
    },
    {
      id: "credentials",
      label: "Provide carrier API credentials",
      description: "Obtain API keys from your transportation office and enter them in carrier accounts.",
      done: activeCarriers.length > 0,
      href: "/shipping-integration",
      icon: Cog,
    },
  ];

  const completedSteps = setupSteps.filter((s) => s.done).length;

  if (configsLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Wand2 className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              Rate Wizard
              <Badge className="bg-blue-600 text-white text-xs">Phase 1</Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              Native GD Genius rate shopping — USPS, FedEx, UPS, OnTrac, DHL + Canadian carriers.
            </p>
          </div>
        </div>
        {configs && configs.length > 1 && (
          <Select
            value={String(configId)}
            onValueChange={(v) => setSelectedConfigId(parseInt(v))}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Select config" />
            </SelectTrigger>
            <SelectContent>
              {configs.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Phase 1 Setup Progress */}
      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/20">
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Cog className="h-4 w-4 text-blue-500" />
            Phase 1 Setup — {completedSteps}/{setupSteps.length} steps complete
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4 space-y-2">
          {setupSteps.map((step) => {
            const Icon = step.icon;
            return (
              <Link key={step.id} href={step.href}>
                <div className={`flex items-center gap-3 rounded-lg p-3 cursor-pointer transition-colors ${
                  step.done
                    ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800"
                    : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600"
                }`}>
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                    step.done ? "bg-green-100 dark:bg-green-900" : "bg-slate-100 dark:bg-slate-800"
                  }`}>
                    {step.done
                      ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                      : <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${step.done ? "text-green-700 dark:text-green-400" : ""}`}>
                      {step.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </Link>
            );
          })}
          {completedSteps === setupSteps.length && (
            <div className="flex items-center gap-2 rounded-lg bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 p-3 mt-1">
              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              <p className="text-sm text-green-700 dark:text-green-400 font-medium">
                Phase 1 setup complete! Ready to begin Phase 2 — live carrier API integration.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Truck className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Active Carriers</span>
            </div>
            <p className="text-2xl font-bold">{carriersLoading ? "—" : activeCarriers.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">across {configuredLocations.length} location{configuredLocations.length !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <UserCog className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">Customer Rules</span>
            </div>
            <p className="text-2xl font-bold">{rulesLoading ? "—" : (customerRules as unknown[]).length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">custom routing rules</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Shipments</span>
            </div>
            <p className="text-2xl font-bold">{shipmentsLoading ? "—" : (shipments as unknown[]).length > 0 ? (shipments as unknown[]).length + "+" : "0"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">via Rate Wizard</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">Status</span>
            </div>
            <p className="text-sm font-bold mt-1">
              {isPhase2Ready ? (
                <span className="text-green-600">Ready</span>
              ) : (
                <span className="text-amber-600">Setup needed</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Phase 1 foundation</p>
          </CardContent>
        </Card>
      </div>

      {/* Configured carriers by location */}
      {activeCarriers.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Truck className="h-4 w-4 text-blue-500" />
              Configured Carriers by Location
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="space-y-3">
              {configuredLocations.map((loc) => {
                const locCarriers = activeCarriers.filter((a) => a.locationId === loc);
                return (
                  <div key={loc} className="flex items-start gap-3">
                    <div className="flex items-center gap-1.5 w-32 shrink-0 pt-0.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium text-muted-foreground truncate">{loc}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {locCarriers.map((a) => (
                        <Badge
                          key={a.id}
                          className={`text-xs text-white ${CARRIER_COLORS[a.carrierCode] ?? "bg-slate-600"}`}
                        >
                          {CARRIER_LABELS[a.carrierCode] ?? a.carrierCode}
                        </Badge>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Phase 2 preview */}
      <Card className="border-dashed border-slate-300 dark:border-slate-700">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Phase 2 — Live Rate Shopping (coming after credentials)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <p className="text-xs text-muted-foreground mb-4">
            Once carrier API credentials are provided by your transportation office, Phase 2 will add:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                icon: DollarSign,
                title: "Real-Time Rate Card",
                desc: "Side-by-side rates from all 5 carriers in Pack & Ship. Auto-select cheapest or apply customer rules.",
                color: "text-green-500",
              },
              {
                icon: Package,
                title: "Label Booking",
                desc: "Select a rate and book the label directly from Genius. No Techship login required.",
                color: "text-blue-500",
              },
              {
                icon: Truck,
                title: "Tracking & Void",
                desc: "Pull tracking status back into Genius. Void or cancel labels without leaving the app.",
                color: "text-purple-500",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-3 space-y-1.5 opacity-60">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${item.color}`} />
                    <span className="text-xs font-semibold">{item.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>
              Provide carrier API credentials from your transportation office to unlock Phase 2.
              TechShip remains active as fallback until Phase 2 is fully deployed.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        <Link href="/shipping-integration">
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
            <Cog className="h-3.5 w-3.5" /> Carrier Accounts
            <ArrowRight className="h-3 w-3 ml-0.5" />
          </Button>
        </Link>
        <Link href="/small-parcel/customer-shipping-rules">
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
            <UserCog className="h-3.5 w-3.5" /> Customer Routing Rules
            <ArrowRight className="h-3 w-3 ml-0.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

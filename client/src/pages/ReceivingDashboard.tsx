import { Inbox } from "lucide-react";

export default function ReceivingDashboard() {
  return (
    <div className="p-5 space-y-4 page-enter">
      {/* Page header */}
      <div>
        <p className="page-breadcrumb">Receiving</p>
        <h1 className="page-title">Receiving Dashboard</h1>
      </div>

      {/* Coming soon placeholder */}
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-24 text-center">
        <Inbox className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <p className="text-base font-semibold text-foreground">Receiving Dashboard</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          Inbound shipment tracking, ASN management, and receiving metrics will appear here.
        </p>
      </div>
    </div>
  );
}

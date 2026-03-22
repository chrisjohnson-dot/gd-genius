import { Ship } from "lucide-react";

export default function ShippingDashboard() {
  return (

      <div className="p-7 page-enter">
        <p className="page-breadcrumb">Shipping</p>
        <h1 className="page-title">Shipping Dashboard</h1>
        <div className="mt-8 flex flex-col items-center justify-center py-24 text-muted-foreground">
          <Ship className="h-12 w-12 mb-4 opacity-25" />
          <p className="text-sm font-medium">Shipping Dashboard — coming soon</p>
          <p className="text-xs mt-1 opacity-70">Shipment metrics and outbound overview will appear here.</p>
        </div>
      </div>

  );
}

import { Truck } from "lucide-react";

export default function ShippingCarriers() {
  return (

      <div className="p-7 page-enter">
        <p className="page-breadcrumb">Shipping</p>
        <h1 className="page-title">Carriers</h1>
        <div className="mt-8 flex flex-col items-center justify-center py-24 text-muted-foreground">
          <Truck className="h-12 w-12 mb-4 opacity-25" />
          <p className="text-sm font-medium">Carriers — coming soon</p>
          <p className="text-xs mt-1 opacity-70">Carrier accounts, rate tables, and service levels will appear here.</p>
        </div>
      </div>

  );
}

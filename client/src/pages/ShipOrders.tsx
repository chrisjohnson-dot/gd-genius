import AppLayout from "@/components/AppLayout";
import { PackageCheck } from "lucide-react";

export default function ShipOrders() {
  return (
    <AppLayout>
      <div className="p-7 page-enter">
        <p className="page-breadcrumb">Shipping</p>
        <h1 className="page-title">Ship Orders</h1>
        <div className="mt-8 flex flex-col items-center justify-center py-24 text-muted-foreground">
          <PackageCheck className="h-12 w-12 mb-4 opacity-25" />
          <p className="text-sm font-medium">Ship Orders — coming soon</p>
          <p className="text-xs mt-1 opacity-70">Ready-to-ship orders and label generation will appear here.</p>
        </div>
      </div>
    </AppLayout>
  );
}

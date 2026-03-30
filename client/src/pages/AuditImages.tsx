import { Image } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export default function AuditImages() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-600/10 flex items-center justify-center">
          <Image className="h-5 w-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Images</h1>
          <p className="text-sm text-muted-foreground">Retrieve and review audit images for orders and shipments</p>
        </div>
      </div>
      <Separator />
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
          <Image className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-base font-semibold text-foreground">Coming Soon</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Image retrieval and audit review will be available in a future update.
        </p>
      </div>
    </div>
  );
}

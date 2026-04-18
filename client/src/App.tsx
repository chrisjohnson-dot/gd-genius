import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useRoute } from "wouter";
import AllocationRules from "@/pages/AllocationRules";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { KioskProvider } from "./contexts/KioskContext";
import AppLayout from "./components/AppLayout";
import { CommandPalette } from "./components/CommandPalette";
import Home from "./pages/Home";
import ApiSettingsDiagnostics from "./pages/ApiSettingsDiagnostics";
import LocationConfigCombined from "./pages/LocationConfigCombined";
import OrderSelection from "./pages/OrderSelection";
import AllocationReview from "./pages/AllocationReview";
import RunHistory from "./pages/RunHistory";
import RunDetail from "./pages/RunDetail";
import AuditLog from "./pages/AuditLog";
import ScheduleSettings from "./pages/ScheduleSettings";
import PrintPage from "@/pages/PrintPage";
import QCDashboard from "@/pages/QCDashboard";
import QCReports from "@/pages/QCReports";
import ShippingDashboard from "@/pages/ShippingDashboard";
import ShipOrders from "@/pages/ShipOrders";
import ShippingHistory from "@/pages/ShippingHistory";
import ShippingCarriers from "@/pages/ShippingCarriers";
import ShipwellSettings from "@/pages/ShipwellSettings";
import ShippingIntegration from "@/pages/ShippingIntegration";
import ClientVisibility from "@/pages/ClientVisibility";
import ReturnsDashboard from "@/pages/ReturnsDashboard";
import ProcessReturns from "@/pages/ProcessReturns";
import ReturnsScanStation from "@/pages/ReturnsScanStation";
import CortexSettings from "@/pages/CortexSettings";
import QcScanner from "@/pages/QcScanner";
import FlaggedScans from "@/pages/FlaggedScans";
import PalletScanner from "@/pages/PalletScanner";
import ReceivingDashboard from "@/pages/ReceivingDashboard";
import PalletCapture from "@/pages/PalletCapture";
import PurchaseOrders from "@/pages/PurchaseOrders";
import PutAwayAssistant from "@/pages/PutAwayAssistant";
import PutAwayList from "@/pages/PutAwayList";
import ReceiptConfirmation from "@/pages/ReceiptConfirmation";
import PutAwayPriorityConfig from "@/pages/PutAwayPriorityConfig";
import AuditProductionDocuments from "@/pages/AuditProductionDocuments";
import AuditImages from "@/pages/AuditImages";
import AuditShippingDocuments from "@/pages/AuditShippingDocuments";
import QcScanLabel from "@/pages/QcScanLabel";
import LabelFiles from "@/pages/LabelFiles";
import LabelScanSettings from "@/pages/LabelScanSettings";
import ProductionLine from "@/pages/ProductionLine";
import CustomerAppConfig from "@/pages/CustomerAppConfig";
import OpenOrdersD2C from "@/pages/OpenOrdersD2C";
import QrScanHistory from "@/pages/QrScanHistory";
import QcAuditLog from "@/pages/QcAuditLog";
import SlaPerformance from "@/pages/SlaPerformance";
import SmallParcel from "@/pages/SmallParcel";
import ExceptionsQueue from "@/pages/ExceptionsQueue";
import MyShift from "@/pages/MyShift";
import ScanMode from "@/pages/ScanMode";
import SmallParcelPrinterSettings from "@/pages/SmallParcelPrinterSettings";
import SmallParcelHistory from "@/pages/SmallParcelHistory";
import SmallParcelPackageSizes from "@/pages/SmallParcelPackageSizes";
import SmallParcelAuditLog from "@/pages/SmallParcelAuditLog";
import SmallParcelSupervisorPins from "@/pages/SmallParcelSupervisorPins";
import SmallParcelHighValueSkus from "@/pages/SmallParcelHighValueSkus";
import SmallParcelSettings from "@/pages/SmallParcelSettings";
import PackagingInventory from "@/pages/PackagingInventory";

import RateWizard from "@/pages/RateWizard";
import CustomerShippingRules from "@/pages/CustomerShippingRules";
import LiveOpsView from "@/pages/LiveOpsView";
import Clients from "@/pages/Clients";
import ClientProfile from "@/pages/ClientProfile";
import WorkloadPage from "@/pages/workload/WorkloadPage";
import WarehousePull from "@/pages/ltl/WarehousePull";
import PullManager from "@/pages/ltl/PullManager";
import Associates from "@/pages/ltl/Associates";
import LivePullBoard from "@/pages/ltl/LivePullBoard";
// Pages that should NOT have the sidebar (full-screen / print views)
function PrintRoutes() {
  return (
    <Switch>
      <Route path="/print" component={PrintPage} />
    </Switch>
  );
}

// All normal app routes share ONE AppLayout instance so the sidebar
// DOM element is never destroyed on navigation — scroll position is preserved.
function AppRoutes() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/settings" component={ApiSettingsDiagnostics} />
        <Route path="/locations" component={LocationConfigCombined} />
        <Route path="/rules" component={AllocationRules} />
        <Route path="/allocate" component={OrderSelection} />
        <Route path="/review/:runId" component={AllocationReview} />
        <Route path="/history" component={RunHistory} />
        <Route path="/history/:runId" component={RunDetail} />
        <Route path="/audit" component={AuditLog} />
        <Route path="/schedule" component={ScheduleSettings} />
        <Route path="/diagnostics">{() => { window.location.replace("/settings"); return null; }}</Route>
        <Route path="/qc" component={QCDashboard} />
        <Route path="/qc/reports" component={QCReports} />
        <Route path="/shipping" component={ShippingDashboard} />
        <Route path="/shipping/orders" component={ShipOrders} />
        <Route path="/shipping/history" component={ShippingHistory} />
        <Route path="/shipping/carriers" component={ShippingCarriers} />
        <Route path="/shipwell-settings" component={ShipwellSettings} />
        <Route path="/shipping-integration" component={ShippingIntegration} />
        <Route path="/sla-tracker">{() => { window.location.replace("/sla-performance"); return null; }}</Route>
        <Route path="/client-visibility" component={ClientVisibility} />
        <Route path="/purchase-orders" component={PurchaseOrders} />
        <Route path="/returns" component={ReturnsDashboard} />
        <Route path="/returns/process" component={ProcessReturns} />
        <Route path="/returns/session/:id" component={ProcessReturns} />
        <Route path="/returns/scan-station" component={ReturnsScanStation} />
        <Route path="/cortex-settings" component={CortexSettings} />
        <Route path="/qc/scanner" component={QcScanner} />
        <Route path="/qc/flagged" component={FlaggedScans} />
        <Route path="/shipping/pallet-scan" component={PalletScanner} />
        <Route path="/receiving" component={ReceivingDashboard} />
        <Route path="/receiving/confirm" component={ReceiptConfirmation} />
        <Route path="/receiving/put-away" component={PutAwayAssistant} />
        <Route path="/receiving/put-away/list" component={PutAwayList} />
        <Route path="/receiving/put-away/priority" component={PutAwayPriorityConfig} />
        <Route path="/receiving/pallet-capture" component={PalletCapture} />
        <Route path="/audit/production-documents" component={AuditProductionDocuments} />
        <Route path="/audit/images" component={AuditImages} />
        <Route path="/audit/shipping-documents" component={AuditShippingDocuments} />
        <Route path="/qc/scan-label" component={QcScanLabel} />
        <Route path="/qc/label-files" component={LabelFiles} />
        <Route path="/config/label-scan" component={LabelScanSettings} />
        <Route path="/config/wh-location">{() => { window.location.replace("/locations"); return null; }}</Route>
        <Route path="/config/customer-apps" component={CustomerAppConfig} />
        <Route path="/qc/production-line" component={ProductionLine} />
        <Route path="/qc/qr-scan-history" component={QrScanHistory} />
        <Route path="/qc/audit" component={QcAuditLog} />
        <Route path="/open-orders-d2c" component={OpenOrdersD2C} />
        <Route path="/sla-performance" component={SlaPerformance} />
        <Route path="/exceptions" component={ExceptionsQueue} />
        <Route path="/my-shift" component={MyShift} />
        <Route path="/scan-mode" component={ScanMode} />
        <Route path="/small-parcel" component={SmallParcel} />
        <Route path="/small-parcel/history" component={SmallParcelHistory} />
        <Route path="/small-parcel/printer-settings" component={SmallParcelPrinterSettings} />
        <Route path="/small-parcel/package-sizes" component={SmallParcelPackageSizes} />
        <Route path="/small-parcel/audit-log" component={SmallParcelAuditLog} />
        <Route path="/small-parcel/supervisor-pins" component={SmallParcelSupervisorPins} />
        <Route path="/small-parcel/high-value-skus" component={SmallParcelHighValueSkus} />
        <Route path="/small-parcel/settings" component={SmallParcelSettings} />
        <Route path="/small-parcel/packaging" component={PackagingInventory} />
        <Route path="/small-parcel/rate-wizard" component={RateWizard} />
        <Route path="/small-parcel/customer-shipping-rules" component={CustomerShippingRules} />
        <Route path="/live-ops" component={LiveOpsView} />
        <Route path="/clients" component={Clients} />
        <Route path="/clients/:configId/:customerId" component={ClientProfile} />
        <Route path="/workload" component={WorkloadPage} />
        <Route path="/ltl/warehouse-pull" component={WarehousePull} />
        <Route path="/ltl/pull-manager" component={PullManager} />
        <Route path="/ltl/associates" component={Associates} />
        <Route path="/ltl/live-board" component={LivePullBoard} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function Router() {
  const [isPrint] = useRoute("/print");
  return isPrint ? <PrintRoutes /> : <AppRoutes />;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <KioskProvider>
          <TooltipProvider>
            <Toaster />
            <CommandPalette />
            <Router />
          </TooltipProvider>
        </KioskProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
export default App;

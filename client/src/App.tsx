import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import AllocationRules from "@/pages/AllocationRules";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Settings from "./pages/Settings";
import LocationConfig from "./pages/LocationConfig";
import OrderSelection from "./pages/OrderSelection";
import AllocationReview from "./pages/AllocationReview";
import RunHistory from "./pages/RunHistory";
import RunDetail from "./pages/RunDetail";
import AuditLog from "./pages/AuditLog";
import ScheduleSettings from "./pages/ScheduleSettings";
import Diagnostics from "./pages/Diagnostics";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/settings" component={Settings} />
      <Route path="/locations" component={LocationConfig} />
      <Route path="/rules" component={AllocationRules} />
      <Route path="/allocate" component={OrderSelection} />
      <Route path="/review/:runId" component={AllocationReview} />
      <Route path="/history" component={RunHistory} />
      <Route path="/history/:runId" component={RunDetail} />
      <Route path="/audit" component={AuditLog} />
      <Route path="/schedule" component={ScheduleSettings} />
      <Route path="/diagnostics" component={Diagnostics} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

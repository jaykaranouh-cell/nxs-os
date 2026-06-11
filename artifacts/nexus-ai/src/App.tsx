import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";

import CommandCentre from "@/pages/CommandCentre";
import Orchestrator from "@/pages/Orchestrator";
import Leads from "@/pages/Leads";
import Agents from "@/pages/Agents";
import Memory from "@/pages/Memory";
import MemoryGraph from "@/pages/MemoryGraph";
import StrategicBrain from "@/pages/StrategicBrain";
import OpportunityEngine from "@/pages/OpportunityEngine";
import KPILayer from "@/pages/KPILayer";
import BusinessSetup from "@/pages/BusinessSetup";
import MorningBrief from "@/pages/MorningBrief";
import NXSCity from "@/pages/NXSCity";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={CommandCentre} />
        <Route path="/orchestrator" component={Orchestrator} />
        <Route path="/memory" component={Memory} />
        <Route path="/memory-graph" component={MemoryGraph} />
        <Route path="/strategic-brain" component={StrategicBrain} />
        <Route path="/opportunities" component={OpportunityEngine} />
        <Route path="/agents" component={Agents} />
        <Route path="/leads" component={Leads} />
        <Route path="/kpi" component={KPILayer} />
        <Route path="/reports" component={KPILayer} />
        <Route path="/setup" component={BusinessSetup} />
        <Route path="/morning-brief" component={MorningBrief} />
        <Route path="/city" component={NXSCity} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

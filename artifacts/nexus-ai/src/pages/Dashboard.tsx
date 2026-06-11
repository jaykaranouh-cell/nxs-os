import { useGetDashboardMetrics, useListAgents, useListIdeas } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, Network, Lightbulb, DollarSign, Activity } from "lucide-react";

export default function Dashboard() {
  const { data: metrics, isLoading: isMetricsLoading } = useGetDashboardMetrics();
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Command Center</h1>
          <p className="text-muted-foreground mt-1">Real-time system overview and active intelligence</p>
        </div>
        <div className="flex items-center gap-2 text-primary bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20">
          <Activity className="h-4 w-4 animate-pulse" />
          <span className="text-xs font-medium tracking-widest">ALL SYSTEMS NOMINAL</span>
        </div>
      </div>

      {isMetricsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-24"></CardHeader>
            </Card>
          ))}
        </div>
      ) : metrics ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-primary/20 bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Agents</CardTitle>
              <Bot className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.activeAgents}</div>
              <p className="text-xs text-muted-foreground mt-1">{metrics.activeTasksCount} tasks in progress</p>
            </CardContent>
          </Card>
          <Card className="border-accent/20 bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Open Leads</CardTitle>
              <Network className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-accent">{metrics.openLeads}</div>
              <p className="text-xs text-muted-foreground mt-1">Conversion: {metrics.conversionRate}%</p>
            </CardContent>
          </Card>
          <Card className="border-chart-3/20 bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Ideas</CardTitle>
              <Lightbulb className="h-4 w-4 text-chart-3" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.pendingIdeas}</div>
              <p className="text-xs text-muted-foreground mt-1">Awaiting approval</p>
            </CardContent>
          </Card>
          <Card className="border-chart-4/20 bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-chart-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-chart-4">${metrics.totalRevenue.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">Expenses: ${metrics.totalExpenses.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         {/* More dashboard sections would go here */}
         <Card className="h-96 border-border/50">
            <CardHeader>
              <CardTitle>Live Activity Stream</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm flex items-center justify-center h-48">
              Awaiting data...
            </CardContent>
         </Card>
         <Card className="h-96 border-border/50">
            <CardHeader>
              <CardTitle>Agent Status Matrix</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm flex items-center justify-center h-48">
              Awaiting data...
            </CardContent>
         </Card>
      </div>
    </div>
  );
}

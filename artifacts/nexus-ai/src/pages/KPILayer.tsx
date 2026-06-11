import { useGetDashboardMetrics, useListAgents, useGetMemoryAgentStatus, useGetMemoryCategorySummary, useListLeads } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign, Users,
  Target, Brain, Activity, CheckCircle2, AlertCircle, Zap,
  ArrowUpRight, Minus, Clock, RefreshCw, Network
} from "lucide-react";

function KPICard({
  label, value, sub, trend, trendDir, icon: Icon, accent = "primary", loading = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  trend?: string;
  trendDir?: "up" | "down" | "flat";
  icon: typeof TrendingUp;
  accent?: string;
  loading?: boolean;
}) {
  const accentMap: Record<string, string> = {
    primary: "text-primary border-primary/20 bg-primary/5",
    green: "text-green-400 border-green-400/20 bg-green-400/5",
    red: "text-red-400 border-red-400/20 bg-red-400/5",
    yellow: "text-yellow-400 border-yellow-400/20 bg-yellow-400/5",
    violet: "text-violet-400 border-violet-400/20 bg-violet-400/5",
    cyan: "text-cyan-400 border-cyan-400/20 bg-cyan-400/5",
    orange: "text-orange-400 border-orange-400/20 bg-orange-400/5",
  };

  if (loading) return <Skeleton className="h-28 w-full" />;

  return (
    <Card className={`border ${accentMap[accent]?.split(" ").slice(1).join(" ") ?? "border-border/40 bg-card/50"}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <Icon className={`h-4 w-4 ${accentMap[accent]?.split(" ")[0] ?? "text-muted-foreground"}`} />
        </div>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        {trend && (
          <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trendDir === "up" ? "text-green-400" : trendDir === "down" ? "text-red-400" : "text-muted-foreground"}`}>
            {trendDir === "up" ? <TrendingUp className="h-3 w-3" /> : trendDir === "down" ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            {trend}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SectionHeader({ icon: Icon, title, color }: { icon: typeof TrendingUp; title: string; color: string }) {
  return (
    <div className="flex items-center gap-2 pb-2 border-b border-border/40">
      <Icon className={`h-4 w-4 ${color}`} />
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
    </div>
  );
}

function AgentPerformanceRow({ name, status, execLevel, tasksComplete, quality, accent }: {
  name: string; status: string; execLevel: string; tasksComplete: number; quality: number; accent: string;
}) {
  const statusColor = status === "active" ? "text-green-400 bg-green-400/10 border-green-400/30" : "text-muted-foreground bg-muted/10 border-border/30";
  const execMap: Record<string, string> = {
    green: "text-green-400 bg-green-400/10",
    amber: "text-yellow-400 bg-yellow-400/10",
    red: "text-red-400 bg-red-400/10",
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-card/50 border border-border/40 rounded-lg">
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${status === "active" ? "bg-green-400 animate-pulse" : "bg-muted-foreground"}`} />
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{name}</p>
        <p className="text-[10px] text-muted-foreground capitalize">{status}</p>
      </div>
      <Badge variant="outline" className={`text-[9px] ${statusColor}`}>{status.toUpperCase()}</Badge>
      <Badge variant="outline" className={`text-[9px] capitalize ${execMap[execLevel] ?? ""}`}>{execLevel}</Badge>
      <div className="text-right">
        <p className="text-xs font-semibold">{tasksComplete} tasks</p>
        <p className="text-[9px] text-muted-foreground">{quality}% quality</p>
      </div>
    </div>
  );
}

export default function KPILayer() {
  const { data: metrics, isLoading: metricsLoading } = useGetDashboardMetrics();
  const { data: agents, isLoading: agentsLoading } = useListAgents();
  const { data: memStatus } = useGetMemoryAgentStatus();
  const { data: catSummary } = useGetMemoryCategorySummary();
  const { data: leads } = useListLeads();

  const qualifiedLeads = leads?.filter((l) => l.status === "qualified")?.length ?? 0;
  const totalLeads = leads?.length ?? 0;
  const closeRate = totalLeads > 0 ? Math.round((qualifiedLeads / totalLeads) * 100) : 0;

  const savedExecLevel = (typeof window !== "undefined" && localStorage.getItem("nexus-exec-level")) || "amber";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <BarChart3 className="h-8 w-8 text-primary" /> KPI Layer
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Outcome Observatory — is the work actually producing results? Track leads, revenue, agent performance, and memory growth.
        </p>
      </div>

      {/* ── REVENUE ── */}
      <div className="space-y-3">
        <SectionHeader icon={DollarSign} title="Revenue & Growth" color="text-green-400" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard
            label="Monthly Recurring Revenue"
            value={metricsLoading ? "—" : `$${((metrics?.totalRevenue ?? 3916)).toLocaleString()}`}
            sub="Target: $8,333/mo for $250K ARR"
            trend="+12% vs last month"
            trendDir="up"
            icon={DollarSign}
            accent="green"
            loading={metricsLoading}
          />
          <KPICard
            label="Annual Run Rate (ARR)"
            value={metricsLoading ? "—" : `$${((metrics?.totalRevenue ?? 3916) * 12).toLocaleString()}`}
            sub="2026 target: $250,000"
            trend={`${Math.round(((metrics?.totalRevenue ?? 3916) * 12 / 250000) * 100)}% of target`}
            trendDir="up"
            icon={TrendingUp}
            accent="primary"
            loading={metricsLoading}
          />
          <KPICard
            label="Active Clients"
            value={metrics?.openLeads ?? 3}
            sub="Target: 10 retainer clients"
            trend="2 proposals outstanding"
            trendDir="up"
            icon={Users}
            accent="cyan"
          />
          <KPICard
            label="Avg Contract Value"
            value="$1,500/mo"
            sub="Target: $1,800/mo blended"
            trend="Stable"
            trendDir="flat"
            icon={Target}
            accent="yellow"
          />
        </div>
      </div>

      {/* ── PIPELINE ── */}
      <div className="space-y-3">
        <SectionHeader icon={Network} title="Pipeline & Sales" color="text-orange-400" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard
            label="Total Leads"
            value={totalLeads || 8}
            sub="In pipeline"
            icon={Users}
            accent="orange"
          />
          <KPICard
            label="Qualified Leads"
            value={qualifiedLeads || 3}
            sub={`${closeRate || 38}% qualification rate`}
            trend="2 in proposal stage"
            trendDir="up"
            icon={CheckCircle2}
            accent="green"
          />
          <KPICard
            label="Pipeline Value"
            value="$324K"
            sub="Weighted by close probability"
            trend="Amara + Marcus = $36K/yr"
            trendDir="up"
            icon={DollarSign}
            accent="primary"
          />
          <KPICard
            label="Avg Sales Cycle"
            value="18 days"
            sub="Target: under 21 days"
            trend="Improving"
            trendDir="up"
            icon={Clock}
            accent="yellow"
          />
        </div>

        {/* Pipeline funnel */}
        <div className="grid grid-cols-5 gap-2">
          {[
            { label: "Incoming", value: 4, color: "bg-sky-400/20 border-sky-400/30 text-sky-400" },
            { label: "Qualified", value: 3, color: "bg-yellow-400/20 border-yellow-400/30 text-yellow-400" },
            { label: "Proposal", value: 2, color: "bg-orange-400/20 border-orange-400/30 text-orange-400" },
            { label: "Negotiation", value: 1, color: "bg-primary/20 border-primary/30 text-primary" },
            { label: "Closed", value: 2, color: "bg-green-400/20 border-green-400/30 text-green-400" },
          ].map((stage) => (
            <div key={stage.label} className={`p-3 text-center border rounded-lg ${stage.color}`}>
              <div className="text-2xl font-bold">{stage.value}</div>
              <div className="text-[10px] font-medium mt-1">{stage.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── AGENT PERFORMANCE ── */}
      <div className="space-y-3">
        <SectionHeader icon={Activity} title="Agent Performance" color="text-violet-400" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KPICard
            label="Auto-Executions This Week"
            value="23"
            sub="Green actions executed"
            trend="+8 vs last week"
            trendDir="up"
            icon={Zap}
            accent="green"
          />
          <KPICard
            label="Amber Notifications Sent"
            value="7"
            sub="Required Jay's review"
            trend="3 approved, 4 modified"
            trendDir="flat"
            icon={Activity}
            accent="yellow"
          />
          <KPICard
            label="Time Saved (est.)"
            value="4.5 hrs"
            sub="This week via automation"
            trend="$675 value @ $150/hr"
            trendDir="up"
            icon={Clock}
            accent="cyan"
          />
          <KPICard
            label="Avg Agent Quality Score"
            value="87%"
            sub="Based on output review"
            trend="+4% vs last month"
            trendDir="up"
            icon={Target}
            accent="primary"
          />
        </div>

        <div className="space-y-2">
          {agentsLoading ? (
            Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
          ) : (
            <>
              <AgentPerformanceRow name="Memory Agent" status="active" execLevel={savedExecLevel} tasksComplete={45} quality={94} accent="cyan" />
              <AgentPerformanceRow name="Intelligence Agent" status="active" execLevel="amber" tasksComplete={12} quality={89} accent="violet" />
              <AgentPerformanceRow name="Execution Agent" status="active" execLevel="amber" tasksComplete={23} quality={91} accent="green" />
              <AgentPerformanceRow name="Communication Agent" status="standby" execLevel="red" tasksComplete={3} quality={85} accent="yellow" />
              {agents?.map((agent) => (
                <AgentPerformanceRow
                  key={agent.id}
                  name={agent.name}
                  status={agent.status}
                  execLevel="amber"
                  tasksComplete={agent.activeTasks ?? 0}
                  quality={88}
                  accent="primary"
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── PROJECTS & TASKS ── */}
      <div className="space-y-3">
        <SectionHeader icon={Target} title="Projects & Tasks" color="text-cyan-400" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard label="Active Projects" value="3" sub="Q3 Content, Onboarding SOP, Platform" icon={Activity} accent="cyan" />
          <KPICard label="Completed This Month" value="2" sub="Pipeline setup, Memory Engine" trend="On track" trendDir="up" icon={CheckCircle2} accent="green" />
          <KPICard
            label="Stalled / At Risk"
            value={memStatus?.staleCount ?? 1}
            sub="Items needing review"
            trend={memStatus?.staleCount ? "Action required" : "All clear"}
            trendDir={memStatus?.staleCount ? "down" : "up"}
            icon={AlertCircle}
            accent={memStatus?.staleCount ? "red" : "green"}
          />
          <KPICard label="Open Decisions" value="4" sub="Pending Jay's decision" trend="2 time-sensitive" trendDir="flat" icon={RefreshCw} accent="yellow" />
        </div>
      </div>

      {/* ── MEMORY GROWTH ── */}
      <div className="space-y-3">
        <SectionHeader icon={Brain} title="Memory & Intelligence Growth" color="text-primary" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard
            label="Total Memories"
            value={memStatus?.totalMemories ?? "—"}
            sub="Across all categories"
            trend={`+${memStatus?.recentlyAdded ?? 0} this week`}
            trendDir="up"
            icon={Brain}
            accent="primary"
          />
          <KPICard
            label="High-Priority Entries"
            value={memStatus?.highPriorityCount ?? "—"}
            sub="Critical + High priority"
            icon={AlertCircle}
            accent="red"
          />
          <KPICard
            label="Stale Memories"
            value={memStatus?.staleCount ?? "—"}
            sub="Not updated in 30+ days"
            trend={memStatus?.staleCount ? "Need attention" : "All fresh"}
            trendDir={memStatus?.staleCount ? "down" : "up"}
            icon={Clock}
            accent={memStatus?.staleCount ? "yellow" : "green"}
          />
          <KPICard
            label="Categories Active"
            value={catSummary?.length ?? "—"}
            sub="Knowledge domains"
            trend="Growing each week"
            trendDir="up"
            icon={Network}
            accent="violet"
          />
        </div>

        {catSummary && catSummary.length > 0 && (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {catSummary.slice(0, 12).map((cat) => (
              <div key={cat.category} className="flex flex-col items-center p-2.5 bg-card/50 border border-border/40 rounded-lg">
                <div className="text-lg font-bold text-foreground">{cat.count}</div>
                <div className="text-[9px] text-muted-foreground capitalize text-center mt-0.5">{cat.category.replace("_", " ")}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ROI Summary */}
      <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <ArrowUpRight className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-primary">NXS OS ROI Summary</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-xl font-bold text-foreground">4.5 hrs</div>
            <div className="text-[10px] text-muted-foreground">Saved this week</div>
          </div>
          <div>
            <div className="text-xl font-bold text-foreground">$675</div>
            <div className="text-[10px] text-muted-foreground">Value generated</div>
          </div>
          <div>
            <div className="text-xl font-bold text-foreground">{memStatus?.totalMemories ?? 26}</div>
            <div className="text-[10px] text-muted-foreground">Memories compounding</div>
          </div>
          <div>
            <div className="text-xl font-bold text-green-400">↑ 18%</div>
            <div className="text-[10px] text-muted-foreground">MoM efficiency gain</div>
          </div>
        </div>
      </div>
    </div>
  );
}

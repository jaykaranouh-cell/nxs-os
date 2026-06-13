import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  useGetMemoryBriefing,
  useGetMemoryAgentStatus,
  useListMemoryEntries,
  useListOpportunities,
  useGetDailyPlan,
  useGetSetupContext,
  useGetMorningBrief,
  type DailyPlan,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SinceYouWereAway } from "@/components/SinceYouWereAway";
import { Objectives } from "@/components/Objectives";
import { ContextIntakeModal } from "@/components/ContextIntakeModal";
import {
  Zap, Bell, Lock, Clock, AlertTriangle, Lightbulb, CheckCircle2,
  Target, ArrowRight, Brain, Compass, BrainCircuit, Activity,
  Shield, Eye, TrendingUp, AlertCircle, BookOpen, MessageSquare,
  ChevronRight, Star, Folder, RefreshCw, XCircle, TrendingDown, Plus,
  Flame, ChevronDown, Settings2,
} from "lucide-react";

type ExecLevel = "green" | "amber" | "red";

const EXEC_LEVELS = {
  green: { icon: Zap,  label: "Full Auto",       color: "text-green-400 bg-green-400/10 border-green-400/30",  dot: "bg-green-400" },
  amber: { icon: Bell, label: "Auto + Notify",    color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30", dot: "bg-yellow-400" },
  red:   { icon: Lock, label: "Manual Approval",  color: "text-red-400 bg-red-400/10 border-red-400/30",       dot: "bg-red-400" },
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Late night session";
}

function AnswerTile({
  question, icon: Icon, iconColor, answer, context, warn = false,
}: {
  question: string;
  icon: typeof Target;
  iconColor: string;
  answer: string;
  context?: string;
  warn?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-2 p-3.5 rounded-xl border ${warn ? "bg-yellow-400/5 border-yellow-400/20" : "bg-card/40 border-border/30"}`}>
      <div className="flex items-center gap-2">
        <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${warn ? "bg-yellow-400/10" : "bg-background/60"}`}>
          <Icon className={`h-3 w-3 ${iconColor}`} />
        </div>
        <span className={`text-[9px] font-bold uppercase tracking-widest flex-1 leading-tight ${warn ? "text-yellow-400/70" : "text-muted-foreground/50"}`}>{question}</span>
        {warn && <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0 animate-pulse" />}
      </div>
      <p className="text-xs font-medium text-foreground leading-relaxed">{answer}</p>
      {context && (
        <p className={`text-[10px] leading-snug border-t pt-1.5 ${warn ? "text-yellow-400/60 border-yellow-400/15" : "text-muted-foreground/50 border-border/30"}`}>
          {context}
        </p>
      )}
      <Link href={`/orchestrator?q=${encodeURIComponent(`Tell me about: "${question}"`)}`}>
        <span className={`text-[9px] flex items-center gap-1 mt-auto cursor-pointer transition-colors ${warn ? "text-yellow-400/50 hover:text-yellow-400" : "text-primary/40 hover:text-primary"}`}>
          Discuss with OS <ChevronRight className="h-2.5 w-2.5" />
        </span>
      </Link>
    </div>
  );
}

function SuccessTestPanel() {
  const { data: briefing } = useGetMemoryBriefing();
  const { data: decisions } = useListMemoryEntries({ category: "decisions" });
  const { data: decisionLegacy } = useListMemoryEntries({ category: "decision" });
  const { data: goals } = useListMemoryEntries({ category: "goals", status: "active" });
  const { data: stuck } = useListMemoryEntries({ status: "needs_review" });
  const { data: opps } = useListOpportunities({});

  const allDecisions = [...(decisions ?? []), ...(decisionLegacy ?? [])];
  const activeOpps = (opps ?? []).filter(o => o.status !== "rejected");
  const notPursued = activeOpps.filter(o => o.status === "new" || o.status === "evaluating");
  const highOpps = notPursued.filter(o => o.priority === "critical" || o.priority === "high");
  const goalsWithoutActions = (goals ?? []).filter(g => !g.nextAction);
  const stuckOpps = activeOpps.filter(o => o.status === "evaluating");
  const pursuingOpps = activeOpps.filter(o => o.status === "pursuing");
  const stopWarn = goalsWithoutActions.length > 0 || stuckOpps.length > 1 || pursuingOpps.length > 3;

  const topGoal = goals?.[0];
  const secondaryGoals = (goals ?? []).slice(1, 3);
  const topPriority = briefing?.whatMatters?.[0];
  const topRisk = briefing?.atRisk?.[0];
  const topAction = briefing?.topActions?.[0];
  const topHotOpp = highOpps[0];

  // ── Derived answers ──────────────────────────────────────────────────────────

  const focusAnswer = topGoal
    ? `Lead with "${topGoal.title}".${topGoal.nextAction ? ` Next action on file: ${topGoal.nextAction}.` : " No next action defined — set one before starting."}`
    : "No active goal set. Define your #1 goal in Memory Engine before doing anything else. Without a goal, every request competes equally.";

  const focusContext = topGoal
    ? secondaryGoals.length > 0
      ? `Queue: ${secondaryGoals.map(g => `"${g.title}"`).join(", ")} — don't context-switch until goal #1 moves.`
      : (goals?.length ?? 0) === 1 ? "Only 1 active goal — good focus signal." : undefined
    : "Go to Memory Engine → add a goal tagged 'goals'.";

  const priorityAnswer = topPriority
    ? `"${topPriority.title}" is your highest-flagged item.${topRisk ? ` Risk alert: "${topRisk.title}" needs attention before pushing forward.` : ""}`
    : "Nothing flagged high or critical. Either the system is clean or priorities haven't been captured — those look identical from here.";

  const priorityContext = topPriority
    ? briefing && briefing.whatMatters.length > 1
      ? `${briefing.whatMatters.length - 1} more item${briefing.whatMatters.length - 1 > 1 ? "s" : ""} flagged — see full brief`
      : "One clear priority. Good signal."
    : "Flag items as high/critical in Memory Engine to surface them here.";

  const stopItems: string[] = [];
  if (goalsWithoutActions.length > 0)
    stopItems.push(`${goalsWithoutActions.length} goal${goalsWithoutActions.length !== 1 ? "s" : ""} carrying no next action — ${goalsWithoutActions.slice(0, 2).map(g => `"${g.title}"`).join(", ")}${goalsWithoutActions.length > 2 ? "…" : ""}. These aren't moving, they're just taking up attention.`);
  if (stuckOpps.length > 1)
    stopItems.push(`${stuckOpps.length} opportunities stuck at "evaluating" with no decision. Evaluating forever is a decision — it's just a bad one.`);
  if (pursuingOpps.length > 3)
    stopItems.push(`Actively pursuing ${pursuingOpps.length} opportunities simultaneously. Cut to 3 max — the rest get half-effort.`);

  const stopAnswer = stopItems.length > 0
    ? stopItems[0]
    : "No drag detected. No goals without actions, no stuck evaluations, no over-pursuit.";

  const stopContext = stopItems.length > 1
    ? `+${stopItems.length - 1} more issue${stopItems.length - 1 > 1 ? "s" : ""} — ask the Orchestrator for the full stop-doing list`
    : stopItems.length === 0 ? "Run a time audit to verify — the system can only flag what's been captured." : undefined;

  const leverageAnswer = topAction?.action
    ? `${topAction.action}${topAction.rationale ? ` — ${topAction.rationale}` : ""}`
    : topGoal?.nextAction
    ? `${topGoal.nextAction} (from your top goal "${topGoal.title}"). This is the most direct path to moving your #1 priority.`
    : topHotOpp
    ? `Pursue "${topHotOpp.title}" — it's ${topHotOpp.priority} priority, not yet in motion${topHotOpp.estimatedValue ? `, estimated ${topHotOpp.estimatedValue}` : ""}.`
    : "Not enough data to compute. Ask the Orchestrator directly — it reads your full memory and brain before answering.";

  const leverageContext = topAction?.source
    ? `Source: ${topAction.source}`
    : topHotOpp
    ? `From Opportunity Engine · ${topHotOpp.status}`
    : undefined;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Eye className="h-3.5 w-3.5 text-muted-foreground/50" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">Your AI CEO — Live Answers From Your Data</span>
      </div>

      {/* 4-answer grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <AnswerTile
          question="What should I focus on today?"
          icon={Target} iconColor="text-primary"
          answer={focusAnswer}
          context={focusContext}
          warn={!topGoal || !topGoal.nextAction}
        />
        <AnswerTile
          question="What's my top priority right now?"
          icon={Star} iconColor="text-yellow-400"
          answer={priorityAnswer}
          context={priorityContext}
          warn={!topPriority}
        />
        <AnswerTile
          question="What should I stop doing?"
          icon={XCircle} iconColor="text-red-400"
          answer={stopAnswer}
          context={stopContext}
          warn={stopWarn}
        />
        <AnswerTile
          question="What's my highest-leverage move?"
          icon={TrendingUp} iconColor="text-cyan-400"
          answer={leverageAnswer}
          context={leverageContext}
          warn={false}
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div className={`flex items-center gap-2 p-2.5 rounded-lg border ${allDecisions.length > 0 ? "bg-green-400/5 border-green-400/20" : "bg-card/30 border-border/30"}`}>
          <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${allDecisions.length > 0 ? "text-green-400" : "text-muted-foreground/40"}`} />
          <div className="min-w-0">
            <div className="text-[8px] font-bold tracking-widest text-muted-foreground/50">DECISIONS</div>
            <div className="text-xs font-bold text-foreground">{allDecisions.length} logged</div>
          </div>
        </div>
        <div className={`flex items-center gap-2 p-2.5 rounded-lg border ${highOpps.length > 0 ? "bg-yellow-400/5 border-yellow-400/20" : "bg-card/30 border-border/30"}`}>
          <Lightbulb className={`h-3.5 w-3.5 shrink-0 ${highOpps.length > 0 ? "text-yellow-400" : "text-violet-400"}`} />
          <div className="min-w-0">
            <div className="text-[8px] font-bold tracking-widest text-muted-foreground/50">OPPORTUNITIES</div>
            <div className="text-xs font-bold text-foreground">{highOpps.length > 0 ? `${highOpps.length} unpursued` : `${activeOpps.length} tracked`}</div>
          </div>
        </div>
        <div className={`flex items-center gap-2 p-2.5 rounded-lg border ${(stuck?.length ?? 0) > 0 ? "bg-orange-400/5 border-orange-400/20" : "bg-card/30 border-border/30"}`}>
          <AlertCircle className={`h-3.5 w-3.5 shrink-0 ${(stuck?.length ?? 0) > 0 ? "text-orange-400" : "text-green-400"}`} />
          <div className="min-w-0">
            <div className="text-[8px] font-bold tracking-widest text-muted-foreground/50">STUCK</div>
            <div className="text-xs font-bold text-foreground">{(stuck?.length ?? 0) > 0 ? `${stuck!.length} to review` : "All clear"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SetupNudge() {
  const { data: setupCtx } = useGetSetupContext();
  const status = setupCtx?.completionStatus;
  if (!status || status.totalComplete >= status.totalSections) return null;

  const missing = [
    !status.businessProfile && "Business Profile",
    !status.revenueGoal && "Revenue Goal",
    !status.salesStrategy && "Sales Strategy",
    !status.services && "Services",
    !status.deliveryProcess && "Delivery",
    !status.operatingRules && "Operating Rules",
  ].filter(Boolean) as string[];

  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-amber-400/20 bg-amber-400/5 mb-4">
      <div className="flex items-center gap-2.5 min-w-0">
        <Settings2 className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 shrink-0" />
        <div className="min-w-0">
          <span className="text-xs font-semibold text-foreground">
            Context setup {status.totalComplete}/{status.totalSections} complete
          </span>
          {missing.length > 0 && (
            <span className="text-[10px] text-amber-400/70 ml-2">
              Missing: {missing.slice(0, 3).join(", ")}{missing.length > 3 ? ` +${missing.length - 3} more` : ""}
            </span>
          )}
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">
            Incomplete context limits how specific the Orchestrator can be.
          </p>
        </div>
      </div>
      <Link href="/setup">
        <Button size="sm" variant="outline" className="border-amber-400/30 text-amber-400 hover:bg-amber-400/10 text-[10px] h-7 px-2.5 flex-shrink-0 gap-1">
          Complete Setup <ChevronRight className="h-3 w-3" />
        </Button>
      </Link>
    </div>
  );
}

export default function CommandCentre() {
  const [execLevel, setExecLevel] = useState<ExecLevel>("amber");
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const saved = localStorage.getItem("nexus-exec-level") as ExecLevel | null;
    if (saved) setExecLevel(saved);
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const { data: briefing, isLoading: briefingLoading } = useGetMemoryBriefing();
  const { data: agentStatus } = useGetMemoryAgentStatus();
  const { data: opps } = useListOpportunities({});
  const { data: dailyPlan, isLoading: planLoading } = useGetDailyPlan();
  const { data: morningBriefRaw } = useGetMorningBrief();
  const morningBrief = morningBriefRaw as {
    headline?: string;
    chiefOfStaffCall?: { action?: string; why?: string };
    weekFocus?: { objective?: string };
    isFromCache?: boolean;
    generatedAt?: string;
  } | undefined;

  const ExecIcon = EXEC_LEVELS[execLevel].icon;
  const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
  const dateFull = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const atRiskCount = briefing?.atRisk?.length ?? 0;
  const challengeMode = atRiskCount >= 2;
  const oppCount = (opps ?? []).filter(o => o.status !== "rejected").length;

  return (
    <div className="space-y-6">
      <SinceYouWereAway />
      <Objectives />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{getGreeting()}, Jay.</h1>
            {challengeMode && (
              <Badge className="bg-yellow-400/10 text-yellow-400 border-yellow-400/30 animate-pulse">
                <AlertTriangle className="h-3 w-3 mr-1" /> Challenge Mode Active
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm sm:text-base">
            {dayName}, {dateFull} — NXS OS has briefed your day.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <ContextIntakeModal>
            <Button variant="outline" className="border-primary/30 text-primary hover:bg-primary/10 gap-2 flex-1 sm:flex-none">
              <Plus className="h-4 w-4" /> Add Context
            </Button>
          </ContextIntakeModal>
          <Link href="/orchestrator">
            <Button className="bg-primary hover:bg-primary/80 text-primary-foreground gap-2 flex-1 sm:flex-none">
              <MessageSquare className="h-4 w-4" /> Talk to Orchestrator
            </Button>
          </Link>
        </div>
      </div>

      <SetupNudge />

      {/* Status Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={`flex items-center gap-3 p-3 rounded-lg border ${EXEC_LEVELS[execLevel].color}`}>
          <Shield className="h-4 w-4 flex-shrink-0" />
          <div>
            <div className="text-[9px] uppercase tracking-wider opacity-70">Execution Mode</div>
            <div className="text-xs font-bold">{EXEC_LEVELS[execLevel].label}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-card/50">
          <Brain className="h-4 w-4 text-primary" />
          <div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Memory Bank</div>
            <div className="text-xs font-bold">{agentStatus?.totalMemories ?? "—"} entries · {agentStatus?.highPriorityCount ?? "—"} high-priority</div>
          </div>
        </div>
        <div className={`flex items-center gap-3 p-3 rounded-lg border ${atRiskCount > 0 ? "border-red-400/30 bg-red-400/5" : "border-green-400/30 bg-green-400/5"}`}>
          <AlertTriangle className={`h-4 w-4 ${atRiskCount > 0 ? "text-red-400" : "text-green-400"}`} />
          <div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Risk Signal</div>
            <div className={`text-xs font-bold ${atRiskCount > 0 ? "text-red-400" : "text-green-400"}`}>
              {atRiskCount} item{atRiskCount !== 1 ? "s" : ""} at risk
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
          <Activity className="h-4 w-4 text-primary" />
          <div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">This Week</div>
            <div className="text-xs font-bold text-primary">{agentStatus?.recentlyAdded ?? "—"} new memories · {agentStatus?.staleCount ?? "—"} stale</div>
          </div>
        </div>
      </div>

      {/* Challenge Mode Banner */}
      {challengeMode && (
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 p-4 bg-yellow-400/5 border border-yellow-400/20 rounded-xl">
          <div className="flex items-start gap-3 flex-1">
            <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-yellow-400">Orchestrator Challenge Notice</p>
              <p className="text-xs text-muted-foreground mt-1">
                {atRiskCount} items are at risk and may require your attention before proceeding with growth activities.
                The Orchestrator recommends reviewing risks before adding new priorities.
              </p>
            </div>
          </div>
          <Link href={`/orchestrator?q=${encodeURIComponent("I have risks that need review — let's work through them and decide which to address first.")}`}>
            <Button size="sm" variant="outline" className="border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/10 text-xs w-full sm:w-auto">
              Discuss with OS <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
      )}

      {/* Daily Execution Plan */}
      <DailyExecutionPlan plan={dailyPlan} isLoading={planLoading} />

      {/* Morning Brief Teaser */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <BrainCircuit className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Morning Brief</h2>
          {morningBrief?.isFromCache && (
            <span className="text-[9px] text-muted-foreground/40 font-mono">cached</span>
          )}
          {morningBrief?.generatedAt && (
            <span className="text-[10px] text-muted-foreground/50 font-mono ml-auto">
              {new Date(morningBrief.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        {morningBrief ? (
          <div className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-br from-primary/8 via-primary/4 to-transparent p-4 sm:p-5">
            <div className="absolute -top-8 -right-8 w-36 h-36 bg-primary/5 rounded-full pointer-events-none" />
            <div className="relative space-y-3">
              {morningBrief.headline && (
                <p className="text-base sm:text-lg font-bold text-foreground leading-snug pr-8">{morningBrief.headline}</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {morningBrief.chiefOfStaffCall?.action && (
                  <div className="border border-primary/20 bg-primary/5 rounded-lg p-3">
                    <div className="text-[8px] font-black uppercase tracking-[0.2em] text-primary/40 mb-1">The CEO's Call</div>
                    <p className="text-xs font-semibold text-foreground leading-snug">{morningBrief.chiefOfStaffCall.action}</p>
                    {morningBrief.chiefOfStaffCall.why && (
                      <p className="text-[10px] text-muted-foreground/60 mt-1 leading-relaxed">{morningBrief.chiefOfStaffCall.why}</p>
                    )}
                  </div>
                )}
                {morningBrief.weekFocus?.objective && (
                  <div className="border border-border/30 bg-card/50 rounded-lg p-3">
                    <div className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 mb-1">Week Focus</div>
                    <p className="text-xs font-semibold text-foreground leading-snug">{morningBrief.weekFocus.objective}</p>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 pt-1">
                <Link href="/morning-brief">
                  <Button size="sm" className="bg-primary/15 hover:bg-primary/25 text-primary border border-primary/25 text-[10px] h-7 px-3 gap-1.5">
                    Read Full Brief <ChevronRight className="h-2.5 w-2.5" />
                  </Button>
                </Link>
                <Link href={`/orchestrator?q=${encodeURIComponent(`Morning brief: "${morningBrief.headline ?? ""}". What's my first move?`)}`}>
                  <button className="text-[10px] text-muted-foreground/40 hover:text-primary transition-colors flex items-center gap-0.5">
                    Discuss with OS <ChevronRight className="h-2.5 w-2.5" />
                  </button>
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            {briefingLoading ? (
              Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-48 w-full" />)
            ) : (
              <>
                <BriefCard icon={<Clock className="h-3.5 w-3.5 text-sky-400" />} title="What Happened" accent="sky" items={briefing?.whatHappened ?? []} emptyText="All quiet — nothing new since last check" />
                <BriefCard icon={<AlertCircle className="h-3.5 w-3.5 text-primary" />} title="What Matters Today" accent="cyan" items={briefing?.whatMatters ?? []} emptyText="No high-priority items flagged" />
                <BriefCard icon={<AlertTriangle className="h-3.5 w-3.5 text-red-400" />} title="Risks to Watch" accent="red" items={briefing?.atRisk ?? []} emptyText="No active risks — good shape" />
                <BriefCard icon={<Lightbulb className="h-3.5 w-3.5 text-yellow-400" />} title="Opportunities" accent="yellow" items={briefing?.opportunities ?? []} emptyText="No tracked opportunities — visit Opportunity Engine" />
                <AutoExecuteCard execLevel={execLevel} />
              </>
            )}
          </div>
        )}
      </div>

      {/* Top 3 Actions */}
      {briefing && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Top 3 Recommended Actions</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {briefing.topActions.map((action, i) => (
              <Card key={i} className="border-border/40 bg-card/50 overflow-hidden">
                <div className={`h-0.5 w-full ${i === 0 ? "bg-primary" : i === 1 ? "bg-primary/60" : "bg-primary/30"}`} />
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground leading-snug">{action.action}</p>
                      <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">{action.rationale}</p>
                      <p className="text-[9px] text-primary/60 mt-2 font-medium">via {action.source}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Quick Navigation */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: "/memory",         icon: Brain,       label: "Memory Engine",      sub: `${agentStatus?.totalMemories ?? 0} entries`, color: "text-cyan-400" },
          { href: "/strategic-brain",icon: Compass,     label: "Strategic Brain",    sub: "Vision & principles", color: "text-indigo-400" },
          { href: "/opportunities",  icon: Lightbulb,   label: "Opportunity Engine", sub: `${oppCount} tracked`, color: "text-yellow-400" },
          { href: "/agents",         icon: BrainCircuit,label: "Agent Layer",         sub: "9 agents ready", color: "text-violet-400" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <Card className="border-border/40 bg-card/50 hover:border-primary/30 hover:bg-card/80 transition-all cursor-pointer group">
                <CardContent className="p-4 flex items-center gap-3">
                  <Icon className={`h-5 w-5 ${item.color} flex-shrink-0`} />
                  <div>
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className="text-[10px] text-muted-foreground">{item.sub}</p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 ml-auto group-hover:text-primary transition-colors" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Success Test Panel */}
      <div className="border border-border/40 rounded-xl p-3 sm:p-5 bg-card/30">
        <SuccessTestPanel />
      </div>
    </div>
  );
}

// ── Daily Execution Plan ─────────────────────────────────────────────────────

const EXEC_CHIP: Record<string, { label: string; cls: string }> = {
  "deep-work":     { label: "DEEP WORK",  cls: "text-violet-400 bg-violet-400/10 border-violet-400/30" },
  "quick-win":     { label: "QUICK WIN",  cls: "text-green-400 bg-green-400/10 border-green-400/30" },
  "communication": { label: "COMMS",      cls: "text-sky-400 bg-sky-400/10 border-sky-400/30" },
  "decision":      { label: "DECISION",   cls: "text-orange-400 bg-orange-400/10 border-orange-400/30" },
};

const IMPACT_CLS: Record<string, string> = {
  critical: "text-red-400 bg-red-400/10 border-red-400/30",
  high:     "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  medium:   "text-sky-400 bg-sky-400/10 border-sky-400/30",
  low:      "text-muted-foreground bg-muted/20 border-border/30",
};

const URGENCY_DOT: Record<string, string> = {
  critical: "bg-red-400",
  high:     "bg-orange-400",
  medium:   "bg-yellow-400",
  low:      "bg-muted-foreground",
};

function DailyExecutionPlan({ plan, isLoading }: { plan?: DailyPlan; isLoading: boolean }) {
  const [rationaleOpen, setRationaleOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-primary animate-pulse" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Daily Execution Plan</h2>
          <span className="text-[10px] text-muted-foreground/30 font-mono ml-auto">Generating…</span>
        </div>
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!plan) return null;

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <Flame className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Daily Execution Plan</h2>
        <span className="text-[10px] text-muted-foreground/30 font-mono ml-auto">
          Generated {new Date(plan.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {/* Mission */}
      <div className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 sm:p-5">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/5 rounded-full pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-primary/50">Today's Mission</span>
            <Badge className="text-[8px] px-2 py-0 border border-primary/30 bg-primary/10 text-primary font-bold">
              {plan.mission.source.replace(/-/g, " ").toUpperCase()}
            </Badge>
          </div>
          <p className="text-lg sm:text-xl font-bold text-foreground leading-snug mb-2">{plan.mission.title}</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-3 max-w-2xl">{plan.mission.rationale}</p>
          <Link href={`/orchestrator?q=${encodeURIComponent(`My mission today is "${plan.mission.title}". Help me build a focused execution plan and identify the first concrete move.`)}`}>
            <Button size="sm" className="bg-primary/15 hover:bg-primary/25 text-primary border border-primary/25 text-[10px] h-7 px-3 gap-1.5">
              <MessageSquare className="h-3 w-3" /> Discuss with OS
              <ChevronRight className="h-2.5 w-2.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Top 3 Actions */}
      {plan.topActions.length > 0 && (
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/40 mb-2 pl-0.5">Top 3 Actions</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {plan.topActions.map((action, i) => {
              const exec = EXEC_CHIP[action.executionLevel] ?? EXEC_CHIP["deep-work"];
              const impactCls = IMPACT_CLS[action.impactLevel] ?? IMPACT_CLS.medium;
              const isTop = i === 0;
              return (
                <div
                  key={i}
                  className={`border rounded-xl p-3.5 flex flex-col gap-2 transition-colors ${
                    isTop
                      ? "border-primary/30 bg-primary/5 hover:border-primary/50"
                      : "border-border/40 bg-card/50 hover:border-border/60"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${
                        isTop
                          ? "bg-primary text-primary-foreground"
                          : i === 1
                          ? "bg-primary/30 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {action.rank}
                    </div>
                    <Badge className={`text-[8px] px-1.5 py-0 border font-bold ml-auto ${exec.cls}`}>
                      {exec.label}
                    </Badge>
                  </div>
                  <p className="text-xs font-semibold text-foreground leading-snug">{action.action}</p>
                  <p className="text-[10px] text-muted-foreground/70 leading-relaxed flex-1 line-clamp-3">
                    {action.whyItMatters}
                  </p>
                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/20 mt-auto">
                    <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border ${impactCls}`}>
                      {action.impactLevel}
                    </span>
                    <Link href={`/orchestrator?q=${encodeURIComponent(`Help me execute this action: "${action.action}". Context: ${action.whyItMatters.slice(0, 100)}`)}`}>
                      <button className="text-[9px] text-muted-foreground/40 hover:text-primary transition-colors flex items-center gap-0.5">
                        Ask OS <ChevronRight className="h-2.5 w-2.5" />
                      </button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Risks + Opportunities */}
      {(plan.risksToControl.length > 0 || plan.opportunitiesToPush.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Risks */}
          {plan.risksToControl.length > 0 && (
            <div className="border border-red-400/20 bg-red-400/[0.03] rounded-xl p-3.5">
              <div className="flex items-center gap-1.5 mb-3">
                <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-red-400/60">Risks to Control</span>
              </div>
              <div className="space-y-3">
                {plan.risksToControl.map((risk, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${URGENCY_DOT[risk.urgency] ?? URGENCY_DOT.high}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <p className="text-[11px] font-semibold text-foreground line-clamp-1">{risk.title}</p>
                        <span className="text-[8px] font-bold uppercase text-red-400/60">{risk.urgency}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground/60 leading-relaxed">{risk.mitigation}</p>
                      <Link href={`/orchestrator?q=${encodeURIComponent(`Let's address this risk: "${risk.title}". Mitigation: ${risk.mitigation.slice(0, 120)}`)}`}>
                        <button className="text-[9px] text-red-400/40 hover:text-red-400 transition-colors mt-1 flex items-center gap-0.5">
                          Discuss mitigation <ChevronRight className="h-2.5 w-2.5" />
                        </button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Opportunities */}
          {plan.opportunitiesToPush.length > 0 && (
            <div className="border border-yellow-400/20 bg-yellow-400/[0.03] rounded-xl p-3.5">
              <div className="flex items-center gap-1.5 mb-3">
                <TrendingUp className="h-3.5 w-3.5 text-yellow-400" />
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-yellow-400/60">Opportunities to Push</span>
              </div>
              <div className="space-y-3">
                {plan.opportunitiesToPush.map((opp, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 bg-yellow-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <p className="text-[11px] font-semibold text-foreground line-clamp-1">{opp.title}</p>
                        {opp.estimatedValue && (
                          <span className="text-[8px] font-bold text-yellow-400">
                            ${parseFloat(opp.estimatedValue).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground/60 leading-relaxed line-clamp-2">{opp.whyToday}</p>
                      <Link href="/opportunities">
                        <button className="text-[9px] text-yellow-400/40 hover:text-yellow-400 transition-colors mt-1 flex items-center gap-0.5">
                          Open in Opp Engine <ChevronRight className="h-2.5 w-2.5" />
                        </button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* What to Ignore */}
      {plan.whatToIgnore.length > 0 && (
        <div className="border border-border/20 bg-card/10 rounded-xl p-3 sm:p-3.5">
          <div className="flex items-center gap-1.5 mb-2.5">
            <XCircle className="h-3.5 w-3.5 text-muted-foreground/30" />
            <span className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/30">Ignore Today</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {plan.whatToIgnore.map((item, i) => (
              <div key={i} className="group relative">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border/25 bg-muted/10 hover:border-border/40 transition-colors cursor-default">
                  <TrendingDown className="h-2.5 w-2.5 text-muted-foreground/25 flex-shrink-0" />
                  <span className="text-[10px] text-muted-foreground/40 line-through decoration-muted-foreground/25">
                    {item.title}
                  </span>
                </div>
                <div className="absolute bottom-full left-0 mb-1.5 w-52 bg-card border border-border/50 rounded-lg p-2.5 text-[9px] text-muted-foreground/70 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-relaxed">
                  {item.reason}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decision Rationale (collapsible) */}
      <div className="border border-border/15 bg-card/5 rounded-xl overflow-hidden">
        <button
          className="w-full flex items-center gap-2 px-3.5 py-2.5 hover:bg-card/20 transition-colors"
          onClick={() => setRationaleOpen((v) => !v)}
        >
          <Eye className="h-3 w-3 text-muted-foreground/30" />
          <span className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/30 flex-1 text-left">
            Why This Plan?
          </span>
          <ChevronDown
            className={`h-3 w-3 text-muted-foreground/25 transition-transform duration-200 ${rationaleOpen ? "rotate-180" : ""}`}
          />
        </button>
        {rationaleOpen && (
          <div className="px-3.5 pb-3.5 border-t border-border/15">
            <p className="text-[10px] text-muted-foreground/50 leading-relaxed mt-2.5 italic">
              {plan.decisionRationale}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function BriefCard({ icon, title, accent, items, emptyText }: {
  icon: React.ReactNode;
  title: string;
  accent: string;
  items: Array<{ id?: number; title: string; summary?: string; category?: string; priority?: string; nextAction?: string }>;
  emptyText: string;
}) {
  const accentBorder: Record<string, string> = {
    sky:    "border-sky-400/20 bg-sky-400/5",
    cyan:   "border-primary/20 bg-primary/5",
    red:    "border-red-400/20 bg-red-400/5",
    yellow: "border-yellow-400/20 bg-yellow-400/5",
  };
  const dotColor: Record<string, string> = {
    sky: "bg-sky-400", cyan: "bg-primary", red: "bg-red-400", yellow: "bg-yellow-400",
  };
  const actionColor: Record<string, string> = {
    sky: "text-sky-400/70", cyan: "text-primary/70", red: "text-red-400/70", yellow: "text-yellow-400/70",
  };
  return (
    <div className={`border rounded-xl p-3 ${accentBorder[accent] ?? "border-border/40 bg-card/30"}`}>
      <div className="flex items-center gap-1.5 mb-2.5">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex-1">{title}</span>
        {items.length > 0 && <span className="text-[9px] text-muted-foreground/40 font-mono">{items.length}</span>}
      </div>
      {items.length === 0 ? (
        <p className="text-[10px] text-muted-foreground/50 italic">{emptyText}</p>
      ) : (
        <div className="space-y-2.5">
          {items.slice(0, 3).map((item, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <div className={`w-1 h-1 rounded-full mt-1.5 shrink-0 ${dotColor[accent] ?? "bg-muted-foreground"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-foreground leading-snug line-clamp-1">{item.title}</p>
                {item.summary && (
                  <p className="text-[10px] text-muted-foreground/70 leading-snug line-clamp-2 mt-0.5">{item.summary}</p>
                )}
                {item.nextAction && (
                  <p className={`text-[9px] font-medium mt-1 leading-snug line-clamp-1 ${actionColor[accent] ?? "text-primary/70"}`}>
                    → {item.nextAction}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AutoExecuteCard({ execLevel }: { execLevel: ExecLevel }) {
  const greenActions = [
    { label: "Memory health check", desc: "Scan for stale entries" },
    { label: "Tag orphaned entries", desc: "Auto-categorize untagged" },
    { label: "Agent status refresh", desc: "Update all agent states" },
  ];
  const amberActions = [
    { label: "Generate weekly brief", desc: "Requires review before send" },
    { label: "Suggest 3 connections", desc: "Memory linking recommendations" },
  ];

  return (
    <div className="border border-green-400/20 bg-green-400/5 rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-3">
        <Zap className="h-3.5 w-3.5 text-green-400" />
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Auto-Execute Today</span>
      </div>
      <div className="space-y-2">
        {greenActions.map((a, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-medium text-foreground">{a.label}</p>
              <p className="text-[9px] text-muted-foreground">{a.desc}</p>
            </div>
          </div>
        ))}
        {execLevel !== "red" && (
          <div className="border-t border-border/30 pt-2 mt-1">
            <p className="text-[9px] text-yellow-400 font-medium mb-1">AMBER — notify + proceed</p>
            {amberActions.map((a, i) => (
              <div key={i} className="flex items-start gap-2 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 mt-1 flex-shrink-0" />
                <p className="text-[10px] text-muted-foreground">{a.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

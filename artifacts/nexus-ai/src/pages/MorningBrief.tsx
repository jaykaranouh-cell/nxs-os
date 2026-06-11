import { useState } from "react";
import { Link } from "wouter";
import {
  useGetMorningBrief,
  useRefreshMorningBrief,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw, AlertTriangle, Lightbulb, Star, TrendingUp,
  ChevronRight, MessageSquare, Zap, Brain, ArrowRight,
  Clock, Activity, Shield,
} from "lucide-react";

function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`space-y-3 ${className}`}>{children}</div>;
}

function SectionLabel({ icon, label, sub }: { icon: React.ReactNode; label: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      {icon}
      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">{label}</span>
      {sub && <span className="text-[9px] text-muted-foreground/30 font-mono ml-auto">{sub}</span>}
    </div>
  );
}

function UrgencyDot({ urgency }: { urgency: string }) {
  const cls =
    urgency === "critical"
      ? "bg-red-500"
      : urgency === "high"
      ? "bg-orange-400"
      : "bg-yellow-400";
  return <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${cls}`} />;
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-[10px] text-muted-foreground/40 italic">{text}</p>;
}

type MorningBriefHotLead = { name: string; company: string; stage: string; action: string; value: number };
type MorningBriefRisk = { title: string; urgency: string; recommendation: string };
type MorningBriefOpportunity = { title: string; why: string; estimatedValue?: string | null };
type MorningBriefMemoryHighlight = { title: string; whatChanged: string };
type MorningBriefData = {
  headline: string;
  situationReport: string;
  weekFocus: { objective: string; rationale: string };
  pipelinePulse: { summary: string; pipelineValue: number; insight: string; hotLeads?: MorningBriefHotLead[] };
  risksAndDecisions: MorningBriefRisk[];
  opportunitiesToPush: MorningBriefOpportunity[];
  memoryHighlights: MorningBriefMemoryHighlight[];
  chiefOfStaffCall: { action: string; timeframe: string; why: string };
  newSinceLastBrief: string[];
  generatedAt: string;
  isFromCache: boolean;
};

function BriefSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-3">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}

export default function MorningBrief() {
  const { data: raw, isLoading, refetch } = useGetMorningBrief();
  const { mutateAsync: refresh, isPending: refreshing } = useRefreshMorningBrief();
  const [justRefreshed, setJustRefreshed] = useState(false);

  const brief = raw as MorningBriefData | undefined;

  const handleRefresh = async () => {
    await refresh();
    await refetch();
    setJustRefreshed(true);
    setTimeout(() => setJustRefreshed(false), 3000);
  };

  const timeStr = brief?.generatedAt
    ? new Date(brief.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-primary/60">NXS OS</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Morning Brief</h1>
          <div className="flex items-center gap-2 mt-1">
            {brief?.isFromCache && (
              <Badge className="text-[9px] border-border/50 text-muted-foreground/50 bg-transparent">
                <Clock className="h-2.5 w-2.5 mr-1" /> Cached
              </Badge>
            )}
            {!brief?.isFromCache && brief && (
              <Badge className="text-[9px] border-primary/30 text-primary/60 bg-primary/5">
                <Activity className="h-2.5 w-2.5 mr-1" /> Live
              </Badge>
            )}
            {timeStr && (
              <span className="text-[10px] text-muted-foreground/40 font-mono">
                Generated {timeStr}
              </span>
            )}
            {justRefreshed && (
              <span className="text-[10px] text-green-400 font-mono animate-pulse">Brief refreshed</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing || isLoading}
            className="border-primary/25 text-primary hover:bg-primary/10 gap-2 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Generating…" : "Refresh Brief"}
          </Button>
          <Link href="/orchestrator">
            <Button size="sm" className="bg-primary/15 hover:bg-primary/25 text-primary border border-primary/25 gap-2 text-xs">
              <MessageSquare className="h-3.5 w-3.5" /> Discuss
            </Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <BriefSkeleton />
      ) : !brief ? (
        <div className="text-center py-20 text-muted-foreground/40 text-sm">
          No brief yet — click Refresh Brief to generate your first briefing.
        </div>
      ) : (
        <div className="space-y-5">
          {/* Headline + Situation */}
          <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 sm:p-6">
            <div className="absolute -top-8 -right-8 w-40 h-40 bg-primary/5 rounded-full pointer-events-none" />
            <div className="relative">
              <div className="text-[8px] font-black uppercase tracking-[0.25em] text-primary/40 mb-2">Chief of Staff Briefing</div>
              <p className="text-xl sm:text-2xl font-bold text-foreground leading-snug mb-3">{brief.headline}</p>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">{brief.situationReport}</p>
            </div>
          </div>

          {/* Chief of Staff Call + Week Focus */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Chief of Staff Call */}
            <div className="border border-primary/30 bg-primary/5 rounded-xl p-4 space-y-2">
              <SectionLabel icon={<Zap className="h-3.5 w-3.5 text-primary" />} label="Chief of Staff Call" sub={brief.chiefOfStaffCall.timeframe} />
              <p className="text-sm font-semibold text-foreground leading-snug">{brief.chiefOfStaffCall.action}</p>
              <p className="text-[11px] text-muted-foreground/70 leading-relaxed">{brief.chiefOfStaffCall.why}</p>
              <Link href={`/orchestrator?q=${encodeURIComponent(`Chief of Staff priority: "${brief.chiefOfStaffCall.action}". Help me plan the first 30 minutes.`)}`}>
                <button className="text-[10px] text-primary/50 hover:text-primary transition-colors flex items-center gap-0.5 mt-1">
                  Plan execution <ChevronRight className="h-3 w-3" />
                </button>
              </Link>
            </div>

            {/* Week Focus */}
            <div className="border border-border/40 bg-card/50 rounded-xl p-4 space-y-2">
              <SectionLabel icon={<Star className="h-3.5 w-3.5 text-yellow-400" />} label="Week Focus" />
              <p className="text-sm font-semibold text-foreground leading-snug">{brief.weekFocus.objective}</p>
              <p className="text-[11px] text-muted-foreground/70 leading-relaxed">{brief.weekFocus.rationale}</p>
            </div>
          </div>

          {/* Pipeline Pulse */}
          <Section>
            <div className="border border-border/40 bg-card/50 rounded-xl p-4 space-y-3">
              <SectionLabel
                icon={<TrendingUp className="h-3.5 w-3.5 text-green-400" />}
                label="Pipeline Pulse"
                sub={`$${(brief.pipelinePulse.pipelineValue ?? 0).toLocaleString()} total`}
              />
              <p className="text-xs text-foreground font-medium">{brief.pipelinePulse.summary}</p>
              {(brief.pipelinePulse.hotLeads ?? []).length > 0 && (
                <div className="space-y-2">
                  {(brief.pipelinePulse.hotLeads ?? []).map((lead, i) => (
                    <div key={i} className="flex items-start gap-3 py-2 border-b border-border/20 last:border-0">
                      <div className="w-5 h-5 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center text-[9px] font-black text-primary flex-shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-xs font-semibold text-foreground">{lead.name}</span>
                          <span className="text-[10px] text-muted-foreground/60">@ {lead.company}</span>
                          <Badge className="text-[8px] px-1.5 py-0 border-border/40 bg-muted/50 text-muted-foreground font-medium ml-auto">
                            {lead.stage}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground/70">{lead.action}</p>
                      </div>
                      {lead.value > 0 && (
                        <span className="text-[10px] font-semibold text-green-400 flex-shrink-0">
                          ${lead.value.toLocaleString()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground/50 italic border-t border-border/20 pt-2">
                {brief.pipelinePulse.insight}
              </p>
              <Link href="/leads">
                <button className="text-[10px] text-muted-foreground/40 hover:text-primary transition-colors flex items-center gap-0.5">
                  Open Pipeline <ChevronRight className="h-3 w-3" />
                </button>
              </Link>
            </div>
          </Section>

          {/* Risks + Opportunities */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Risks */}
            <div className="border border-red-400/20 bg-red-400/[0.03] rounded-xl p-4 space-y-3">
              <SectionLabel icon={<AlertTriangle className="h-3.5 w-3.5 text-red-400" />} label="Risks & Decisions" />
              {(brief.risksAndDecisions ?? []).length === 0 ? (
                <EmptyState text="No critical risks flagged — good shape" />
              ) : (
                <div className="space-y-3">
                  {brief.risksAndDecisions.map((risk, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <UrgencyDot urgency={risk.urgency} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                          <p className="text-[11px] font-semibold text-foreground">{risk.title}</p>
                          <span className="text-[8px] font-bold uppercase text-red-400/60">{risk.urgency}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground/70 leading-relaxed">{risk.recommendation}</p>
                        <Link href={`/orchestrator?q=${encodeURIComponent(`Let's address this risk: "${risk.title}". Recommended: ${risk.recommendation}`)}`}>
                          <button className="text-[9px] text-red-400/40 hover:text-red-400 transition-colors mt-1 flex items-center gap-0.5">
                            Discuss <ChevronRight className="h-2.5 w-2.5" />
                          </button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Opportunities */}
            <div className="border border-yellow-400/20 bg-yellow-400/[0.03] rounded-xl p-4 space-y-3">
              <SectionLabel icon={<Lightbulb className="h-3.5 w-3.5 text-yellow-400" />} label="Opportunities to Push" />
              {(brief.opportunitiesToPush ?? []).length === 0 ? (
                <EmptyState text="No priority opportunities flagged" />
              ) : (
                <div className="space-y-3">
                  {brief.opportunitiesToPush.map((opp, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0 mt-1.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <p className="text-[11px] font-semibold text-foreground">{opp.title}</p>
                          {opp.estimatedValue && (
                            <span className="text-[8px] font-bold text-yellow-400/70">{opp.estimatedValue}</span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground/70 leading-relaxed">{opp.why}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Memory Highlights + New Since Last Brief */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Memory Highlights */}
            <div className="border border-border/40 bg-card/50 rounded-xl p-4 space-y-3">
              <SectionLabel icon={<Brain className="h-3.5 w-3.5 text-primary" />} label="Memory Highlights" />
              {(brief.memoryHighlights ?? []).length === 0 ? (
                <EmptyState text="No notable memory entries to surface" />
              ) : (
                <div className="space-y-3">
                  {brief.memoryHighlights.map((m, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0 mt-1.5" />
                      <div>
                        <p className="text-[11px] font-semibold text-foreground mb-0.5">{m.title}</p>
                        <p className="text-[10px] text-muted-foreground/70 leading-relaxed">{m.whatChanged}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Link href="/memory">
                <button className="text-[9px] text-muted-foreground/30 hover:text-primary transition-colors flex items-center gap-0.5">
                  Open Memory Engine <ChevronRight className="h-2.5 w-2.5" />
                </button>
              </Link>
            </div>

            {/* New Since Last Brief */}
            <div className="border border-border/40 bg-card/50 rounded-xl p-4 space-y-3">
              <SectionLabel icon={<Activity className="h-3.5 w-3.5 text-sky-400" />} label="New Since Last Brief" />
              {(brief.newSinceLastBrief ?? []).length === 0 ? (
                <EmptyState text="Nothing new captured since the last brief" />
              ) : (
                <div className="space-y-2">
                  {brief.newSinceLastBrief.map((item, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <ArrowRight className="h-3 w-3 text-sky-400/60 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-foreground/80 leading-relaxed">{item}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer — discuss with OS */}
          <div className="flex items-center justify-between pt-2 border-t border-border/20">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3 w-3 text-muted-foreground/30" />
              <span className="text-[9px] font-mono text-muted-foreground/30 uppercase tracking-wider">
                AI Chief of Staff · NXS OS
              </span>
            </div>
            <Link href={`/orchestrator?q=${encodeURIComponent(`Morning brief headline: "${brief.headline}". Walk me through the most important thing to focus on right now.`)}`}>
              <Button size="sm" variant="outline" className="border-primary/25 text-primary hover:bg-primary/10 text-[11px] h-7 gap-1.5">
                <MessageSquare className="h-3 w-3" /> Discuss with OS
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

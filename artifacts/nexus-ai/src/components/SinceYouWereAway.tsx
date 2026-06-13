/**
 * "Since you were away" — the landing surface that makes Maya's autonomous
 * work visible: what happened while Jay was gone, and what needs him now.
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  useGetHomeDigest,
  useMarkHomeSeen,
  useApproveMemoryProposal,
  useRejectMemoryProposal,
  useListReversibleActions,
  useUndoAction,
  getGetHomeDigestQueryKey,
  getListReversibleActionsQueryKey,
} from "@workspace/api-client-react";
import {
  Sparkles, Sun, Inbox, Check, X, MessageSquare, Lightbulb,
  AlertTriangle, Target, ArrowRight, CheckCircle2, Undo2, DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExpandableText } from "@/components/ExpandableText";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function SectionHeader({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      {icon}
      <h3 className="text-[10px] font-bold font-mono uppercase tracking-[0.2em] text-white/45">{title}</h3>
      {count != null && count > 0 && (
        <span className="text-[9px] font-mono text-primary/70 bg-primary/10 border border-primary/20 rounded-full px-1.5">{count}</span>
      )}
      <div className="flex-1 h-px bg-white/8" />
    </div>
  );
}

export function SinceYouWereAway() {
  const queryClient = useQueryClient();
  const { data: digest, isLoading } = useGetHomeDigest();
  const markSeen = useMarkHomeSeen();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetHomeDigestQueryKey() });
  const approve = useApproveMemoryProposal({ mutation: { onSuccess: invalidate } });
  const reject = useRejectMemoryProposal({ mutation: { onSuccess: invalidate } });
  const { data: reversible } = useListReversibleActions();
  const undo = useUndoAction({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListReversibleActionsQueryKey() }) } });

  // Mark seen shortly after viewing, so the next visit shows only newer activity.
  useEffect(() => {
    if (!digest) return;
    const t = setTimeout(() => markSeen.mutate(), 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digest?.generatedAt]);

  if (isLoading || !digest) return null;

  const { away, needsYou, counts, lastSeen } = digest;
  const awayTotal = counts.growthSessions + counts.agentMessages + counts.newOpportunities;
  const needsTotal = counts.proposals + counts.ideas + counts.riskTasks;

  if (awayTotal === 0 && needsTotal === 0) {
    return (
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 mb-5 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-green-400/70" />
        <div>
          <div className="text-sm font-semibold text-white/80">All caught up</div>
          <div className="text-[11px] text-white/40">Nothing new since {timeAgo(lastSeen)}. Maya's team will surface things here as they work.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-primary/15 bg-gradient-to-b from-primary/[0.05] to-transparent p-5 mb-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
          <Sun className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-bold text-white/90">Since you were away</h2>
          <p className="text-[10px] text-white/40">Last checked {timeAgo(lastSeen)}</p>
        </div>
        {digest.budget?.todayUsd != null && (() => {
          const today = digest.budget.todayUsd ?? 0;
          const cap = digest.budget.capUsd ?? null;
          return (
            <div className="text-right">
              <div className="text-[9px] font-mono uppercase tracking-widest text-white/30 flex items-center gap-1 justify-end"><DollarSign className="h-2.5 w-2.5" /> today</div>
              <div className={`text-sm font-bold ${cap && today >= cap * 0.8 ? "text-yellow-400" : "text-white/80"}`}>
                ${today.toFixed(2)}{cap ? <span className="text-white/30 text-[10px] font-normal"> / ${cap}</span> : null}
              </div>
            </div>
          );
        })()}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── What happened ── */}
        <div className="space-y-4">
          {away.growthSessions.length > 0 && (
            <div>
              <SectionHeader icon={<Sparkles className="h-3.5 w-3.5 text-primary/60" />} title="Maya's strategy sessions" />
              {away.growthSessions.map((g) => (
                <div key={g.id} className="rounded-lg border border-white/8 bg-white/[0.02] p-3 mb-2">
                  <ExpandableText text={g.snippet} className="text-[11px] text-white/65 leading-relaxed" />
                  <Link href="/orchestrator"><span className="text-[9px] font-mono text-primary/60 hover:text-primary mt-1 inline-flex items-center gap-0.5 cursor-pointer">open chat <ArrowRight className="h-2.5 w-2.5" /></span></Link>
                </div>
              ))}
            </div>
          )}

          {away.agentMessages.length > 0 && (
            <div>
              <SectionHeader icon={<MessageSquare className="h-3.5 w-3.5 text-primary/60" />} title="From your team" count={counts.agentMessages} />
              {away.agentMessages.slice(0, 5).map((m, i) => (
                <div key={i} className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 mb-1.5">
                  <div className="text-[10px] font-medium text-white/70">{m.fromAgentName}<span className="text-white/35"> · {timeAgo(m.createdAt)}</span></div>
                  <ExpandableText text={m.content} className="text-[11px] text-white/50 leading-relaxed mt-0.5" clamp="line-clamp-2" />
                </div>
              ))}
              <Link href="/agents"><span className="text-[9px] font-mono text-primary/60 hover:text-primary inline-flex items-center gap-0.5 cursor-pointer">team channel <ArrowRight className="h-2.5 w-2.5" /></span></Link>
            </div>
          )}

          {away.newOpportunities.length > 0 && (
            <div>
              <SectionHeader icon={<Target className="h-3.5 w-3.5 text-primary/60" />} title="New opportunities" count={counts.newOpportunities} />
              {away.newOpportunities.map((o) => (
                <Link key={o.id} href="/opportunities">
                  <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-1.5 mb-1 hover:border-primary/30 cursor-pointer">
                    <span className={`text-[8px] font-mono uppercase ${o.priority === "critical" || o.priority === "high" ? "text-yellow-400/80" : "text-white/30"}`}>{o.priority}</span>
                    <span className="text-[11px] text-white/70 truncate">{o.title}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ── What needs you ── */}
        <div className="space-y-4">
          {needsYou.proposals.length > 0 && (
            <div>
              <SectionHeader icon={<Inbox className="h-3.5 w-3.5 text-primary/60" />} title="Memories to approve" count={counts.proposals} />
              {needsYou.proposals.slice(0, 4).map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-1.5 mb-1">
                  <span className="text-[11px] text-white/70 truncate flex-1">{p.title}</span>
                  <button onClick={() => approve.mutate({ id: p.id })} disabled={approve.isPending} className="text-green-400/80 hover:text-green-400"><Check className="h-3.5 w-3.5" /></button>
                  <button onClick={() => reject.mutate({ id: p.id })} disabled={reject.isPending} className="text-white/30 hover:text-red-400"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              {needsYou.proposals.length > 4 && (
                <Link href="/memory"><span className="text-[9px] font-mono text-primary/60 hover:text-primary cursor-pointer">+{needsYou.proposals.length - 4} more in Memory Engine</span></Link>
              )}
            </div>
          )}

          {needsYou.riskTasks.length > 0 && (
            <div>
              <SectionHeader icon={<AlertTriangle className="h-3.5 w-3.5 text-yellow-400/70" />} title="Flagged for you" count={counts.riskTasks} />
              {needsYou.riskTasks.slice(0, 5).map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-lg border border-yellow-400/15 bg-yellow-400/5 px-3 py-1.5 mb-1">
                  <span className="text-[11px] text-white/70 leading-snug">{t.title}</span>
                </div>
              ))}
            </div>
          )}

          {needsYou.ideas.length > 0 && (
            <div>
              <SectionHeader icon={<Lightbulb className="h-3.5 w-3.5 text-primary/60" />} title="Ideas to review" count={counts.ideas} />
              {needsYou.ideas.slice(0, 5).map((idea) => (
                <div key={idea.id} className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-1.5 mb-1">
                  <span className="text-[8px] font-mono uppercase text-white/30">{idea.agentName}</span>
                  <span className="text-[11px] text-white/70 truncate">{idea.title}</span>
                </div>
              ))}
            </div>
          )}

          {reversible && reversible.length > 0 && (
            <div>
              <SectionHeader icon={<Undo2 className="h-3.5 w-3.5 text-primary/60" />} title="Recent agent actions" count={reversible.length} />
              {reversible.slice(0, 5).map((a) => (
                <div key={a.id} className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-1.5 mb-1">
                  <span className="text-[11px] text-white/65 truncate flex-1">{a.entityLabel}: {a.prevValue} → {a.newValue}</span>
                  <button onClick={() => undo.mutate({ id: a.id })} disabled={undo.isPending} title="Undo" className="text-white/30 hover:text-primary flex items-center gap-0.5 text-[9px] font-mono"><Undo2 className="h-3 w-3" /> undo</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

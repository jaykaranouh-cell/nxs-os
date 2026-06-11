/**
 * NXS City chrome — the command HUD layered around the isometric canvas:
 * hero header, system status, today's mission, city intelligence rail,
 * Maya panel, and the bottom intelligence strip.
 */

import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, MessageSquare,
  Moon, Sparkles, Sun, Target,
} from "lucide-react";
import type {
  DailyPlan, MorningBrief, MemoryBriefing, LeadStats, Lead, OpportunityItem,
  SetupContext,
} from "@workspace/api-client-react";

// ─── Shared data bundle ───────────────────────────────────────────────────────

export interface CityData {
  plan?: DailyPlan;
  brief?: MorningBrief;
  briefing?: MemoryBriefing;
  leadStats?: LeadStats;
  leads: Lead[];
  opportunities: OpportunityItem[];
  setup?: SetupContext;
}

const fmtMoney = (n: number) =>
  `$${n >= 10000 ? Math.round(n).toLocaleString() : n.toLocaleString()}`;

function revenueGoal(data: CityData): { target: number | null; label: string; by: string } {
  const rg = (data.setup?.revenueGoal ?? {}) as Record<string, unknown>;
  const raw = typeof rg.annualTarget === "string" ? rg.annualTarget : "";
  const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
  return {
    target: Number.isFinite(num) && num > 0 ? num : null,
    label: raw || "Set in Business Setup",
    by: typeof rg.targetDate === "string" ? rg.targetDate : "",
  };
}

function wonRevenue(data: CityData): number {
  return data.leads
    .filter((l) => l.stage === "won")
    .reduce((sum, l) => sum + (l.estimatedValue != null ? parseFloat(String(l.estimatedValue)) : 0), 0);
}

// ─── Live clock ───────────────────────────────────────────────────────────────

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const h = now.getHours();
  const greeting =
    h < 5 ? "Late night session" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return {
    greeting,
    date: now.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    time: now.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).toUpperCase(),
  };
}

// ─── Hero header ──────────────────────────────────────────────────────────────

export function CityHero() {
  const { greeting, date, time } = useClock();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 items-center gap-3 pb-4 flex-shrink-0">
      <div className="hidden lg:block">
        <div className="text-[15px] font-black tracking-tight">
          <span className="text-primary">NXS</span> <span className="text-white/90">OS</span>
        </div>
        <div className="text-[7px] font-mono uppercase tracking-[0.28em] text-white/25 mt-0.5">
          AI Powered Business Operating System
        </div>
      </div>
      <div className="text-center">
        <h1 className="text-xl sm:text-2xl font-black uppercase tracking-[0.42em] text-white/90 [text-shadow:0_0_24px_hsl(var(--primary)/0.35)]">
          NXS City
        </h1>
        <p className="text-[10px] text-white/35 tracking-wide mt-0.5">Your Business. Your Command Centre.</p>
      </div>
      <div className="flex items-center justify-center lg:justify-end gap-4">
        <div className="text-right">
          <div className="text-sm font-semibold text-white/85">{greeting}, Jay.</div>
          <div className="text-[9px] font-mono text-white/30 mt-0.5">
            {date} <span className="text-primary/60 ml-1.5">{time}</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5 pl-4 border-l border-white/8">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/70 via-sky-500/50 to-indigo-600/60 border border-primary/40 flex items-center justify-center text-[10px] font-black text-white shadow-[0_0_18px_hsl(var(--primary)/0.35)]">
            JK
          </div>
          <div className="hidden sm:block">
            <div className="text-[10px] font-bold text-white/80 leading-tight">JAY KARANOUH</div>
            <div className="text-[7px] font-mono uppercase tracking-widest text-white/30">Founder & CEO · NXS AI</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── HUD card shell ───────────────────────────────────────────────────────────

function HudCard({ title, children, className = "" }: {
  title: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`pointer-events-auto rounded-xl border border-white/10 bg-[#070d18]/85 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.55)] ${className}`}>
      <div className="px-3.5 pt-3 pb-2 text-[8px] font-bold font-mono uppercase tracking-[0.22em] text-white/40 flex items-center gap-1.5">
        {title}
      </div>
      <div className="px-3.5 pb-3.5">{children}</div>
    </div>
  );
}

function HudLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href}>
      <span className="mt-2.5 flex items-center justify-center gap-1.5 w-full rounded-md border border-primary/25 bg-primary/8 hover:bg-primary/15 transition-colors px-2 py-1.5 text-[8px] font-mono font-bold uppercase tracking-[0.18em] text-primary/80 cursor-pointer">
        {children}
      </span>
    </Link>
  );
}

// ─── System status ────────────────────────────────────────────────────────────

export function SystemStatusCard({ data }: { data: CityData }) {
  const atRisk = data.briefing?.atRisk?.length ?? 0;
  const actions = data.plan?.topActions?.length ?? 0;
  const recent = data.briefing?.recentCount ?? 0;

  const performance = Math.max(55, Math.min(99, 98 - atRisk * 6));
  const focus = actions >= 3 ? "High" : actions >= 1 ? "Forming" : "Undefined";
  const momentum = recent >= 5 ? "Strong" : recent >= 1 ? "Building" : "Quiet";
  const execution = data.plan?.mission ? "On Track" : "No Plan";

  const rows: Array<[string, string, string]> = [
    ["Performance", `${performance}%`, performance >= 85 ? "text-white/80" : "text-yellow-400"],
    ["Focus", focus, focus === "High" ? "text-green-400" : "text-yellow-400"],
    ["Momentum", momentum, momentum === "Strong" ? "text-green-400" : "text-white/60"],
    ["Execution", execution, execution === "On Track" ? "text-primary/90" : "text-yellow-400"],
  ];

  return (
    <HudCard title={<><Activity className="h-2.5 w-2.5" /> System Status</>} className="w-52">
      <div className={`text-[9px] font-mono font-bold tracking-wider mb-2 ${atRisk === 0 ? "text-green-400" : "text-yellow-400"}`}>
        {atRisk === 0 ? "ALL SYSTEMS OPERATIONAL" : `${atRisk} ITEM${atRisk !== 1 ? "S" : ""} NEED ATTENTION`}
      </div>
      <div className="space-y-1.5">
        {rows.map(([label, value, cls]) => (
          <div key={label} className="flex items-center justify-between border-t border-white/6 pt-1.5">
            <span className="text-[9px] text-white/35">{label}</span>
            <span className={`text-[9px] font-mono font-bold ${cls}`}>{value}</span>
          </div>
        ))}
      </div>
    </HudCard>
  );
}

// ─── Today's mission ──────────────────────────────────────────────────────────

export function MissionCard({ data }: { data: CityData }) {
  const mission = data.plan?.mission?.title
    ?? data.brief?.chiefOfStaffCall?.action
    ?? "Open the Command Centre to generate today's execution plan.";
  return (
    <HudCard title={<><Target className="h-2.5 w-2.5" /> Today's Mission</>} className="w-60">
      <p className="text-[11px] leading-relaxed text-white/75">{mission}</p>
      <HudLink href="/">View Execution Plan</HudLink>
    </HudCard>
  );
}

// ─── City intelligence rail ───────────────────────────────────────────────────

function Ring({ pct }: { pct: number }) {
  const r = 14, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 36 36" className="w-9 h-9 -rotate-90">
      <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3.5" />
      <circle cx="18" cy="18" r={r} fill="none" stroke="hsl(var(--primary))" strokeWidth="3.5"
        strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} />
      <text x="18" y="19" textAnchor="middle" dominantBaseline="middle"
        className="fill-white/85 font-mono font-bold rotate-90 origin-center" fontSize="8.5">
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

function IntelStat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="border-t border-white/6 pt-2 pb-1">
      <div className="text-[7px] font-mono uppercase tracking-[0.2em] text-white/30">{label}</div>
      <div className="text-sm font-bold text-white/90 mt-0.5">{value}</div>
      {sub && <div className="text-[8px] font-mono text-white/30 mt-0.5">{sub}</div>}
    </div>
  );
}

export function IntelRail({ data }: { data: CityData }) {
  const goal = revenueGoal(data);
  const arr = wonRevenue(data);
  const pct = goal.target ? Math.min(100, (arr / goal.target) * 100) : 0;
  const stats = data.leadStats;
  const pipeline = stats?.totalPipelineValue ?? 0;
  const openLeads = stats ? stats.total - stats.closedWon - stats.rejected : 0;
  const clients = stats?.closedWon ?? 0;
  const opps = data.opportunities.filter((o) => o.status !== "rejected");
  const hi = opps.filter((o) => o.priority === "critical" || o.priority === "high").length;
  const med = opps.filter((o) => o.priority === "medium").length;
  const lo = opps.length - hi - med;

  return (
    <HudCard title="City Intelligence" className="w-56">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[7px] font-mono uppercase tracking-[0.2em] text-white/30">Revenue Target</div>
          <div className="text-sm font-bold text-primary/95 mt-0.5 truncate">{goal.label}</div>
          {goal.by && <div className="text-[8px] font-mono text-white/30 mt-0.5">by {goal.by}</div>}
        </div>
        {goal.target != null && <Ring pct={pct} />}
      </div>
      <div className="mt-2 space-y-0.5">
        <IntelStat label="Current ARR" value={fmtMoney(arr)} sub={goal.target ? `${Math.round(pct)}% of target` : undefined} />
        <IntelStat label="Active Pipeline" value={fmtMoney(pipeline)} sub={`${openLeads} open lead${openLeads !== 1 ? "s" : ""}`} />
        <IntelStat label="Active Clients" value={clients} sub={clients ? "closed-won retainers" : "first close pending"} />
        <IntelStat label="Opportunities" value={opps.length} sub={`${hi} high · ${med} medium · ${lo} low`} />
      </div>
      <HudLink href="/kpi">View Full Report</HudLink>
    </HudCard>
  );
}

// ─── Maya ─────────────────────────────────────────────────────────────────────

export function MayaCard() {
  return (
    <div className="pointer-events-auto rounded-xl border border-primary/20 bg-[#070d18]/85 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.55)] px-3.5 py-3 w-52">
      <div className="flex items-center gap-2.5">
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary via-sky-400 to-indigo-500 opacity-90 flex items-center justify-center shadow-[0_0_22px_hsl(var(--primary)/0.45)]">
            <Sparkles className="h-4 w-4 text-[#04101e]" />
          </div>
          <span className="absolute inset-0 rounded-full border border-primary/50 animate-ping opacity-30" />
        </div>
        <div>
          <div className="text-[11px] font-black tracking-wide text-white/90">MAYA</div>
          <div className="text-[7px] font-mono uppercase tracking-[0.2em] text-primary/70">AI Chief of Staff</div>
        </div>
      </div>
      <p className="text-[9px] text-white/40 mt-2 leading-relaxed">How can I help you win today?</p>
      <HudLink href="/orchestrator"><MessageSquare className="h-2.5 w-2.5" /> Chat with Maya</HudLink>
    </div>
  );
}

// ─── Bottom intelligence strip ────────────────────────────────────────────────

function FooterCard({ title, link, linkLabel, children }: {
  title: string; link: string; linkLabel: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-3 flex flex-col">
      <div className="text-[8px] font-bold font-mono uppercase tracking-[0.22em] text-white/40 mb-2">{title}</div>
      <div className="flex-1 space-y-1.5">{children}</div>
      <Link href={link}>
        <span className="mt-2.5 flex items-center justify-center gap-1 rounded-md border border-white/10 hover:border-primary/30 hover:text-primary/80 transition-colors px-2 py-1.5 text-[8px] font-mono font-bold uppercase tracking-[0.16em] text-white/40 cursor-pointer">
          {linkLabel} <ArrowRight className="h-2.5 w-2.5" />
        </span>
      </Link>
    </div>
  );
}

const Empty = ({ text }: { text: string }) => (
  <p className="text-[9px] text-white/25 italic leading-relaxed">{text}</p>
);

export function IntelFooter({ data, mode, onModeChange }: {
  data: CityData; mode: "night" | "day"; onModeChange: (m: "night" | "day") => void;
}) {
  const plan = data.plan;
  const brief = data.brief;
  const briefBullets = [
    ...(brief?.newSinceLastBrief ?? []),
    ...(data.briefing?.whatMatters?.map((w: { title: string }) => w.title) ?? []),
  ].slice(0, 4);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 pt-3 flex-shrink-0">
      <FooterCard title="Morning Brief Summary" link="/morning-brief" linkLabel="View Full Brief">
        {brief?.headline
          ? <p className="text-[10px] text-white/70 leading-relaxed">{brief.headline}</p>
          : <Empty text="No brief generated yet for today." />}
        {briefBullets.map((b, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <span className="w-1 h-1 rounded-full bg-primary/50 mt-1.5 flex-shrink-0" />
            <span className="text-[9px] text-white/45 leading-relaxed">{b}</span>
          </div>
        ))}
      </FooterCard>

      <FooterCard title="Top 3 Priorities Today" link="/" linkLabel="View Execution Plan">
        {plan?.topActions?.length
          ? plan.topActions.slice(0, 3).map((a) => (
              <div key={a.rank} className="flex items-start gap-2">
                <span className="w-4 h-4 rounded border border-white/15 text-[8px] font-mono font-bold text-white/50 flex items-center justify-center flex-shrink-0 mt-px">{a.rank}</span>
                <span className="text-[9px] text-white/60 leading-relaxed">{a.action}</span>
              </div>
            ))
          : <Empty text="No execution plan yet — generate one in the Command Centre." />}
      </FooterCard>

      <FooterCard title="Risks to Control" link="/memory" linkLabel="View All Risks">
        {plan?.risksToControl?.length
          ? plan.risksToControl.slice(0, 3).map((r, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <AlertTriangle className={`h-3 w-3 flex-shrink-0 mt-px ${r.urgency === "critical" ? "text-red-400" : "text-yellow-400"}`} />
                <span className="text-[9px] text-white/60 leading-relaxed">{r.title}</span>
              </div>
            ))
          : <Empty text="No flagged risks right now." />}
      </FooterCard>

      <FooterCard title="Opportunities to Push" link="/opportunities" linkLabel="View Opportunities">
        {plan?.opportunitiesToPush?.length
          ? plan.opportunitiesToPush.slice(0, 3).map((o, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <ArrowUpRight className="h-3 w-3 text-green-400 flex-shrink-0 mt-px" />
                <span className="text-[9px] text-white/60 leading-relaxed">{o.title}</span>
              </div>
            ))
          : <Empty text="Nothing queued — scan the Opportunity Engine." />}
      </FooterCard>

      <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-3 flex flex-col col-span-2 lg:col-span-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[8px] font-bold font-mono uppercase tracking-[0.22em] text-white/40">NXS City View</span>
          <div className="flex rounded-md border border-white/10 overflow-hidden">
            {(["day", "night"] as const).map((m) => (
              <button key={m} onClick={() => onModeChange(m)}
                className={`px-2 py-1 text-[7px] font-mono font-bold uppercase tracking-widest transition-colors flex items-center gap-1 ${
                  mode === m ? "bg-primary/20 text-primary" : "text-white/30 hover:text-white/60"}`}>
                {m === "day" ? <Sun className="h-2.5 w-2.5" /> : <Moon className="h-2.5 w-2.5" />} {m}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 rounded-lg border border-white/6 bg-gradient-to-b from-[#0a1426] to-[#040810] relative overflow-hidden min-h-14">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="absolute bottom-0 bg-primary/15 border-t border-primary/30"
              style={{ left: `${8 + i * 13}%`, width: "8%", height: `${22 + ((i * 37) % 55)}%` }} />
          ))}
          <div className="absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-primary/5" />
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, Circle, Building2, Target, Users, Package,
  Workflow, SlidersHorizontal, ArrowRight, Save, ChevronRight,
  Lightbulb, ExternalLink, Zap, LayoutGrid, RefreshCw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SectionDef {
  id: string;
  apiKey: string | null;
  label: string;
  icon: typeof Target;
  description: string;
  color: string;
  externalHref?: string;
  fields: FieldDef[];
}

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  type: "text" | "textarea";
  rows?: number;
  prompts?: string[];
}

type SectionData = Record<string, string>;
type AllData = Record<string, SectionData>;

// ─── Section definitions ──────────────────────────────────────────────────────

const SECTIONS: SectionDef[] = [
  {
    id: "business-profile",
    apiKey: "business-profile",
    label: "Business Profile",
    icon: Building2,
    description: "The foundation. What your business is, who it serves, and what stage you're at.",
    color: "text-cyan-400",
    fields: [
      {
        key: "name",
        label: "Business or brand name",
        type: "text",
        placeholder: "e.g. Nexus Consulting",
        prompts: ["Nexus AI", "My Agency Name", "Sole trader — just my name"],
      },
      {
        key: "description",
        label: "What does your business do? (1–2 sentences)",
        type: "textarea",
        rows: 2,
        placeholder: "e.g. We help ambitious founders build systems that run their business so they can focus on growth.",
        prompts: ["We help [target] achieve [outcome] through [method]", "B2B consulting for [industry] teams", "High-ticket services for [niche]"],
      },
      {
        key: "mainOffer",
        label: "Your main offer or product",
        type: "text",
        placeholder: "e.g. AI implementation retainer — $4k/month",
        prompts: ["Monthly retainer", "Project-based consulting", "Done-with-you programme"],
      },
      {
        key: "stage",
        label: "Current business stage",
        type: "text",
        placeholder: "e.g. Early revenue — 2 clients, scaling to 5",
        prompts: ["Pre-revenue", "Early revenue (1–3 clients)", "Scaling (proven offer)", "Established"],
      },
      {
        key: "primaryObjective",
        label: "Primary objective right now",
        type: "textarea",
        rows: 2,
        placeholder: "e.g. Sign 3 new clients before Q3 to hit monthly revenue target and remove dependency on one client.",
        prompts: ["Close next 3 clients", "Build repeatable sales process", "Productise the core offer"],
      },
    ],
  },
  {
    id: "revenue-goal",
    apiKey: "revenue-goal",
    label: "Revenue Goal",
    icon: Target,
    description: "Your financial targets. NXS OS uses these to evaluate opportunities and prioritise actions.",
    color: "text-green-400",
    fields: [
      {
        key: "annualTarget",
        label: "Annual revenue target",
        type: "text",
        placeholder: "e.g. $250,000",
        prompts: ["$100,000", "$250,000", "$500,000+"],
      },
      {
        key: "monthlyTarget",
        label: "Monthly revenue target",
        type: "text",
        placeholder: "e.g. $20,000/month",
        prompts: ["$8,333/mo ($100k/yr)", "$20,000/mo ($240k/yr)", "$41,667/mo ($500k/yr)"],
      },
      {
        key: "targetDate",
        label: "Target achievement date",
        type: "text",
        placeholder: "e.g. December 2025",
        prompts: ["End of this quarter", "December 2025", "December 2026"],
      },
      {
        key: "revenueModel",
        label: "Revenue model",
        type: "text",
        placeholder: "e.g. Monthly retainer + project fees",
        prompts: ["Monthly retainer", "Retainer + project fees", "Project-based only", "Subscription"],
      },
      {
        key: "clientsNeeded",
        label: "Number of clients needed to hit goal",
        type: "text",
        placeholder: "e.g. 5 clients at $4k/month",
        prompts: ["3 at $7k/mo", "5 at $4k/mo", "10 at $2k/mo"],
      },
    ],
  },
  {
    id: "sales-strategy",
    apiKey: "sales-strategy",
    label: "Sales Strategy",
    icon: Users,
    description: "Who you're selling to, how you reach them, and the rules that govern your sales process.",
    color: "text-violet-400",
    fields: [
      {
        key: "idealCustomer",
        label: "Ideal customer profile",
        type: "textarea",
        rows: 3,
        placeholder: "e.g. Founder-led B2B service businesses (5–30 staff), $500k–$3M revenue, feeling overwhelmed by operations, want to scale without hiring a full team.",
        prompts: ["B2B founder, 5–50 staff", "Agency owner scaling past $1M", "Consultant with a proven offer"],
      },
      {
        key: "targetIndustries",
        label: "Target industries",
        type: "text",
        placeholder: "e.g. SaaS, professional services, agencies, e-commerce",
        prompts: ["SaaS + professional services", "Agencies + consultancies", "E-commerce + retail"],
      },
      {
        key: "salesChannels",
        label: "Main sales channels",
        type: "text",
        placeholder: "e.g. LinkedIn content, referrals, strategic partnerships",
        prompts: ["LinkedIn + referrals", "Content + inbound", "Partnerships + warm intros"],
      },
      {
        key: "salesProcess",
        label: "Current sales process (steps)",
        type: "textarea",
        rows: 3,
        placeholder: "e.g. 1. Lead identifies via content → 2. Discovery call (30 min) → 3. Proposal within 48hr → 4. Follow up × 2 → 5. Close or park",
        prompts: ["Discovery → Proposal → Close", "Consultation → Scope → Proposal → Close", "Demo → Pilot → Contract"],
      },
      {
        key: "followUpRules",
        label: "Follow-up rules and cadence",
        type: "textarea",
        rows: 2,
        placeholder: "e.g. Follow up within 24hr of discovery. Two follow-ups max after proposal — if no response, move to nurture. Never chase more than 3 times.",
        prompts: ["Max 3 touch-points, then park", "Follow up at 24hr, 7d, 14d", "No follow up — inbound only"],
      },
    ],
  },
  {
    id: "services",
    apiKey: "services",
    label: "Services & Packages",
    icon: Package,
    description: "Your offers, how they're packaged, and who they're designed for.",
    color: "text-yellow-400",
    fields: [
      {
        key: "servicesOverview",
        label: "Overview of services you offer",
        type: "textarea",
        rows: 3,
        placeholder: "e.g. AI operating system implementation for founder-led businesses. We map, automate, and systematise the operations layer so founders can focus on growth.",
        prompts: ["Strategy + implementation retainer", "Done-for-you setup + ongoing support", "Audit → Roadmap → Execution"],
      },
      {
        key: "packages",
        label: "Package names, prices, and delivery time",
        type: "textarea",
        rows: 4,
        placeholder: "e.g.\nStarter: $2,000/mo — basic AI systems, 2 automations/month, monthly review\nGrowth: $4,000/mo — full AI OS, unlimited automations, weekly sessions\nEnterprise: $8,000/mo — custom build, team training, SLA support",
        prompts: ["Single flat rate + add-ons", "3-tier (Starter / Growth / Enterprise)", "Project-based with maintenance retainer"],
      },
    ],
  },
  {
    id: "leads",
    apiKey: null,
    label: "Current Leads",
    icon: ArrowRight,
    description: "Your live pipeline and active opportunities — managed in the Opportunity Engine.",
    color: "text-orange-400",
    externalHref: "/opportunities",
    fields: [],
  },
  {
    id: "delivery-process",
    apiKey: "delivery-process",
    label: "Delivery Process",
    icon: Workflow,
    description: "How you deliver once a client signs. Your onboarding, implementation, and handover steps.",
    color: "text-sky-400",
    fields: [
      {
        key: "onboardingSteps",
        label: "Client onboarding steps",
        type: "textarea",
        rows: 3,
        placeholder: "e.g. 1. Contracts + payment → 2. Welcome pack + kickoff call → 3. Systems audit (week 1) → 4. Roadmap delivery → 5. Build phase begins",
        prompts: ["Contract → Kickoff → Audit → Build", "Onboarding doc + 90-day plan", "Systems access → Discovery → Roadmap"],
      },
      {
        key: "implementationSteps",
        label: "How you implement and deliver",
        type: "textarea",
        rows: 3,
        placeholder: "e.g. Weekly implementation sprints. Each sprint: plan → build → test → deploy → review. Client reviews output before each deploy.",
        prompts: ["Weekly sprints with client review", "Async delivery with monthly calls", "Phased milestones (3/6/12 month)"],
      },
      {
        key: "reviewProcess",
        label: "Review and feedback process",
        type: "text",
        placeholder: "e.g. Monthly performance review + quarterly strategy session",
        prompts: ["Monthly review calls", "Async Loom reviews", "Quarterly strategy sessions"],
      },
      {
        key: "handoverProcess",
        label: "Handover or offboarding process",
        type: "text",
        placeholder: "e.g. 30-day handover: documentation → training → knowledge transfer → sign-off",
        prompts: ["30-day handover period", "Documentation + training call", "No formal handover — ongoing retainer"],
      },
      {
        key: "commonRisks",
        label: "Common delivery risks and how you handle them",
        type: "textarea",
        rows: 2,
        placeholder: "e.g. Slow client response → weekly check-in. Scope creep → SOW change request process. Tech issues → documented fallback steps.",
        prompts: ["Scope creep → change request", "Slow client feedback → fixed deadlines", "Key person dependency → documentation"],
      },
    ],
  },
  {
    id: "operating-rules",
    apiKey: "operating-rules",
    label: "Operating Rules",
    icon: SlidersHorizontal,
    description: "The rules that govern how NXS OS prioritises, filters, and makes decisions on your behalf.",
    color: "text-rose-400",
    fields: [
      {
        key: "priorityWork",
        label: "Work that should always be prioritised",
        type: "textarea",
        rows: 2,
        placeholder: "e.g. Revenue-generating activities (sales calls, proposals, follow-ups). Client delivery commitments. Strategic thinking on the business.",
        prompts: ["Sales, delivery, strategy — in that order", "Revenue first, then content, then admin", "Client commitments always take priority"],
      },
      {
        key: "ignoreWork",
        label: "Work to ignore or say no to",
        type: "textarea",
        rows: 2,
        placeholder: "e.g. Speculative work without a signed contract. Any client paying less than $2k/month. Social media requests that don't feed our ICP.",
        prompts: ["No spec work, no low-ticket", "Say no to anything under $3k", "Avoid tasks that don't compound"],
      },
      {
        key: "decisionRules",
        label: "Your decision-making rules",
        type: "textarea",
        rows: 2,
        placeholder: "e.g. If unsure, wait 24hr before deciding. Any commitment over $1k needs a written brief first. Only take on clients that score 7/10+ on ICP fit.",
        prompts: ["24hr rule for big decisions", "Written brief before any commitment", "ICP score threshold before accepting work"],
      },
      {
        key: "highLeverageActivities",
        label: "Highest-leverage activities",
        type: "textarea",
        rows: 2,
        placeholder: "e.g. 1. Sales conversations 2. LinkedIn content that attracts ICP 3. Building systems that remove me from the business 4. Strategic partnerships",
        prompts: ["Sales + partnerships + systems", "Content, conversations, and systems", "Referral network + delivery excellence"],
      },
      {
        key: "lowLeverageDistractors",
        label: "Low-leverage distractions to avoid",
        type: "text",
        placeholder: "e.g. Admin, email, reactive Slack, unqualified discovery calls, endless optimisation of things that already work",
        prompts: ["Admin, email, reactive tasks", "Premature optimisation", "Unqualified inbound + shallow meetings"],
      },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isComplete(data: SectionData | null | undefined): boolean {
  if (!data) return false;
  const values = Object.values(data);
  return values.filter((v) => {
    if (!v) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (typeof v === "object") return Array.isArray(v) ? (v as unknown[]).length > 0 : Object.keys(v as object).length > 0;
    return Boolean(v);
  }).length >= 2;
}

// ─── Field component ──────────────────────────────────────────────────────────

function FormField({
  def, value, onChange,
}: {
  def: FieldDef;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-foreground/80">{def.label}</label>
      {def.type === "textarea" ? (
        <textarea
          rows={def.rows ?? 3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder}
          className="w-full bg-background/60 border border-border/40 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder}
          className="w-full bg-background/60 border border-border/40 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors"
        />
      )}
      {def.prompts && def.prompts.length > 0 && !value && (
        <div className="flex flex-wrap gap-1.5">
          {def.prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onChange(prompt)}
              className="text-[10px] px-2 py-1 rounded-md bg-primary/5 border border-primary/15 text-primary/60 hover:text-primary hover:bg-primary/10 hover:border-primary/30 transition-all"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section nav item ─────────────────────────────────────────────────────────

function SectionNavItem({
  section, isActive, complete, onClick,
}: {
  section: SectionDef;
  isActive: boolean;
  complete: boolean;
  onClick: () => void;
}) {
  const Icon = section.icon;
  if (section.externalHref) {
    return (
      <Link href={section.externalHref}>
        <div className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${isActive ? "bg-primary/10 border border-primary/20" : "hover:bg-white/4"}`}>
          <Icon className={`h-4 w-4 flex-shrink-0 ${section.color}`} />
          <span className="flex-1 text-sm text-foreground/80 leading-tight">{section.label}</span>
          <ExternalLink className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground/70" />
        </div>
      </Link>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${
        isActive
          ? "bg-primary/10 border border-primary/20 shadow-[0_0_12px_rgba(0,255,255,0.06)]"
          : "hover:bg-white/4 border border-transparent"
      }`}
    >
      <Icon className={`h-4 w-4 flex-shrink-0 ${section.color}`} />
      <span className={`flex-1 text-sm leading-tight ${isActive ? "text-foreground font-medium" : "text-foreground/70"}`}>
        {section.label}
      </span>
      {complete ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
      ) : (
        <Circle className="h-3.5 w-3.5 text-muted-foreground/20 flex-shrink-0" />
      )}
    </button>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function BusinessSetup() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeSectionId, setActiveSectionId] = useState(SECTIONS[0].id);
  const [allData, setAllData] = useState<AllData>({});
  const [saving, setSaving] = useState(false);

  const { data: setupCtx, isLoading } = useQuery({
    queryKey: ["setup-context"],
    queryFn: async () => {
      const r = await fetch("/api/setup-context");
      if (!r.ok) throw new Error("Failed to load");
      return r.json() as Promise<Record<string, unknown>>;
    },
  });

  useEffect(() => {
    if (!setupCtx) return;
    const map: AllData = {};
    for (const section of SECTIONS) {
      if (!section.apiKey) continue;
      const camelKey = toCamel(section.id);
      const data = (setupCtx as Record<string, SectionData>)[camelKey];
      if (data && typeof data === "object") {
        map[section.id] = data as SectionData;
      }
    }
    setAllData(map);
  }, [setupCtx]);

  const getSectionData = useCallback((sectionId: string): SectionData => {
    return allData[sectionId] ?? {};
  }, [allData]);

  const setField = useCallback((sectionId: string, key: string, value: string) => {
    setAllData((prev) => ({
      ...prev,
      [sectionId]: { ...(prev[sectionId] ?? {}), [key]: value },
    }));
  }, []);

  const saveSection = async (section: SectionDef) => {
    if (!section.apiKey) return;
    setSaving(true);
    try {
      const data = getSectionData(section.id);
      const r = await fetch(`/api/setup-context/${section.apiKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Save failed");
      await queryClient.invalidateQueries({ queryKey: ["setup-context"] });
      toast({ title: "Saved", description: `${section.label} updated — Orchestrator context refreshed.` });
    } catch {
      toast({ title: "Save failed", description: "Try again in a moment.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const completionMap: Record<string, boolean> = {};
  for (const section of SECTIONS) {
    if (!section.apiKey) {
      completionMap[section.id] = false;
    } else {
      const camelKey = toCamel(section.id);
      const data = (setupCtx as Record<string, SectionData> | undefined)?.[camelKey];
      completionMap[section.id] = isComplete(data);
    }
  }

  const totalComplete = Object.values(completionMap).filter(Boolean).length;
  const totalSections = SECTIONS.filter(s => s.apiKey !== null).length;

  const activeSection = SECTIONS.find((s) => s.id === activeSectionId) ?? SECTIONS[0];
  const ActiveIcon = activeSection.icon;

  return (
    <div className="flex flex-col h-full gap-0">
      {/* Header */}
      <div className="flex-shrink-0 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
                <LayoutGrid className="h-3.5 w-3.5 text-primary" />
              </div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">Business Context Setup</h1>
            </div>
            <p className="text-xs text-muted-foreground/60 ml-9 leading-relaxed">
              What you enter here feeds directly into the Orchestrator, Memory, and Daily Plan.
            </p>
          </div>
          <div className="flex-shrink-0 text-right">
            <div className="text-xs font-bold text-foreground">{totalComplete}<span className="text-muted-foreground/50">/{totalSections}</span></div>
            <div className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">complete</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 bg-border/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full transition-all duration-500"
            style={{ width: `${(totalComplete / totalSections) * 100}%` }}
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left nav — desktop */}
        <div className="hidden md:flex w-52 flex-shrink-0 flex-col gap-0.5">
          {SECTIONS.map((s, i) => (
            <div key={s.id}>
              {i === 4 && (
                <div className="px-3 py-1.5 mt-1">
                  <div className="h-px bg-border/30" />
                </div>
              )}
              <SectionNavItem
                section={s}
                isActive={activeSectionId === s.id}
                complete={completionMap[s.id]}
                onClick={() => setActiveSectionId(s.id)}
              />
            </div>
          ))}

          <div className="mt-auto pt-4">
            <div className="p-3 rounded-xl border border-primary/10 bg-primary/3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Zap className="h-3 w-3 text-primary" />
                <span className="text-[9px] font-bold text-primary/70 uppercase tracking-wider">Live context</span>
              </div>
              <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                Saved sections are injected into every Orchestrator response immediately.
              </p>
            </div>
          </div>
        </div>

        {/* Mobile section picker */}
        <div className="md:hidden flex-shrink-0 w-full mb-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => s.externalHref ? undefined : setActiveSectionId(s.id)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-medium transition-all ${
                    activeSectionId === s.id
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-card/40 border-border/30 text-muted-foreground/70"
                  }`}
                >
                  <Icon className={`h-3 w-3 ${s.color}`} />
                  {s.label.split(" ")[0]}
                  {completionMap[s.id] && <CheckCircle2 className="h-2.5 w-2.5 text-green-400" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <RefreshCw className="h-5 w-5 text-primary/40 animate-spin" />
            </div>
          ) : activeSection.externalHref ? (
            /* External section (Leads → Opportunity Engine) */
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-sm space-y-4">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-orange-400/10 border border-orange-400/20 flex items-center justify-center">
                  <ArrowRight className="h-7 w-7 text-orange-400" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground mb-2">Manage leads in Opportunity Engine</h3>
                  <p className="text-xs text-muted-foreground/60 leading-relaxed">
                    Your leads and active pipeline are tracked in the Opportunity Engine, where you can qualify,
                    prioritise, and route each opportunity. They feed the Orchestrator context automatically.
                  </p>
                </div>
                <Link href="/opportunities">
                  <Button size="sm" className="gap-2">
                    Open Opportunity Engine <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            /* Standard form section */
            <div className="space-y-5">
              {/* Section header */}
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-background border border-border/40`}>
                  <ActiveIcon className={`h-4.5 w-4.5 ${activeSection.color}`} style={{ width: "1.1rem", height: "1.1rem" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-bold text-foreground">{activeSection.label}</h2>
                    {completionMap[activeSection.id] ? (
                      <Badge className="bg-green-400/10 text-green-400 border-green-400/20 text-[9px] py-0">
                        <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> Saved
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] py-0 text-muted-foreground/50">
                        <Circle className="h-2.5 w-2.5 mr-1" /> Not saved
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground/60 mt-0.5 leading-relaxed">{activeSection.description}</p>
                </div>
              </div>

              {/* Fields */}
              <div className="space-y-4 bg-card/20 border border-border/30 rounded-2xl p-4 md:p-5">
                {activeSection.fields.map((field) => (
                  <FormField
                    key={field.key}
                    def={field}
                    value={getSectionData(activeSection.id)[field.key] ?? ""}
                    onChange={(val) => setField(activeSection.id, field.key, val)}
                  />
                ))}
              </div>

              {/* Starter prompt hint */}
              {activeSection.fields.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/3 border border-primary/10">
                  <Lightbulb className="h-3.5 w-3.5 text-primary/50 flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                    Click any <span className="text-primary/70 font-medium">prompt chip</span> under a field to pre-fill it — then edit to match your situation. You can always come back and update these.
                  </p>
                </div>
              )}

              {/* Save + next */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <Button
                  onClick={() => saveSection(activeSection)}
                  disabled={saving}
                  className="gap-2 font-medium"
                >
                  {saving ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  {saving ? "Saving…" : "Save Section"}
                </Button>

                {/* Next section shortcut */}
                {(() => {
                  const idx = SECTIONS.findIndex(s => s.id === activeSectionId);
                  const next = SECTIONS[idx + 1];
                  if (!next) return null;
                  return (
                    <button
                      onClick={() => setActiveSectionId(next.id)}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-primary/70 transition-colors"
                    >
                      Next: {next.label} <ChevronRight className="h-3 w-3" />
                    </button>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function toCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

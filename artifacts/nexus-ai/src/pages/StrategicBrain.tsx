import { useState, useEffect } from "react";
import { useGetSystemContext, useUpsertSystemContext } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Compass, Target, Heart, DollarSign, Shield, Edit, Check, X,
  Plus, Trash2, Brain, Briefcase, User, Zap, BookOpen, AlertTriangle, TrendingUp,
  Database, ChevronDown, Sparkles
} from "lucide-react";

interface BrainBusiness {
  vision: string;
  mission: string;
  principles: string[];
  revenueTarget: string;
  growthStrategy: string;
  riskTolerance: string;
  orchestratorRules: string[];
}

interface BrainPersonal {
  vision: string;
  purpose: string;
  values: string[];
  workingStyle: string;
  healthPriorities: string[];
  wealthGoals: string;
  nonNegotiables: string[];
}

interface BrainMaya {
  vibe: string;
  humour: string;
  address: string;
  quirks: string[];
  signoff: string;
  extra: string;
}

interface BrainData {
  business: BrainBusiness;
  personal: BrainPersonal;
  maya: BrainMaya;
}

const DEFAULT_BRAIN: BrainData = {
  business: {
    vision: "Build Nexus AI into the go-to AI operating system for ambitious founders — the system that runs the business so you can run the vision.",
    mission: "Eliminate operational cognitive load for founders through intelligent AI agents that capture, connect, and act on business knowledge.",
    principles: [
      "Memory first — if it's not in the OS, it doesn't exist",
      "Compound value — every action should make the system smarter",
      "Compliance always — no cold outreach, no unauthorized automation",
      "Conversation over dashboards — the OS should talk, not just show",
      "Quality over speed — one great client beats five mediocre ones",
    ],
    revenueTarget: "$250,000 ARR by December 31, 2026",
    growthStrategy: "LinkedIn content → agency partnerships → referrals. No cold outreach in V1.",
    riskTolerance: "moderate",
    orchestratorRules: [
      "Always address Jay by name",
      "Lead with what matters most, not what happened most recently",
      "Challenge me if I'm spreading too thin — call it out directly",
      "Never recommend cold outreach or unsolicited contact",
      "When I ask for options, give me 3 max with a clear recommendation",
      "Flag decisions that contradict previously made decisions",
      "Remind me of lessons learned before I make the same mistake twice",
    ],
  },
  personal: {
    vision: "Design a life of sovereign freedom — where the business funds my life, not the other way around.",
    purpose: "Build systems that compound. Create leverage. Protect time. Live intentionally.",
    values: [
      "Freedom and autonomy above all",
      "Deep work over shallow hustle",
      "Health as the foundation of everything",
      "Relationships over transactions",
      "Long-term thinking over short-term wins",
    ],
    workingStyle: "Deep work blocks 8am–1pm. Strategic thinking in the morning. Execution in the afternoon. No meetings before 10am. Single-threaded focus — one major project at a time.",
    healthPriorities: [
      "Sleep 7.5 hours minimum",
      "Morning routine: meditation + exercise before work",
      "No work after 7pm",
      "Weekly long walk or hike for strategic thinking",
    ],
    wealthGoals: "Financial independence by 35. Business generates 2× personal expenses. Investment portfolio compounds passively.",
    nonNegotiables: [
      "Morning routine is sacred — never skip",
      "No decisions when tired or reactive",
      "Protect the maker schedule — no meeting days",
      "Say no to anything that doesn't align with the 3-year vision",
    ],
  },
  maya: {
    vibe: "Jay's sparring partner: sharp, loyal, switched-on, and practical. Talks like a real person who actually cares about the outcome, never like a corporate assistant. Warm, but doesn't baby Jay. Challenges weak ideas, pressure-tests assumptions, calls out risks, and never blindly agrees.",
    humour: "Slightly cheeky, dry, and quick. Swearing is allowed when it lands (never forced, never aimed at clients). No corporate nonsense, no robotic disclaimers, no motivational fluff.",
    address: "Jay, casual and direct, like a business partner. Occasionally 'boss' when delivering good news.",
    quirks: [
      "When Jay pitches an idea, opens with 3 to 5 sharp questions, risks, or blind spots before any recommendation",
      "Never says 'great idea' unless it actually is one. If pricing is too cheap or a plan has holes, says so straight",
      "When Jay is rushing, slows him down with useful pushback. When he's overthinking, simplifies the next move",
      "When Jay asks for execution, stops debating and produces the asset: copy, plan, prompt, or structure",
      "Calls out wins explicitly before moving to what's next",
    ],
    signoff: "Occasionally ends a major brief with: 'Go get it.'",
    extra: "Role: strategist, creative partner, business advisor, copywriter, and execution assistant in one. Plain language, practical and actionable, no long-winded theory unless asked. Writing rule: never use em dashes. Use commas, colons, or short sentences instead.",
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function EditableText({
  value, onChange, multiline = false, placeholder,
}: { value: string; onChange: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value]);

  if (!editing) {
    return (
      <div className="group relative">
        <p className="text-sm text-muted-foreground leading-relaxed pr-6 whitespace-pre-wrap">
          {value || <span className="opacity-40 italic">{placeholder}</span>}
        </p>
        <button
          onClick={() => setEditing(true)}
          className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground/50 hover:text-foreground transition-all"
        >
          <Edit className="h-3 w-3" />
        </button>
      </div>
    );
  }

  const save = () => { onChange(draft); setEditing(false); };

  return (
    <div className="space-y-2">
      {multiline ? (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="text-sm bg-background border-border/50 resize-none"
          rows={3}
          autoFocus
        />
      ) : (
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-8 text-sm bg-background border-border/50"
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
      )}
      <div className="flex gap-2">
        <Button size="sm" className="h-7 px-3 text-xs" onClick={save}>Save</Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditing(false)}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function EditableList({
  items, onChange, placeholder,
}: { items: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="group flex items-start gap-2">
          <div className="w-1 h-1 rounded-full bg-primary/60 mt-2 flex-shrink-0" />
          <p className="text-sm text-muted-foreground leading-relaxed flex-1">{item}</p>
          <button
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground/40 hover:text-destructive transition-all flex-shrink-0 mt-0.5"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      {adding ? (
        <div className="flex gap-2 mt-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            className="h-7 text-xs bg-background border-border/50 flex-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                onChange([...items, draft.trim()]);
                setDraft("");
                setAdding(false);
              }
            }}
          />
          <Button
            size="sm"
            className="h-7 px-2"
            onClick={() => {
              if (draft.trim()) { onChange([...items, draft.trim()]); setDraft(""); setAdding(false); }
            }}
          >
            <Check className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setAdding(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-xs text-muted-foreground/50 hover:text-primary transition-colors mt-1"
        >
          <Plus className="h-3 w-3" /> Add item
        </button>
      )}
    </div>
  );
}

function BrainSection({ icon, title, color, children, defaultOpen = true }: {
  icon: React.ReactNode; title: string; color: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="border-border/40 bg-card/50 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={color}>{icon}</span>
          <span className="text-sm font-bold">{title}</span>
        </div>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-border/30">
          <div className="pt-4">{children}</div>
        </div>
      )}
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StrategicBrain() {
  const [brain, setBrain] = useState<BrainData>(DEFAULT_BRAIN);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const { data: contextData, isLoading } = useGetSystemContext();
  const upsert = useUpsertSystemContext();

  useEffect(() => {
    if (contextData?.brain) {
      const incoming = contextData.brain as BrainData;
      setBrain({ ...incoming, maya: { ...DEFAULT_BRAIN.maya, ...(incoming.maya ?? {}) } });
    }
  }, [contextData]);

  function update<T extends keyof BrainData>(section: T, key: keyof BrainData[T], value: unknown) {
    setBrain((prev) => {
      const next = { ...prev, [section]: { ...prev[section], [key]: value } } as BrainData;
      upsert.mutate(
        { data: { brain: next as unknown as Record<string, unknown> } },
        {
          onSuccess: () => { setSaved(true); setSaveError(false); setTimeout(() => setSaved(false), 2500); },
          onError: () => { setSaveError(true); setTimeout(() => setSaveError(false), 3000); },
        }
      );
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Compass className="h-8 w-8 text-indigo-400" /> Strategic Brain
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            The foundation that guides every Orchestrator recommendation. Changes save to the database and apply immediately.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <Badge className="bg-green-400/10 text-green-400 border-green-400/30">
              <Check className="h-3 w-3 mr-1" /> Saved to OS
            </Badge>
          )}
          {saveError && (
            <Badge className="bg-red-400/10 text-red-400 border-red-400/30">
              Save failed — retry
            </Badge>
          )}
          {upsert.isPending && (
            <Badge className="bg-primary/10 text-primary border-primary/30">
              Saving...
            </Badge>
          )}
          <Badge className="bg-background border-border/40 text-muted-foreground text-[10px]">
            <Database className="h-3 w-3 mr-1" /> DB-backed
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ── BUSINESS COLUMN ── */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-1 border-b border-border/40">
            <Briefcase className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Business Brain</h2>
          </div>

          <BrainSection icon={<Target className="h-4 w-4" />} title="Business Vision" color="text-primary">
            <EditableText value={brain.business.vision} onChange={(v) => update("business", "vision", v)} multiline placeholder="Where is this business going?" />
          </BrainSection>

          <BrainSection icon={<Zap className="h-4 w-4" />} title="Mission" color="text-cyan-400">
            <EditableText value={brain.business.mission} onChange={(v) => update("business", "mission", v)} multiline placeholder="What does the business do and for whom?" />
          </BrainSection>

          <BrainSection icon={<BookOpen className="h-4 w-4" />} title="Core Principles" color="text-violet-400">
            <EditableList items={brain.business.principles} onChange={(v) => update("business", "principles", v)} placeholder="Add a principle..." />
          </BrainSection>

          <BrainSection icon={<TrendingUp className="h-4 w-4" />} title="Revenue Target" color="text-green-400">
            <EditableText value={brain.business.revenueTarget} onChange={(v) => update("business", "revenueTarget", v)} placeholder="e.g. $250K ARR by December 2026" />
          </BrainSection>

          <BrainSection icon={<Target className="h-4 w-4" />} title="Growth Strategy" color="text-orange-400">
            <EditableText value={brain.business.growthStrategy} onChange={(v) => update("business", "growthStrategy", v)} multiline placeholder="How are you growing the business?" />
          </BrainSection>

          <BrainSection icon={<AlertTriangle className="h-4 w-4" />} title="Risk Tolerance" color="text-yellow-400">
            <div className="space-y-3">
              <Select value={brain.business.riskTolerance} onValueChange={(v) => update("business", "riskTolerance", v)}>
                <SelectTrigger className="bg-background border-border/50 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conservative">Conservative — protect what's built</SelectItem>
                  <SelectItem value="moderate">Moderate — calculated bets only</SelectItem>
                  <SelectItem value="aggressive">Aggressive — go all-in on upside</SelectItem>
                </SelectContent>
              </Select>
              <div className={`px-3 py-2 rounded-md text-xs ${brain.business.riskTolerance === "conservative" ? "bg-blue-400/10 text-blue-400 border border-blue-400/20" : brain.business.riskTolerance === "moderate" ? "bg-yellow-400/10 text-yellow-400 border border-yellow-400/20" : "bg-red-400/10 text-red-400 border border-red-400/20"}`}>
                {brain.business.riskTolerance === "conservative" && "Orchestrator will prioritise stability and proven paths. Will flag high-risk recommendations."}
                {brain.business.riskTolerance === "moderate" && "Orchestrator balances opportunity with risk. Will recommend bold moves with clear rationale."}
                {brain.business.riskTolerance === "aggressive" && "Orchestrator will push for maximum upside. Will challenge conservative instincts."}
              </div>
            </div>
          </BrainSection>

          <BrainSection icon={<Brain className="h-4 w-4" />} title="Orchestrator Rules" color="text-primary">
            <p className="text-[10px] text-muted-foreground mb-3">How the Orchestrator should behave when advising Jay — these are checked before every response</p>
            <EditableList items={brain.business.orchestratorRules} onChange={(v) => update("business", "orchestratorRules", v)} placeholder="Add a rule for the Orchestrator..." />
          </BrainSection>
        </div>

        {/* ── PERSONAL COLUMN ── */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-1 border-b border-border/40">
            <User className="h-4 w-4 text-rose-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Personal Brain</h2>
          </div>

          <BrainSection icon={<Compass className="h-4 w-4" />} title="Personal Vision" color="text-indigo-400">
            <EditableText value={brain.personal.vision} onChange={(v) => update("personal", "vision", v)} multiline placeholder="What does your ideal life look like?" />
          </BrainSection>

          <BrainSection icon={<Zap className="h-4 w-4" />} title="Purpose" color="text-yellow-400">
            <EditableText value={brain.personal.purpose} onChange={(v) => update("personal", "purpose", v)} multiline placeholder="Why do you do what you do?" />
          </BrainSection>

          <BrainSection icon={<Heart className="h-4 w-4" />} title="Core Values" color="text-rose-400">
            <EditableList items={brain.personal.values} onChange={(v) => update("personal", "values", v)} placeholder="Add a value..." />
          </BrainSection>

          <BrainSection icon={<BookOpen className="h-4 w-4" />} title="Working Style" color="text-cyan-400">
            <EditableText value={brain.personal.workingStyle} onChange={(v) => update("personal", "workingStyle", v)} multiline placeholder="How and when do you do your best work?" />
          </BrainSection>

          <BrainSection icon={<Heart className="h-4 w-4" />} title="Health Priorities" color="text-green-400">
            <EditableList items={brain.personal.healthPriorities} onChange={(v) => update("personal", "healthPriorities", v)} placeholder="Add a health priority..." />
          </BrainSection>

          <BrainSection icon={<DollarSign className="h-4 w-4" />} title="Wealth Goals" color="text-yellow-300">
            <EditableText value={brain.personal.wealthGoals} onChange={(v) => update("personal", "wealthGoals", v)} multiline placeholder="What does financial freedom look like for you?" />
          </BrainSection>

          <BrainSection icon={<Shield className="h-4 w-4" />} title="Non-Negotiables" color="text-red-400">
            <p className="text-[10px] text-muted-foreground mb-3">The Orchestrator will never recommend actions that violate these</p>
            <EditableList items={brain.personal.nonNegotiables} onChange={(v) => update("personal", "nonNegotiables", v)} placeholder="Add a non-negotiable..." />
          </BrainSection>
        </div>
      </div>

      {/* ── MAYA PERSONALITY ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b border-border/40">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Maya — Personality</h2>
          <span className="text-[10px] text-muted-foreground/50">how she talks to you, in chat and out loud</span>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <BrainSection icon={<Sparkles className="h-4 w-4" />} title="Vibe" color="text-primary">
            <EditableText value={brain.maya.vibe} onChange={(v) => update("maya", "vibe", v)} multiline placeholder="Who is Maya? Describe her character in a sentence or two..." />
          </BrainSection>
          <BrainSection icon={<Zap className="h-4 w-4" />} title="Humour" color="text-yellow-400">
            <EditableText value={brain.maya.humour} onChange={(v) => update("maya", "humour", v)} multiline placeholder="Dry? Playful? None during serious topics?" />
          </BrainSection>
          <BrainSection icon={<Target className="h-4 w-4" />} title="How She Addresses You" color="text-cyan-400">
            <EditableText value={brain.maya.address} onChange={(v) => update("maya", "address", v)} placeholder="e.g. First name only / 'boss' / 'mate'..." />
          </BrainSection>
          <BrainSection icon={<BookOpen className="h-4 w-4" />} title="Sign-off" color="text-green-400">
            <EditableText value={brain.maya.signoff} onChange={(v) => update("maya", "signoff", v)} placeholder="A line she sometimes closes with..." />
          </BrainSection>
          <BrainSection icon={<Zap className="h-4 w-4" />} title="Signature Habits" color="text-violet-400">
            <EditableList items={brain.maya.quirks} onChange={(v) => update("maya", "quirks", v)} placeholder="Add a verbal habit or signature move..." />
          </BrainSection>
          <BrainSection icon={<BookOpen className="h-4 w-4" />} title="Anything Else" color="text-orange-400">
            <EditableText value={brain.maya.extra} onChange={(v) => update("maya", "extra", v)} multiline placeholder="Free-form instructions: Aussie slang, pet peeves, energy level..." />
          </BrainSection>
        </div>
      </div>

      <div className="text-center text-[10px] text-muted-foreground/40 pb-2">
        Changes auto-save to the database. The Orchestrator reads this context before every single response it generates.
      </div>
    </div>
  );
}

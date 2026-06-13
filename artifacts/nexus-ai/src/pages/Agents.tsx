import { useState, useEffect } from "react";
import { useListAgents, useGetRecentAgentActivity, useListAgentMessages, useAskAgent, getListAgentMessagesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot, Brain, Zap, Bell, Lock, Shield, Activity, CheckCircle2,
  AlertCircle, Clock, MessageSquare, Search, BarChart3, DollarSign,
  Users, FileText, Settings, Network, BrainCircuit, Lightbulb,
  ArrowRight, Target, RefreshCw, Eye, Link2
} from "lucide-react";
import { Link } from "wouter";
import { ExpandableText } from "@/components/ExpandableText";
import { AgentProfileModal } from "@/components/AgentProfileModal";

type ExecLevel = "green" | "amber" | "red";

const EXEC_CONFIG = {
  green: { icon: Zap, label: "Full Auto", color: "text-green-400 bg-green-400/10 border-green-400/30" },
  amber: { icon: Bell, label: "Auto + Notify", color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30" },
  red: { icon: Lock, label: "Manual", color: "text-red-400 bg-red-400/10 border-red-400/30" },
};

interface CoreAgent {
  id: string;
  name: string;
  tagline: string;
  icon: typeof Brain;
  accent: string;
  status: "active" | "standby" | "offline";
  execLevel: ExecLevel;
  capabilities: string[];
  currentTask: string | null;
  lastAction: string;
  href?: string;
}

interface DeptMode {
  id: string;
  name: string;
  icon: typeof Bot;
  accent: string;
  active: boolean;
  description: string;
  lastDispatch: string;
}

const CORE_AGENTS: CoreAgent[] = [
  {
    id: "memory",
    name: "Memory Agent",
    tagline: "Captures, connects, and retrieves knowledge across the OS",
    icon: Brain,
    accent: "cyan",
    status: "active",
    execLevel: "green",
    capabilities: ["Auto-tag new entries", "Detect stale memories", "Suggest connections", "Seed from conversations", "Generate briefing context"],
    currentTask: "Running daily memory health check",
    lastAction: "Tagged 3 entries · linked 2 decisions · flagged 1 stale",
    href: "/memory",
  },
  {
    id: "intelligence",
    name: "Intelligence Agent",
    tagline: "Synthesizes data, spots patterns, and surfaces insights",
    icon: BrainCircuit,
    accent: "violet",
    status: "active",
    execLevel: "amber",
    capabilities: ["Pattern recognition across memories", "Competitive signal monitoring", "Opportunity detection", "Risk correlation analysis", "Research synthesis"],
    currentTask: "Analyzing pipeline conversion patterns",
    lastAction: "Flagged competitor gap → persistent memory · added to Opportunity Engine",
    href: "/opportunities",
  },
  {
    id: "execution",
    name: "Execution Agent",
    tagline: "Turns approved decisions into tracked actions and projects",
    icon: Zap,
    accent: "green",
    status: "active",
    execLevel: "amber",
    capabilities: ["Create and track tasks", "Manage project progress", "Escalate blockers", "Draft SOPs from decisions", "Monitor completion"],
    currentTask: "Tracking Q3 Content Machine milestones",
    lastAction: "Moved 'Outline LinkedIn posts' from backlog → in progress",
  },
  {
    id: "communication",
    name: "Communication Agent",
    tagline: "Drafts outreach, proposals, and follow-ups — Jay executes",
    icon: MessageSquare,
    accent: "amber",
    status: "standby",
    execLevel: "red",
    capabilities: ["Proposal drafting", "Follow-up sequences", "Brief generation", "Meeting summaries", "Partnership outreach templates"],
    currentTask: null,
    lastAction: "Drafted Amara Diallo proposal template · awaiting Jay review",
  },
];

const DEPT_MODES: DeptMode[] = [
  { id: "sales", name: "Sales Mode", icon: Target, accent: "orange", active: true, description: "Lead qualification, proposal routing, pipeline management, and opportunity follow-up.", lastDispatch: "2 min ago" },
  { id: "marketing", name: "Marketing Mode", icon: Lightbulb, accent: "pink", active: true, description: "Content calendar, campaign tracking, LinkedIn strategy, and brand positioning.", lastDispatch: "1 hr ago" },
  { id: "research", name: "Research Mode", icon: Search, accent: "violet", active: true, description: "Market research, competitive analysis, trend monitoring, and insight synthesis.", lastDispatch: "3 hrs ago" },
  { id: "finance", name: "Finance Mode", icon: DollarSign, accent: "yellow", active: false, description: "Revenue tracking, expense monitoring, ARR calculations, and financial projections.", lastDispatch: "Yesterday" },
  { id: "operations", name: "Operations Mode", icon: Settings, accent: "blue", active: false, description: "Process management, SOP tracking, onboarding workflows, and system health.", lastDispatch: "2 days ago" },
];

const ACCENT_COLORS: Record<string, { text: string; bg: string; border: string; dot: string }> = {
  cyan: { text: "text-cyan-400", bg: "bg-cyan-400/10", border: "border-cyan-400/20", dot: "bg-cyan-400" },
  violet: { text: "text-violet-400", bg: "bg-violet-400/10", border: "border-violet-400/20", dot: "bg-violet-400" },
  green: { text: "text-green-400", bg: "bg-green-400/10", border: "border-green-400/20", dot: "bg-green-400" },
  amber: { text: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/20", dot: "bg-yellow-400" },
  orange: { text: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/20", dot: "bg-orange-400" },
  pink: { text: "text-pink-400", bg: "bg-pink-400/10", border: "border-pink-400/20", dot: "bg-pink-400" },
  yellow: { text: "text-yellow-300", bg: "bg-yellow-300/10", border: "border-yellow-300/20", dot: "bg-yellow-300" },
  blue: { text: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20", dot: "bg-blue-400" },
};

function CoreAgentCard({ agent, execLevel, onExecChange }: {
  agent: CoreAgent;
  execLevel: ExecLevel;
  onExecChange: (id: string, level: ExecLevel) => void;
}) {
  const ac = ACCENT_COLORS[agent.accent];
  const AgentIcon = agent.icon;
  const exec = EXEC_CONFIG[execLevel];
  const ExecIcon = exec.icon;

  return (
    <Card className={`border ${ac.border} bg-card/50 overflow-hidden`}>
      <div className={`h-0.5 w-full ${ac.dot}`} />
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${ac.bg} border ${ac.border} relative`}>
              <AgentIcon className={`h-5 w-5 ${ac.text}`} />
              <div className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${agent.status === "active" ? "bg-green-400 animate-pulse" : agent.status === "standby" ? "bg-yellow-400" : "bg-muted-foreground"}`} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-foreground">{agent.name}</h3>
              <p className="text-[10px] text-muted-foreground leading-snug max-w-48">{agent.tagline}</p>
            </div>
          </div>
          <Badge variant="outline" className={`text-[9px] capitalize ${agent.status === "active" ? "text-green-400 border-green-400/30 bg-green-400/10" : "text-muted-foreground border-border/30"}`}>
            {agent.status}
          </Badge>
        </div>

        {agent.currentTask && (
          <div className={`flex items-center gap-2 p-2 rounded-md mb-3 ${ac.bg} border ${ac.border}`}>
            <Activity className={`h-3 w-3 ${ac.text} flex-shrink-0 animate-pulse`} />
            <p className={`text-[10px] ${ac.text} leading-snug`}>{agent.currentTask}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-1 mb-3">
          {agent.capabilities.slice(0, 4).map((cap) => (
            <Badge key={cap} variant="outline" className="text-[9px] border-border/40 text-muted-foreground">{cap}</Badge>
          ))}
          {agent.capabilities.length > 4 && (
            <Badge variant="outline" className="text-[9px] border-border/40 text-muted-foreground/50">+{agent.capabilities.length - 4}</Badge>
          )}
        </div>

        <div className="flex items-center gap-1 mb-3">
          <Clock className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
          <p className="text-[9px] text-muted-foreground/60 leading-snug">{agent.lastAction}</p>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          <div className="flex items-center gap-1">
            <Shield className="h-3 w-3 text-muted-foreground/50" />
            <span className="text-[9px] text-muted-foreground">Execution:</span>
          </div>
          <div className="flex gap-1">
            {(["green", "amber", "red"] as ExecLevel[]).map((lev) => {
              const lc = EXEC_CONFIG[lev];
              const LIcon = lc.icon;
              return (
                <Tooltip key={lev}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onExecChange(agent.id, lev)}
                      className={`px-1.5 py-0.5 rounded text-[9px] border transition-all flex items-center gap-0.5 ${execLevel === lev ? lc.color : "border-border/30 text-muted-foreground/40 hover:border-border"}`}
                    >
                      <LIcon className="h-2.5 w-2.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">{lc.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          {agent.href && (
            <Link href={agent.href}>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-muted-foreground hover:text-primary">
                View <ArrowRight className="h-2.5 w-2.5 ml-1" />
              </Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DeptModeCard({ mode, agentName, onToggle, onProfile }: { mode: DeptMode; agentName?: string; onToggle: (id: string) => void; onProfile: (id: string, name: string) => void }) {
  const ac = ACCENT_COLORS[mode.accent];
  const ModeIcon = mode.icon;

  return (
    <Card className={`border ${mode.active ? ac.border : "border-border/30"} ${mode.active ? ac.bg : "bg-card/30"} overflow-hidden transition-all`}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <ModeIcon className={`h-4 w-4 flex-shrink-0 ${mode.active ? ac.text : "text-muted-foreground/40"}`} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`text-sm font-semibold ${mode.active ? "text-foreground" : "text-muted-foreground/60"}`}>{agentName ?? mode.name}</span>
                {agentName && <span className={`text-[8px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${mode.active ? `${ac.text} ${ac.border}` : "text-muted-foreground/40 border-border/30"}`}>{mode.name.replace(/ Mode$/, "")}</span>}
              </div>
            </div>
          </div>
          <button
            onClick={() => onToggle(mode.id)}
            className={`text-[9px] px-2 py-0.5 rounded-full border transition-all ${mode.active ? `${ac.text} ${ac.border} ${ac.bg}` : "text-muted-foreground/40 border-border/30"}`}
          >
            {mode.active ? "ACTIVE" : "STANDBY"}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">{mode.description}</p>
        <div className="flex items-center justify-between gap-1 mt-2">
          <div className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5 text-muted-foreground/40" />
            <span className="text-[9px] text-muted-foreground/50">Last dispatch: {mode.lastDispatch}</span>
          </div>
          <button
            onClick={() => onProfile(mode.id, agentName ?? mode.name.replace(/ Mode$/, ""))}
            className="text-[9px] px-2 py-0.5 rounded-full border border-primary/25 text-primary/70 hover:bg-primary/10 transition-colors flex items-center gap-1"
          >
            <Brain className="h-2.5 w-2.5" /> Profile
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function AskAgentComposer() {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState("sales");
  const [question, setQuestion] = useState("");
  const ask = useAskAgent({
    mutation: {
      onSettled: () =>
        queryClient.invalidateQueries({ queryKey: getListAgentMessagesQueryKey() }),
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || ask.isPending) return;
    setQuestion("");
    ask.mutate({ agentId: target, data: { content: q } });
    // show the outgoing message immediately
    setTimeout(() => queryClient.invalidateQueries({ queryKey: getListAgentMessagesQueryKey() }), 400);
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 p-3 bg-card/40 border border-border/40 rounded-lg">
      <select
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="h-9 rounded-md bg-background border border-border/50 text-xs px-2 text-foreground flex-shrink-0"
      >
        <option value="sales">Sales</option>
        <option value="marketing">Marketing</option>
        <option value="research">Research</option>
        <option value="finance">Finance</option>
      </select>
      <Input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder={ask.isPending ? "Agent is thinking..." : "Ask this agent directly..."}
        className="h-9 text-xs"
        disabled={ask.isPending}
      />
      <Button type="submit" size="sm" className="h-9 flex-shrink-0" disabled={!question.trim() || ask.isPending}>
        {ask.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
      </Button>
    </form>
  );
}

export default function Agents() {

  const [execLevels, setExecLevels] = useState<Record<string, ExecLevel>>({
    memory: "green", intelligence: "amber", execution: "amber", communication: "red",
  });
  const [deptModes, setDeptModes] = useState(DEPT_MODES);
  const [profileAgent, setProfileAgent] = useState<{ id: string; name: string } | null>(null);
  const { data: recentActivity, isLoading: activityLoading } = useGetRecentAgentActivity();
  const { data: realAgents } = useListAgents();
  const nameById = Object.fromEntries((realAgents ?? []).map((a) => [a.id, a.name]));
  const { data: teamMessages } = useListAgentMessages();

  useEffect(() => {
    const saved = localStorage.getItem("nexus-exec-level") as ExecLevel | null;
    if (saved) setExecLevels((prev) => ({ ...prev, memory: saved }));
  }, []);

  function handleExecChange(id: string, level: ExecLevel) {
    setExecLevels((prev) => ({ ...prev, [id]: level }));
    if (id === "memory") localStorage.setItem("nexus-exec-level", level);
  }

  function toggleDeptMode(id: string) {
    setDeptModes((prev) => prev.map((m) => m.id === id ? { ...m, active: !m.active } : m));
  }

  const activeCount = CORE_AGENTS.filter((a) => a.status === "active").length;
  const activeDepts = deptModes.filter((m) => m.active).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Bot className="h-8 w-8 text-violet-400" /> Agent Layer
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Flexible AI agents that form the nervous system of NXS OS — core agents always on, department modes on demand.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="flex items-center gap-2 px-3 py-2 bg-card/50 border border-border/40 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-medium">{activeCount} core agents active</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-card/50 border border-border/40 rounded-lg">
            <Activity className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium">{activeDepts} dept modes active</span>
          </div>
        </div>
      </div>

      {/* Core OS Agents */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-border/40">
          <BrainCircuit className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Core OS Agents</h2>
          <span className="text-[10px] text-muted-foreground/50 ml-auto">Always running · form the intelligence backbone of NXS OS</span>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {CORE_AGENTS.map((agent) => (
            <CoreAgentCard
              key={agent.id}
              agent={agent}
              execLevel={execLevels[agent.id]}
              onExecChange={handleExecChange}
            />
          ))}
        </div>
      </div>

      {/* Auto-Execution Governance */}
      <div className="p-4 bg-card/30 border border-border/40 rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold">Auto-Execution Governance</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              level: "green" as ExecLevel,
              icon: Zap,
              title: "Green — Full Auto",
              color: "text-green-400 border-green-400/20 bg-green-400/5",
              examples: ["Memory health checks", "Entry tagging and classification", "Agent status updates", "Category summaries", "Stale entry detection"],
            },
            {
              level: "amber" as ExecLevel,
              icon: Bell,
              title: "Amber — Auto + Notify",
              color: "text-yellow-400 border-yellow-400/20 bg-yellow-400/5",
              examples: ["Weekly briefing generation", "Memory connection suggestions", "Lead qualification routing", "Risk flagging", "Opportunity logging"],
            },
            {
              level: "red" as ExecLevel,
              icon: Lock,
              title: "Red — Manual Approval",
              color: "text-red-400 border-red-400/20 bg-red-400/5",
              examples: ["Client communications", "Proposal sending", "Strategic decisions", "Financial commitments", "External outreach"],
            },
          ].map((g) => {
            const GIcon = g.icon;
            return (
              <div key={g.level} className={`p-3 rounded-lg border ${g.color}`}>
                <div className="flex items-center gap-2 mb-2">
                  <GIcon className="h-4 w-4" />
                  <span className="text-xs font-bold">{g.title}</span>
                </div>
                <ul className="space-y-1">
                  {g.examples.map((ex) => (
                    <li key={ex} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <div className="w-1 h-1 rounded-full bg-current opacity-60 flex-shrink-0" />
                      {ex}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {/* Department Modes */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-border/40">
          <Network className="h-4 w-4 text-orange-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Department Modes</h2>
          <span className="text-[10px] text-muted-foreground/50 ml-auto">Toggle on/off based on what Jay needs · each mode activates specialized reasoning</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {deptModes.map((mode) => (
            <DeptModeCard key={mode.id} mode={mode} agentName={nameById[mode.id]} onToggle={toggleDeptMode} onProfile={(id, name) => setProfileAgent({ id, name })} />
          ))}
        </div>
      </div>

      {profileAgent && (
        <AgentProfileModal
          agentId={profileAgent.id}
          agentName={profileAgent.name}
          open={!!profileAgent}
          onOpenChange={(v) => { if (!v) setProfileAgent(null); }}
        />
      )}

{/* Team Channel — inter-agent mailbox */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-border/40">
          <MessageSquare className="h-4 w-4 text-primary/70" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Team Channel</h2>
          <span className="text-[10px] text-muted-foreground/50">what the agents are telling each other — and your direct line to them</span>
        </div>
        <AskAgentComposer />
        {teamMessages && teamMessages.length > 0 ? (
          <div className="space-y-2">
            {teamMessages.slice(0, 12).map((m) => (
              <div key={m.id} className="flex items-start gap-3 p-3 bg-primary/[0.03] border border-primary/15 rounded-lg">
                <MessageSquare className="h-3.5 w-3.5 text-primary/50 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">
                    {m.fromAgentName}
                    <span className="text-muted-foreground/60 font-normal"> → {m.toAgentId === "all" ? "everyone" : m.toAgentId === "orchestrator" ? "Maya" : m.toAgentId === "jay" ? "Jay" : m.toAgentId}</span>
                  </p>
                  <ExpandableText text={m.content} className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-line" />
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-[9px] text-muted-foreground/50">
                    {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className={`text-[8px] font-mono uppercase ${m.readAt ? "text-green-400/70" : "text-muted-foreground/40"}`}>
                    {m.readAt ? "read" : "unread"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/40 italic p-3">No team messages yet. Agents leave notes for each other here when they coordinate.</p>
        )}
      </div>

      {/* Recent Activity */}

      <div className="space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-border/40">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Recent Agent Activity</h2>
        </div>
        {activityLoading ? (
          Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
        ) : recentActivity && recentActivity.length > 0 ? (
          <div className="space-y-2">
            {recentActivity.map((activity, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-card/40 border border-border/30 rounded-lg">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0 animate-pulse" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-foreground">{activity.agentName}</p>
                  <p className="text-[10px] text-muted-foreground">{activity.details ?? activity.action}</p>
                </div>
                <span className="text-[9px] text-muted-foreground/50 flex-shrink-0">
                  {new Date(activity.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/40 italic p-3">No agent activity yet today.</p>
        )}
      </div>
    </div>
  );
}

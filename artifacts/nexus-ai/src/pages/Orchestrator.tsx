import { useState, useRef, useEffect } from "react";
import {
  useListChatMessages, getListChatMessagesQueryKey,
  useGetMemoryBriefing, useGetMemoryAgentStatus,
  useGetSystemContext, useListOpportunities,
  useListMemoryEntries,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link, useSearch } from "wouter";
import {
  Bot, Send, User, BrainCircuit, Loader2, Activity, Zap, Bell, Lock,
  Shield, AlertTriangle, Brain, Compass, Lightbulb, Target, Network,
  ChevronRight, ArrowRight, Database, BookOpen, CheckSquare, Plus
} from "lucide-react";
import { ContextIntakeModal } from "@/components/ContextIntakeModal";
import { authHeaders } from "@/lib/auth";

type ExecLevel = "green" | "amber" | "red";

const EXEC_CONFIG = {
  green: { icon: Zap,  label: "Full Auto",      color: "text-green-400 border-green-400/30 bg-green-400/10",   short: "AUTO" },
  amber: { icon: Bell, label: "Auto + Notify",   color: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10", short: "NOTIFY" },
  red:   { icon: Lock, label: "Manual Approval", color: "text-red-400 border-red-400/30 bg-red-400/10",         short: "MANUAL" },
};

const QUICK_PROMPTS = [
  "What should I focus on today?",
  "What are my top 3 priorities right now?",
  "What should I stop doing?",
  "Challenge my current priorities",
  "What opportunities am I ignoring?",
  "Am I drifting from my goals?",
  "What's my highest-leverage move?",
  "What's my biggest risk right now?",
];

const ALL_AGENTS = [
  { name: "Memory Agent",       status: "active"  as const, color: "bg-cyan-400" },
  { name: "Intelligence Agent", status: "active"  as const, color: "bg-violet-400" },
  { name: "Execution Agent",    status: "active"  as const, color: "bg-green-400" },
  { name: "Communication Agent",status: "standby" as const, color: "bg-yellow-400" },
  { name: "Sales Mode",         status: "active"  as const, color: "bg-orange-400" },
  { name: "Marketing Mode",     status: "active"  as const, color: "bg-pink-400" },
  { name: "Research Mode",      status: "active"  as const, color: "bg-indigo-400" },
  { name: "Finance Mode",       status: "standby" as const, color: "bg-yellow-300" },
  { name: "Operations Mode",    status: "standby" as const, color: "bg-blue-400" },
];

// ─── Markdown renderer ────────────────────────────────────────────────────────

function parseInline(text: string): React.ReactNode[] {
  // Split on bold, italic, and inline code patterns
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_")))
      return <em key={i} className="italic text-foreground/75">{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="px-1 py-0.5 rounded text-[11px] font-mono bg-primary/10 text-primary border border-primary/20">{part.slice(1, -1)}</code>;
    return part;
  });
}

function isBullet(line: string) {
  return line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ");
}
function bulletText(line: string) {
  return line.startsWith("• ") ? line.slice(2) : line.slice(2);
}

function renderLines(lines: string[], keyPrefix: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Blank line → small spacer
    if (line.trim() === "") {
      elements.push(<div key={`${keyPrefix}-gap-${i}`} className="h-1" />);
      i++; continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) {
      elements.push(<hr key={`${keyPrefix}-hr-${i}`} className="border-border/30 my-2" />);
      i++; continue;
    }

    // Headings
    const h3 = line.match(/^###\s+(.+)/);
    if (h3) {
      elements.push(<p key={`${keyPrefix}-h3-${i}`} className="text-[11px] font-bold uppercase tracking-widest text-primary/70 mt-2 mb-0.5">{parseInline(h3[1])}</p>);
      i++; continue;
    }
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      elements.push(<p key={`${keyPrefix}-h2-${i}`} className="text-xs font-bold text-foreground mt-2 mb-0.5">{parseInline(h2[1])}</p>);
      i++; continue;
    }
    const h1 = line.match(/^#\s+(.+)/);
    if (h1) {
      elements.push(<p key={`${keyPrefix}-h1-${i}`} className="text-sm font-bold text-foreground mt-2 mb-1">{parseInline(h1[1])}</p>);
      i++; continue;
    }

    // Bullet lists (-, *, •)
    if (isBullet(line)) {
      const bullets: string[] = [];
      while (i < lines.length && isBullet(lines[i])) { bullets.push(bulletText(lines[i])); i++; }
      elements.push(
        <ul key={`${keyPrefix}-ul-${i}`} className="space-y-1 my-1 ml-1">
          {bullets.map((b, bi) => (
            <li key={bi} className="flex gap-2 items-start">
              <span className="text-primary/50 mt-1.5 flex-shrink-0 text-[10px]">◆</span>
              <span className="flex-1">{parseInline(b)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered lists
    if (line.match(/^(\d+)\.\s+(.+)/)) {
      const items: Array<[string, string]> = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\d+)\.\s+(.+)/);
        if (!m) break;
        items.push([m[1], m[2]]);
        i++;
      }
      elements.push(
        <div key={`${keyPrefix}-ol-${i}`} className="space-y-1 my-1">
          {items.map(([n, text], ii) => (
            <div key={ii} className="flex gap-2 items-start">
              <span className="text-primary/60 font-mono text-[11px] flex-shrink-0 mt-0.5 w-4 text-right">{n}.</span>
              <span className="flex-1">{parseInline(text)}</span>
            </div>
          ))}
        </div>
      );
      continue;
    }

    // Plain paragraph
    elements.push(<p key={`${keyPrefix}-p-${i}`} className="leading-relaxed">{parseInline(line)}</p>);
    i++;
  }
  return elements;
}

function PlainMessage({ content }: { content: string }) {
  return <div className="text-sm space-y-0.5">{renderLines(content.split("\n"), "pm")}</div>;
}

// Renders CoS block text with full block-level + inline markdown
function BlockText({ text, className }: { text: string; className?: string }) {
  const lines = text.split(/\s{2,}|\n/); // CoS parser joins with spaces; re-split on double spaces or newlines
  const rendered = renderLines(lines, "bt");
  // If only one element and it's a plain paragraph, render inline to avoid extra wrapper
  if (rendered.length === 1) {
    return <p className={className ?? "text-xs text-foreground/90 leading-relaxed"}>{parseInline(text)}</p>;
  }
  return <div className={`text-xs text-foreground/90 leading-relaxed space-y-0.5 ${className ?? ""}`}>{rendered}</div>;
}

// ─── CoS Visual Block Renderer ───────────────────────────────────────────────

const COS_CFG: Record<string, { label: string; bg: string; border: string; lc: string }> = {
  Situation:      { label: "SITUATION",      bg: "bg-muted/20",       border: "border-border/40",       lc: "text-muted-foreground/60" },
  Priority:       { label: "PRIORITY",       bg: "bg-cyan-400/5",     border: "border-cyan-400/20",     lc: "text-cyan-400" },
  Risk:           { label: "RISK",           bg: "bg-red-400/5",      border: "border-red-400/20",      lc: "text-red-400" },
  Opportunity:    { label: "OPPORTUNITY",    bg: "bg-yellow-400/5",   border: "border-yellow-400/20",   lc: "text-yellow-400" },
  Recommendation: { label: "RECOMMENDATION", bg: "bg-primary/5",      border: "border-primary/20",      lc: "text-primary" },
  Challenge:      { label: "CHALLENGE",      bg: "bg-orange-400/5",   border: "border-orange-400/20",   lc: "text-orange-400" },
};

function parseCoS(content: string): Array<{ key: string; text: string }> | null {
  const lines = content.split("\n");
  if (!lines.some(l => /^\*\*(Situation|Priority|Risk|Opportunity|Recommendation|Challenge|Confidence|Next Move):/.test(l))) return null;
  const blocks: Array<{ key: string; text: string }> = [];
  let key = "", acc: string[] = [];
  const flush = () => { if (key) blocks.push({ key, text: acc.join(" ").trim() }); };
  for (const line of lines) {
    const hm = line.match(/^\*\*(Situation|Priority|Risk|Opportunity|Recommendation|Challenge|Next Move):\*\*\s*(.*)/);
    const cm = line.match(/^\*\*Confidence:\s*(\d+)%\*\*\s*[-—]?\s*(.*)/);
    if (cm) { flush(); key = "Confidence"; acc = [`${cm[1]}|${cm[2]}`]; }
    else if (hm) { flush(); key = hm[1]; acc = hm[2] ? [hm[2]] : []; }
    else if (key && line.trim()) acc.push(line.trim());
  }
  flush();
  return blocks.length > 0 ? blocks : null;
}

function MessageContent({ content }: { content: string }) {
  const blocks = parseCoS(content);
  if (!blocks) return <PlainMessage content={content} />;

  return (
    <div className="space-y-1.5">
      {blocks.map((block, i) => {
        if (block.key === "Confidence") {
          const [pct, note] = block.text.split("|");
          const val = parseInt(pct, 10);
          const bar = val >= 80 ? "bg-green-400" : val >= 60 ? "bg-yellow-400" : "bg-orange-400";
          const tc  = val >= 80 ? "text-green-400" : val >= 60 ? "text-yellow-400" : "text-orange-400";
          return (
            <div key={i} className="flex items-center gap-2.5 px-2 py-1.5">
              <span className="text-[8px] font-bold tracking-wider text-muted-foreground/50 w-20 shrink-0">CONFIDENCE</span>
              <div className="flex-1 h-1 bg-muted/30 rounded-full overflow-hidden">
                <div className={`h-full ${bar} rounded-full`} style={{ width: `${val}%` }} />
              </div>
              <span className={`text-[10px] font-bold ${tc} shrink-0`}>{pct}%</span>
              {note && <span className="text-[9px] text-muted-foreground/40 shrink-0 hidden sm:block truncate max-w-[200px]">{note}</span>}
            </div>
          );
        }
        if (block.key === "Next Move") {
          return (
            <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-primary/10 border border-primary/25">
              <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <div>
                <div className="text-[8px] font-bold tracking-wider text-primary/60 mb-0.5">NEXT MOVE</div>
                <BlockText text={block.text} className="text-xs font-semibold text-foreground leading-snug" />
              </div>
            </div>
          );
        }
        const cfg = COS_CFG[block.key];
        if (!cfg) return null;
        return (
          <div key={i} className={`rounded-lg border ${cfg.border} ${cfg.bg} px-3 py-2`}>
            <div className={`text-[8px] font-bold tracking-wider ${cfg.lc} mb-1`}>{cfg.label}</div>
            <BlockText text={block.text} />
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Orchestrator() {
  const [input, setInput] = useState("");
  const [execLevel, setExecLevel] = useState<ExecLevel>("amber");
  const queryClient = useQueryClient();
  const { data: messages, isLoading } = useListChatMessages({ limit: 50 });
  const { data: briefing } = useGetMemoryBriefing();
  const [localUserMessage, setLocalUserMessage] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [consulting, setConsulting] = useState<string[]>([]);
  const hasSentInitialQuery = useRef(false);
  const lastMessageCount = useRef(0);
  const search = useSearch();
  const qParam = new URLSearchParams(search).get("q");
  const { data: agentStatus } = useGetMemoryAgentStatus();
  const { data: contextData } = useGetSystemContext();
  const { data: opps } = useListOpportunities({});
  const { data: decisions } = useListMemoryEntries({ category: "decisions" });
  const { data: lessons } = useListMemoryEntries({ category: "lessons_learned" });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("nexus-exec-level") as ExecLevel | null;
    if (saved) setExecLevel(saved);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent, isStreaming]);

  useEffect(() => {
    const count = messages?.length ?? 0;
    if (count > lastMessageCount.current && count > 0) {
      lastMessageCount.current = count;
      setStreamingContent("");
      setLocalUserMessage(null);
    }
  }, [messages]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (qParam && !hasSentInitialQuery.current && !isLoading) {
      hasSentInitialQuery.current = true;
      const q = qParam;
      setTimeout(() => { void streamMessage(q); }, 400);
    }
  }, [qParam, isLoading]);

  function handleLevelChange(lev: ExecLevel) {
    setExecLevel(lev);
    localStorage.setItem("nexus-exec-level", lev);
  }

  async function streamMessage(message: string) {
    const msg = message.trim();
    if (!msg || isStreaming) return;
    setLocalUserMessage(msg);
    setIsStreaming(true);
    setStreamingContent("");
    setConsulting([]);
    try {
      const resp = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ content: msg }),
      });
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6)) as Record<string, unknown>;
            if (Array.isArray(d.dispatch)) {
              setConsulting(
                (d.dispatch as Array<{ agentName?: string }>)
                  .map((a) => a.agentName ?? "")
                  .filter(Boolean)
              );
            }
            if (typeof d.content === "string") setStreamingContent((p) => p + d.content);
            if (d.done === true) {
              queryClient.invalidateQueries({ queryKey: getListChatMessagesQueryKey({ limit: 50 }) });
              break outer;
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error("Stream error:", err);
      queryClient.invalidateQueries({ queryKey: getListChatMessagesQueryKey({ limit: 50 }) });
    } finally {
      setIsStreaming(false);
      setConsulting([]);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    const msg = input;
    setInput("");
    void streamMessage(msg);
  };

  function sendQuick(prompt: string) {
    if (isStreaming) return;
    void streamMessage(prompt);
  }

  const atRiskCount = briefing?.atRisk?.length ?? 0;
  const challengeMode = atRiskCount >= 2;

  const memCount = agentStatus?.totalMemories ?? 0;
  const oppCount = (opps ?? []).filter(o => o.status !== "rejected").length;
  const decCount = (decisions ?? []).length;
  const lessonCount = (lessons ?? []).length;
  const brainLoaded = !!contextData?.brain;

  return (
    <div className="h-full flex gap-4 overflow-hidden">
      {/* ── MAIN CHAT ── */}
      <div className="flex-1 flex flex-col bg-card/50 border border-border/50 rounded-xl overflow-hidden shadow-2xl backdrop-blur-sm relative min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-3 sm:px-5 py-3 border-b border-border/50 bg-card/80 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute -inset-1 rounded-full bg-primary/20 animate-pulse" />
              <Avatar className="h-9 w-9 border border-primary/50">
                <AvatarFallback className="bg-primary/10 text-primary"><BrainCircuit className="h-4 w-4" /></AvatarFallback>
              </Avatar>
            </div>
            <div>
              <h2 className="font-bold text-foreground leading-none">NXS Orchestrator</h2>
              <p className="text-[10px] text-primary font-mono mt-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                ONLINE · {memCount} memories · {oppCount} opportunities · {brainLoaded ? "brain loaded" : "brain loading..."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {challengeMode && (
              <Badge className="bg-yellow-400/10 text-yellow-400 border-yellow-400/30 text-[10px] animate-pulse hidden sm:flex">
                <AlertTriangle className="h-3 w-3 mr-1" /> Challenge Mode
              </Badge>
            )}
            <ContextIntakeModal>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-md text-[9px] border font-mono transition-all border-primary/30 text-primary/70 hover:border-primary hover:text-primary hover:bg-primary/5">
                    <Plus className="h-3 w-3" /> <span className="hidden sm:inline">Context</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">Add context to Memory</TooltipContent>
              </Tooltip>
            </ContextIntakeModal>
            <div className="flex gap-1">
              {(["green", "amber", "red"] as ExecLevel[]).map((lev) => {
                const lc = EXEC_CONFIG[lev];
                const LIcon = lc.icon;
                return (
                  <Tooltip key={lev}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleLevelChange(lev)}
                        className={`flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-md text-[9px] border font-mono transition-all ${execLevel === lev ? lc.color : "border-border/30 text-muted-foreground/40 hover:border-border"}`}
                      >
                        <LIcon className="h-3 w-3" /> <span className="hidden sm:inline">{lc.short}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">{lc.label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        </div>

        {/* Challenge mode banner */}
        {challengeMode && (
          <div className="flex items-center gap-3 px-5 py-2.5 bg-yellow-400/5 border-b border-yellow-400/20 flex-shrink-0">
            <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0" />
            <p className="text-xs text-yellow-400/90 flex-1">
              <strong>Orchestrator challenge:</strong> {atRiskCount} items are at risk. Before moving forward, should we review what's blocking progress?
            </p>
            <button
              onClick={() => sendQuick("I see we're in challenge mode. Walk me through the risks and whether I should pause new initiatives.")}
              className="text-[10px] text-yellow-400 border border-yellow-400/30 rounded px-2 py-0.5 hover:bg-yellow-400/10 transition-colors flex-shrink-0"
            >
              Discuss →
            </button>
          </div>
        )}

        {/* Messages */}
        <ScrollArea className="flex-1 p-3 sm:p-5 overflow-x-hidden" ref={scrollRef}>
          <div className="space-y-5 max-w-full">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : messages?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground space-y-4">
                <div className="relative">
                  <div className="absolute -inset-4 rounded-full bg-primary/10 animate-pulse" />
                  <BrainCircuit className="h-14 w-14 text-primary/60 relative" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-foreground">NXS Orchestrator ready.</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                    Your AI Chief of Staff — reads your memory, brain, and opportunities before every reply. Ask anything.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center max-w-md">
                  {QUICK_PROMPTS.slice(0, 4).map((p) => (
                    <button
                      key={p}
                      onClick={() => sendQuick(p)}
                      className="text-xs text-muted-foreground border border-border/40 rounded-full px-3 py-1.5 hover:border-primary/40 hover:text-primary transition-colors"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages?.map((msg) => (
                <div key={msg.id} className={`flex gap-2 sm:gap-3 max-w-[92%] sm:max-w-[88%] ${msg.role === "user" ? "ml-auto flex-row-reverse" : ""}`}>
                  <Avatar className={`h-7 w-7 mt-1 border flex-shrink-0 ${msg.role === "user" ? "border-accent/50" : "border-primary/50"}`}>
                    <AvatarFallback className={msg.role === "user" ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary"}>
                      {msg.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className={`space-y-2 min-w-0 flex-1 ${msg.role === "user" ? "items-end flex flex-col" : "items-start flex flex-col"}`}>
                    <div className={`px-3 sm:px-4 py-3 rounded-2xl shadow-md w-full break-words ${msg.role === "user" ? "bg-accent/10 border-accent/20 border" : "bg-primary/10 border-primary/20 border"}`}>
                      {msg.role === "orchestrator"
                        ? <MessageContent content={msg.content} />
                        : <p className="text-sm leading-relaxed">{msg.content}</p>
                      }
                    </div>
                    {msg.agentActions && (() => {
                      try {
                        const actions = JSON.parse(msg.agentActions);
                        return (
                          <div className="flex flex-wrap gap-1 max-w-full">
                            {actions.map((action: { agentName: string; action: string }, i: number) => (
                              <Badge key={i} variant="outline" className="bg-background border-primary/20 text-primary/70 text-[9px] font-mono max-w-[220px] truncate">
                                <Activity className="w-2 h-2 mr-1 shrink-0" />
                                <span className="truncate">{action.agentName}</span>
                              </Badge>
                            ))}
                          </div>
                        );
                      } catch { return null; }
                    })()}
                  </div>
                </div>
              ))
            )}
            {localUserMessage && (
              <div className="flex gap-2 sm:gap-3 max-w-[92%] sm:max-w-[88%] ml-auto flex-row-reverse">
                <Avatar className="h-7 w-7 mt-1 border flex-shrink-0 border-accent/50">
                  <AvatarFallback className="bg-accent/10 text-accent"><User className="h-3.5 w-3.5" /></AvatarFallback>
                </Avatar>
                <div className="px-3 sm:px-4 py-3 rounded-2xl shadow-md bg-accent/10 border-accent/20 border min-w-0">
                  <p className="text-sm leading-relaxed">{localUserMessage}</p>
                </div>
              </div>
            )}
            {isStreaming && !streamingContent && (
              <div className="flex gap-3 max-w-[85%]">
                <Avatar className="h-7 w-7 mt-1 border border-primary/50 flex-shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary"><Bot className="h-3.5 w-3.5" /></AvatarFallback>
                </Avatar>
                <div className="bg-primary/10 border-primary/20 border px-4 py-3 rounded-2xl flex items-center gap-2 shadow-md">
                  {consulting.length > 0 && (
                    <span className="text-xs text-primary/80 flex items-center gap-1.5">
                      <Network className="h-3 w-3" />
                      Consulting {consulting.join(", ")}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" />
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0.15s" }} />
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0.3s" }} />
                  </span>
                </div>
              </div>
            )}
            {isStreaming && streamingContent && (
              <div className="flex gap-2 sm:gap-3 max-w-[92%] sm:max-w-[88%]">
                <Avatar className="h-7 w-7 mt-1 border flex-shrink-0 border-primary/50">
                  <AvatarFallback className="bg-primary/10 text-primary"><Bot className="h-3.5 w-3.5" /></AvatarFallback>
                </Avatar>
                <div className="px-3 sm:px-4 py-3 rounded-2xl shadow-md bg-primary/10 border-primary/20 border min-w-0 flex-1 break-words">
                  <MessageContent content={streamingContent} />
                  <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5 align-middle rounded-sm" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Quick prompts (when has messages) */}
        {messages && messages.length > 0 && (
          <div className="px-3 sm:px-5 py-2 border-t border-border/30 flex gap-2 overflow-x-auto flex-shrink-0">
            {QUICK_PROMPTS.slice(0, 5).map((p) => (
              <button
                key={p}
                onClick={() => sendQuick(p)}
                disabled={isStreaming}
                className="text-[10px] text-muted-foreground border border-border/30 rounded-full px-2.5 py-1 whitespace-nowrap hover:border-primary/40 hover:text-primary transition-colors flex-shrink-0"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="p-3 sm:p-4 bg-card/80 border-t border-border/50 flex-shrink-0">
          <form onSubmit={handleSubmit} className="relative flex items-center">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the Orchestrator anything..."
              className="pr-12 bg-background border-primary/30 focus-visible:ring-primary/50 shadow-inner h-11 rounded-xl text-sm"
              disabled={isStreaming}
            />
            <Button
              type="submit"
              size="icon"
              className="absolute right-1.5 h-8 w-8 rounded-lg bg-primary hover:bg-primary/80 text-primary-foreground"
              disabled={!input.trim() || isStreaming}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </form>
        </div>
      </div>

      {/* ── SIDEBAR ── */}
      <div className="hidden lg:flex w-72 flex-col gap-4 overflow-y-auto flex-shrink-0">
        {/* OS Status */}
        <Card className="border-primary/20 bg-card/50 overflow-hidden">
          <div className="h-0.5 w-full bg-gradient-to-r from-primary via-primary/50 to-transparent" />
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-bold flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 text-primary" /> NXS OS Status
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="text-center p-2 bg-background/60 rounded-lg border border-border/30">
                <div className="text-base font-bold text-foreground">{memCount}</div>
                <div className="text-[9px] text-muted-foreground">Memories</div>
              </div>
              <div className="text-center p-2 bg-background/60 rounded-lg border border-border/30">
                <div className="text-base font-bold text-foreground">{agentStatus?.recentlyAdded ?? "—"}</div>
                <div className="text-[9px] text-muted-foreground">This Week</div>
              </div>
            </div>
            <div className={`p-2 rounded-lg border text-xs flex items-center gap-2 ${EXEC_CONFIG[execLevel].color}`}>
              {execLevel === "green" ? <Zap className="h-3.5 w-3.5" /> : execLevel === "amber" ? <Bell className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              <div>
                <div className="font-semibold">{EXEC_CONFIG[execLevel].label}</div>
                <div className="text-[9px] opacity-70">Current execution mode</div>
              </div>
            </div>
            {challengeMode && (
              <div className="p-2 rounded-lg border border-yellow-400/30 bg-yellow-400/5 text-[10px] text-yellow-400">
                <AlertTriangle className="h-3 w-3 inline mr-1" />
                Challenge mode: {atRiskCount} risks need review
              </div>
            )}
          </CardContent>
        </Card>

        {/* What the Orchestrator reads */}
        <Card className="border-border/40 bg-card/50 overflow-hidden">
          <div className="h-0.5 w-full bg-gradient-to-r from-cyan-400/60 via-violet-400/30 to-transparent" />
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-bold flex items-center gap-2 text-muted-foreground">
              <Database className="h-3.5 w-3.5 text-cyan-400" /> What I Read Before Replying
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2">
            {[
              { label: "Memory entries", value: memCount, icon: Brain, color: "text-cyan-400", ok: memCount > 0 },
              { label: "Opportunities", value: oppCount, icon: Lightbulb, color: "text-yellow-400", ok: oppCount > 0 },
              { label: "Decisions logged", value: decCount, icon: CheckSquare, color: "text-green-400", ok: decCount > 0 },
              { label: "Lessons captured", value: lessonCount, icon: BookOpen, color: "text-amber-400", ok: lessonCount > 0 },
              { label: "Strategic Brain", value: brainLoaded ? "loaded" : "empty", icon: Compass, color: "text-indigo-400", ok: brainLoaded },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Icon className={`h-3 w-3 ${item.color}`} />
                    {item.label}
                  </div>
                  <div className={`text-[10px] font-mono font-bold ${item.ok ? "text-foreground" : "text-muted-foreground/40"}`}>
                    {item.value}
                  </div>
                </div>
              );
            })}
            <p className="text-[9px] text-muted-foreground/40 pt-1 border-t border-border/30 leading-relaxed">
              All data is loaded from the database in real time before each response.
            </p>
          </CardContent>
        </Card>

        {/* Morning Brief Snapshot */}
        {briefing && (
          <Card className="border-border/40 bg-card/50">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-xs font-bold flex items-center gap-2 text-muted-foreground">
                <Brain className="h-3.5 w-3.5" /> Today's Brief
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              {briefing.whatMatters.slice(0, 2).map((item, i) => (
                <div key={i} className="flex gap-2 text-[10px]">
                  <div className="w-1 h-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  <span className="text-muted-foreground line-clamp-2 leading-snug">{item.title}</span>
                </div>
              ))}
              {briefing.atRisk.slice(0, 1).map((item, i) => (
                <div key={i} className="flex gap-2 text-[10px]">
                  <div className="w-1 h-1 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                  <span className="text-red-400/80 line-clamp-2 leading-snug">{item.title}</span>
                </div>
              ))}
              <Link href="/">
                <button className="text-[9px] text-primary/60 hover:text-primary flex items-center gap-1 mt-1">
                  Full briefing <ChevronRight className="h-2.5 w-2.5" />
                </button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Top Action */}
        {briefing?.topActions?.[0] && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-[10px] font-bold text-primary/70 uppercase tracking-wider flex items-center gap-1">
                <Target className="h-3 w-3" /> Top Priority Action
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <p className="text-xs font-semibold text-foreground leading-snug">{briefing.topActions[0].action}</p>
              <p className="text-[9px] text-muted-foreground mt-1">{briefing.topActions[0].rationale}</p>
              <button
                onClick={() => sendQuick(`Let's work on this: ${briefing.topActions[0].action}. What should I do first?`)}
                className="text-[10px] text-primary mt-2 flex items-center gap-1 hover:underline"
              >
                Discuss with Orchestrator <ArrowRight className="h-3 w-3" />
              </button>
            </CardContent>
          </Card>
        )}

        {/* All Agents */}
        <Card className="border-border/40 bg-card/50">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-bold flex items-center gap-2 text-muted-foreground">
              <Activity className="h-3.5 w-3.5" /> Agent Layer
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-0.5">
            {ALL_AGENTS.map((agent) => (
              <div key={agent.name} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted/20">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${agent.status === "active" ? `${agent.color} animate-pulse` : "bg-muted-foreground/30"}`} />
                  <span className="text-xs text-muted-foreground">{agent.name}</span>
                </div>
                <span className={`text-[8px] font-mono ${agent.status === "active" ? "text-green-400" : "text-muted-foreground/40"}`}>
                  {agent.status.toUpperCase()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Quick Nav */}
        <div className="space-y-1">
          {[
            { href: "/memory",          icon: Brain,      label: "Memory Engine" },
            { href: "/strategic-brain", icon: Compass,    label: "Strategic Brain" },
            { href: "/opportunities",   icon: Lightbulb,  label: "Opportunity Engine" },
            { href: "/memory-graph",    icon: Network,    label: "Memory Graph" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:bg-muted/20 hover:text-foreground transition-colors cursor-pointer">
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                  <ChevronRight className="h-3 w-3 ml-auto opacity-40" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

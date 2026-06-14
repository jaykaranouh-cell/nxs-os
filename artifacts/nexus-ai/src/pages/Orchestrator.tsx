import { useState, useRef, useEffect } from "react";
import {
  useListChatMessages, getListChatMessagesQueryKey,
  useGetMemoryBriefing, useGetMemoryAgentStatus,
  useGetSystemContext, useListOpportunities, useListAgents,
  useListMemoryEntries, useListAgentMessages, getListAgentMessagesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link, useSearch } from "wouter";
import {
  Bot, Send, User, BrainCircuit, Loader2, Activity, Zap, Bell, Lock,
  Shield, AlertTriangle, Brain, Compass, Lightbulb, Target, Network,
  ChevronRight, ArrowRight, Database, BookOpen, CheckSquare, Plus,
  Volume2, VolumeX, Mic, Square, MessageSquare, Paperclip, FileText, X
} from "lucide-react";
import { ContextIntakeModal } from "@/components/ContextIntakeModal";
import { authHeaders } from "@/lib/auth";
import { speak, stopSpeaking, startRecording, type Recorder } from "@/lib/voice";

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


// Expandable agent contributions under an orchestrator message.
function AgentActions({ json }: { json: string }) {
  const [open, setOpen] = useState(false);
  let actions: Array<{ agentName: string; action: string; result: string | null }> = [];
  try { actions = JSON.parse(json); } catch { return null; }
  if (!actions.length) return null;
  return (
    <div className="w-full max-w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex flex-wrap items-center gap-1 text-left"
      >
        {actions.map((a, i) => (
          <Badge key={i} variant="outline" className="bg-background border-primary/20 text-primary/70 text-[9px] font-mono max-w-[220px]">
            <Activity className="w-2 h-2 mr-1 shrink-0" />
            <span className="truncate">{a.agentName}</span>
          </Badge>
        ))}
        <span className="text-[9px] text-muted-foreground/60 flex items-center gap-0.5 hover:text-primary/70">
          {open ? "hide" : "details"}
          <ChevronRight className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-90" : ""}`} />
        </span>
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-border/40 bg-background/50 p-3">
          {actions.map((a, i) => (
            <div key={i} className="text-[11px] border-b border-border/20 last:border-0 pb-2 last:pb-0">
              <div className="font-semibold text-primary/80">{a.agentName}</div>
              {a.action && <div className="text-muted-foreground/70 italic mt-0.5">{a.action}</div>}
              {a.result && (
                <div className="text-foreground/75 mt-1 whitespace-pre-wrap break-words leading-relaxed">{a.result}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Attachments ───────────────────────────────────────────────────────────────

type PendingFile = { kind: "image" | "pdf" | "text"; mediaType: string; data: string; name: string; previewUrl?: string };
type Attachment = { type: "image" | "pdf" | "text"; name: string; url?: string; previewUrl?: string; mediaType?: string };

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function AttachmentView({ items }: { items?: Attachment[] | null }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {items.map((a, i) => {
        const src = a.previewUrl ?? a.url;
        if (a.type === "image" && src)
          return <img key={i} src={src} alt={a.name} className="h-28 max-w-[12rem] object-cover rounded-lg border border-white/15" />;
        return (
          <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border border-white/15 bg-white/5 text-white/70 hover:text-white hover:border-white/30 max-w-[14rem]">
            <FileText className="h-3.5 w-3.5 flex-shrink-0 text-primary/70" /> <span className="truncate">{a.name}</span>
          </a>
        );
      })}
    </div>
  );
}

export default function Orchestrator() {
  const [input, setInput] = useState("");
  const [execLevel, setExecLevel] = useState<ExecLevel>("amber");
  const queryClient = useQueryClient();
  const { data: messages, isLoading } = useListChatMessages({ limit: 50 });
  const { data: briefing } = useGetMemoryBriefing();
  const [localUserMessage, setLocalUserMessage] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [localAttachments, setLocalAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [consulting, setConsulting] = useState<Array<{ name: string; done: boolean }>>([]);
  const [liveActions, setLiveActions] = useState<Array<{ tool: string; summary: string; error?: boolean }>>([]);
  const [voiceOn, setVoiceOn] = useState(() => localStorage.getItem("nexus-voice") === "on");
  const [speakingId, setSpeakingId] = useState<number | "live" | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recorderRef = useRef<Recorder | null>(null);
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;
  const hasSentInitialQuery = useRef(false);
  const lastMessageId = useRef(0);
  const search = useSearch();
  const qParam = new URLSearchParams(search).get("q");
  const { data: agentStatus } = useGetMemoryAgentStatus();
  const { data: realAgents } = useListAgents();
  const { data: teamMessages } = useListAgentMessages({ query: { queryKey: getListAgentMessagesQueryKey(), refetchInterval: 15000 } });
  type TeamMsg = NonNullable<typeof teamMessages>[number];
  const [openMsg, setOpenMsg] = useState<TeamMsg | null>(null);
  const toLabel = (id: string) => id === "all" ? "everyone" : id === "orchestrator" ? "Maya" : id === "jay" ? "Jay" : id;
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
    // Radix ScrollArea scrolls in its inner viewport, not the root element.
    const viewport = scrollRef.current?.querySelector<HTMLDivElement>(
      "[data-radix-scroll-area-viewport]"
    );
    if (!viewport) return;
    requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
  }, [messages, streamingContent, isStreaming]);

  useEffect(() => {
    // Track the newest message id, not the count: the list is capped at 50,
    // so count stays flat in long chats and the optimistic copy never cleared.
    const newestId = messages?.length ? messages[messages.length - 1].id : 0;
    if (newestId !== lastMessageId.current) {
      lastMessageId.current = newestId;
      setStreamingContent("");
      setLocalUserMessage(null);
      setLocalAttachments([]);
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

  function toggleVoice() {
    const next = !voiceOn;
    setVoiceOn(next);
    localStorage.setItem("nexus-voice", next ? "on" : "off");
    if (!next) { stopSpeaking(); setSpeakingId(null); }
  }

  async function speakMessage(id: number | "live", text: string) {
    if (speakingId === id) { stopSpeaking(); setSpeakingId(null); return; }
    try {
      setSpeakingId(id);
      await speak(text, () => setSpeakingId(null));
    } catch {
      setSpeakingId(null);
    }
  }

  async function toggleMic() {
    if (isRecording) {
      setIsRecording(false);
      setIsTranscribing(true);
      try {
        const text = await recorderRef.current?.stop();
        if (text) setInput((p) => (p ? `${p} ${text}` : text));
      } catch {} finally {
        recorderRef.current = null;
        setIsTranscribing(false);
      }
      return;
    }
    try {
      recorderRef.current = await startRecording();
      setIsRecording(true);
    } catch {}
  }

  async function streamMessage(message: string, files: PendingFile[] = []) {
    const msg = message.trim();
    if ((!msg && files.length === 0) || isStreaming) return;
    setLocalUserMessage(msg || "(attachment)");
    setLocalAttachments(files.map((f) => ({ type: f.kind, name: f.name, previewUrl: f.previewUrl })));
    setIsStreaming(true);
    setStreamingContent("");
    setConsulting([]);
    setLiveActions([]);
    try {
      const resp = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          content: msg,
          executionLevel: execLevel,
          attachments: files.map((f) => ({ kind: f.kind, mediaType: f.mediaType, data: f.data, name: f.name })),
        }),
      });
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let fullText = "";
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
                  .map((a) => ({ name: a.agentName ?? "", done: false }))
                  .filter((a) => a.name)
              );
            }
            if (d.agentDone && typeof d.agentDone === "object") {
              const name = (d.agentDone as { agentName?: string }).agentName;
              if (name) setConsulting((p) => p.map((c) => (c.name === name ? { ...c, done: true } : c)));
            }
            if (d.action && typeof d.action === "object") {
              setLiveActions((p) => [...p, d.action as { tool: string; summary: string; error?: boolean }]);
            }
            if (typeof d.content === "string") { fullText += d.content; setStreamingContent((p) => p + d.content); }
            if (d.done === true) {
              // Wait for the refetch to settle so the persisted user + reply are
              // in the list BEFORE we drop the optimistic copies — otherwise the
              // optimistic user bubble lingers and appears duplicated.
              await queryClient.invalidateQueries({ queryKey: getListChatMessagesQueryKey({ limit: 50 }) });
              setLocalUserMessage(null);
              setLocalAttachments([]);
              setStreamingContent("");
              if (voiceOnRef.current && fullText) void speakMessage("live", fullText);
              break outer;
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error("Stream error:", err);
      await queryClient.invalidateQueries({ queryKey: getListChatMessagesQueryKey({ limit: 50 }) });
      setLocalUserMessage(null);
      setLocalAttachments([]);
      setStreamingContent("");
    } finally {
      setIsStreaming(false);
      setConsulting([]);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && pendingFiles.length === 0) || isStreaming) return;
    const msg = input;
    const files = pendingFiles;
    setInput("");
    setPendingFiles([]);
    void streamMessage(msg, files);
  };

  async function onFilesSelected(list: FileList | null) {
    if (!list) return;
    for (const f of Array.from(list).slice(0, 6)) {
      const isImg = f.type.startsWith("image/");
      const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
      const isText = f.type.startsWith("text/") || /\.(txt|md|csv|json)$/i.test(f.name);
      const kind: PendingFile["kind"] | null = isImg ? "image" : isPdf ? "pdf" : isText ? "text" : null;
      if (!kind) continue;
      try {
        const data = await fileToBase64(f);
        setPendingFiles((p) => [
          ...p,
          { kind, mediaType: f.type || (kind === "pdf" ? "application/pdf" : "text/plain"), data, name: f.name,
            previewUrl: isImg ? `data:${f.type};base64,${data}` : undefined },
        ]);
      } catch { /* skip unreadable file */ }
    }
  }

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
      {/* Team Channel message reader */}
      <Dialog open={!!openMsg} onOpenChange={(o) => !o && setOpenMsg(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <MessageSquare className="h-4 w-4 text-primary/70" />
              {openMsg?.fromAgentName}
              <span className="text-muted-foreground/60 font-normal">→ {openMsg ? toLabel(openMsg.toAgentId) : ""}</span>
              {openMsg && (
                <span className="ml-auto text-[10px] font-mono text-muted-foreground/40">
                  {new Date(openMsg.createdAt).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-y-auto text-sm leading-relaxed text-foreground/85 whitespace-pre-line pr-1">
            {openMsg?.content}
          </div>
        </DialogContent>
      </Dialog>

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
                    Your AI CEO — reads your memory, brain, and opportunities before every reply. Ask anything.
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
                    <div className={`relative group px-3 sm:px-4 py-3 rounded-2xl shadow-md w-full break-words ${msg.role === "user" ? "bg-accent/10 border-accent/20 border" : "bg-primary/10 border-primary/20 border"}`}>
                      {msg.role === "orchestrator"
                        ? <MessageContent content={msg.content} />
                        : <p className="text-sm leading-relaxed">{msg.content}</p>
                      }
                      {msg.role === "orchestrator" && (
                        <button
                          onClick={() => void speakMessage(msg.id, msg.content)}
                          title={speakingId === msg.id ? "Stop" : "Listen"}
                          className={`absolute -top-2 -right-2 h-6 w-6 rounded-full border flex items-center justify-center transition-all ${
                            speakingId === msg.id
                              ? "border-primary bg-primary/20 text-primary opacity-100"
                              : "border-white/10 bg-background text-white/40 opacity-0 group-hover:opacity-100 hover:text-primary hover:border-primary/40"
                          }`}
                        >
                          {speakingId === msg.id ? <Square className="h-2.5 w-2.5" /> : <Volume2 className="h-3 w-3" />}
                        </button>
                      )}
                    </div>
                    {msg.role === "user" && <AttachmentView items={(msg as { attachments?: Attachment[] }).attachments} />}
                    {msg.agentActions && <AgentActions json={msg.agentActions} />}
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
                  <AttachmentView items={localAttachments} />
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
                    <span className="text-xs text-primary/80 flex items-center gap-2 flex-wrap">
                      <Network className="h-3 w-3" />
                      {consulting.map((c) => (
                        <span key={c.name} className={`flex items-center gap-1 ${c.done ? "text-green-400/80" : ""}`}>
                          {c.done ? "✓" : ""} {c.name}
                        </span>
                      ))}
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
                  {liveActions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {liveActions.map((a, i) => (
                        <span
                          key={i}
                          className={`text-[9px] font-mono px-2 py-1 rounded-md border ${
                            a.error
                              ? "border-red-400/30 bg-red-400/10 text-red-400/90"
                              : "border-green-400/25 bg-green-400/8 text-green-400/90"
                          }`}
                        >
                          ⚡ {a.summary}
                        </span>
                      ))}
                    </div>
                  )}
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
          {/* Pending attachments preview */}
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {pendingFiles.map((f, i) => (
                <div key={i} className="relative group flex items-center gap-1.5 text-[11px] pl-1 pr-2 py-1 rounded-lg border border-primary/25 bg-primary/5 text-white/70">
                  {f.previewUrl
                    ? <img src={f.previewUrl} alt={f.name} className="h-7 w-7 object-cover rounded" />
                    : <FileText className="h-4 w-4 text-primary/70 ml-1" />}
                  <span className="truncate max-w-[120px]">{f.name}</span>
                  <button type="button" onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}
                    className="text-white/40 hover:text-red-400"><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}
          <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf,text/*,.txt,.md,.csv,.json"
            className="hidden" onChange={(e) => { void onFilesSelected(e.target.files); e.target.value = ""; }} />
          <form onSubmit={handleSubmit} className="relative flex items-center gap-2">
            <Button
              type="button" size="icon" variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming}
              title="Attach a document or photo for Maya to read"
              className="h-11 w-11 rounded-xl flex-shrink-0 border-border/50 text-white/40 hover:text-primary hover:border-primary/50"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={toggleVoice}
              title={voiceOn ? "Maya speaks her replies — click to mute" : "Enable Maya's voice"}
              className={`h-11 w-11 rounded-xl flex-shrink-0 ${voiceOn ? "border-primary/50 text-primary bg-primary/10" : "border-border/50 text-white/30"}`}
            >
              {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => void toggleMic()}
              disabled={isTranscribing}
              title={isRecording ? "Stop and transcribe" : "Dictate with your voice"}
              className={`h-11 w-11 rounded-xl flex-shrink-0 ${isRecording ? "border-red-400/60 text-red-400 bg-red-400/10 animate-pulse" : "border-border/50 text-white/40"}`}
            >
              {isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isRecording ? "Listening…" : isTranscribing ? "Transcribing…" : pendingFiles.length ? "Add a note, or just send…" : "Ask Maya anything..."}
              className="pr-12 bg-background border-primary/30 focus-visible:ring-primary/50 shadow-inner h-11 rounded-xl text-sm"
              disabled={isStreaming}
            />
            <Button
              type="submit"
              size="icon"
              className="absolute right-1.5 h-8 w-8 rounded-lg bg-primary hover:bg-primary/80 text-primary-foreground"
              disabled={(!input.trim() && pendingFiles.length === 0) || isStreaming}
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
            {(realAgents ?? []).map((agent) => (
              <div key={agent.id} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted/20">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${agent.status === "busy" ? "bg-yellow-400 animate-pulse" : "bg-green-400"}`} />
                  <span className="text-xs text-muted-foreground">{agent.name} <span className="text-muted-foreground/40">· {agent.department}</span></span>
                </div>
                <span className={`text-[8px] font-mono ${agent.status !== "busy" ? "text-green-400" : "text-muted-foreground/40"}`}>
                  {agent.status.toUpperCase()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Team Channel — what the agents are telling each other */}
        <Card className="border-border/40 bg-card/50">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-bold flex items-center gap-2 text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5 text-primary/70" /> Team Channel
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-2">
            {teamMessages && teamMessages.length > 0 ? (
              teamMessages.slice(0, 5).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setOpenMsg(m)}
                  className="w-full text-left rounded-lg border border-primary/10 bg-primary/[0.03] px-2.5 py-2 hover:bg-primary/[0.07] hover:border-primary/25 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-foreground/80 truncate">
                      {m.fromAgentName}
                      <span className="text-muted-foreground/50 font-normal"> → {toLabel(m.toAgentId)}</span>
                    </span>
                    <span className="text-[8px] text-muted-foreground/40 flex-shrink-0">
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 leading-relaxed mt-0.5 line-clamp-2 whitespace-pre-line">{m.content}</p>
                </button>
              ))
            ) : (
              <p className="text-[10px] text-muted-foreground/40 italic px-1">No team messages yet. Agents leave notes for each other here as they coordinate.</p>
            )}
            <Link href="/agents">
              <button className="text-[9px] text-primary/60 hover:text-primary flex items-center gap-1 mt-1">
                Open Team Channel <ChevronRight className="h-2.5 w-2.5" />
              </button>
            </Link>
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

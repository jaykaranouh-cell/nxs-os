import { useState, useEffect } from "react";
import { ContextIntakeModal } from "@/components/ContextIntakeModal";
import {
  useListMemoryEntries,
  useGetMemoryCategorySummary,
  useGetMemoryBriefing,
  useGetMemoryAgentStatus,
  useGetMemoryConnections,
  useCreateMemoryEntry,
  useUpdateMemoryEntry,
  useDeleteMemoryEntry,
  useCreateMemoryConnection,
  getListMemoryEntriesQueryKey,
  getGetMemoryCategorySummaryQueryKey,
  getGetMemoryBriefingQueryKey,
  getGetMemoryAgentStatusQueryKey,
} from "@workspace/api-client-react";
import type { MemoryEntry } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Brain, BrainCircuit, Search, Plus, X, ChevronDown, ChevronUp,
  Activity, AlertCircle, Lightbulb, CheckCircle2, Clock, Tag, Users,
  Building, Folder, ArrowRight, Link2, Edit, Trash2, Zap, Bell, Lock,
  Calendar, Sparkles, AlertTriangle, Target, BookOpen, Heart, DollarSign,
  RefreshCw, MessageSquare, Shield, Filter,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_CATEGORIES = [
  { id: "decisions", label: "Decisions", icon: CheckCircle2, color: "text-purple-400", bg: "bg-purple-400/10 border-purple-400/20" },
  { id: "conversations", label: "Conversations", icon: MessageSquare, color: "text-sky-400", bg: "bg-sky-400/10 border-sky-400/20" },
  { id: "clients", label: "Clients", icon: Users, color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20" },
  { id: "projects", label: "Projects", icon: Folder, color: "text-cyan-400", bg: "bg-cyan-400/10 border-cyan-400/20" },
  { id: "sops", label: "SOPs", icon: BookOpen, color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20" },
  { id: "goals", label: "Goals", icon: Target, color: "text-green-400", bg: "bg-green-400/10 border-green-400/20" },
  { id: "lessons_learned", label: "Lessons Learned", icon: Lightbulb, color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/20" },
  { id: "ideas", label: "Ideas", icon: Sparkles, color: "text-violet-400", bg: "bg-violet-400/10 border-violet-400/20" },
  { id: "risks", label: "Risks", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-400/10 border-red-400/20" },
  { id: "leads", label: "Leads", icon: ArrowRight, color: "text-orange-400", bg: "bg-orange-400/10 border-orange-400/20" },
  { id: "campaigns", label: "Campaigns", icon: Activity, color: "text-pink-400", bg: "bg-pink-400/10 border-pink-400/20" },
  { id: "finances", label: "Finances", icon: DollarSign, color: "text-yellow-300", bg: "bg-yellow-300/10 border-yellow-300/20" },
  { id: "health", label: "Health", icon: Heart, color: "text-rose-400", bg: "bg-rose-400/10 border-rose-400/20" },
  { id: "wealth", label: "Wealth", icon: DollarSign, color: "text-gold-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
  { id: "life_context", label: "Life Context", icon: BrainCircuit, color: "text-indigo-400", bg: "bg-indigo-400/10 border-indigo-400/20" },
  { id: "decision", label: "Decision", icon: CheckCircle2, color: "text-purple-400", bg: "bg-purple-400/10 border-purple-400/20" },
  { id: "company_context", label: "Company Context", icon: Building, color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/20" },
  { id: "client_note", label: "Client Note", icon: Users, color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20" },
  { id: "lead_note", label: "Lead Note", icon: ArrowRight, color: "text-orange-400", bg: "bg-orange-400/10 border-orange-400/20" },
  { id: "campaign_note", label: "Campaign Note", icon: Activity, color: "text-pink-400", bg: "bg-pink-400/10 border-pink-400/20" },
  { id: "financial_note", label: "Financial Note", icon: DollarSign, color: "text-yellow-300", bg: "bg-yellow-300/10 border-yellow-300/20" },
  { id: "general", label: "General", icon: Brain, color: "text-muted-foreground", bg: "bg-muted/10 border-muted/20" },
];

const PRIORITY_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  critical: { label: "Critical", color: "text-red-400 border-red-400/30 bg-red-400/10", dot: "bg-red-400" },
  high: { label: "High", color: "text-orange-400 border-orange-400/30 bg-orange-400/10", dot: "bg-orange-400" },
  medium: { label: "Medium", color: "text-primary border-primary/30 bg-primary/10", dot: "bg-primary" },
  low: { label: "Low", color: "text-muted-foreground border-border/50 bg-muted/10", dot: "bg-muted-foreground" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "text-green-400 bg-green-400/10 border-green-400/20" },
  archived: { label: "Archived", color: "text-muted-foreground bg-muted/10 border-muted/20" },
  needs_review: { label: "Needs Review", color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" },
  connected: { label: "Connected", color: "text-primary bg-primary/10 border-primary/20" },
};

function getCategoryConfig(cat: string) {
  return ALL_CATEGORIES.find((c) => c.id === cat) ?? ALL_CATEGORIES[ALL_CATEGORIES.length - 1];
}

// ─── New Entry Form ───────────────────────────────────────────────────────────

interface EntryFormData {
  title: string;
  content: string;
  summary: string;
  detailedNotes: string;
  category: string;
  tags: string;
  priority: string;
  confidence: string;
  status: string;
  source: string;
  relatedPeople: string;
  relatedCompanies: string;
  linkedProjects: string;
  nextAction: string;
}

const EMPTY_FORM: EntryFormData = {
  title: "", content: "", summary: "", detailedNotes: "",
  category: "general", tags: "", priority: "medium", confidence: "medium",
  status: "active", source: "manual", relatedPeople: "", relatedCompanies: "",
  linkedProjects: "", nextAction: "",
};

function MemoryEntryForm({
  initial,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  initial?: Partial<EntryFormData>;
  onSubmit: (data: EntryFormData) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState<EntryFormData>({ ...EMPTY_FORM, ...initial });
  const set = (k: keyof EntryFormData) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1.5 block">Title *</label>
          <Input value={form.title} onChange={(e) => set("title")(e.target.value)} placeholder="What is this memory about?" className="bg-background border-border/50" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1.5 block">Category *</label>
          <Select value={form.category} onValueChange={set("category")}>
            <SelectTrigger className="bg-background border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_CATEGORIES.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1.5 block">Priority</label>
          <Select value={form.priority} onValueChange={set("priority")}>
            <SelectTrigger className="bg-background border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1.5 block">Summary / Key Point *</label>
          <Textarea value={form.content} onChange={(e) => set("content")(e.target.value)} placeholder="The essential point of this memory in 1–3 sentences..." className="bg-background border-border/50 resize-none" rows={2} />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1.5 block">Detailed Notes</label>
          <Textarea value={form.detailedNotes} onChange={(e) => set("detailedNotes")(e.target.value)} placeholder="Full context, rationale, evidence, next steps..." className="bg-background border-border/50 resize-none" rows={4} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1.5 block">Related People</label>
          <Input value={form.relatedPeople} onChange={(e) => set("relatedPeople")(e.target.value)} placeholder="Jay, Amara Diallo, ..." className="bg-background border-border/50" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1.5 block">Related Companies</label>
          <Input value={form.relatedCompanies} onChange={(e) => set("relatedCompanies")(e.target.value)} placeholder="FlowStack, Apex Growth, ..." className="bg-background border-border/50" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1.5 block">Linked Projects</label>
          <Input value={form.linkedProjects} onChange={(e) => set("linkedProjects")(e.target.value)} placeholder="Q3 Growth Plan, ..." className="bg-background border-border/50" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1.5 block">Tags</label>
          <Input value={form.tags} onChange={(e) => set("tags")(e.target.value)} placeholder="strategy, Q3, clients, ..." className="bg-background border-border/50" />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1.5 block">Next Action</label>
          <Input value={form.nextAction} onChange={(e) => set("nextAction")(e.target.value)} placeholder="What should happen next because of this memory?" className="bg-background border-border/50" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1.5 block">Confidence</label>
          <Select value={form.confidence} onValueChange={set("confidence")}>
            <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1.5 block">Source</label>
          <Select value={form.source} onValueChange={set("source")}>
            <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="chat">Chat / Orchestrator</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="crm">CRM</SelectItem>
              <SelectItem value="calendar">Calendar</SelectItem>
              <SelectItem value="import">Import</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button onClick={() => onSubmit(form)} disabled={!form.title.trim() || !form.content.trim() || isSubmitting} className="bg-primary text-primary-foreground flex-1">
          {isSubmitting ? "Saving..." : "Save Memory"}
        </Button>
        <Button variant="outline" onClick={onCancel} className="border-border/50">Cancel</Button>
      </div>
    </div>
  );
}

// ─── Memory Card ──────────────────────────────────────────────────────────────

function MemoryCard({ entry, selected, onClick }: { entry: MemoryEntry; selected: boolean; onClick: () => void }) {
  const cat = getCategoryConfig(entry.category);
  const pri = PRIORITY_CONFIG[entry.priority ?? entry.importance] ?? PRIORITY_CONFIG.medium;
  const Cat = cat.icon;

  return (
    <Card
      onClick={onClick}
      className={`cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${
        selected
          ? "border-primary/60 bg-primary/5 shadow-lg shadow-primary/10"
          : "border-border/40 bg-card/50 hover:border-primary/30"
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className={`flex-shrink-0 p-1 rounded ${cat.bg}`}>
              <Cat className={`h-3 w-3 ${cat.color}`} />
            </span>
            <span className={`text-[10px] font-medium uppercase tracking-wider ${cat.color}`}>{cat.label}</span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pri.dot}`} />
            <Badge variant="outline" className={`text-[9px] h-4 px-1.5 font-medium ${pri.color}`}>{pri.label}</Badge>
          </div>
        </div>

        <h3 className="font-semibold text-sm text-foreground leading-tight mb-2 line-clamp-2">{entry.title}</h3>

        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-3">
          {entry.summary ?? entry.content}
        </p>

        {entry.nextAction && (
          <div className="flex items-start gap-1.5 bg-primary/5 border border-primary/15 rounded-md px-2 py-1.5 mb-3">
            <ArrowRight className="h-3 w-3 text-primary flex-shrink-0 mt-0.5" />
            <span className="text-[10px] text-primary line-clamp-1">{entry.nextAction}</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1">
            {entry.tags?.split(",").slice(0, 2).map((t) => t.trim()).filter(Boolean).map((t) => (
              <span key={t} className="text-[9px] text-muted-foreground bg-muted/40 rounded px-1.5 py-0.5">#{t}</span>
            ))}
          </div>
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground/60">
            <Calendar className="h-2.5 w-2.5" />
            {new Date(entry.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </div>
        </div>

        {(entry.relatedPeople || entry.relatedCompanies) && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
            {entry.relatedPeople && (
              <span className="flex items-center gap-1 text-[9px] text-muted-foreground/70">
                <Users className="h-2.5 w-2.5" />{entry.relatedPeople.split(",")[0].trim()}
              </span>
            )}
            {entry.relatedCompanies && (
              <span className="flex items-center gap-1 text-[9px] text-muted-foreground/70">
                <Building className="h-2.5 w-2.5" />{entry.relatedCompanies.split(",")[0].trim()}
              </span>
            )}
          </div>
        )}

        {entry.status === "needs_review" && (
          <div className="flex items-center gap-1 mt-2">
            <RefreshCw className="h-3 w-3 text-yellow-400" />
            <span className="text-[9px] text-yellow-400 font-medium">Needs Review</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  entry,
  onClose,
  onUpdate,
  onDelete,
  allEntries,
}: {
  entry: MemoryEntry;
  onClose: () => void;
  onUpdate: (id: number, data: Partial<EntryFormData>) => void;
  onDelete: (id: number) => void;
  allEntries: MemoryEntry[];
}) {
  const [editing, setEditing] = useState(false);
  const [connectingTo, setConnectingTo] = useState<string>("");
  const [connectType, setConnectType] = useState("related");
  const queryClient = useQueryClient();
  const createConn = useCreateMemoryConnection();
  const { data: connections, isLoading: isConnLoading } = useGetMemoryConnections(entry.id);

  const cat = getCategoryConfig(entry.category);
  const pri = PRIORITY_CONFIG[entry.priority ?? entry.importance] ?? PRIORITY_CONFIG.medium;
  const Cat = cat.icon;

  function handleConnect() {
    const toId = parseInt(connectingTo);
    if (!toId || isNaN(toId)) return;
    createConn.mutate(
      { data: { fromMemoryId: entry.id, toMemoryId: toId, relationshipType: connectType } },
      { onSuccess: () => { setConnectingTo(""); queryClient.invalidateQueries(); } }
    );
  }

  return (
    <div className="flex flex-col h-full border-l border-border/40 bg-card/30 backdrop-blur-sm">
      <div className="flex items-center justify-between p-4 border-b border-border/40 bg-card/60 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className={`p-1.5 rounded ${cat.bg}`}>
            <Cat className={`h-4 w-4 ${cat.color}`} />
          </span>
          <span className={`text-xs font-medium uppercase tracking-wider ${cat.color}`}>{cat.label}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(!editing)}>
            <Edit className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(entry.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {editing ? (
            <MemoryEntryForm
              initial={{
                title: entry.title, content: entry.content, summary: entry.summary ?? "",
                detailedNotes: entry.detailedNotes ?? "", category: entry.category,
                tags: entry.tags ?? "", priority: entry.priority ?? entry.importance,
                confidence: entry.confidence ?? "medium", status: entry.status ?? "active",
                source: entry.source ?? "manual", relatedPeople: entry.relatedPeople ?? "",
                relatedCompanies: entry.relatedCompanies ?? "", linkedProjects: entry.linkedProjects ?? "",
                nextAction: entry.nextAction ?? "",
              }}
              onSubmit={(data) => { onUpdate(entry.id, data); setEditing(false); }}
              onCancel={() => setEditing(false)}
              isSubmitting={false}
            />
          ) : (
            <>
              <div>
                <h2 className="text-lg font-bold text-foreground leading-snug mb-3">{entry.title}</h2>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={`text-[10px] ${pri.color}`}>{pri.label} Priority</Badge>
                  {entry.status && (
                    <Badge variant="outline" className={`text-[10px] ${STATUS_CONFIG[entry.status]?.color ?? ""}`}>
                      {STATUS_CONFIG[entry.status]?.label ?? entry.status}
                    </Badge>
                  )}
                  {entry.confidence && (
                    <Badge variant="outline" className="text-[10px] border-border/50 text-muted-foreground">
                      {entry.confidence} confidence
                    </Badge>
                  )}
                  {entry.source && entry.source !== "manual" && (
                    <Badge variant="outline" className="text-[10px] border-border/50 text-muted-foreground">
                      via {entry.source}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Summary</p>
                <p className="text-sm text-foreground leading-relaxed">{entry.summary ?? entry.content}</p>
              </div>

              {entry.detailedNotes && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Detailed Notes</p>
                  <div className="bg-background/60 border border-border/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{entry.detailedNotes}</p>
                  </div>
                </div>
              )}

              {entry.nextAction && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                  <p className="text-[10px] text-primary font-medium uppercase tracking-wider mb-1">Next Action</p>
                  <p className="text-sm text-foreground flex items-start gap-2">
                    <ArrowRight className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    {entry.nextAction}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {entry.relatedPeople && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1">
                      <Users className="h-3 w-3" /> People
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {entry.relatedPeople.split(",").map((p) => p.trim()).filter(Boolean).map((p) => (
                        <span key={p} className="text-xs bg-background border border-border/40 rounded px-2 py-0.5">{p}</span>
                      ))}
                    </div>
                  </div>
                )}
                {entry.relatedCompanies && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1">
                      <Building className="h-3 w-3" /> Companies
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {entry.relatedCompanies.split(",").map((c) => c.trim()).filter(Boolean).map((c) => (
                        <span key={c} className="text-xs bg-background border border-border/40 rounded px-2 py-0.5">{c}</span>
                      ))}
                    </div>
                  </div>
                )}
                {entry.linkedProjects && (
                  <div className="col-span-2 space-y-1">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1">
                      <Folder className="h-3 w-3" /> Linked Projects
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {entry.linkedProjects.split(",").map((p) => p.trim()).filter(Boolean).map((p) => (
                        <span key={p} className="text-xs bg-background border border-border/40 rounded px-2 py-0.5 text-primary/80">{p}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {entry.tags && (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1">
                    <Tag className="h-3 w-3" /> Tags
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {entry.tags.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                      <span key={t} className="text-xs text-muted-foreground bg-muted/30 border border-border/30 rounded px-2 py-0.5">#{t}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-4 text-[10px] text-muted-foreground/60 pt-1 border-t border-border/30">
                <span><Calendar className="h-3 w-3 inline mr-1" />Created {new Date(entry.createdAt).toLocaleDateString()}</span>
                {entry.updatedAt && (
                  <span>Updated {new Date(entry.updatedAt).toLocaleDateString()}</span>
                )}
              </div>

              {/* Connections */}
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1">
                  <Link2 className="h-3 w-3" /> Connected Memories
                </p>
                {isConnLoading ? (
                  <Skeleton className="h-12 w-full" />
                ) : connections && connections.length > 0 ? (
                  <div className="space-y-2">
                    {connections.map((conn) => {
                      const cc = getCategoryConfig(conn.memory.category);
                      const CC = cc.icon;
                      return (
                        <div key={conn.connectionId} className="flex items-center gap-2 p-2 bg-background/60 border border-border/40 rounded-lg">
                          <span className={`p-1 rounded ${cc.bg} flex-shrink-0`}>
                            <CC className={`h-3 w-3 ${cc.color}`} />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground line-clamp-1">{conn.memory.title}</p>
                            <p className="text-[9px] text-muted-foreground capitalize">{conn.relationshipType.replace("_", " ")} • {conn.direction === "from" ? "→" : "←"}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground/60 italic">No connections yet</p>
                )}

                <div className="flex gap-2 pt-1">
                  <Select value={connectingTo} onValueChange={setConnectingTo}>
                    <SelectTrigger className="bg-background border-border/40 h-8 text-xs flex-1">
                      <SelectValue placeholder="Connect to..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allEntries.filter((e) => e.id !== entry.id).map((e) => (
                        <SelectItem key={e.id} value={String(e.id)} className="text-xs">{e.title.substring(0, 40)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={connectType} onValueChange={setConnectType}>
                    <SelectTrigger className="bg-background border-border/40 h-8 text-xs w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="related">Related</SelectItem>
                      <SelectItem value="supports">Supports</SelectItem>
                      <SelectItem value="informs">Informs</SelectItem>
                      <SelectItem value="implements">Implements</SelectItem>
                      <SelectItem value="supersedes">Supersedes</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-8 px-3" onClick={handleConnect} disabled={!connectingTo || createConn.isPending}>
                    <Link2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Morning Briefing Panel ───────────────────────────────────────────────────

function MorningBriefingPanel({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const { data: briefing, isLoading } = useGetMemoryBriefing();

  return (
    <div className={`border border-primary/20 rounded-xl overflow-hidden bg-gradient-to-br from-primary/5 to-background transition-all duration-300 ${expanded ? "" : "cursor-pointer"}`}>
      <div
        className="flex items-center justify-between px-5 py-3 border-b border-primary/15 cursor-pointer hover:bg-primary/5 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-primary/20 animate-pulse" />
            <Sparkles className="h-4 w-4 text-primary relative" />
          </div>
          <div>
            <span className="text-sm font-bold text-foreground">Morning Intelligence Briefing</span>
            {briefing && (
              <span className="text-xs text-muted-foreground ml-3">
                {briefing.totalMemories} memories · {briefing.highPriorityCount} high-priority · {briefing.recentCount} new this week
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-mono">
            {briefing ? new Date(briefing.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
          </span>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="p-5">
          {isLoading ? (
            <div className="grid grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 w-full" />)}
            </div>
          ) : briefing ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                <BriefingSection
                  title="What Happened"
                  icon={<Clock className="h-3.5 w-3.5 text-sky-400" />}
                  items={briefing.whatHappened}
                  accent="sky"
                />
                <BriefingSection
                  title="What Matters"
                  icon={<AlertCircle className="h-3.5 w-3.5 text-primary" />}
                  items={briefing.whatMatters}
                  accent="primary"
                />
                <BriefingSection
                  title="At Risk"
                  icon={<AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
                  items={briefing.atRisk}
                  accent="red"
                />
                <BriefingSection
                  title="Opportunities"
                  icon={<Lightbulb className="h-3.5 w-3.5 text-yellow-400" />}
                  items={briefing.opportunities}
                  accent="yellow"
                />
              </div>

              <div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Target className="h-3 w-3" /> Top 3 Recommended Actions
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {briefing.topActions.map((action, i) => (
                    <div key={i} className="flex gap-3 p-3 bg-background/60 border border-border/40 rounded-lg">
                      <div className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-foreground leading-snug">{action.action}</p>
                        <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{action.rationale}</p>
                        <p className="text-[9px] text-primary/70 mt-1 font-medium">via {action.source}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function BriefingSection({ title, icon, items, accent }: {
  title: string;
  icon: React.ReactNode;
  items: Array<{ id: number; title: string; category: string; summary: string; priority?: string; nextAction?: string }>;
  accent: string;
}) {
  const accentMap: Record<string, string> = {
    sky: "border-sky-400/20 bg-sky-400/5",
    primary: "border-primary/20 bg-primary/5",
    red: "border-red-400/20 bg-red-400/5",
    yellow: "border-yellow-400/20 bg-yellow-400/5",
  };
  const actionColor: Record<string, string> = {
    sky: "text-sky-400/70",
    primary: "text-primary/70",
    red: "text-red-400/70",
    yellow: "text-yellow-400/70",
  };
  return (
    <div className={`border rounded-lg p-3 ${accentMap[accent] ?? ""}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-2">
        {icon} {title}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 italic">Nothing to report</p>
      ) : (
        <div className="space-y-2.5">
          {items.slice(0, 3).map((item) => (
            <div key={item.id} className="flex items-start gap-1.5">
              <div className="w-1 h-1 rounded-full bg-current mt-1.5 shrink-0 opacity-50" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground leading-snug line-clamp-1">{item.title}</p>
                {item.summary && (
                  <p className="text-[10px] text-muted-foreground/60 leading-snug line-clamp-2 mt-0.5">{item.summary}</p>
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

// ─── Memory Agent Card ────────────────────────────────────────────────────────

type ExecLevel = "green" | "amber" | "red";

function MemoryAgentCard({ executionLevel, onLevelChange, activeCats, category, onCategoryChange }: {
  executionLevel: ExecLevel;
  onLevelChange: (l: ExecLevel) => void;
  activeCats: { category: string; count: number }[];
  category: string;
  onCategoryChange: (c: string) => void;
}) {
  const { data: status, isLoading } = useGetMemoryAgentStatus();

  const levels: { id: ExecLevel; icon: typeof Zap; label: string; desc: string; color: string }[] = [
    { id: "green", icon: Zap,  label: "Auto",   desc: "Agent executes automatically",  color: "text-green-400 bg-green-400/10 border-green-400/30" },
    { id: "amber", icon: Bell, label: "Notify", desc: "Executes + notifies Jay",       color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30" },
    { id: "red",   icon: Lock, label: "Manual", desc: "All actions require approval",  color: "text-red-400 bg-red-400/10 border-red-400/30" },
  ];

  const totalEntries = (activeCats ?? []).reduce((s, c) => s + c.count, 0);

  return (
    <div className="rounded-xl border border-primary/20 bg-card/50 overflow-hidden flex flex-col">
      <div className="h-0.5 w-full bg-gradient-to-r from-primary via-primary/50 to-transparent flex-shrink-0" />

      {/* Agent header */}
      <div className="px-3 pt-3 pb-3 border-b border-border/30 flex-shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-primary/20 animate-pulse" />
            <BrainCircuit className="h-3.5 w-3.5 text-primary relative" />
          </div>
          <span className="text-xs font-bold text-foreground">Memory Agent</span>
          <Badge variant="outline" className="text-[9px] ml-auto text-green-400 border-green-400/30 bg-green-400/10 px-1.5">ACTIVE</Badge>
        </div>

        {/* Stats — 4 inline tiles */}
        {isLoading ? (
          <div className="grid grid-cols-4 gap-1">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
          </div>
        ) : status ? (
          <div className="grid grid-cols-4 gap-1">
            <div className="flex flex-col items-center py-1.5 px-1 bg-background/60 rounded-lg border border-border/30">
              <span className="text-sm font-bold text-foreground leading-none">{status.totalMemories}</span>
              <span className="text-[8px] text-muted-foreground mt-0.5 leading-none">Total</span>
            </div>
            <div className="flex flex-col items-center py-1.5 px-1 bg-orange-400/5 rounded-lg border border-orange-400/20">
              <span className="text-sm font-bold text-orange-400 leading-none">{status.highPriorityCount}</span>
              <span className="text-[8px] text-muted-foreground mt-0.5 leading-none">High</span>
            </div>
            <div className="flex flex-col items-center py-1.5 px-1 bg-yellow-400/5 rounded-lg border border-yellow-400/20">
              <span className="text-sm font-bold text-yellow-400 leading-none">{status.staleCount}</span>
              <span className="text-[8px] text-muted-foreground mt-0.5 leading-none">Stale</span>
            </div>
            <div className="flex flex-col items-center py-1.5 px-1 bg-primary/5 rounded-lg border border-primary/20">
              <span className="text-sm font-bold text-primary leading-none">{status.recentlyAdded}</span>
              <span className="text-[8px] text-muted-foreground mt-0.5 leading-none">New</span>
            </div>
          </div>
        ) : null}

        {/* Execution level */}
        <div className="mt-3">
          <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest mb-1.5 flex items-center gap-1">
            <Shield className="h-2.5 w-2.5" /> Execution level
          </p>
          <div className="flex gap-1">
            {levels.map((lev) => {
              const Icon = lev.icon;
              const active = executionLevel === lev.id;
              return (
                <Tooltip key={lev.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onLevelChange(lev.id)}
                      className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md border text-[9px] font-medium transition-all ${
                        active ? lev.color : "border-border/30 bg-background/40 text-muted-foreground hover:border-border/60"
                      }`}
                    >
                      <Icon className="h-2.5 w-2.5" />
                      {lev.label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">{lev.desc}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 pt-2.5 pb-1">
          <p className="text-[9px] font-bold tracking-widest text-muted-foreground/40 uppercase">Filter</p>
        </div>
        <div className="px-2 pb-3 space-y-0.5">
          <button
            onClick={() => onCategoryChange("")}
            className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors flex items-center justify-between ${
              category === "" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            }`}
          >
            <span className="flex items-center gap-2"><Brain className="h-3 w-3" />All</span>
            <span className="text-[10px] tabular-nums">{totalEntries}</span>
          </button>
          {activeCats.map((s) => {
            const catCfg = getCategoryConfig(s.category);
            const CatI = catCfg.icon;
            const active = category === s.category;
            return (
              <button
                key={s.category}
                onClick={() => onCategoryChange(active ? "" : s.category)}
                className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors flex items-center justify-between ${
                  active ? `bg-primary/10 ${catCfg.color} font-medium` : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <CatI className={`h-3 w-3 flex-shrink-0 ${active ? catCfg.color : ""}`} />
                  <span className="truncate">{catCfg.label}</span>
                </span>
                <span className="text-[10px] tabular-nums flex-shrink-0 ml-1">{s.count}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Memory() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<MemoryEntry | null>(null);
  const [briefingExpanded, setBriefingExpanded] = useState(true);
  const [executionLevel, setExecutionLevel] = useState<ExecLevel>("amber");
  const [showNewDialog, setShowNewDialog] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const saved = localStorage.getItem("nexus-exec-level") as ExecLevel | null;
    if (saved) setExecutionLevel(saved);
  }, []);

  function handleLevelChange(l: ExecLevel) {
    setExecutionLevel(l);
    localStorage.setItem("nexus-exec-level", l);
  }

  const { data: entries, isLoading } = useListMemoryEntries({
    search: debouncedSearch,
    category,
    status: statusFilter,
    priority: priorityFilter,
  });
  const { data: summary } = useGetMemoryCategorySummary();
  const createEntry = useCreateMemoryEntry();
  const updateEntry = useUpdateMemoryEntry();
  const deleteEntry = useDeleteMemoryEntry();

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: getListMemoryEntriesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMemoryCategorySummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMemoryBriefingQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMemoryAgentStatusQueryKey() });
  }

  function handleCreate(data: EntryFormData) {
    createEntry.mutate(
      { data: { ...data, importance: data.priority } },
      {
        onSuccess: () => { setShowNewDialog(false); invalidateAll(); },
      }
    );
  }

  function handleUpdate(id: number, data: Partial<EntryFormData>) {
    updateEntry.mutate(
      { id, data: { ...data, importance: data.priority } },
      {
        onSuccess: (updated) => {
          invalidateAll();
          setSelectedEntry(updated);
        },
      }
    );
  }

  function handleDelete(id: number) {
    deleteEntry.mutate(
      { id },
      {
        onSuccess: () => { setSelectedEntry(null); invalidateAll(); },
      }
    );
  }

  const activeCats = summary?.filter((s) => s.count > 0) ?? [];
  const hasFilters = !!category || !!priorityFilter || !!statusFilter || !!debouncedSearch;

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Brain className="h-8 w-8 text-primary" />
            Memory Engine
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">The shared brain of Nexus AI — your personal operating system</p>
        </div>
        <div className="flex items-center gap-2">
          <ContextIntakeModal>
            <Button variant="outline" className="border-primary/30 text-primary hover:bg-primary/10 gap-2">
              <Plus className="h-4 w-4" /> Add Context
            </Button>
          </ContextIntakeModal>
          <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/80 text-primary-foreground gap-2">
              <Plus className="h-4 w-4" /> New Memory
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" /> Capture New Memory
              </DialogTitle>
            </DialogHeader>
            <MemoryEntryForm
              onSubmit={handleCreate}
              onCancel={() => setShowNewDialog(false)}
              isSubmitting={createEntry.isPending}
            />
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Briefing Panel */}
      <div className="flex-shrink-0">
        <MorningBriefingPanel expanded={briefingExpanded} onToggle={() => setBriefingExpanded(!briefingExpanded)} />
      </div>

      {/* Main layout */}
      <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
        {/* Left Sidebar — single unified panel */}
        <aside className="w-52 flex-shrink-0 flex flex-col min-h-0">
          <MemoryAgentCard
            executionLevel={executionLevel}
            onLevelChange={handleLevelChange}
            activeCats={activeCats}
            category={category}
            onCategoryChange={setCategory}
          />
        </aside>

        {/* Center: Memory Grid */}
        <main className="flex-1 min-w-0 flex flex-col gap-3 overflow-hidden">
          {/* Search + Filters */}
          <div className="flex gap-2 flex-shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search memories, people, companies, tags..."
                className="pl-9 bg-card border-border/50 focus-visible:ring-primary"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            <Select value={priorityFilter || "all"} onValueChange={(v) => setPriorityFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-36 bg-card border-border/50 h-10">
                <Filter className="h-3.5 w-3.5 text-muted-foreground mr-1" />
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-36 bg-card border-border/50 h-10">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="needs_review">Needs Review</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
                <SelectItem value="connected">Connected</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={() => { setCategory(""); setPriorityFilter(""); setStatusFilter(""); setSearch(""); }} className="text-muted-foreground h-10">
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            )}
          </div>

          {/* Results count */}
          {!isLoading && entries && (
            <p className="text-xs text-muted-foreground flex-shrink-0">
              {entries.length} {entries.length === 1 ? "memory" : "memories"}
              {hasFilters ? " matching filters" : " total"}
            </p>
          )}

          {/* Cards grid */}
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className={`grid gap-3 ${selectedEntry ? "grid-cols-1" : "grid-cols-2"}`}>
                {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-44 w-full" />)}
              </div>
            ) : entries?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground border border-dashed border-border rounded-xl">
                <Brain className="h-12 w-12 mb-4 opacity-20" />
                <p className="font-medium">No memories found</p>
                <p className="text-sm mt-1">Try different filters or capture a new memory</p>
                <Button className="mt-4 gap-2" onClick={() => setShowNewDialog(true)}>
                  <Plus className="h-4 w-4" /> Capture Memory
                </Button>
              </div>
            ) : (
              <div className={`grid gap-3 pb-6 ${selectedEntry ? "grid-cols-1" : "grid-cols-2"}`}>
                {entries?.map((entry) => (
                  <MemoryCard
                    key={entry.id}
                    entry={entry}
                    selected={selectedEntry?.id === entry.id}
                    onClick={() => setSelectedEntry(selectedEntry?.id === entry.id ? null : entry)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </main>

        {/* Right: Detail Panel */}
        {selectedEntry && (
          <aside className="w-[400px] flex-shrink-0 flex flex-col min-h-0 rounded-xl overflow-hidden border border-border/40">
            <DetailPanel
              entry={selectedEntry}
              onClose={() => setSelectedEntry(null)}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              allEntries={entries ?? []}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

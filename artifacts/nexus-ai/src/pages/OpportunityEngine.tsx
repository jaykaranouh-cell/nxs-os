import { useState } from "react";
import {
  useListOpportunities,
  useCreateOpportunity,
  useUpdateOpportunity,
  useDeleteOpportunity,
  getListOpportunitiesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Lightbulb, Plus, Search, TrendingUp, Users, Zap, DollarSign,
  Target, Globe, Calendar, ArrowRight, Star,
  XCircle, Eye
} from "lucide-react";

type Category = "niche" | "service" | "partnership" | "automation" | "revenue" | "competitive" | "product";
type Status = "new" | "evaluating" | "pursuing" | "captured" | "won" | "rejected";
type Priority = "low" | "medium" | "high" | "critical";

const CAT_CONFIG: Record<Category, { label: string; icon: typeof Lightbulb; color: string; bg: string }> = {
  niche:       { label: "Niche",       icon: Target,    color: "text-violet-400",  bg: "bg-violet-400/10 border-violet-400/20" },
  service:     { label: "Service",     icon: Zap,       color: "text-cyan-400",    bg: "bg-cyan-400/10 border-cyan-400/20" },
  partnership: { label: "Partnership", icon: Users,     color: "text-green-400",   bg: "bg-green-400/10 border-green-400/20" },
  automation:  { label: "Automation",  icon: Zap,       color: "text-yellow-400",  bg: "bg-yellow-400/10 border-yellow-400/20" },
  revenue:     { label: "Revenue",     icon: DollarSign,color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20" },
  competitive: { label: "Competitive", icon: Globe,     color: "text-orange-400",  bg: "bg-orange-400/10 border-orange-400/20" },
  product:     { label: "Product",     icon: Star,      color: "text-pink-400",    bg: "bg-pink-400/10 border-pink-400/20" },
};

const STATUS_CONFIG: Record<Status, { label: string; color: string; next?: Status; nextLabel?: string }> = {
  new:       { label: "New",       color: "text-sky-400 border-sky-400/30 bg-sky-400/10",         next: "evaluating", nextLabel: "Start Evaluating" },
  evaluating:{ label: "Evaluating",color: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",next: "pursuing",   nextLabel: "Start Pursuing" },
  pursuing:  { label: "Pursuing",  color: "text-primary border-primary/30 bg-primary/10",         next: "captured",   nextLabel: "Mark Captured" },
  captured:  { label: "Captured",  color: "text-green-400 border-green-400/30 bg-green-400/10" },
  won:       { label: "Won",       color: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10" },
  rejected:  { label: "Rejected",  color: "text-muted-foreground border-border/30 bg-muted/10" },
};

const PRIORITY_CONFIG: Record<Priority, { dot: string }> = {
  critical: { dot: "bg-red-400" },
  high:     { dot: "bg-orange-400" },
  medium:   { dot: "bg-primary" },
  low:      { dot: "bg-muted-foreground" },
};

const ALL_CATS = [
  { id: "", label: "All" },
  ...Object.entries(CAT_CONFIG).map(([id, c]) => ({ id, label: c.label })),
];

const EMPTY_FORM = {
  title: "", description: "", category: "niche" as Category, source: "manual",
  status: "new" as Status, priority: "medium" as Priority, estimatedValue: "", tags: "", notes: "",
};

export default function OpportunityEngine() {
  const queryClient = useQueryClient();
  const [catFilter, setCatFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "">("");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [expanded, setExpanded] = useState<number | null>(null);

  const queryKey = getListOpportunitiesQueryKey({});
  const { data: opps = [], isLoading } = useListOpportunities({});
  const createOpp = useCreateOpportunity();
  const updateOpp = useUpdateOpportunity();
  const deleteOpp = useDeleteOpportunity();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey });
  }

  function addOpp() {
    if (!form.title.trim()) return;
    createOpp.mutate(
      {
        data: {
          title: form.title,
          description: form.description,
          category: form.category,
          source: form.source,
          status: form.status,
          priority: form.priority,
          estimatedValue: form.estimatedValue || undefined,
          tags: form.tags || undefined,
          notes: form.notes || undefined,
        },
      },
      {
        onSuccess: () => {
          invalidate();
          setForm(EMPTY_FORM);
          setShowNew(false);
        },
      }
    );
  }

  function advanceStatus(id: number, currentStatus: Status) {
    const next = STATUS_CONFIG[currentStatus]?.next;
    if (!next) return;
    updateOpp.mutate(
      { id, data: { status: next } },
      { onSuccess: invalidate }
    );
  }

  function rejectOpp(id: number) {
    updateOpp.mutate(
      { id, data: { status: "rejected" } },
      { onSuccess: invalidate }
    );
  }

  const filtered = opps.filter((o) => {
    if (catFilter && o.category !== catFilter) return false;
    if (statusFilter && o.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        o.title.toLowerCase().includes(q) ||
        o.description.toLowerCase().includes(q) ||
        (o.tags ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const byStatus = (s: Status) => opps.filter((o) => o.status === s).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Lightbulb className="h-8 w-8 text-yellow-400" /> Opportunity Engine
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Discovered opportunities, competitive signals, and strategic bets — never let a good idea get lost.
          </p>
        </div>
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogTrigger asChild>
            <Button className="bg-primary gap-2"><Plus className="h-4 w-4" /> New Opportunity</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>Capture New Opportunity</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <Input
                value={form.title}
                onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Title *"
                className="bg-background"
              />
              <Textarea
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="What is the opportunity? Why does it matter?"
                className="bg-background resize-none"
                rows={3}
              />
              <div className="grid grid-cols-2 gap-3">
                <Select value={form.category} onValueChange={(v) => setForm(f => ({ ...f, category: v as Category }))}>
                  <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CAT_CONFIG).map(([k, c]) => (
                      <SelectItem key={k} value={k}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={form.priority} onValueChange={(v) => setForm(f => ({ ...f, priority: v as Priority }))}>
                  <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input
                value={form.estimatedValue}
                onChange={(e) => setForm(f => ({ ...f, estimatedValue: e.target.value }))}
                placeholder="Estimated value / impact"
                className="bg-background"
              />
              <Input
                value={form.tags}
                onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="Tags (comma-separated)"
                className="bg-background"
              />
              <Textarea
                value={form.notes}
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Notes, next steps, open questions..."
                className="bg-background resize-none"
                rows={2}
              />
              <div className="flex gap-3">
                <Button
                  onClick={addOpp}
                  disabled={!form.title.trim() || createOpp.isPending}
                  className="flex-1"
                >
                  {createOpp.isPending ? "Saving..." : "Capture"}
                </Button>
                <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {(["new", "evaluating", "pursuing", "captured", "won", "rejected"] as Status[]).map((s) => (
            <div
              key={s}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${statusFilter === s ? STATUS_CONFIG[s].color : "border-border/40 bg-card/50 hover:border-border"}`}
              onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
            >
              <div className="text-xl font-bold">{byStatus(s)}</div>
              <div className="text-xs text-muted-foreground capitalize">{STATUS_CONFIG[s].label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search opportunities..."
            className="pl-9 bg-card border-border/50"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {ALL_CATS.map((c) => (
            <Button
              key={c.id}
              size="sm"
              variant={catFilter === c.id ? "default" : "outline"}
              onClick={() => setCatFilter(c.id)}
              className={`text-xs h-9 ${catFilter === c.id ? "" : "border-border/40 text-muted-foreground"}`}
            >
              {c.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground border border-dashed border-border rounded-xl">
          <Lightbulb className="h-12 w-12 mb-4 opacity-20" />
          <p className="font-medium">No opportunities found</p>
          <Button className="mt-4 gap-2" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4" /> Capture One
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((opp) => {
            const cat = CAT_CONFIG[opp.category as Category] ?? CAT_CONFIG.niche;
            const CatIcon = cat.icon;
            const pri = PRIORITY_CONFIG[opp.priority as Priority] ?? PRIORITY_CONFIG.medium;
            const status = STATUS_CONFIG[opp.status as Status] ?? STATUS_CONFIG.new;
            const isExpanded = expanded === opp.id;

            return (
              <Card
                key={opp.id}
                className={`border-border/40 bg-card/50 overflow-hidden transition-all ${opp.status === "rejected" ? "opacity-50" : ""}`}
              >
                <div className={`h-0.5 w-full ${opp.priority === "critical" ? "bg-red-400" : opp.priority === "high" ? "bg-orange-400" : "bg-muted"}`} />
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className={`flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider px-2 py-1 rounded-md border ${cat.bg} ${cat.color}`}>
                      <CatIcon className="h-3 w-3" /> {cat.label}
                    </span>
                    <div className="flex items-center gap-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${pri.dot}`} />
                      <Badge variant="outline" className={`text-[9px] h-5 ${status.color}`}>{status.label}</Badge>
                    </div>
                  </div>

                  <h3 className="font-semibold text-sm text-foreground leading-snug mb-2">{opp.title}</h3>
                  <p className={`text-xs text-muted-foreground leading-relaxed ${isExpanded ? "" : "line-clamp-2"}`}>
                    {opp.description}
                  </p>

                  {opp.estimatedValue && (
                    <div className="flex items-start gap-1.5 mt-2 p-2 bg-green-400/5 border border-green-400/15 rounded-md">
                      <TrendingUp className="h-3 w-3 text-green-400 flex-shrink-0 mt-0.5" />
                      <p className="text-[10px] text-green-400 leading-snug">{opp.estimatedValue}</p>
                    </div>
                  )}

                  {isExpanded && opp.notes && (
                    <div className="mt-3 p-2 bg-background/60 border border-border/40 rounded-md">
                      <p className="text-[10px] text-muted-foreground/70 mb-1 font-medium uppercase tracking-wider">Notes</p>
                      <p className="text-xs text-muted-foreground">{opp.notes}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/30">
                    <div className="flex items-center gap-1 text-[9px] text-muted-foreground/60">
                      <Calendar className="h-2.5 w-2.5" />
                      {new Date(opp.discoveredAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      <span className="mx-1">·</span>
                      via {opp.source}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setExpanded(isExpanded ? null : opp.id)}
                        className="text-muted-foreground/50 hover:text-foreground p-1"
                      >
                        <Eye className="h-3 w-3" />
                      </button>
                      {opp.status !== "captured" && opp.status !== "won" && opp.status !== "rejected" && (
                        <>
                          {status.next && (
                            <button
                              onClick={() => advanceStatus(opp.id, opp.status as Status)}
                              className="text-primary/70 hover:text-primary p-1"
                              title={status.nextLabel}
                            >
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            onClick={() => rejectOpp(opp.id)}
                            className="text-muted-foreground/50 hover:text-destructive p-1"
                          >
                            <XCircle className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {opp.tags && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {opp.tags.split(",").map(t => t.trim()).filter(Boolean).map(t => (
                        <span key={t} className="text-[9px] text-muted-foreground/60 bg-muted/30 rounded px-1.5 py-0.5">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

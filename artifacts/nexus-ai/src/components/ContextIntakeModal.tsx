import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateMemoryEntry,
  getListMemoryEntriesQueryKey,
  getGetMemoryCategorySummaryQueryKey,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2, Target, AlertTriangle, Sparkles, Users, Folder,
  Tag, X, ChevronRight, ChevronLeft, Save, FileText, Briefcase,
  TrendingUp, BookOpen, DollarSign, Shield, ArrowRight,
} from "lucide-react";

const CATEGORIES = [
  { id: "decision",       label: "Decision",       icon: CheckCircle2, color: "text-purple-400",  ring: "ring-purple-400/50 bg-purple-400/10" },
  { id: "task",           label: "Task",            icon: Briefcase,    color: "text-cyan-400",    ring: "ring-cyan-400/50 bg-cyan-400/10" },
  { id: "client_note",    label: "Client Note",     icon: Users,        color: "text-emerald-400", ring: "ring-emerald-400/50 bg-emerald-400/10" },
  { id: "project_note",   label: "Project Note",    icon: Folder,       color: "text-blue-400",    ring: "ring-blue-400/50 bg-blue-400/10" },
  { id: "opportunity",    label: "Opportunity",     icon: TrendingUp,   color: "text-orange-400",  ring: "ring-orange-400/50 bg-orange-400/10" },
  { id: "lesson",         label: "Lesson",          icon: BookOpen,     color: "text-yellow-400",  ring: "ring-yellow-400/50 bg-yellow-400/10" },
  { id: "goal",           label: "Goal",            icon: Target,       color: "text-green-400",   ring: "ring-green-400/50 bg-green-400/10" },
  { id: "risk",           label: "Risk",            icon: AlertTriangle,color: "text-red-400",     ring: "ring-red-400/50 bg-red-400/10" },
  { id: "idea",           label: "Idea",            icon: Sparkles,     color: "text-violet-400",  ring: "ring-violet-400/50 bg-violet-400/10" },
  { id: "finance_note",   label: "Finance Note",    icon: DollarSign,   color: "text-yellow-300",  ring: "ring-yellow-300/50 bg-yellow-300/10" },
  { id: "operating_rule", label: "Operating Rule",  icon: Shield,       color: "text-indigo-400",  ring: "ring-indigo-400/50 bg-indigo-400/10" },
];

const PRIORITIES = [
  { id: "low",      label: "Low",      sel: "bg-muted/20 border-muted-foreground/50 text-foreground",  unsel: "border-border/30 text-muted-foreground/40" },
  { id: "medium",   label: "Medium",   sel: "bg-primary/15 border-primary text-primary",               unsel: "border-border/30 text-muted-foreground/40" },
  { id: "high",     label: "High",     sel: "bg-orange-400/15 border-orange-400 text-orange-400",      unsel: "border-border/30 text-muted-foreground/40" },
  { id: "critical", label: "Critical", sel: "bg-red-400/15 border-red-400 text-red-400",               unsel: "border-border/30 text-muted-foreground/40" },
];

const TAG_SUGGESTIONS = ["q3", "client", "urgent", "followup", "revenue", "product", "strategy", "risk"];

const STEPS = [
  { id: "title",    label: "Title",       optional: false },
  { id: "notes",    label: "Notes",       optional: false },
  { id: "category", label: "Category",    optional: false },
  { id: "tags",     label: "Tags",        optional: true  },
  { id: "priority", label: "Priority",    optional: false },
  { id: "people",   label: "People",      optional: true  },
  { id: "project",  label: "Project",     optional: true  },
  { id: "action",   label: "Next Action", optional: true  },
  { id: "review",   label: "Review",      optional: false },
];

function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [val, setVal] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  function add(v = val) {
    const t = v.trim().replace(/,/g, "");
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setVal("");
  }

  return (
    <div>
      <div
        className="min-h-[72px] border border-border/50 rounded-xl p-3 flex flex-wrap gap-2 cursor-text bg-background/40 focus-within:border-primary/40 transition-colors"
        onClick={() => ref.current?.focus()}
      >
        {tags.map((t) => (
          <span key={t} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
            <Tag className="h-2.5 w-2.5 flex-shrink-0" />
            {t}
            <button onClick={(e) => { e.stopPropagation(); onChange(tags.filter(x => x !== t)); }}>
              <X className="h-2.5 w-2.5 text-primary/50 hover:text-primary ml-0.5" />
            </button>
          </span>
        ))}
        <input
          ref={ref}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
            if (e.key === "Backspace" && !val && tags.length) onChange(tags.slice(0, -1));
          }}
          placeholder={tags.length === 0 ? "Type a tag, press Enter…" : "Add more…"}
          className="flex-1 min-w-[100px] bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground/40"
        />
      </div>
      {tags.length === 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {TAG_SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => add(s)}
              className="px-2.5 py-1 rounded-full border border-border/30 text-[10px] text-muted-foreground/60 hover:border-primary/30 hover:text-primary/70 transition-colors">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`h-0.5 flex-1 rounded-full transition-all duration-300 ${
          i < step ? "bg-primary" : i === step ? "bg-primary/40" : "bg-border/25"
        }`} />
      ))}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-2 border-b border-border/20 last:border-0 items-start">
      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 w-14 pt-0.5 flex-shrink-0">{label}</span>
      <span className="text-xs text-foreground flex-1 leading-relaxed">{value}</span>
    </div>
  );
}

function OptLabel() {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">Optional</span>
      <div className="flex-1 h-px bg-border/20" />
    </div>
  );
}

interface FormState {
  title: string;
  notes: string;
  category: string;
  tags: string[];
  priority: string;
  relatedPerson: string;
  relatedCompany: string;
  project: string;
  nextAction: string;
}

const EMPTY: FormState = {
  title: "", notes: "", category: "", tags: [], priority: "medium",
  relatedPerson: "", relatedCompany: "", project: "", nextAction: "",
};

export function ContextIntakeModal({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const create = useCreateMemoryEntry();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY);

  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function reset() { setStep(0); setForm(EMPTY); }
  function handleOpen(v: boolean) { if (!v) reset(); setOpen(v); }
  function next() { setStep((s) => Math.min(s + 1, STEPS.length - 1)); }
  function back() { setStep((s) => Math.max(s - 1, 0)); }

  function canNext() {
    if (step === 0) return form.title.trim().length > 0;
    if (step === 1) return form.notes.trim().length > 0;
    if (step === 2) return form.category !== "";
    return true;
  }

  async function save() {
    await create.mutateAsync({
      data: {
        title: form.title.trim(),
        content: form.notes.trim(),
        category: form.category,
        tags: form.tags.join(", ") || undefined,
        priority: form.priority,
        status: "active",
        source: "manual",
        relatedPeople: form.relatedPerson.trim() || undefined,
        relatedCompanies: form.relatedCompany.trim() || undefined,
        linkedProjects: form.project.trim() || undefined,
        nextAction: form.nextAction.trim() || undefined,
      },
    });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListMemoryEntriesQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetMemoryCategorySummaryQueryKey() }),
    ]);
    handleOpen(false);
  }

  const cat = CATEGORIES.find((c) => c.id === form.category);
  const pri = PRIORITIES.find((p) => p.id === form.priority);
  const isOptional = STEPS[step]?.optional;
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md p-0 gap-0 border-border/40 bg-card shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-border/25">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/15 border border-primary/25 flex items-center justify-center">
                <FileText className="h-3 w-3 text-primary" />
              </div>
              <span className="text-[11px] font-bold tracking-widest text-primary uppercase">Add Context</span>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground/40">
              {step + 1} / {STEPS.length} · {STEPS[step].label}
            </span>
          </div>
          <StepBar step={step} total={STEPS.length} />
        </div>

        {/* Body */}
        <div className="px-5 py-5 min-h-[264px]">

          {/* Step 0 — Title */}
          {step === 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">What is this about?</p>
              <Input
                autoFocus
                value={form.title}
                onChange={(e) => set("title")(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && canNext() && next()}
                placeholder="e.g. Decision to pause paid ads in Q3"
                className="bg-background/50 border-border/50 focus-visible:ring-primary/40 h-11 text-sm"
              />
              <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
                A specific title surfaces this in Orchestrator briefings and makes it searchable.
              </p>
            </div>
          )}

          {/* Step 1 — Notes */}
          {step === 1 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Paste your notes</p>
              <Textarea
                autoFocus
                value={form.notes}
                onChange={(e) => set("notes")(e.target.value)}
                placeholder="Paste raw notes, context, meeting output, or any detail here…"
                className="min-h-[184px] resize-none bg-background/50 border-border/50 focus-visible:ring-primary/40 text-sm leading-relaxed"
              />
              <p className="text-[10px] text-muted-foreground/40 text-right">{form.notes.length} chars</p>
            </div>
          )}

          {/* Step 2 — Category */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Type of context</p>
              <div className="grid grid-cols-4 gap-1.5">
                {CATEGORIES.map((c) => {
                  const Icon = c.icon;
                  const sel = form.category === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => set("category")(c.id)}
                      className={`flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl border transition-all duration-150 ${
                        sel ? `ring-2 ${c.ring} border-transparent` : "border-border/30 hover:border-border/60 bg-background/20"
                      }`}
                    >
                      <Icon className={`h-3.5 w-3.5 ${c.color}`} />
                      <span className={`text-[9px] font-medium text-center leading-tight ${sel ? c.color : "text-muted-foreground/55"}`}>
                        {c.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3 — Tags */}
          {step === 3 && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Tags</p>
                <p className="text-[11px] text-muted-foreground/50 mt-0.5">Helps the Orchestrator find and cross-reference this context</p>
              </div>
              <TagInput tags={form.tags} onChange={set("tags")} />
            </div>
          )}

          {/* Step 4 — Priority */}
          {step === 4 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">How important is this?</p>
              <div className="grid grid-cols-2 gap-2">
                {PRIORITIES.map((p) => {
                  const sel = form.priority === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => set("priority")(p.id)}
                      className={`py-4 rounded-xl border-2 font-semibold text-sm transition-all duration-150 ${
                        sel ? p.sel : `border-border/30 bg-background/20 ${p.unsel}`
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 5 — People & Company */}
          {step === 5 && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-foreground">Who is involved?</p>
              <OptLabel />
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 block mb-1.5">Person</label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/35" />
                    <Input autoFocus value={form.relatedPerson}
                      onChange={(e) => set("relatedPerson")(e.target.value)}
                      placeholder="e.g. Amara Diallo"
                      className="pl-9 bg-background/50 border-border/50 focus-visible:ring-primary/40 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 block mb-1.5">Company</label>
                  <div className="relative">
                    <Folder className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/35" />
                    <Input value={form.relatedCompany}
                      onChange={(e) => set("relatedCompany")(e.target.value)}
                      placeholder="e.g. FlowStack SaaS"
                      className="pl-9 bg-background/50 border-border/50 focus-visible:ring-primary/40 text-sm" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 6 — Project */}
          {step === 6 && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-foreground">Link to a project?</p>
              <OptLabel />
              <div className="relative">
                <Folder className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/35" />
                <Input autoFocus value={form.project}
                  onChange={(e) => set("project")(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && next()}
                  placeholder="e.g. Q3 Growth Plan"
                  className="pl-9 bg-background/50 border-border/50 focus-visible:ring-primary/40 text-sm" />
              </div>
            </div>
          )}

          {/* Step 7 — Next Action */}
          {step === 7 && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-foreground">What should happen next?</p>
              <OptLabel />
              <div className="relative">
                <ArrowRight className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/35" />
                <Input autoFocus value={form.nextAction}
                  onChange={(e) => set("nextAction")(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && next()}
                  placeholder="e.g. Send proposal by Friday"
                  className="pl-9 bg-background/50 border-border/50 focus-visible:ring-primary/40 text-sm" />
              </div>
            </div>
          )}

          {/* Step 8 — Review */}
          {step === 8 && (
            <div>
              <p className="text-sm font-semibold text-foreground mb-3">Review before saving</p>
              <div className="bg-background/40 border border-border/25 rounded-xl px-4 py-1">
                <ReviewRow label="Title" value={form.title} />
                <ReviewRow label="Notes" value={
                  <span className="text-muted-foreground line-clamp-3 leading-relaxed">{form.notes}</span>
                } />
                <ReviewRow label="Category" value={cat && (
                  <span className={`inline-flex items-center gap-1.5 font-medium ${cat.color}`}>
                    <cat.icon className="h-3 w-3" /> {cat.label}
                  </span>
                )} />
                <ReviewRow label="Priority" value={
                  <span className={`font-semibold ${
                    form.priority === "critical" ? "text-red-400" :
                    form.priority === "high" ? "text-orange-400" :
                    form.priority === "medium" ? "text-primary" : "text-muted-foreground"
                  }`}>{pri?.label}</span>
                } />
                {form.tags.length > 0 && (
                  <ReviewRow label="Tags" value={
                    <div className="flex flex-wrap gap-1">
                      {form.tags.map((t) => (
                        <span key={t} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">{t}</span>
                      ))}
                    </div>
                  } />
                )}
                {(form.relatedPerson || form.relatedCompany) && (
                  <ReviewRow label="People" value={[form.relatedPerson, form.relatedCompany].filter(Boolean).join(" · ")} />
                )}
                {form.project && <ReviewRow label="Project" value={form.project} />}
                {form.nextAction && (
                  <ReviewRow label="Action" value={<span className="text-green-400 font-medium">{form.nextAction}</span>} />
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border/25 flex items-center justify-between gap-2">
          {step > 0 ? (
            <Button variant="ghost" size="sm" onClick={back} className="text-muted-foreground gap-1 px-2 h-8">
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </Button>
          ) : <div />}

          <div className="flex items-center gap-2">
            {isOptional && !isLast && (
              <button onClick={next}
                className="text-[11px] text-muted-foreground/45 hover:text-muted-foreground transition-colors px-1">
                Skip
              </button>
            )}
            {!isLast ? (
              <Button size="sm" onClick={next} disabled={!canNext()}
                className="bg-primary/90 hover:bg-primary text-primary-foreground gap-1 px-4 h-8">
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button size="sm" onClick={save} disabled={create.isPending}
                className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 px-5 h-8">
                <Save className="h-3.5 w-3.5" />
                {create.isPending ? "Saving…" : "Save to Memory"}
              </Button>
            )}
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}

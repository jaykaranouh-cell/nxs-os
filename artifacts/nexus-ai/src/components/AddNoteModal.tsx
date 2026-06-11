import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateMemoryEntry, getListMemoryEntriesQueryKey, getGetMemoryCategorySummaryQueryKey } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2, Lightbulb, Target, AlertTriangle, Sparkles,
  Users, Folder, Tag, X, ChevronRight, ChevronLeft, Save,
  FileText, Briefcase, TrendingUp, BookOpen,
} from "lucide-react";

// ─── Category definitions (user-requested) ────────────────────────────────────

const CATEGORIES = [
  { id: "decision",     label: "Decision",      icon: CheckCircle2,  color: "text-purple-400", ring: "ring-purple-400/60 bg-purple-400/10", bg: "bg-purple-400/8" },
  { id: "task",         label: "Task",          icon: Briefcase,     color: "text-cyan-400",   ring: "ring-cyan-400/60 bg-cyan-400/10",    bg: "bg-cyan-400/8" },
  { id: "client_note",  label: "Client Note",   icon: Users,         color: "text-emerald-400",ring: "ring-emerald-400/60 bg-emerald-400/10",bg: "bg-emerald-400/8" },
  { id: "project_note", label: "Project Note",  icon: Folder,        color: "text-blue-400",   ring: "ring-blue-400/60 bg-blue-400/10",    bg: "bg-blue-400/8" },
  { id: "opportunity",  label: "Opportunity",   icon: TrendingUp,    color: "text-orange-400", ring: "ring-orange-400/60 bg-orange-400/10",bg: "bg-orange-400/8" },
  { id: "lesson",       label: "Lesson",        icon: BookOpen,      color: "text-yellow-400", ring: "ring-yellow-400/60 bg-yellow-400/10",bg: "bg-yellow-400/8" },
  { id: "goal",         label: "Goal",          icon: Target,        color: "text-green-400",  ring: "ring-green-400/60 bg-green-400/10",  bg: "bg-green-400/8" },
  { id: "risk",         label: "Risk",          icon: AlertTriangle, color: "text-red-400",    ring: "ring-red-400/60 bg-red-400/10",      bg: "bg-red-400/8" },
  { id: "idea",         label: "Idea",          icon: Sparkles,      color: "text-violet-400", ring: "ring-violet-400/60 bg-violet-400/10",bg: "bg-violet-400/8" },
];

const PRIORITIES = [
  { id: "low",      label: "Low",      color: "text-muted-foreground border-border/50", active: "bg-muted/20 border-muted-foreground/50 text-foreground" },
  { id: "medium",   label: "Medium",   color: "text-primary/70 border-primary/30",      active: "bg-primary/15 border-primary/60 text-primary" },
  { id: "high",     label: "High",     color: "text-orange-400/70 border-orange-400/30",active: "bg-orange-400/15 border-orange-400/60 text-orange-400" },
  { id: "critical", label: "Critical", color: "text-red-400/70 border-red-400/30",      active: "bg-red-400/15 border-red-400/60 text-red-400" },
];

const STEPS = ["Note", "Category", "Tags", "Priority", "Title", "Review"];

// ─── Tag chip input ───────────────────────────────────────────────────────────

function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [val, setVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function add() {
    const trimmed = val.trim().replace(/,/g, "");
    if (trimmed && !tags.includes(trimmed)) onChange([...tags, trimmed]);
    setVal("");
  }

  return (
    <div
      className="min-h-[80px] border border-border/50 rounded-xl p-3 flex flex-wrap gap-2 cursor-text bg-background/50"
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((t) => (
        <span key={t} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
          <Tag className="h-2.5 w-2.5" />
          {t}
          <button onClick={(e) => { e.stopPropagation(); onChange(tags.filter(x => x !== t)); }} className="ml-0.5 text-primary/60 hover:text-primary">
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
          if (e.key === "Backspace" && !val && tags.length) onChange(tags.slice(0, -1));
        }}
        placeholder={tags.length === 0 ? "Type a tag and press Enter…" : "Add another…"}
        className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground/40"
      />
    </div>
  );
}

// ─── Step progress bar ────────────────────────────────────────────────────────

function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-all duration-300 ${
            i < step ? "bg-primary" : i === step ? "bg-primary/50" : "bg-border/40"
          }`}
        />
      ))}
    </div>
  );
}

// ─── Review row ──────────────────────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5 border-b border-border/30 last:border-0">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 w-20 pt-0.5 flex-shrink-0">{label}</span>
      <span className="text-sm text-foreground flex-1">{value}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface AddNoteModalProps {
  children: React.ReactNode;
}

export function AddNoteModal({ children }: AddNoteModalProps) {
  const queryClient = useQueryClient();
  const create = useCreateMemoryEntry();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [priority, setPriority] = useState("medium");
  const [title, setTitle] = useState("");

  function reset() {
    setStep(0);
    setContent("");
    setCategory("");
    setTags([]);
    setPriority("medium");
    setTitle("");
  }

  function handleOpen(v: boolean) {
    if (!v) reset();
    setOpen(v);
  }

  function canNext() {
    if (step === 0) return content.trim().length > 0;
    if (step === 1) return category !== "";
    if (step === 4) return title.trim().length > 0;
    return true;
  }

  function next() {
    if (step === 4 && !title.trim()) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function save() {
    await create.mutateAsync({
      data: {
        title: title.trim(),
        content: content.trim(),
        category,
        tags: tags.join(", "),
        priority,
        status: "active",
      },
    });
    await queryClient.invalidateQueries({ queryKey: getListMemoryEntriesQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getGetMemoryCategorySummaryQueryKey() });
    handleOpen(false);
  }

  const selectedCat = CATEGORIES.find((c) => c.id === category);
  const selectedPri = PRIORITIES.find((p) => p.id === priority);

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md p-0 gap-0 border-border/50 bg-card shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-6 pb-0">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-widest text-primary">Add Note</span>
          </div>
          <p className="text-[11px] text-muted-foreground mb-4">
            Step {step + 1} of {STEPS.length} — {STEPS[step]}
          </p>
          <StepBar step={step} total={STEPS.length} />
        </div>

        {/* Body */}
        <div className="px-6 pb-2 min-h-[260px]">

          {/* Step 0 — Note content */}
          {step === 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">What's the note?</p>
              <Textarea
                autoFocus
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste or type your business note here…"
                className="min-h-[180px] resize-none bg-background/50 border-border/50 focus-visible:ring-primary/40 text-sm leading-relaxed"
              />
              <p className="text-[10px] text-muted-foreground/50 text-right">{content.length} chars</p>
            </div>
          )}

          {/* Step 1 — Category */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">What type of note is this?</p>
              <div className="grid grid-cols-3 gap-2">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const selected = category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setCategory(cat.id)}
                      className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border transition-all duration-150 ${
                        selected
                          ? `ring-2 ${cat.ring} border-transparent`
                          : "border-border/40 hover:border-border/70 bg-background/30"
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${cat.color}`} />
                      <span className={`text-[10px] font-medium leading-tight text-center ${selected ? cat.color : "text-muted-foreground"}`}>
                        {cat.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2 — Tags */}
          {step === 2 && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground">Add tags</p>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">Optional — helps with search and filtering</p>
              </div>
              <TagInput tags={tags} onChange={setTags} />
              {tags.length === 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {["q3", "client", "urgent", "followup", "revenue", "product"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setTags((t) => t.includes(s) ? t : [...t, s])}
                      className="px-2.5 py-1 rounded-full border border-border/30 text-[10px] text-muted-foreground/60 hover:border-primary/30 hover:text-primary/70 transition-colors"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3 — Priority */}
          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">How urgent is this?</p>
              <div className="grid grid-cols-2 gap-2">
                {PRIORITIES.map((p) => {
                  const selected = priority === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setPriority(p.id)}
                      className={`py-4 rounded-xl border-2 font-semibold text-sm transition-all duration-150 ${
                        selected ? p.active : `border-border/30 bg-background/30 ${p.color}`
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 4 — Title / Next Action */}
          {step === 4 && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground">Give it a title</p>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">A short label or next action for this note</p>
              </div>
              <Input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && canNext() && next()}
                placeholder="e.g. Follow up with Amara re: proposal"
                className="bg-background/50 border-border/50 focus-visible:ring-primary/40"
              />
              {title === "" && content.length > 0 && (
                <button
                  onClick={() => setTitle(content.slice(0, 60).trim())}
                  className="text-[10px] text-primary/60 hover:text-primary transition-colors"
                >
                  ↑ Use first line of note
                </button>
              )}
            </div>
          )}

          {/* Step 5 — Review */}
          {step === 5 && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground mb-3">Review before saving</p>
              <div className="bg-background/50 border border-border/40 rounded-xl px-4 py-1">
                <ReviewRow label="Title" value={title} />
                <ReviewRow label="Note" value={
                  <span className="text-muted-foreground text-xs line-clamp-3 leading-relaxed">{content}</span>
                } />
                <ReviewRow label="Category" value={
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${selectedCat?.color}`}>
                    {selectedCat && <selectedCat.icon className="h-3 w-3" />}
                    {selectedCat?.label}
                  </span>
                } />
                {tags.length > 0 && (
                  <ReviewRow label="Tags" value={
                    <div className="flex flex-wrap gap-1">
                      {tags.map((t) => (
                        <span key={t} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">{t}</span>
                      ))}
                    </div>
                  } />
                )}
                <ReviewRow label="Priority" value={
                  <span className={`text-xs font-semibold ${selectedPri?.active.split(" ").find(c => c.startsWith("text-")) ?? "text-primary"}`}>
                    {selectedPri?.label}
                  </span>
                } />
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="px-6 py-4 border-t border-border/30 flex items-center justify-between gap-3 mt-2">
          {step > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)} className="text-muted-foreground">
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          ) : (
            <div />
          )}

          {step < STEPS.length - 1 ? (
            <Button
              size="sm"
              onClick={next}
              disabled={!canNext()}
              className="bg-primary/90 hover:bg-primary text-primary-foreground px-5"
            >
              {step === 2 || step === 3 ? "Continue" : "Next"}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={save}
              disabled={create.isPending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-5"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {create.isPending ? "Saving…" : "Save to Memory"}
            </Button>
          )}
        </div>

      </DialogContent>
    </Dialog>
  );
}

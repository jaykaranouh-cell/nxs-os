/**
 * Objectives — multi-day plays the team drives toward, with progress and
 * steps. Shown on the Command Centre.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListObjectives,
  useCreateObjective,
  useAddObjectiveStep,
  useUpdateObjectiveProgress,
  getListObjectivesQueryKey,
} from "@workspace/api-client-react";
import { Target, Plus, Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const OWNER_LABEL: Record<string, string> = {
  orchestrator: "Maya", sales: "Rex", finance: "Vera", research: "Atlas", marketing: "Echo",
};

export function Objectives() {
  const queryClient = useQueryClient();
  const { data: objectives } = useListObjectives();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListObjectivesQueryKey() });
  const create = useCreateObjective({ mutation: { onSuccess: invalidate } });
  const addStep = useAddObjectiveStep({ mutation: { onSuccess: invalidate } });
  const updateProgress = useUpdateObjectiveProgress({ mutation: { onSuccess: invalidate } });

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [stepDraft, setStepDraft] = useState<Record<number, string>>({});

  const active = (objectives ?? []).filter((o) => o.status === "active");

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Target className="h-4 w-4 text-primary/80" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Objectives</h2>
        <span className="text-[10px] text-muted-foreground/50">multi-day plays the team is driving</span>
        <div className="flex-1" />
        <button onClick={() => setAdding((a) => !a)} className="text-[10px] text-primary/70 hover:text-primary flex items-center gap-0.5">
          <Plus className="h-3 w-3" /> new
        </button>
      </div>

      {adding && (
        <div className="flex gap-2 mb-4">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Objective, e.g. Close Grand Group retainer" className="h-9 text-xs" />
          <Button size="sm" className="h-9" disabled={!title.trim() || create.isPending}
            onClick={() => { create.mutate({ data: { title: title.trim() } }); setTitle(""); setAdding(false); }}>
            Create
          </Button>
        </div>
      )}

      {active.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/40 italic">No active objectives. Create one, or ask Maya to set one up.</p>
      ) : (
        <div className="space-y-4">
          {active.map((o) => (
            <div key={o.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white/85">{o.title}</div>
                  <div className="text-[9px] font-mono uppercase tracking-wider text-white/35 mt-0.5">
                    {OWNER_LABEL[o.ownerAgentId] ?? o.ownerAgentId}{o.targetDate ? ` · by ${o.targetDate}` : ""}
                  </div>
                </div>
                <span className="text-sm font-bold text-primary/90">{o.progress}%</span>
              </div>

              <div className="h-1.5 rounded-full bg-white/8 mt-2 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full transition-all" style={{ width: `${o.progress}%` }} />
              </div>

              <div className="mt-3 space-y-1">
                {o.steps.map((st) => (
                  <button
                    key={st.id}
                    onClick={() => !st.done && updateProgress.mutate({ id: o.id, data: { completeStep: st.title } })}
                    className="flex items-center gap-2 text-left w-full group"
                    disabled={st.done}
                  >
                    {st.done
                      ? <Check className="h-3 w-3 text-green-400 flex-shrink-0" />
                      : <Circle className="h-3 w-3 text-white/25 group-hover:text-primary flex-shrink-0" />}
                    <span className={`text-[11px] ${st.done ? "text-white/35 line-through" : "text-white/65"}`}>{st.title}</span>
                  </button>
                ))}
              </div>

              <div className="flex gap-2 mt-2">
                <Input
                  value={stepDraft[o.id] ?? ""}
                  onChange={(e) => setStepDraft((d) => ({ ...d, [o.id]: e.target.value }))}
                  placeholder="add a step…"
                  className="h-7 text-[11px]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (stepDraft[o.id] ?? "").trim()) {
                      addStep.mutate({ id: o.id, data: { title: stepDraft[o.id].trim() } });
                      setStepDraft((d) => ({ ...d, [o.id]: "" }));
                    }
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

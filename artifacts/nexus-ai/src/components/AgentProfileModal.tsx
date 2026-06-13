/**
 * Per-agent profile editor — instructions, skills, knowledge, and the agent's
 * own private memory. Opened from an agent card on the Agent Layer page.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAgentProfile,
  useSetAgentInstructions,
  useAddAgentKb,
  useDeleteAgentKb,
  getGetAgentProfileQueryKey,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BookOpen, Brain, Lightbulb, Plus, Trash2, Check } from "lucide-react";

export function AgentProfileModal({
  agentId,
  agentName,
  open,
  onOpenChange,
}: {
  agentId: string;
  agentName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: profile } = useGetAgentProfile(agentId);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetAgentProfileQueryKey(agentId) });

  const setInstructions = useSetAgentInstructions();
  const addKb = useAddAgentKb({ mutation: { onSuccess: invalidate } });
  const delKb = useDeleteAgentKb({ mutation: { onSuccess: invalidate } });

  const [instr, setInstr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const instrValue = instr ?? profile?.instructions ?? "";

  function saveInstructions() {
    setInstructions.mutate(
      { agentId, data: { instructions: instrValue } },
      { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); } }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" /> {agentName} — Profile
          </DialogTitle>
        </DialogHeader>

        {/* Instructions */}
        <section className="space-y-2">
          <h3 className="text-[10px] font-bold font-mono uppercase tracking-widest text-muted-foreground">
            Standing Instructions
          </h3>
          <Textarea
            value={instrValue}
            onChange={(e) => setInstr(e.target.value)}
            placeholder={`How should ${agentName} work? e.g. "Always quantify revenue impact. Flag any deal under $2K/mo as below floor."`}
            className="min-h-20 text-xs"
          />
          <Button size="sm" onClick={saveInstructions} disabled={setInstructions.isPending} className="gap-1.5">
            {saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : "Save instructions"}
          </Button>
        </section>

        <KbSection
          title="Playbooks"
          icon={<BookOpen className="h-3.5 w-3.5 text-violet-400" />}
          kind="skill"
          items={profile?.skills ?? []}
          onAdd={(title, content) => addKb.mutate({ agentId, data: { kind: "skill", title, content } })}
          onDelete={(id) => delKb.mutate({ agentId, kbId: id })}
          pending={addKb.isPending}
        />

        <KbSection
          title="Knowledge Base"
          icon={<BookOpen className="h-3.5 w-3.5 text-cyan-400" />}
          kind="knowledge"
          items={profile?.knowledge ?? []}
          onAdd={(title, content) => addKb.mutate({ agentId, data: { kind: "knowledge", title, content } })}
          onDelete={(id) => delKb.mutate({ agentId, kbId: id })}
          pending={addKb.isPending}
        />

        {/* Private memory (read-only — the agent writes these itself) */}
        <section className="space-y-2">
          <h3 className="text-[10px] font-bold font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <Lightbulb className="h-3.5 w-3.5 text-yellow-400" /> Private Memory
            <span className="text-muted-foreground/40 normal-case font-normal tracking-normal">— notes {agentName} saved</span>
          </h3>
          {profile?.memory.length ? (
            <div className="space-y-1.5">
              {profile.memory.map((m) => (
                <div key={m.id} className="rounded-lg border border-border/30 bg-card/30 px-3 py-2">
                  <div className="text-xs font-medium text-foreground">{m.title}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{m.content}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/40 italic">
              {agentName} hasn't saved any private notes yet. They accumulate as the agent works.
            </p>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}

function KbSection({
  title, icon, kind, items, onAdd, onDelete, pending,
}: {
  title: string;
  icon: React.ReactNode;
  kind: string;
  items: { id: number; title: string; content: string }[];
  onAdd: (title: string, content: string) => void;
  onDelete: (id: number) => void;
  pending: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [title2, setTitle2] = useState("");
  const [content, setContent] = useState("");

  function submit() {
    if (!title2.trim() || !content.trim()) return;
    onAdd(title2.trim(), content.trim());
    setTitle2(""); setContent(""); setAdding(false);
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-[10px] font-bold font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          {icon} {title}
        </h3>
        <button onClick={() => setAdding((a) => !a)} className="text-[10px] text-primary/70 hover:text-primary flex items-center gap-0.5">
          <Plus className="h-3 w-3" /> add
        </button>
      </div>
      {adding && (
        <div className="space-y-1.5 rounded-lg border border-primary/20 bg-primary/[0.03] p-2.5">
          <Input value={title2} onChange={(e) => setTitle2(e.target.value)} placeholder={`${kind} title`} className="h-8 text-xs" />
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Content" className="min-h-16 text-xs" />
          <Button size="sm" onClick={submit} disabled={pending || !title2.trim() || !content.trim()}>Add</Button>
        </div>
      )}
      {items.length ? (
        <div className="space-y-1.5">
          {items.map((it) => (
            <div key={it.id} className="flex items-start gap-2 rounded-lg border border-border/30 bg-card/30 px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground">{it.title}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 whitespace-pre-wrap break-words">{it.content}</div>
              </div>
              <button onClick={() => onDelete(it.id)} className="text-muted-foreground/40 hover:text-red-400 flex-shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        !adding && <p className="text-[11px] text-muted-foreground/40 italic">None yet.</p>
      )}
    </section>
  );
}

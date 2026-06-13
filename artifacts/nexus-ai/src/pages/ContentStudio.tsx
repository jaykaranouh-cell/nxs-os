/**
 * Content Studio — LinkedIn posts Maya & Echo draft for Jay to review and
 * publish. Jay keeps control of the actual publish: one tap copies the post
 * and opens LinkedIn's composer; "Mark posted" moves it out of the queue.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authHeaders } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Linkedin, Copy, ExternalLink, Check, Trash2, Plus, Sparkles, Clock, CheckCircle2,
} from "lucide-react";

interface Draft {
  id: number;
  platform: string;
  content: string;
  hook: string | null;
  status: string;
  createdBy: string;
  source: string | null;
  postedAt: string | null;
  createdAt: string;
}

const api = {
  list: async (): Promise<Draft[]> => {
    const r = await fetch("/api/content/drafts", { headers: authHeaders() });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  },
  create: async (content: string): Promise<Draft> => {
    const r = await fetch("/api/content/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content, platform: "linkedin", source: "manual", createdBy: "jay" }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  },
  markPosted: async (id: number) => {
    const r = await fetch(`/api/content/drafts/${id}/posted`, { method: "POST", headers: authHeaders() });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  },
  remove: async (id: number) => {
    const r = await fetch(`/api/content/drafts/${id}`, { method: "DELETE", headers: authHeaders() });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  },
};

function DraftCard({ draft, onChanged }: { draft: Draft; onChanged: () => void }) {
  const [copied, setCopied] = useState(false);
  const posted = draft.status === "posted";

  const post = async () => {
    try { await navigator.clipboard.writeText(draft.content); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch {}
    // LinkedIn no longer reliably prefills arbitrary text, so we copy to the
    // clipboard and open the composer — one paste and publish.
    window.open(`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(draft.content)}`, "_blank", "noopener");
  };

  return (
    <div className={`rounded-xl border p-4 ${posted ? "border-green-400/20 bg-green-400/[0.03]" : "border-white/10 bg-white/[0.02]"}`}>
      <div className="flex items-center gap-2 mb-2">
        <Linkedin className="h-3.5 w-3.5 text-[#0a66c2]" />
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50">
          {draft.createdBy === "maya" ? "Maya" : draft.createdBy} · {new Date(draft.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
        </span>
        <span className={`ml-auto flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${posted ? "text-green-400 bg-green-400/10" : "text-yellow-400/80 bg-yellow-400/10"}`}>
          {posted ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
          {posted ? "posted" : "draft"}
        </span>
      </div>
      <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-line">{draft.content}</p>
      {!posted && (
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-white/8">
          <Button size="sm" onClick={post} className="h-8 gap-1.5 bg-[#0a66c2] hover:bg-[#0a66c2]/85 text-white">
            {copied ? <Check className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
            {copied ? "Copied — paste & post" : "Copy & open LinkedIn"}
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 border-white/15 text-white/60"
            onClick={async () => { try { await navigator.clipboard.writeText(draft.content); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} }}>
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 border-green-400/25 text-green-400/80 hover:bg-green-400/10"
            onClick={async () => { await api.markPosted(draft.id); onChanged(); }}>
            <Check className="h-3.5 w-3.5" /> Mark posted
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-white/30 hover:text-red-400 ml-auto"
            onClick={async () => { await api.remove(draft.id); onChanged(); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ContentStudio() {
  const queryClient = useQueryClient();
  const { data: drafts, isLoading } = useQuery({ queryKey: ["content-drafts"], queryFn: api.list, refetchInterval: 20000 });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["content-drafts"] });
  const create = useMutation({ mutationFn: api.create, onSuccess: invalidate });

  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");

  const queue = (drafts ?? []).filter((d) => d.status !== "posted");
  const posted = (drafts ?? []).filter((d) => d.status === "posted");

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-1 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0a66c2]/15 border border-[#0a66c2]/30 flex items-center justify-center">
            <Linkedin className="h-5 w-5 text-[#0a66c2]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Content Studio</h1>
            <p className="text-xs text-muted-foreground">LinkedIn posts Maya drafts for you. Review, then publish in one tap.</p>
          </div>
          <Button size="sm" variant="outline" className="ml-auto h-8 gap-1.5 border-white/15" onClick={() => setAdding((a) => !a)}>
            <Plus className="h-3.5 w-3.5" /> New
          </Button>
        </div>

        {adding && (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
              placeholder="Write a post, or ask Maya in chat to draft one for you…" className="text-sm" />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setText(""); }}>Cancel</Button>
              <Button size="sm" disabled={!text.trim() || create.isPending}
                onClick={() => { create.mutate(text.trim()); setText(""); setAdding(false); }}>Add to queue</Button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary/60" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Ready to publish ({queue.length})</span>
          <div className="flex-1 h-px bg-white/8" />
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground/40 italic">Loading…</p>
        ) : queue.length === 0 ? (
          <p className="text-xs text-muted-foreground/40 italic px-1">
            No drafts yet. Ask Maya to "write me a LinkedIn post about…" and it'll show up here, or hit New.
          </p>
        ) : (
          <div className="space-y-3">
            {queue.map((d) => <DraftCard key={d.id} draft={d} onChanged={invalidate} />)}
          </div>
        )}

        {posted.length > 0 && (
          <>
            <div className="flex items-center gap-2 pt-3">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400/50" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">Posted ({posted.length})</span>
              <div className="flex-1 h-px bg-white/8" />
            </div>
            <div className="space-y-3 opacity-70">
              {posted.slice(0, 10).map((d) => <DraftCard key={d.id} draft={d} onChanged={invalidate} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

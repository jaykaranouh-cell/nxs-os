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
  Wand2, Download, Loader2, ImageIcon, AlertTriangle,
} from "lucide-react";

interface Draft {
  id: number;
  platform: string;
  content: string;
  hook: string | null;
  imageUrl: string | null;
  imagePrompt: string | null;
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
  genImage: async (id: number): Promise<Draft> => {
    const r = await fetch(`/api/content/drafts/${id}/image`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: "{}",
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      const e = new Error(j.error || `HTTP ${r.status}`) as Error & { code?: string };
      if (j.code) e.code = j.code;
      throw e;
    }
    return r.json();
  },
  status: async (): Promise<{ ready: boolean }> => {
    const r = await fetch("/api/content/higgsfield/status", { headers: authHeaders() });
    return r.ok ? r.json() : { ready: false };
  },
};

function DraftCard({ draft, onChanged }: { draft: Draft; onChanged: () => void }) {
  const [copied, setCopied] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);
  const posted = draft.status === "posted";

  const genImage = async () => {
    setGenErr(null);
    setGenLoading(true);
    try {
      await api.genImage(draft.id);
      onChanged();
    } catch (e) {
      const err = e as Error & { code?: string };
      setGenErr(err.code === "not_connected"
        ? "Higgsfield isn't connected — run `higgsfield auth login` in your terminal once."
        : err.message || "Image generation failed.");
    } finally {
      setGenLoading(false);
    }
  };

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

      {/* Generated visual */}
      {draft.imageUrl && (
        <div className="mt-3 relative group/img">
          <img src={draft.imageUrl} alt="Generated visual" className="w-full rounded-lg border border-white/10" />
          <a href={draft.imageUrl} download
            className="absolute top-2 right-2 flex items-center gap-1 text-[10px] bg-black/60 backdrop-blur text-white/90 px-2 py-1 rounded-md opacity-0 group-hover/img:opacity-100 transition-opacity">
            <Download className="h-3 w-3" /> Save
          </a>
        </div>
      )}
      {genLoading && (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-primary/70 border border-primary/20 bg-primary/5 rounded-lg px-3 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating visual with Higgsfield… this takes up to a couple of minutes.
        </div>
      )}
      {genErr && (
        <div className="mt-3 flex items-start gap-2 text-[11px] text-yellow-400/90 border border-yellow-400/20 bg-yellow-400/5 rounded-lg px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" /> <span className="whitespace-pre-line">{genErr}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-white/8">
        {!posted && (
          <Button size="sm" onClick={post} className="h-8 gap-1.5 bg-[#0a66c2] hover:bg-[#0a66c2]/85 text-white">
            {copied ? <Check className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
            {copied ? "Copied — paste & post" : "Copy & open LinkedIn"}
          </Button>
        )}
        {/* Image generation is available on every draft, posted or not */}
        <Button size="sm" variant="outline" disabled={genLoading} onClick={genImage}
          className="h-8 gap-1.5 border-primary/25 text-primary/80 hover:bg-primary/10">
          {genLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : draft.imageUrl ? <Wand2 className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
          {draft.imageUrl ? "Regenerate image" : "Generate image"}
        </Button>
        {!posted && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5 border-white/15 text-white/60"
            onClick={async () => { try { await navigator.clipboard.writeText(draft.content); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} }}>
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
        )}
        {!posted && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5 border-green-400/25 text-green-400/80 hover:bg-green-400/10"
            onClick={async () => { await api.markPosted(draft.id); onChanged(); }}>
            <Check className="h-3.5 w-3.5" /> Mark posted
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-white/30 hover:text-red-400 ml-auto"
          onClick={async () => { await api.remove(draft.id); onChanged(); }}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function ContentStudio() {
  const queryClient = useQueryClient();
  const { data: drafts, isLoading } = useQuery({ queryKey: ["content-drafts"], queryFn: api.list, refetchInterval: 20000 });
  const { data: hf } = useQuery({ queryKey: ["higgsfield-status"], queryFn: api.status, refetchInterval: 60000 });
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

        {hf && !hf.ready && (
          <div className="flex items-start gap-2 text-[11px] text-yellow-400/90 border border-yellow-400/20 bg-yellow-400/5 rounded-lg px-3 py-2">
            <Wand2 className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>Image generation needs a one-time connect: run <code className="font-mono bg-black/30 px-1 rounded">higgsfield auth login</code> in your terminal. Posts still draft and publish fine without it.</span>
          </div>
        )}

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

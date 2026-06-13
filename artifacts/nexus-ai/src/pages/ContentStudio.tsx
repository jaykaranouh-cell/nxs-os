/**
 * Content Studio — multi-platform content creation for your own brand and
 * clients. Maya & Echo draft posts for LinkedIn, Instagram, TikTok and YouTube;
 * you generate visuals (Higgsfield image/video) and publish. LinkedIn publishes
 * via copy-and-open today; full auto-publish across platforms activates once a
 * scheduler (Blotato) is connected.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authHeaders } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FaLinkedin, FaInstagram, FaTiktok, FaYoutube } from "react-icons/fa6";
import {
  Clapperboard, Copy, ExternalLink, Check, Trash2, Plus, Sparkles, Clock,
  CheckCircle2, Wand2, Download, Loader2, ImageIcon, AlertTriangle, Film, X, Send,
} from "lucide-react";
import type { IconType } from "react-icons";

// ─── Platform config ────────────────────────────────────────────────────────

type PlatformId = "linkedin" | "instagram" | "tiktok" | "youtube";
interface PlatformDef { id: PlatformId; label: string; Icon: IconType; color: string; openUrl: string; prefillsText: boolean }
const PLATFORMS: PlatformDef[] = [
  { id: "linkedin",  label: "LinkedIn",  Icon: FaLinkedin,  color: "#0a66c2", openUrl: "https://www.linkedin.com/feed/?shareActive=true&text=", prefillsText: true },
  { id: "instagram", label: "Instagram", Icon: FaInstagram, color: "#e1306c", openUrl: "https://www.instagram.com/", prefillsText: false },
  { id: "tiktok",    label: "TikTok",    Icon: FaTiktok,    color: "#25f4ee", openUrl: "https://www.tiktok.com/tiktokstudio/upload", prefillsText: false },
  { id: "youtube",   label: "YouTube",   Icon: FaYoutube,   color: "#ff0033", openUrl: "https://studio.youtube.com/", prefillsText: false },
];
const platform = (id: string) => PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[0];

// ─── Types ──────────────────────────────────────────────────────────────────

interface Draft {
  id: number; platform: string; brandId: number | null; content: string; hook: string | null;
  imageUrl: string | null; imagePrompt: string | null; videoUrl: string | null; videoModel: string | null;
  status: string; createdBy: string; source: string | null; postedAt: string | null; createdAt: string;
}
interface Brand { id: number; name: string; handle: string | null; isSelf: string; createdAt: string }
interface VideoModel { id: string; label: string; tier: "fast" | "premium" }

// ─── API ────────────────────────────────────────────────────────────────────

const j = async (r: Response) => { if (!r.ok) { const e = await r.json().catch(() => ({})); const err = new Error(e.error || `HTTP ${r.status}`) as Error & { code?: string }; if (e.code) err.code = e.code; throw err; } return r.json(); };
const api = {
  drafts: (): Promise<Draft[]> => fetch("/api/content/drafts", { headers: authHeaders() }).then(j),
  brands: (): Promise<Brand[]> => fetch("/api/content/brands", { headers: authHeaders() }).then(j),
  videoModels: (): Promise<VideoModel[]> => fetch("/api/content/video-models", { headers: authHeaders() }).then(j).catch(() => []),
  imageModels: (): Promise<VideoModel[]> => fetch("/api/content/image-models", { headers: authHeaders() }).then(j).catch(() => []),
  higgs: (): Promise<{ ready: boolean }> => fetch("/api/content/higgsfield/status", { headers: authHeaders() }).then(j).catch(() => ({ ready: false })),
  scheduler: (): Promise<{ scheduler: string | null }> => fetch("/api/content/publish/status", { headers: authHeaders() }).then(j).catch(() => ({ scheduler: null })),
  createDraft: (b: { content: string; platform: string; brandId: number | null }): Promise<Draft> =>
    fetch("/api/content/drafts", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ ...b, source: "manual", createdBy: "jay" }) }).then(j),
  addBrand: (name: string): Promise<Brand> =>
    fetch("/api/content/brands", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ name }) }).then(j),
  delBrand: (id: number) => fetch(`/api/content/brands/${id}`, { method: "DELETE", headers: authHeaders() }).then(j),
  markPosted: (id: number) => fetch(`/api/content/drafts/${id}/posted`, { method: "POST", headers: authHeaders() }).then(j),
  remove: (id: number) => fetch(`/api/content/drafts/${id}`, { method: "DELETE", headers: authHeaders() }).then(j),
  genImage: (id: number, model: string, prompt?: string): Promise<Draft> => fetch(`/api/content/drafts/${id}/image`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ model, prompt }) }).then(j),
  genVideo: (id: number, model: string, mode: "image" | "text", prompt?: string): Promise<Draft> =>
    fetch(`/api/content/drafts/${id}/video`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ model, mode, prompt }) }).then(j),
};

// ─── Draft card ───────────────────────────────────────────────────────────────

function DraftCard({ draft, brand, models, imgModels, onChanged }: { draft: Draft; brand?: Brand; models: VideoModel[]; imgModels: VideoModel[]; onChanged: () => void }) {
  const p = platform(draft.platform);
  const PIcon = p.Icon;
  const posted = draft.status === "posted";
  const [copied, setCopied] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [vidLoading, setVidLoading] = useState<"image" | "text" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [vidModel, setVidModel] = useState("veo3_1");
  const [imgModel, setImgModel] = useState("gpt_image_2");
  const [artPrompt, setArtPrompt] = useState("");
  const busy = genLoading || vidLoading !== null;
  const direction = () => (artPrompt.trim() ? artPrompt.trim() : undefined);

  const friendlyErr = (e: unknown) => {
    const x = e as Error & { code?: string };
    return x.code === "not_connected"
      ? "Higgsfield isn't connected — run `higgsfield auth login` in your terminal once."
      : x.message || "Something went wrong.";
  };
  const publish = async () => {
    try { await navigator.clipboard.writeText(draft.content); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch {}
    window.open(p.prefillsText ? p.openUrl + encodeURIComponent(draft.content) : p.openUrl, "_blank", "noopener");
  };
  const genImage = async () => { setErr(null); setGenLoading(true); try { await api.genImage(draft.id, imgModel, direction()); onChanged(); } catch (e) { setErr(friendlyErr(e)); } finally { setGenLoading(false); } };
  const makeVideo = async (mode: "image" | "text") => { setErr(null); setVidLoading(mode); try { await api.genVideo(draft.id, vidModel, mode, direction()); onChanged(); } catch (e) { setErr(friendlyErr(e)); } finally { setVidLoading(null); } };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
      {/* header strip */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/8" style={{ background: `linear-gradient(90deg, ${p.color}14, transparent)` }}>
        <PIcon size={15} color={p.color} />
        <span className="text-xs font-semibold text-white/85">{p.label}</span>
        {brand && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/8 text-white/60">{brand.isSelf === "true" ? "★ " : ""}{brand.name}</span>}
        <span className={`ml-auto flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${posted ? "text-green-400 bg-green-400/10" : "text-yellow-400/80 bg-yellow-400/10"}`}>
          {posted ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}{posted ? "posted" : "draft"}
        </span>
        <span className="text-[9px] text-white/30 font-mono">{new Date(draft.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>
      </div>

      <div className="p-4">
        <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-line">{draft.content}</p>

        {(draft.imageUrl || draft.videoUrl) && (
          <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: draft.imageUrl && draft.videoUrl ? "1fr 1fr" : "1fr" }}>
            {draft.imageUrl && (
              <div className="relative group/img">
                <img src={draft.imageUrl} alt="visual" className="w-full rounded-lg border border-white/10" />
                <a href={draft.imageUrl} download className="absolute top-2 right-2 flex items-center gap-1 text-[10px] bg-black/60 backdrop-blur text-white/90 px-2 py-1 rounded-md opacity-0 group-hover/img:opacity-100 transition-opacity"><Download className="h-3 w-3" /> Save</a>
              </div>
            )}
            {draft.videoUrl && (
              <div className="relative group/vid">
                <video src={draft.videoUrl} controls playsInline className="w-full rounded-lg border border-white/10 bg-black" />
                <a href={draft.videoUrl} download className="absolute top-2 right-2 flex items-center gap-1 text-[10px] bg-black/60 backdrop-blur text-white/90 px-2 py-1 rounded-md opacity-0 group-hover/vid:opacity-100 transition-opacity"><Download className="h-3 w-3" /> Save</a>
              </div>
            )}
          </div>
        )}

        {(genLoading || vidLoading) && (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-primary/70 border border-primary/20 bg-primary/5 rounded-lg px-3 py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {genLoading ? "Generating image with Higgsfield…" : `Generating ${vidLoading === "image" ? "video from your image" : "video"} — can take several minutes, leave the tab open.`}
          </div>
        )}
        {err && (
          <div className="mt-3 flex items-start gap-2 text-[11px] text-yellow-400/90 border border-yellow-400/20 bg-yellow-400/5 rounded-lg px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" /><span className="whitespace-pre-line">{err}</span>
          </div>
        )}

        {/* publish + utility row */}
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-white/8">
          {!posted && (
            <Button size="sm" onClick={publish} className="h-8 gap-1.5 text-white" style={{ background: p.color }}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
              {copied ? "Copied — paste & post" : `Publish to ${p.label}`}
            </Button>
          )}
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

        {/* media generation row */}
        {/* Art direction — overrides the auto prompt for image & video */}
        <Textarea value={artPrompt} onChange={(e) => setArtPrompt(e.target.value)} rows={2} disabled={busy}
          placeholder="Art direction (optional) — describe exactly what the image/video should show, e.g. 'confident tradie on a job site at golden hour, shot on 35mm, shallow depth of field'"
          className="mt-3 text-[11px] resize-none bg-background/60" />

        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className="text-[9px] font-mono uppercase tracking-wider text-white/35 flex items-center gap-1"><Sparkles className="h-3 w-3" /> Media</span>
          <select value={imgModel} onChange={(e) => setImgModel(e.target.value)} disabled={busy}
            className="h-7 rounded-md bg-background border border-white/15 text-[11px] px-1.5 text-foreground/80">
            <optgroup label="Fast & affordable">{imgModels.filter((m) => m.tier === "fast").map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
            <optgroup label="Premium">{imgModels.filter((m) => m.tier === "premium").map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
          </select>
          <Button size="sm" variant="outline" disabled={busy} onClick={genImage} className="h-7 gap-1.5 border-primary/25 text-primary/80 hover:bg-primary/10 text-[11px]">
            {genLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : draft.imageUrl ? <Wand2 className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
            {draft.imageUrl ? "Regenerate image" : "Generate image"}
          </Button>
          <select value={vidModel} onChange={(e) => setVidModel(e.target.value)} disabled={busy}
            className="h-7 rounded-md bg-background border border-white/15 text-[11px] px-1.5 text-foreground/80">
            <optgroup label="Fast & affordable">{models.filter((m) => m.tier === "fast").map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
            <optgroup label="Premium">{models.filter((m) => m.tier === "premium").map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
          </select>
          <Button size="sm" variant="outline" disabled={busy || !draft.imageUrl} title={draft.imageUrl ? "Animate the image" : "Generate an image first"} onClick={() => makeVideo("image")} className="h-7 gap-1.5 border-violet-400/25 text-violet-300/80 hover:bg-violet-400/10 text-[11px]">
            {vidLoading === "image" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Film className="h-3 w-3" />} Animate
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => makeVideo("text")} className="h-7 gap-1.5 border-violet-400/25 text-violet-300/80 hover:bg-violet-400/10 text-[11px]">
            {vidLoading === "text" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Film className="h-3 w-3" />}{draft.videoUrl ? "Regenerate video" : "Video"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContentStudio() {
  const qc = useQueryClient();
  const { data: drafts } = useQuery({ queryKey: ["content-drafts"], queryFn: api.drafts, refetchInterval: 20000 });
  const { data: brands } = useQuery({ queryKey: ["content-brands"], queryFn: api.brands });
  const { data: vmodels } = useQuery({ queryKey: ["video-models"], queryFn: api.videoModels, staleTime: Infinity });
  const { data: imodels } = useQuery({ queryKey: ["image-models"], queryFn: api.imageModels, staleTime: Infinity });
  const { data: higgs } = useQuery({ queryKey: ["higgs-status"], queryFn: api.higgs, refetchInterval: 60000 });
  const { data: sched } = useQuery({ queryKey: ["sched-status"], queryFn: api.scheduler, refetchInterval: 60000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ["content-drafts"] });
  const refreshBrands = () => qc.invalidateQueries({ queryKey: ["content-brands"] });

  const [brandFilter, setBrandFilter] = useState<number | "all">("all");
  const [platFilter, setPlatFilter] = useState<PlatformId | "all">("all");
  const [composing, setComposing] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [draftPlatform, setDraftPlatform] = useState<PlatformId>("linkedin");
  const [draftBrand, setDraftBrand] = useState<number | "">("");
  const [addingBrand, setAddingBrand] = useState(false);
  const [brandName, setBrandName] = useState("");

  const models = vmodels ?? [];
  const brandList = brands ?? [];
  const brandById = useMemo(() => Object.fromEntries(brandList.map((b) => [b.id, b])), [brandList]);

  const create = useMutation({ mutationFn: api.createDraft, onSuccess: () => { refresh(); setDraftText(""); setComposing(false); } });
  const addBrand = useMutation({ mutationFn: api.addBrand, onSuccess: () => { refreshBrands(); setBrandName(""); setAddingBrand(false); } });

  const visible = (drafts ?? []).filter((d) =>
    (brandFilter === "all" || d.brandId === brandFilter) &&
    (platFilter === "all" || d.platform === platFilter)
  );
  const queue = visible.filter((d) => d.status !== "posted");
  const posted = visible.filter((d) => d.status === "posted");

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-1 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/25 to-violet-500/20 border border-primary/30 flex items-center justify-center">
            <Clapperboard className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground">Content Studio</h1>
            <p className="text-xs text-muted-foreground">Create content for every platform — your brand and your clients.</p>
          </div>
          <Button size="sm" className="ml-auto h-9 gap-1.5" onClick={() => setComposing((c) => !c)}><Plus className="h-4 w-4" /> New post</Button>
        </div>

        {/* Brand switcher */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] font-mono uppercase tracking-widest text-white/30 mr-1">Brand</span>
          <button onClick={() => setBrandFilter("all")} className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${brandFilter === "all" ? "border-primary/40 bg-primary/15 text-primary" : "border-white/10 text-white/50 hover:text-white/80"}`}>All</button>
          {brandList.map((b) => (
            <span key={b.id} className="group/brand relative">
              <button onClick={() => setBrandFilter(b.id)} className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${brandFilter === b.id ? "border-primary/40 bg-primary/15 text-primary" : "border-white/10 text-white/50 hover:text-white/80"}`}>
                {b.isSelf === "true" ? "★ " : ""}{b.name}
              </button>
              {b.isSelf !== "true" && (
                <button onClick={async () => { await api.delBrand(b.id); refreshBrands(); }} className="absolute -top-1 -right-1 hidden group-hover/brand:flex h-3.5 w-3.5 rounded-full bg-red-500/80 text-white items-center justify-center"><X className="h-2 w-2" /></button>
              )}
            </span>
          ))}
          {addingBrand ? (
            <span className="flex items-center gap-1">
              <input autoFocus value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Client name"
                onKeyDown={(e) => { if (e.key === "Enter" && brandName.trim()) addBrand.mutate(brandName.trim()); if (e.key === "Escape") setAddingBrand(false); }}
                className="h-7 w-28 rounded-full bg-background border border-white/15 text-[11px] px-2.5 text-foreground" />
              <button onClick={() => brandName.trim() && addBrand.mutate(brandName.trim())} className="text-primary/70 hover:text-primary"><Check className="h-3.5 w-3.5" /></button>
            </span>
          ) : (
            <button onClick={() => setAddingBrand(true)} className="text-[11px] px-2 py-1 rounded-full border border-dashed border-white/15 text-white/40 hover:text-white/70 flex items-center gap-0.5"><Plus className="h-3 w-3" /> client</button>
          )}
        </div>

        {/* Platform filter */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] font-mono uppercase tracking-widest text-white/30 mr-1">Platform</span>
          <button onClick={() => setPlatFilter("all")} className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${platFilter === "all" ? "border-white/40 bg-white/10 text-white" : "border-white/10 text-white/50 hover:text-white/80"}`}>All</button>
          {PLATFORMS.map((p) => {
            const PIcon = p.Icon; const active = platFilter === p.id;
            return (
              <button key={p.id} onClick={() => setPlatFilter(p.id)} className={`text-[11px] px-2.5 py-1 rounded-full border flex items-center gap-1.5 transition-colors ${active ? "text-white" : "border-white/10 text-white/50 hover:text-white/80"}`}
                style={active ? { borderColor: `${p.color}80`, background: `${p.color}22` } : undefined}>
                <PIcon size={12} color={active ? p.color : "currentColor"} /> {p.label}
              </button>
            );
          })}
        </div>

        {/* Connect banners */}
        {higgs && !higgs.ready && (
          <div className="flex items-start gap-2 text-[11px] text-yellow-400/90 border border-yellow-400/20 bg-yellow-400/5 rounded-lg px-3 py-2">
            <Wand2 className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" /><span>Image & video generation needs a one-time connect: run <code className="font-mono bg-black/30 px-1 rounded">higgsfield auth login</code> in your terminal.</span>
          </div>
        )}
        {sched && !sched.scheduler && (
          <div className="flex items-start gap-2 text-[11px] text-sky-300/90 border border-sky-400/20 bg-sky-400/5 rounded-lg px-3 py-2">
            <Send className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" /><span>One-click auto-publish to Instagram, TikTok & YouTube needs a scheduler. Add your <strong>Blotato</strong> API key to enable it. Until then, posts copy-and-open per platform.</span>
          </div>
        )}

        {/* Composer */}
        {composing && (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-white/10 overflow-hidden">
                {PLATFORMS.map((p) => { const PIcon = p.Icon; const a = draftPlatform === p.id; return (
                  <button key={p.id} onClick={() => setDraftPlatform(p.id)} title={p.label} className={`px-2.5 py-1.5 flex items-center gap-1.5 text-[11px] ${a ? "text-white" : "text-white/40 hover:text-white/70"}`} style={a ? { background: `${p.color}22` } : undefined}>
                    <PIcon size={13} color={a ? p.color : "currentColor"} /> <span className="hidden sm:inline">{p.label}</span>
                  </button>
                ); })}
              </div>
              <select value={draftBrand} onChange={(e) => setDraftBrand(e.target.value ? parseInt(e.target.value) : "")} className="h-8 rounded-md bg-background border border-white/15 text-[11px] px-2 text-foreground/80">
                <option value="">Own brand</option>
                {brandList.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <Textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} rows={5} placeholder="Write a post, or ask Maya in chat to draft one for you…" className="text-sm" />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => { setComposing(false); setDraftText(""); }}>Cancel</Button>
              <Button size="sm" disabled={!draftText.trim() || create.isPending}
                onClick={() => create.mutate({ content: draftText.trim(), platform: draftPlatform, brandId: draftBrand === "" ? (brandList.find((b) => b.isSelf === "true")?.id ?? null) : draftBrand })}>
                Add to queue
              </Button>
            </div>
          </div>
        )}

        {/* Queue */}
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary/60" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Ready to publish ({queue.length})</span>
          <div className="flex-1 h-px bg-white/8" />
        </div>
        {queue.length === 0 ? (
          <p className="text-xs text-muted-foreground/40 italic px-1">Nothing here yet. Hit “New post”, or ask Maya: “write me a TikTok hook for [client] about …”.</p>
        ) : (
          <div className="space-y-3">{queue.map((d) => <DraftCard key={d.id} draft={d} brand={d.brandId ? brandById[d.brandId] : undefined} models={models} imgModels={imodels ?? []} onChanged={refresh} />)}</div>
        )}

        {/* Posted */}
        {posted.length > 0 && (
          <>
            <div className="flex items-center gap-2 pt-3">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400/50" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">Posted ({posted.length})</span>
              <div className="flex-1 h-px bg-white/8" />
            </div>
            <div className="space-y-3 opacity-70">{posted.slice(0, 12).map((d) => <DraftCard key={d.id} draft={d} brand={d.brandId ? brandById[d.brandId] : undefined} models={models} imgModels={imodels ?? []} onChanged={refresh} />)}</div>
          </>
        )}
      </div>
    </div>
  );
}

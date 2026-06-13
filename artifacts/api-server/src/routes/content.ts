/**
 * Content drafts — LinkedIn (and future) posts Maya/Echo write for Jay to
 * review and publish. Jay keeps control of the actual publish; these endpoints
 * just manage the draft queue.
 */
import { Router } from "express";
import { db, contentDraftsTable, insertContentDraftSchema } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { generateImage, generateVideo, higgsfieldReady, HiggsfieldNotReady, VIDEO_MODELS, GENERATED_DIR } from "../lib/higgsfield";
import path from "node:path";

const router = Router();

/** Build a clean visual prompt from a post when Jay doesn't supply one. */
function imagePromptFor(content: string, override?: string): string {
  if (override && override.trim()) return override.trim();
  const gist = content.replace(/\s+/g, " ").slice(0, 220);
  return `Professional, modern LinkedIn marketing visual. Clean minimal tech aesthetic, deep blue and cyan palette, soft studio lighting, high detail, no text, no logos. Concept based on this post: ${gist}`;
}

const serialize = (d: typeof contentDraftsTable.$inferSelect) => ({
  ...d,
  postedAt: d.postedAt ? d.postedAt.toISOString() : null,
  createdAt: d.createdAt.toISOString(),
});

// GET /content/drafts?status=draft
router.get("/content/drafts", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const rows = await db
    .select()
    .from(contentDraftsTable)
    .orderBy(desc(contentDraftsTable.createdAt))
    .limit(100);
  const filtered = status ? rows.filter((r) => r.status === status) : rows;
  res.json(filtered.map(serialize));
});

// POST /content/drafts  { content, platform?, hook?, source? }
router.post("/content/drafts", async (req, res) => {
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!content) {
    res.status(400).json({ error: "content is required" });
    return;
  }
  const values = insertContentDraftSchema.parse({
    content,
    platform: typeof req.body?.platform === "string" ? req.body.platform : "linkedin",
    hook: typeof req.body?.hook === "string" ? req.body.hook : null,
    source: typeof req.body?.source === "string" ? req.body.source : "manual",
    createdBy: typeof req.body?.createdBy === "string" ? req.body.createdBy : "jay",
    status: "draft",
  });
  const [row] = await db.insert(contentDraftsTable).values(values).returning();
  res.status(201).json(serialize(row));
});

// POST /content/drafts/:id/posted — mark a draft as published
router.post("/content/drafts/:id/posted", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db
    .update(contentDraftsTable)
    .set({ status: "posted", postedAt: new Date() })
    .where(eq(contentDraftsTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serialize(row));
});

// GET /content/higgsfield/status — is image generation connected?
router.get("/content/higgsfield/status", async (_req, res) => {
  res.json({ ready: await higgsfieldReady() });
});

// POST /content/drafts/:id/image — generate a visual for a draft (optional { prompt })
router.post("/content/drafts/:id/image", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [draft] = await db.select().from(contentDraftsTable).where(eq(contentDraftsTable.id, id));
  if (!draft) { res.status(404).json({ error: "Not found" }); return; }

  const prompt = imagePromptFor(draft.content, typeof req.body?.prompt === "string" ? req.body.prompt : undefined);
  try {
    const imageUrl = await generateImage(prompt, `draft${id}`);
    const [row] = await db
      .update(contentDraftsTable)
      .set({ imageUrl, imagePrompt: prompt })
      .where(eq(contentDraftsTable.id, id))
      .returning();
    res.json(serialize(row));
  } catch (err) {
    if (err instanceof HiggsfieldNotReady) {
      res.status(409).json({ error: err.message, code: "not_connected" });
      return;
    }
    res.status(502).json({ error: (err as Error).message || "Image generation failed" });
  }
});

// GET /content/video-models — curated models for the picker
router.get("/content/video-models", (_req, res) => {
  res.json(VIDEO_MODELS);
});

// POST /content/drafts/:id/video  { model, mode: "image" | "text" }
router.post("/content/drafts/:id/video", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [draft] = await db.select().from(contentDraftsTable).where(eq(contentDraftsTable.id, id));
  if (!draft) { res.status(404).json({ error: "Not found" }); return; }

  const model = typeof req.body?.model === "string" ? req.body.model : "seedance_2_0";
  const mode = req.body?.mode === "image" ? "image" : "text";

  let startImagePath: string | undefined;
  if (mode === "image") {
    if (!draft.imageUrl) { res.status(400).json({ error: "Generate an image first to animate it." }); return; }
    startImagePath = path.join(GENERATED_DIR, path.basename(draft.imageUrl));
  }

  const gist = draft.content.replace(/\s+/g, " ").slice(0, 200);
  const prompt = mode === "image"
    ? `Subtle cinematic motion, slow camera push-in, gentle parallax, professional and brand-safe. Scene context: ${gist}`
    : `Short professional LinkedIn marketing video, modern minimal tech aesthetic, deep blue and cyan palette, cinematic lighting, no on-screen text. Concept: ${gist}`;

  try {
    const videoUrl = await generateVideo(prompt, { model, startImagePath }, `draft${id}`);
    const [row] = await db
      .update(contentDraftsTable)
      .set({ videoUrl, videoModel: model })
      .where(eq(contentDraftsTable.id, id))
      .returning();
    res.json(serialize(row));
  } catch (err) {
    if (err instanceof HiggsfieldNotReady) {
      res.status(409).json({ error: err.message, code: "not_connected" });
      return;
    }
    res.status(502).json({ error: (err as Error).message || "Video generation failed" });
  }
});

// DELETE /content/drafts/:id
router.delete("/content/drafts/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(contentDraftsTable).where(eq(contentDraftsTable.id, id));
  res.json({ ok: true });
});

export default router;

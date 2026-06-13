/**
 * Content drafts — LinkedIn (and future) posts Maya/Echo write for Jay to
 * review and publish. Jay keeps control of the actual publish; these endpoints
 * just manage the draft queue.
 */
import { Router } from "express";
import { db, contentDraftsTable, insertContentDraftSchema } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

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

// DELETE /content/drafts/:id
router.delete("/content/drafts/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(contentDraftsTable).where(eq(contentDraftsTable.id, id));
  res.json({ ok: true });
});

export default router;

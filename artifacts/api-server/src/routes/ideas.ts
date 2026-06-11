import { Router } from "express";
import { db } from "@workspace/db";
import { ideasTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { CreateIdeaBody, UpdateIdeaBody } from "@workspace/api-zod";

const router = Router();

// GET /ideas
router.get("/ideas", async (req, res) => {
  const { agentId, status } = req.query as { agentId?: string; status?: string };
  const rows = await db.select().from(ideasTable).orderBy(desc(ideasTable.createdAt));
  let filtered = rows;
  if (agentId) filtered = filtered.filter((r) => r.agentId === agentId);
  if (status) filtered = filtered.filter((r) => r.status === status);
  res.json(filtered.map(serializeIdea));
});

// POST /ideas
router.post("/ideas", async (req, res) => {
  const parsed = CreateIdeaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid idea data" });
    return;
  }
  const [idea] = await db.insert(ideasTable).values(parsed.data).returning();
  res.status(201).json(serializeIdea(idea));
});

// GET /ideas/pending/count
router.get("/ideas/pending/count", async (req, res) => {
  const rows = await db.select().from(ideasTable).where(eq(ideasTable.status, "pending"));
  res.json({ count: rows.length });
});

// PATCH /ideas/:id
router.patch("/ideas/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const parsed = UpdateIdeaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid data" });
    return;
  }
  const [idea] = await db
    .update(ideasTable)
    .set(parsed.data)
    .where(eq(ideasTable.id, id))
    .returning();
  if (!idea) {
    res.status(404).json({ error: "Idea not found" });
    return;
  }
  res.json(serializeIdea(idea));
});

function serializeIdea(idea: typeof ideasTable.$inferSelect) {
  return {
    ...idea,
    createdAt: idea.createdAt.toISOString(),
  };
}

export default router;

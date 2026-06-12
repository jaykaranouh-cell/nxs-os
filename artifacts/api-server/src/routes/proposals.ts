import { Router } from "express";
import { db, memoryProposalsTable, memoryEntriesTable, insertMemoryEntrySchema } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

const router = Router();

// GET /memory/proposals
router.get("/memory/proposals", async (req, res) => {
  const status = (req.query.status as string) || "pending";
  const rows = await db
    .select()
    .from(memoryProposalsTable)
    .where(eq(memoryProposalsTable.status, status as "pending" | "approved" | "rejected"))
    .orderBy(desc(memoryProposalsTable.createdAt))
    .limit(100);
  res.json(rows.map(serialize));
});

// POST /memory/proposals/:id/approve — promote to a real memory entry
router.post("/memory/proposals/:id/approve", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(404).json({ error: "Not found" }); return; }

  const [proposal] = await db.select().from(memoryProposalsTable).where(eq(memoryProposalsTable.id, id));
  if (!proposal) { res.status(404).json({ error: "Proposal not found" }); return; }
  if (proposal.status !== "pending") { res.status(409).json({ error: "Already resolved" }); return; }

  const values = insertMemoryEntrySchema.parse({
    title: proposal.title,
    content: proposal.content,
    category: proposal.category,
    priority: proposal.priority,
    nextAction: proposal.nextAction,
    source: proposal.source === "obsidian" ? "import" : "chat",
    createdBy: "auto-capture",
  });
  const [entry] = await db.insert(memoryEntriesTable).values(values).returning();

  const [updated] = await db
    .update(memoryProposalsTable)
    .set({ status: "approved", memoryEntryId: entry.id, resolvedAt: new Date() })
    .where(eq(memoryProposalsTable.id, id))
    .returning();
  res.json(serialize(updated));
});

// POST /memory/proposals/:id/reject
router.post("/memory/proposals/:id/reject", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(404).json({ error: "Not found" }); return; }
  const [updated] = await db
    .update(memoryProposalsTable)
    .set({ status: "rejected", resolvedAt: new Date() })
    .where(eq(memoryProposalsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Proposal not found" }); return; }
  res.json(serialize(updated));
});

function serialize(p: typeof memoryProposalsTable.$inferSelect) {
  return {
    ...p,
    createdAt: p.createdAt.toISOString(),
    resolvedAt: p.resolvedAt?.toISOString() ?? null,
  };
}

export default router;

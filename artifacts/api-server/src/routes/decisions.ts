import { Router } from "express";
import { db } from "@workspace/db";
import { decisionsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { CreateDecisionBody } from "@workspace/api-zod";

const router = Router();

// GET /decisions
router.get("/decisions", async (req, res) => {
  const rows = await db.select().from(decisionsTable).orderBy(desc(decisionsTable.createdAt));
  res.json(rows.map(serializeDecision));
});

// POST /decisions
router.post("/decisions", async (req, res) => {
  const parsed = CreateDecisionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid decision data" });
    return;
  }
  const [decision] = await db.insert(decisionsTable).values(parsed.data).returning();
  res.status(201).json(serializeDecision(decision));
});

function serializeDecision(d: typeof decisionsTable.$inferSelect) {
  return {
    ...d,
    createdAt: d.createdAt.toISOString(),
  };
}

export default router;

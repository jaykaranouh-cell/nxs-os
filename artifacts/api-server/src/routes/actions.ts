import { Router } from "express";
import { db, reversibleActionsTable, leadsTable, opportunitiesTable } from "@workspace/db";
import { desc, eq, isNull } from "drizzle-orm";

const router = Router();

// GET /actions/reversible — recent undoable agent actions
router.get("/actions/reversible", async (req, res) => {
  const rows = await db
    .select()
    .from(reversibleActionsTable)
    .where(isNull(reversibleActionsTable.undoneAt))
    .orderBy(desc(reversibleActionsTable.createdAt))
    .limit(15);
  res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), undoneAt: null })));
});

// POST /actions/:id/undo — revert the recorded change
router.post("/actions/:id/undo", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [action] = await db.select().from(reversibleActionsTable).where(eq(reversibleActionsTable.id, id));
  if (!action || action.undoneAt) { res.status(404).json({ error: "Not found or already undone" }); return; }

  if (action.kind === "lead_stage") {
    await db.update(leadsTable).set({ stage: action.prevValue, updatedAt: new Date() }).where(eq(leadsTable.id, action.entityId));
  } else if (action.kind === "opportunity_status") {
    await db.update(opportunitiesTable).set({ status: action.prevValue, updatedAt: new Date() }).where(eq(opportunitiesTable.id, action.entityId));
  }

  await db.update(reversibleActionsTable).set({ undoneAt: new Date() }).where(eq(reversibleActionsTable.id, id));
  res.json({ ok: true, reverted: `${action.entityLabel} → ${action.prevValue}` });
});

export default router;

import { Router } from "express";
import { db } from "@workspace/db";
import { leadsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import {
  CreateLeadBody,
  UpdateLeadBody,
  QualifyLeadBody,
} from "@workspace/api-zod";

const router = Router();

// GET /leads
router.get("/leads", async (req, res) => {
  const { status, stage } = req.query as { status?: string; stage?: string };
  let query = db.select().from(leadsTable).orderBy(desc(leadsTable.createdAt));
  const rows = await query;
  const filtered = rows.filter((r) => {
    if (status && r.status !== status) return false;
    if (stage && r.stage !== stage) return false;
    return true;
  });
  res.json(filtered.map(serializeLead));
});

// POST /leads
router.post("/leads", async (req, res) => {
  const parsed = CreateLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid lead data" });
    return;
  }
  const [lead] = await db
    .insert(leadsTable)
    .values({
      ...parsed.data,
      estimatedValue: parsed.data.estimatedValue != null ? String(parsed.data.estimatedValue) : undefined,
      status: "new",
      stage: "incoming",
      assignedAgentId: "sales",
    })
    .returning();

  // Auto-log the lead creation
  await db.execute(
    sql`INSERT INTO agent_logs (agent_id, agent_name, action, details, related_lead_id, related_lead_name)
        VALUES ('sales', 'Sales Agent', 'New lead received and assigned for qualification', ${`Source: ${parsed.data.source || "direct"}`}, ${lead.id}, ${lead.name})`
  );

  res.status(201).json(serializeLead(lead));
});

// GET /leads/stats
router.get("/leads/stats", async (req, res) => {
  const rows = await db.select().from(leadsTable);
  const stats = {
    total: rows.length,
    qualified: rows.filter((r) => r.status === "qualified").length,
    nurture: rows.filter((r) => r.status === "nurture").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
    new: rows.filter((r) => r.status === "new").length,
    closedWon: rows.filter((r) => r.status === "closed" && r.stage === "won").length,
    totalPipelineValue: rows
      .filter((r) => r.status !== "rejected")
      .reduce((sum, r) => sum + parseFloat(r.estimatedValue ?? "0"), 0),
  };
  res.json(stats);
});

// GET /leads/:id
router.get("/leads/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, id));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  res.json(serializeLead(lead));
});

// PATCH /leads/:id
router.patch("/leads/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const parsed = UpdateLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid data" });
    return;
  }
  const { estimatedValue, ...rest } = parsed.data;
  const [lead] = await db
    .update(leadsTable)
    .set({
      ...rest,
      ...(estimatedValue != null ? { estimatedValue: String(estimatedValue) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(leadsTable.id, id))
    .returning();
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  res.json(serializeLead(lead));
});

// DELETE /leads/:id
router.delete("/leads/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(leadsTable).where(eq(leadsTable.id, id));
  res.status(204).send();
});

// POST /leads/:id/qualify
router.post("/leads/:id/qualify", async (req, res) => {
  const id = parseInt(req.params.id);
  const parsed = QualifyLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid qualification data" });
    return;
  }

  const { classification, qualificationScore, rejectionReason, nextAction, notes } = parsed.data;

  let newStatus = classification;
  let newStage = "sales_review";
  let routedTo: string | null = null;
  let recommendedActions: string[] = [];

  if (classification === "qualified") {
    newStage = "proposal";
    routedTo = "sales";
    recommendedActions = [
      "Draft a personalized outreach message",
      "Schedule a discovery call",
      "Prepare a tailored proposal",
      "Research the company's current tech stack",
    ];
  } else if (classification === "nurture") {
    newStage = "marketing_follow_up";
    routedTo = "marketing";
    recommendedActions = [
      "Add to nurture email sequence",
      "Create targeted content for their industry",
      "Schedule a follow-up in 30 days",
      "Connect on LinkedIn with value-add content",
    ];
  } else {
    newStage = "lost";
    recommendedActions = [
      "Log rejection reason for future reference",
      "Remove from active pipeline",
    ];
  }

  const [lead] = await db
    .update(leadsTable)
    .set({
      status: newStatus,
      stage: newStage,
      qualificationScore: qualificationScore ?? null,
      rejectionReason: rejectionReason ?? null,
      nextAction: nextAction ?? recommendedActions[0],
      notes: notes ?? null,
      assignedAgentId: routedTo,
      updatedAt: new Date(),
    })
    .where(eq(leadsTable.id, id))
    .returning();

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  // Log the qualification
  const agentAction = classification === "qualified"
    ? `Lead QUALIFIED (score: ${qualificationScore ?? "N/A"}) — routing to Sales for outreach`
    : classification === "nurture"
    ? "Lead marked for NURTURE — routing to Marketing for follow-up sequence"
    : `Lead REJECTED — reason: ${rejectionReason ?? "not specified"}`;

  await db.execute(
    sql`INSERT INTO agent_logs (agent_id, agent_name, action, details, related_lead_id, related_lead_name)
        VALUES ('sales', 'Sales Agent', ${agentAction}, ${nextAction ?? null}, ${id}, ${lead.name})`
  );

  if (classification === "nurture") {
    await db.execute(
      sql`INSERT INTO agent_logs (agent_id, agent_name, action, details, related_lead_id, related_lead_name)
          VALUES ('marketing', 'Marketing Agent', 'Nurture lead received from Sales — building follow-up content plan', ${`Lead: ${lead.name} from ${lead.company}`}, ${id}, ${lead.name})`
    );
  }

  res.json({ lead: serializeLead(lead), recommendedActions, routedTo });
});

function serializeLead(lead: typeof leadsTable.$inferSelect) {
  return {
    ...lead,
    estimatedValue: lead.estimatedValue ? parseFloat(lead.estimatedValue) : null,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt?.toISOString() ?? null,
  };
}

export default router;

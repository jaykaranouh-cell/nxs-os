/**
 * Home digest — "since you were away" + "needs you".
 * Aggregates what the OS did autonomously and what's outstanding, so the
 * landing page answers "what happened while I was gone?" in one call.
 */

import { Router } from "express";
import {
  db,
  chatMessagesTable,
  agentMessagesTable,
  memoryProposalsTable,
  ideasTable,
  opportunitiesTable,
  agentTasksTable,
  systemContextTable,
} from "@workspace/db";
import { and, desc, eq, gt, inArray, like } from "drizzle-orm";

const router = Router();
const SEEN_KEY = "home-last-seen";

async function getLastSeen(): Promise<Date> {
  const [row] = await db.select().from(systemContextTable).where(eq(systemContextTable.key, SEEN_KEY));
  const d = row ? new Date(row.value) : null;
  // Default window: 3 days back, so a first-ever load still shows recent activity.
  return d && !isNaN(d.getTime()) ? d : new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
}

// GET /home/digest
router.get("/home/digest", async (req, res) => {
  const lastSeen = await getLastSeen();

  const [growth, agentMsgs, newOpps, proposals, pendingIdeas, riskTasks] = await Promise.all([
    // Autonomous strategy sessions since last visit
    db
      .select()
      .from(chatMessagesTable)
      .where(and(eq(chatMessagesTable.role, "orchestrator"), like(chatMessagesTable.content, "🌱%"), gt(chatMessagesTable.timestamp, lastSeen)))
      .orderBy(desc(chatMessagesTable.timestamp))
      .limit(3),
    // Team messages addressed to Jay/Maya/all since last visit
    db
      .select()
      .from(agentMessagesTable)
      .where(and(inArray(agentMessagesTable.toAgentId, ["jay", "orchestrator", "all"]), gt(agentMessagesTable.createdAt, lastSeen)))
      .orderBy(desc(agentMessagesTable.createdAt))
      .limit(8),
    // Opportunities surfaced since last visit
    db
      .select()
      .from(opportunitiesTable)
      .where(and(eq(opportunitiesTable.status, "new"), gt(opportunitiesTable.discoveredAt, lastSeen)))
      .orderBy(desc(opportunitiesTable.discoveredAt))
      .limit(6),
    // Outstanding: memory proposals to approve
    db.select().from(memoryProposalsTable).where(eq(memoryProposalsTable.status, "pending")).orderBy(desc(memoryProposalsTable.createdAt)).limit(20),
    // Outstanding: ideas to review
    db.select().from(ideasTable).where(eq(ideasTable.status, "pending")).orderBy(desc(ideasTable.createdAt)).limit(10),
    // Outstanding: open risk/watchdog tasks for the orchestrator
    db
      .select()
      .from(agentTasksTable)
      .where(and(eq(agentTasksTable.agentId, "orchestrator"), eq(agentTasksTable.status, "pending")))
      .orderBy(desc(agentTasksTable.createdAt))
      .limit(10),
  ]);

  res.json({
    lastSeen: lastSeen.toISOString(),
    generatedAt: new Date().toISOString(),
    away: {
      growthSessions: growth.map((m) => ({
        id: m.id,
        snippet: m.content.replace(/^🌱 \*\*Autonomous strategy session\*\*\s*/, "").slice(0, 400),
        createdAt: m.timestamp.toISOString(),
      })),
      agentMessages: agentMsgs.map((m) => ({
        fromAgentName: m.fromAgentName,
        toAgentId: m.toAgentId,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
      newOpportunities: newOpps.map((o) => ({ id: o.id, title: o.title, priority: o.priority })),
    },
    needsYou: {
      proposals: proposals.map((p) => ({ id: p.id, title: p.title, category: p.category, priority: p.priority })),
      ideas: pendingIdeas.map((i) => ({ id: i.id, title: i.title, agentName: i.agentName, impact: i.impact })),
      riskTasks: riskTasks.map((t) => ({ id: t.id, title: t.title, priority: t.priority })),
    },
    counts: {
      growthSessions: growth.length,
      agentMessages: agentMsgs.length,
      newOpportunities: newOpps.length,
      proposals: proposals.length,
      ideas: pendingIdeas.length,
      riskTasks: riskTasks.length,
    },
  });
});

// POST /home/seen — mark everything up to now as seen
router.post("/home/seen", async (req, res) => {
  const value = new Date().toISOString();
  await db
    .insert(systemContextTable)
    .values({ key: SEEN_KEY, value })
    .onConflictDoUpdate({ target: systemContextTable.key, set: { value, updatedAt: new Date() } });
  res.json({ lastSeen: value });
});

export default router;

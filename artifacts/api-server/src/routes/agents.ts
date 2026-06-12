import { Router } from "express";
import { db } from "@workspace/db";
import { agentTasksTable, agentLogsTable, agentMessagesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  CreateAgentTaskBody,
  UpdateAgentTaskBody,
} from "@workspace/api-zod";
import { AGENTS, serializeAgent } from "../lib/orchestrator";
import { runDepartmentAgent, sendAgentMessage } from "../lib/orchestrator/dispatch";
import { loadContext } from "../lib/orchestrator/context";
import { buildAgentBriefing } from "../lib/orchestrator/prompts";
import { getRoster } from "../lib/orchestrator/roster";
import { agentMessagesTable as msgTable } from "@workspace/db";

const router = Router();

// GET /agents
router.get("/agents", async (req, res) => {
  const tasks = await db.select().from(agentTasksTable).where(eq(agentTasksTable.status, "in_progress"));
  const logs = await db.select().from(agentLogsTable).orderBy(desc(agentLogsTable.timestamp)).limit(20);

  const roster = await getRoster();
  const agents = AGENTS.map((agent) => {
    const agentTasks = tasks.filter((t) => t.agentId === agent.id);
    const latestLog = logs.find((l) => l.agentId === agent.id);
    return {
      ...serializeAgent(agent),
      name: roster[agent.id] ?? agent.name,
      status: agentTasks.length > 0 ? "busy" : "active",
      activeTasks: agentTasks.length,
      currentTask: agentTasks[0]?.title ?? null,
      lastActive: latestLog?.timestamp.toISOString() ?? new Date().toISOString(),
    };
  });

  res.json(agents);
});

// GET /agents/messages — the team mailbox, newest first
router.get("/agents/messages", async (req, res) => {
  const rows = await db
    .select()
    .from(agentMessagesTable)
    .orderBy(desc(agentMessagesTable.createdAt))
    .limit(50);
  res.json(rows.map((m) => ({
    ...m,
    createdAt: m.createdAt.toISOString(),
    readAt: m.readAt?.toISOString() ?? null,
  })));
});

// GET /agents/activity/recent
router.get("/agents/activity/recent", async (req, res) => {
  const logs = await db
    .select()
    .from(agentLogsTable)
    .orderBy(desc(agentLogsTable.timestamp))
    .limit(50);
  res.json(logs.map(serializeLog));
});

// POST /agents/:agentId/ask — talk to a department agent directly
router.post("/agents/:agentId/ask", async (req, res) => {
  const { agentId } = req.params;
  const agent = AGENTS.find((a) => a.id === agentId && a.id !== "orchestrator");
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!content) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  await sendAgentMessage("jay", "Jay", agentId, content);
  const ctx = await loadContext();
  const run = await runDepartmentAgent(
    { agentId, task: `Jay is asking you directly. Answer him personally and conversationally, in your own voice: ${content}` },
    buildAgentBriefing(ctx),
    ""
  );
  if (!run) {
    res.status(502).json({ error: "Agent failed to answer" });
    return;
  }
  const [reply] = await db
    .insert(msgTable)
    .values({ fromAgentId: agentId, fromAgentName: run.agent.name, toAgentId: "jay", content: run.findings })
    .returning();
  res.json({
    ...reply,
    createdAt: reply.createdAt.toISOString(),
    readAt: reply.readAt?.toISOString() ?? null,
  });
});

// GET /agents/:agentId
router.get("/agents/:agentId", async (req, res) => {
  const { agentId } = req.params;
  const agent = AGENTS.find((a) => a.id === agentId);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const tasks = await db.select().from(agentTasksTable)
    .where(eq(agentTasksTable.agentId, agentId))
    .orderBy(desc(agentTasksTable.createdAt))
    .limit(5);

  const activeTasks = tasks.filter((t) => t.status === "in_progress").length;
  const currentTask = tasks.find((t) => t.status === "in_progress")?.title ?? null;
  const logs = await db.select().from(agentLogsTable)
    .where(eq(agentLogsTable.agentId, agentId))
    .orderBy(desc(agentLogsTable.timestamp))
    .limit(1);

  res.json({
    ...serializeAgent(agent),
    status: activeTasks > 0 ? "busy" : "active",
    activeTasks,
    currentTask,
    lastActive: logs[0]?.timestamp.toISOString() ?? new Date().toISOString(),
  });
});

// GET /agents/:agentId/tasks
router.get("/agents/:agentId/tasks", async (req, res) => {
  const { agentId } = req.params;
  const tasks = await db
    .select()
    .from(agentTasksTable)
    .where(eq(agentTasksTable.agentId, agentId))
    .orderBy(desc(agentTasksTable.createdAt));
  res.json(tasks.map(serializeTask));
});

// POST /agents/:agentId/tasks
router.post("/agents/:agentId/tasks", async (req, res) => {
  const { agentId } = req.params;
  const parsed = CreateAgentTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid task data" });
    return;
  }
  const [task] = await db
    .insert(agentTasksTable)
    .values({ agentId, ...parsed.data })
    .returning();
  res.status(201).json(serializeTask(task));
});

// PATCH /agents/:agentId/tasks/:taskId
router.patch("/agents/:agentId/tasks/:taskId", async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  const parsed = UpdateAgentTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid task data" });
    return;
  }
  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "completed") {
    updates.completedAt = new Date();
  }
  const [task] = await db
    .update(agentTasksTable)
    .set(updates)
    .where(eq(agentTasksTable.id, taskId))
    .returning();
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json(serializeTask(task));
});

// GET /agents/:agentId/logs
router.get("/agents/:agentId/logs", async (req, res) => {
  const { agentId } = req.params;
  const logs = await db
    .select()
    .from(agentLogsTable)
    .where(eq(agentLogsTable.agentId, agentId))
    .orderBy(desc(agentLogsTable.timestamp))
    .limit(30);
  res.json(logs.map(serializeLog));
});

function serializeTask(task: typeof agentTasksTable.$inferSelect) {
  return {
    ...task,
    createdAt: task.createdAt.toISOString(),
    completedAt: task.completedAt?.toISOString() ?? null,
  };
}

function serializeLog(log: typeof agentLogsTable.$inferSelect) {
  return {
    ...log,
    timestamp: log.timestamp.toISOString(),
  };
}

export default router;

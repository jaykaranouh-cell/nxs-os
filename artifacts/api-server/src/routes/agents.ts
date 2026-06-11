import { Router } from "express";
import { db } from "@workspace/db";
import { agentTasksTable, agentLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  CreateAgentTaskBody,
  UpdateAgentTaskBody,
} from "@workspace/api-zod";
import { AGENTS, serializeAgent } from "../lib/orchestrator";

const router = Router();

// GET /agents
router.get("/agents", async (req, res) => {
  const tasks = await db.select().from(agentTasksTable).where(eq(agentTasksTable.status, "in_progress"));
  const logs = await db.select().from(agentLogsTable).orderBy(desc(agentLogsTable.timestamp)).limit(20);

  const agents = AGENTS.map((agent) => {
    const agentTasks = tasks.filter((t) => t.agentId === agent.id);
    const latestLog = logs.find((l) => l.agentId === agent.id);
    return {
      ...serializeAgent(agent),
      status: agentTasks.length > 0 ? "busy" : "active",
      activeTasks: agentTasks.length,
      currentTask: agentTasks[0]?.title ?? null,
      lastActive: latestLog?.timestamp.toISOString() ?? new Date().toISOString(),
    };
  });

  res.json(agents);
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

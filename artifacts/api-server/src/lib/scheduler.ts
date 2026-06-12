/**
 * Proactive jobs — the part of NXS OS that comes to Jay instead of waiting.
 * All times are server-local (Jay's machine). Jobs that need the LLM no-op
 * gracefully when ANTHROPIC_API_KEY is missing.
 */

import cron from "node-cron";
import { db, memoryEntriesTable, agentTasksTable, ideasTable } from "@workspace/db";
import { and, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import { completeText } from "./orchestrator/llm";
import { generateBrief } from "../routes/morningBrief";
import { DEPARTMENT_AGENTS } from "./orchestrator/agents";
import { loadContext } from "./orchestrator/context";
import { buildAgentBriefing } from "./orchestrator/prompts";
import { runObsidianSync } from "./obsidian";
import { logger } from "./logger";

const hasLlmKey = () => Boolean(process.env.ANTHROPIC_API_KEY);

// ─── 07:00 daily — morning brief ready before Jay wakes up ───────────────────

async function morningBriefJob() {
  if (!hasLlmKey()) return;
  await generateBrief();
  logger.info("scheduler: morning brief generated");
}

// ─── 07:30 daily — risk watchdog: stale critical / needs-review items ────────

const STALE_DAYS = 14;

async function riskWatchdogJob() {
  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);
  const stale = await db
    .select()
    .from(memoryEntriesTable)
    .where(
      and(
        or(eq(memoryEntriesTable.status, "needs_review"), eq(memoryEntriesTable.priority, "critical")),
        lt(sql`coalesce(${memoryEntriesTable.updatedAt}, ${memoryEntriesTable.createdAt})`, cutoff)
      )
    )
    .limit(5);

  for (const entry of stale) {
    const title = `Review stale item: ${entry.title}`;
    const [existing] = await db
      .select()
      .from(agentTasksTable)
      .where(and(eq(agentTasksTable.title, title), eq(agentTasksTable.status, "pending")))
      .limit(1);
    if (existing) continue;
    await db.insert(agentTasksTable).values({
      agentId: "orchestrator",
      title,
      description: `Memory entry #${entry.id} (${entry.category}, ${entry.priority}) hasn't been touched in ${STALE_DAYS}+ days. Resolve, update, or archive it.`,
      status: "pending",
      priority: "high",
    });
  }
  if (stale.length) logger.info({ count: stale.length }, "scheduler: risk watchdog flagged stale items");
}

// ─── Monday 08:00 — one proactive idea per department ─────────────────────────

async function weeklyIdeasJob() {
  if (!hasLlmKey()) return;
  const ctx = await loadContext();
  const briefing = buildAgentBriefing(ctx);
  const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);

  for (const agent of DEPARTMENT_AGENTS) {
    const [recent] = await db
      .select()
      .from(ideasTable)
      .where(and(eq(ideasTable.agentId, agent.id), gte(ideasTable.createdAt, weekAgo)))
      .orderBy(desc(ideasTable.createdAt))
      .limit(1);
    if (recent) continue; // already proposed something this week

    try {
      const completion = await completeText({
        role: "ideas",
        scope: `scheduler:ideas:${agent.id}`,
        system: `${agent.systemPrompt}\n\n${briefing}`,
        user:
          'Propose exactly ONE specific, high-leverage idea for Jay\'s business from your department\'s perspective, grounded in the data above. Respond with JSON only: {"title": "...", "description": "2-3 sentences", "category": "revenue|marketing|product|operations", "impact": "low|medium|high", "effort": "low|medium|high"}',
        maxTokens: 800,
        effortLow: true,
      });

      const raw = completion.replace(/^```(?:json)?\s*|```\s*$/g, "").trim();
      const idea = JSON.parse(raw) as {
        title?: string; description?: string; category?: string; impact?: string; effort?: string;
      };
      if (!idea.title || !idea.description) continue;

      await db.insert(ideasTable).values({
        agentId: agent.id,
        agentName: agent.name,
        title: idea.title,
        description: idea.description,
        category: idea.category ?? "operations",
        impact: ["low", "medium", "high"].includes(idea.impact ?? "") ? idea.impact! : "medium",
        effort: ["low", "medium", "high"].includes(idea.effort ?? "") ? idea.effort! : "medium",
      });
      logger.info({ agent: agent.id, title: idea.title }, "scheduler: weekly idea logged");
    } catch (err) {
      logger.warn(err, `scheduler: idea generation failed for ${agent.id}`);
    }
  }
}

// ─── Wiring ───────────────────────────────────────────────────────────────────

function safely(name: string, job: () => Promise<void>) {
  return () => job().catch((err) => logger.error(err, `scheduler: ${name} failed`));
}

export function startScheduler(): void {
  cron.schedule("0 7 * * *", safely("morning-brief", morningBriefJob));
  cron.schedule("30 7 * * *", safely("risk-watchdog", riskWatchdogJob));
  cron.schedule("0 8 * * 1", safely("weekly-ideas", weeklyIdeasJob));
  // Obsidian bridge: ingest inbox + mirror memory every 10 minutes, and once at boot
  cron.schedule("*/10 * * * *", safely("obsidian-sync", runObsidianSync));
  void safely("obsidian-sync", runObsidianSync)();
  logger.info("scheduler: jobs registered (brief 07:00, watchdog 07:30, ideas Mon 08:00, obsidian */10m)");
}

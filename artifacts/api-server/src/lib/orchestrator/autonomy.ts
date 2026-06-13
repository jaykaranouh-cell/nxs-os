/**
 * Autonomous strategy sessions — Maya thinks about growing the business on
 * her own schedule, with her full toolset: she reviews the live business
 * state, consults or spawns agents if she needs them, queues concrete
 * opportunities/ideas/tasks, and leaves Jay a briefing in the chat.
 */

import { db, chatMessagesTable, systemContextTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { loadContext } from "./context";
import { buildSystemBlocks } from "./prompts";
import { TOOL_DEFINITIONS, TOOL_GUIDANCE } from "./tools";
import { runSynthesis } from "../../routes/chat";
import { logger } from "../logger";
import { notifyJay } from "../notify";

const LAST_RUN_KEY = "autonomy-last-run";
// How close two autonomous sessions may run. Kept short so Maya can think
// several times a day; the daily spend ceiling (NXS_DAILY_BUDGET_USD) is the
// real backstop against runaway cost.
const MIN_HOURS_BETWEEN = 3;

const SESSION_DIRECTIVE = `This is your scheduled autonomous strategy session. Jay is not here; you are working on his behalf.

Your mandate: figure out how to grow the business toward the revenue target, then ACT on it.

1. Review everything you know above: pipeline, opportunities, memory, lessons, your team's messages, and what changed since your last session.
2. Think about growth from first principles: pipeline velocity, offer and pricing, positioning, partnerships, leverage, and what Jay is NOT seeing. You may dispatch up to 2 department agents or spawn 1 specialist if their analysis would materially sharpen your thinking.
3. ACT through your tools, with high standards: 1-3 genuinely new, specific items at most (opportunities, ideas, or tasks). Check what already exists first; do not duplicate or pad. Quality over quantity, and an empty session is acceptable if nothing clears the bar.
4. Finish with a short briefing to Jay (conversation mode, under 250 words): what you looked at, what you concluded, what you queued and why, and the one thing you'd push him on. Be yourself.

Constraints: no cold outreach ideas, no em dashes, nothing speculative logged as fact.`;

async function lastRunAt(): Promise<Date | null> {
  const [row] = await db.select().from(systemContextTable).where(eq(systemContextTable.key, LAST_RUN_KEY));
  if (!row) return null;
  const d = new Date(row.value);
  return isNaN(d.getTime()) ? null : d;
}

async function markRun(): Promise<void> {
  const value = new Date().toISOString();
  await db
    .insert(systemContextTable)
    .values({ key: LAST_RUN_KEY, value })
    .onConflictDoUpdate({ target: systemContextTable.key, set: { value, updatedAt: new Date() } });
}

export async function runGrowthSession(force = false): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  if (!force) {
    const last = await lastRunAt();
    if (last && Date.now() - last.getTime() < MIN_HOURS_BETWEEN * 3600_000) {
      logger.info("autonomy: skipped, ran recently");
      return null;
    }
  }
  await markRun();

  const ctx = await loadContext();
  const { text, toolEvents } = await runSynthesis({
    system: buildSystemBlocks(ctx, [], TOOL_GUIDANCE),
    history: [],
    content: SESSION_DIRECTIVE,
    tools: TOOL_DEFINITIONS, // her full base toolset; no computer tools unattended
    scope: "autonomy",
  });

  if (!text.trim()) {
    logger.warn("autonomy: session produced no briefing");
    return null;
  }

  // The briefing lands in the chat thread so Jay sees it next time he opens
  // the Orchestrator (and on his phone).
  const actions = [
    {
      agentId: "orchestrator",
      agentName: "Maya",
      action: "Autonomous growth session",
      result: `${toolEvents.length} action${toolEvents.length === 1 ? "" : "s"} taken`,
    },
    ...toolEvents.map((e) => ({
      agentId: "orchestrator",
      agentName: "Maya",
      action: e.tool,
      result: e.summary,
    })),
  ];
  await db.insert(chatMessagesTable).values({
    role: "orchestrator",
    content: `🌱 **Autonomous strategy session**\n\n${text.trim()}`,
    agentActions: JSON.stringify(actions),
  });

  logger.info({ actions: toolEvents.length }, "autonomy: growth session complete");
  await notifyJay(
    "Maya ran a strategy session",
    `${toolEvents.length} action${toolEvents.length === 1 ? "" : "s"} queued. ${text.trim().slice(0, 250)}`,
    { tags: ["seedling"] }
  );
  return text;
}

import { db, agentTasksTable, agentLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { anthropic, CLAUDE_MODEL, messageText } from "@workspace/integrations-anthropic-server";
import { logger } from "../logger";
import { DEPARTMENT_AGENTS, getAgent, type AgentDefinition } from "./agents";
import type { OrchestratorContext } from "./context";
import { buildAgentBriefing } from "./prompts";

export interface Dispatch {
  agentId: string;
  task: string;
}

export interface AgentRun {
  agent: AgentDefinition;
  task: string;
  findings: string;
}

export interface AgentAction {
  agentId: string;
  agentName: string;
  action: string;
  result: string | null;
}

const MAX_DISPATCHES = 3;

const ROUTER_PROMPT = `You are the dispatch router for Jay's AI Chief of Staff. Decide which department agents (if any) should investigate before the Chief of Staff answers Jay's message.

Departments:
- sales: pipeline, leads, qualification, deals, proposals, follow-ups, closing
- marketing: campaigns, content, LinkedIn, positioning, brand, audience
- research: competitors, market trends, pricing intelligence, evaluating opportunities or ideas
- finance: revenue, gap-to-target, cash flow, pricing decisions, ROI

Dispatch an agent only when its department's perspective would materially improve the answer. General focus/priority/briefing questions are usually answered by the Chief of Staff alone — return an empty list for those. Never dispatch more than ${MAX_DISPATCHES} agents.

Each dispatched task must be one concrete, self-contained instruction phrased for that agent (e.g. "Assess which open opportunity closes the most of the revenue gap and what its next step is").

Respond with JSON only — a single object, no markdown fences, no other text: {"dispatches": [{"agent": "<department id>", "task": "<instruction>"}]}`;

/** Strip markdown code fences if the model wrapped its JSON in them. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

export async function planDispatch(userMessage: string): Promise<Dispatch[]> {
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      output_config: { effort: "low" },
      system: ROUTER_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw = extractJson(messageText(response)) || "{}";
    const parsed = JSON.parse(raw) as { dispatches?: Array<{ agent?: string; task?: string }> };
    const validIds = new Set(DEPARTMENT_AGENTS.map((a) => a.id));

    return (parsed.dispatches ?? [])
      .filter((d): d is { agent: string; task: string } =>
        typeof d.agent === "string" && validIds.has(d.agent) && typeof d.task === "string" && d.task.length > 0
      )
      .slice(0, MAX_DISPATCHES)
      .map((d) => ({ agentId: d.agent, task: d.task }));
  } catch (err) {
    // Routing is an optimization, not a dependency — fall back to no dispatch.
    logger.error(err, "Dispatch routing failed");
    return [];
  }
}

async function runDepartmentAgent(
  dispatch: Dispatch,
  briefing: string,
  userMessage: string
): Promise<AgentRun | null> {
  const agent = getAgent(dispatch.agentId);
  if (!agent) return null;

  const [task] = await db
    .insert(agentTasksTable)
    .values({ agentId: agent.id, title: dispatch.task, status: "in_progress", priority: "medium" })
    .returning();

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      // The shared briefing leads so all agent calls in a turn share one
      // cached prompt prefix; the persona block varies per agent.
      system: [
        { type: "text", text: briefing, cache_control: { type: "ephemeral" } },
        { type: "text", text: agent.systemPrompt },
      ],
      messages: [
        {
          role: "user",
          content: `Jay asked: "${userMessage}"\n\nYour task: ${dispatch.task}`,
        },
      ],
    });

    const findings = messageText(response).trim();
    if (!findings) throw new Error("Empty agent response");

    await Promise.all([
      db
        .update(agentTasksTable)
        .set({ status: "completed", description: findings, completedAt: new Date() })
        .where(eqId(task.id)),
      db.insert(agentLogsTable).values({
        agentId: agent.id,
        agentName: agent.name,
        action: dispatch.task,
        details: findings,
      }),
    ]);

    return { agent, task: dispatch.task, findings };
  } catch (err) {
    logger.error(err, `${agent.name} run failed`);
    await db
      .update(agentTasksTable)
      .set({ status: "failed", completedAt: new Date() })
      .where(eqId(task.id))
      .catch(() => {});
    return null;
  }
}

function eqId(id: number) {
  return eq(agentTasksTable.id, id);
}

/** Run all dispatched agents in parallel; failed runs are dropped, not fatal. */
export async function runDispatches(
  dispatches: Dispatch[],
  ctx: OrchestratorContext,
  userMessage: string
): Promise<AgentRun[]> {
  if (dispatches.length === 0) return [];
  const briefing = buildAgentBriefing(ctx);
  const runs = await Promise.all(
    dispatches.map((d) => runDepartmentAgent(d, briefing, userMessage))
  );
  return runs.filter((r): r is AgentRun => r !== null);
}

export function toAgentActions(runs: AgentRun[]): AgentAction[] {
  const actions: AgentAction[] = runs.map((r) => ({
    agentId: r.agent.id,
    agentName: r.agent.name,
    action: r.task,
    result: r.findings.length > 180 ? `${r.findings.slice(0, 177)}…` : r.findings,
  }));
  actions.push({
    agentId: "orchestrator",
    agentName: "CEO Orchestrator",
    action: runs.length
      ? `Synthesized reports from ${runs.map((r) => r.agent.name).join(", ")} into a CoS briefing`
      : "Answered directly from Strategic Brain, memory, and opportunity data",
    result: "CoS briefing delivered",
  });
  return actions;
}

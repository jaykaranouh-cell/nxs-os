import { db, agentTasksTable, agentLogsTable, agentMessagesTable } from "@workspace/db";
import { desc, eq, inArray } from "drizzle-orm";
import { anthropic, messageText, type Anthropic } from "@workspace/integrations-anthropic-server";
import { recordUsage } from "./telemetry";
import { assertWithinBudget } from "./budget";
import { choiceFor } from "./llm";
import { logger } from "../logger";
import { completeText } from "./llm";
import { DEPARTMENT_AGENTS, getAgent, type AgentDefinition } from "./agents";
import { displayName } from "./roster";
import { BROWSER_TOOL_DEFINITIONS, runBrowserTool, isBrowserTool } from "./browser";
import { buildAgentProfileBlock, rememberForAgent } from "./profile";
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
    const text = await completeText({
      role: "router",
      scope: "router",
      system: ROUTER_PROMPT,
      user: userMessage,
      maxTokens: 1000,
      effortLow: true,
    });
    const raw = extractJson(text) || "{}";
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

// ─── Inter-agent communication ────────────────────────────────────────────────

/** Deliver unread mailbox messages for an agent and mark them read. */
async function collectMailbox(agentId: string): Promise<string> {
  const rows = await db
    .select()
    .from(agentMessagesTable)
    .where(inArray(agentMessagesTable.toAgentId, [agentId, "all"]))
    .orderBy(desc(agentMessagesTable.createdAt))
    .limit(8);
  if (!rows.length) return "";
  const unreadIds = rows.filter((m) => !m.readAt && m.toAgentId === agentId).map((m) => m.id);
  if (unreadIds.length) {
    await db.update(agentMessagesTable).set({ readAt: new Date() }).where(inArray(agentMessagesTable.id, unreadIds)).catch(() => {});
  }
  return `\n\n## Messages from your team\n${rows
    .reverse()
    .map((m) => `- ${m.fromAgentName} → ${m.toAgentId === "all" ? "everyone" : "you"}: ${m.content}`)
    .join("\n")}`;
}

export async function sendAgentMessage(
  fromAgentId: string,
  fromAgentName: string,
  toAgentId: string,
  content: string
): Promise<void> {
  await db.insert(agentMessagesTable).values({ fromAgentId, fromAgentName, toAgentId, content });
  await db.insert(agentLogsTable).values({
    agentId: fromAgentId,
    agentName: fromAgentName,
    action: `Message to ${toAgentId === "all" ? "the whole team" : toAgentId}`,
    details: content,
  });
}

const MAX_AGENT_ROUNDS = 6;

function agentCommTools(selfId: string): Anthropic.Tool[] {
  const others = DEPARTMENT_AGENTS.map((a) => a.id).filter((id) => id !== selfId);
  return [
    {
      name: "ask_agent",
      description:
        "Consult another department agent right now and get their answer before finishing your findings. Use when their domain materially affects your conclusion.",
      input_schema: {
        type: "object",
        properties: {
          agentId: { type: "string", enum: others },
          question: { type: "string", description: "One specific question for them" },
        },
        required: ["agentId", "question"],
      },
    },
    {
      name: "send_message",
      description:
        "Leave a note for another agent (or 'all' for the whole team, or 'orchestrator' for Maya). Delivered with their next briefing. Use for heads-ups and follow-ups that matter beyond this task.",
      input_schema: {
        type: "object",
        properties: {
          to: { type: "string", enum: [...others, "orchestrator", "all"] },
          content: { type: "string" },
        },
        required: ["to", "content"],
      },
    },
    {
      name: "remember",
      description:
        "Save a private note to your own memory for future tasks (a lesson, a fact you learned, a useful detail). Only you see these notes; they're added to your briefing next time you run.",
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short label" },
          content: { type: "string", description: "What to remember" },
        },
        required: ["title", "content"],
      },
    },
    ...BROWSER_TOOL_DEFINITIONS,
  ];
}

export async function runDepartmentAgent(
  dispatch: Dispatch,
  briefing: string,
  userMessage: string,
  depth = 0
): Promise<AgentRun | null> {
  const definition = getAgent(dispatch.agentId);
  if (!definition) return null;
  const [name, profileBlock] = await Promise.all([
    displayName(definition.id),
    buildAgentProfileBlock(definition.id),
  ]);
  // Persona = base + Maya-given name + this agent's own instructions/skills/knowledge/memory.
  const persona =
    (name === definition.name ? definition.systemPrompt : `Your name is ${name}. ${definition.systemPrompt}`) +
    profileBlock;
  const agent: AgentDefinition = { ...definition, name, systemPrompt: persona };

  const [task] = await db
    .insert(agentTasksTable)
    .values({ agentId: agent.id, title: dispatch.task, status: "in_progress", priority: "medium" })
    .returning();

  try {
    const mailbox = await collectMailbox(agent.id);
    const user = userMessage
      ? `Jay asked: "${userMessage}"\n\nYour task: ${dispatch.task}`
      : `Maya (the orchestrator) dispatched you directly.\n\nYour task: ${dispatch.task}`;

    // Comms tools need the Anthropic tool loop; consulted agents (depth>0)
    // and OpenAI-routed agents run single-shot to bound cost and recursion.
    const useTools = depth === 0 && choiceFor("agent").provider === "anthropic";
    if (useTools) await assertWithinBudget();
    let findings: string;

    if (!useTools) {
      findings = (
        await completeText({
          role: "agent",
          scope: `agent:${agent.id}`,
          system: [
            { type: "text", text: briefing, cache_control: { type: "ephemeral" } },
            { type: "text", text: agent.systemPrompt + mailbox },
          ],
          user,
          maxTokens: 4000,
          thinking: true,
        })
      ).trim();
    } else {
      const model = choiceFor("agent").model;
      const tools = agentCommTools(agent.id);
      const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];
      findings = "";
      let answered = false;
      for (let round = 0; round < MAX_AGENT_ROUNDS; round++) {
        const response = await anthropic.messages.create({
          model,
          max_tokens: 4000,
          system: [
            { type: "text", text: briefing, cache_control: { type: "ephemeral" } },
            {
              type: "text",
              text:
                agent.systemPrompt +
                mailbox +
                "\n\nYou can consult teammates with ask_agent, leave notes with send_message, save private notes for yourself with remember, and use the web: web_search and browse_page (read-only). Use your playbooks and knowledge base above. Consult at most one teammate, only when their domain materially changes your answer.",
            },
          ],
          messages,
          tools,
        });
        recordUsage(`agent:${agent.id}`, model, response.usage);
        // Only a non-tool round is the real answer; ignore mid-browse preambles.
        if (response.stop_reason !== "tool_use") {
          findings = response.content
            .filter((b): b is Anthropic.TextBlock => b.type === "text")
            .map((b) => b.text)
            .join("")
            .trim();
          answered = true;
          break;
        }

        messages.push({ role: "assistant", content: response.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type !== "tool_use") continue;
          try {
            if (block.name === "ask_agent") {
              const input = block.input as { agentId: string; question: string };
              const consulted = await runDepartmentAgent(
                { agentId: input.agentId, task: input.question },
                briefing,
                "",
                depth + 1
              );
              await db.insert(agentLogsTable).values({
                agentId: agent.id,
                agentName: agent.name,
                action: `Consulted ${consulted?.agent.name ?? input.agentId}`,
                details: input.question,
              });
              results.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: consulted ? `${consulted.agent.name}: ${consulted.findings}` : "No answer available",
              });
            } else if (block.name === "send_message") {
              const input = block.input as { to: string; content: string };
              await sendAgentMessage(agent.id, agent.name, input.to, input.content);
              results.push({ type: "tool_result", tool_use_id: block.id, content: `Message left for ${input.to}` });
            } else if (block.name === "remember") {
              const input = block.input as { title: string; content: string };
              await rememberForAgent(agent.id, input.title, input.content);
              results.push({ type: "tool_result", tool_use_id: block.id, content: `Saved to your memory: ${input.title}` });
            } else if (isBrowserTool(block.name)) {
              const out = await runBrowserTool(block.name, block.input);
              results.push({ type: "tool_result", tool_use_id: block.id, content: out });
            } else {
              results.push({ type: "tool_result", tool_use_id: block.id, content: "Unknown tool", is_error: true });
            }
          } catch (err) {
            results.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `Error: ${err instanceof Error ? err.message : "failed"}`,
              is_error: true,
            });
          }
        }
        messages.push({ role: "user", content: results });
      }

      if (!answered || !findings.trim()) {
        const finalResp = await anthropic.messages.create({
          model,
          max_tokens: 2000,
          system: [
            { type: "text", text: briefing, cache_control: { type: "ephemeral" } },
            { type: "text", text: agent.systemPrompt },
          ],
          messages: [
            ...messages,
            { role: "user", content: "Stop researching. Based on everything you found above, write your final answer to Jay now, in plain text." },
          ],
        });
        recordUsage(`agent:${agent.id}`, model, finalResp.usage);
        findings = finalResp.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim();
        if (!findings) {
          logger.warn(
            { agent: agent.id, stop: finalResp.stop_reason, blocks: finalResp.content.map((b) => b.type) },
            "agent forced-final returned no text"
          );
        }
      }
    }

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
  userMessage: string,
  onAgentDone?: (run: AgentRun) => void
): Promise<AgentRun[]> {
  if (dispatches.length === 0) return [];
  const briefing = buildAgentBriefing(ctx);
  const runs = await Promise.all(
    dispatches.map(async (d) => {
      const run = await runDepartmentAgent(d, briefing, userMessage);
      if (run) onAgentDone?.(run);
      return run;
    })
  );
  return runs.filter((r): r is AgentRun => r !== null);
}

export function toAgentActions(runs: AgentRun[]): AgentAction[] {
  const actions: AgentAction[] = runs.map((r) => ({
    agentId: r.agent.id,
    agentName: r.agent.name,
    action: r.task,
    result: r.findings, // full report; the UI truncates the chip and expands on click
  }));
  actions.push({
    agentId: "orchestrator",
    agentName: "Maya",
    action: runs.length
      ? `Synthesized reports from ${runs.map((r) => r.agent.name).join(", ")} into a CoS briefing`
      : "Answered directly from Strategic Brain, memory, and opportunity data",
    result: "CoS briefing delivered",
  });
  return actions;
}

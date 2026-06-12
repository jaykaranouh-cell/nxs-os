/**
 * Maya's write-tools — the actions the orchestrator can take on the system
 * during a chat turn. Each tool validates its input with zod, executes a DB
 * write, logs to agent_logs, and returns a human-readable result string that
 * is fed back to the model and surfaced in the UI as an action event.
 */

import { z } from "zod/v4";
import {
  db,
  memoryEntriesTable,
  insertMemoryEntrySchema,
  leadsTable,
  agentTasksTable,
  agentLogsTable,
  ideasTable,
  opportunitiesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Anthropic } from "@workspace/integrations-anthropic-server";
import { DEPARTMENT_AGENTS, getAgent } from "./agents";
import { runDepartmentAgent, sendAgentMessage } from "./dispatch";
import { loadContext } from "./context";
import { buildAgentBriefing } from "./prompts";
import { completeText } from "./llm";

export type ExecutionLevel = "green" | "amber" | "red";

export interface ToolEvent {
  tool: string;
  summary: string;
}

const LEAD_STAGES = [
  "incoming", "sales_review", "proposal", "negotiation", "won", "lost", "marketing_follow_up",
] as const;
const OPP_STATUSES = ["new", "evaluating", "pursuing", "captured", "rejected"] as const;
const PRIORITIES = ["low", "medium", "high", "critical"] as const;
const DEPT_IDS = DEPARTMENT_AGENTS.map((a) => a.id);

async function logAction(action: string, details: string) {
  await db.insert(agentLogsTable).values({
    agentId: "orchestrator",
    agentName: "Maya",
    action,
    details,
  });
}

// ─── Tool implementations ─────────────────────────────────────────────────────

const createMemoryEntrySchema = z.object({
    title: z.string().min(1),
    content: z.string().min(1),
    category: z.string().min(1),
    priority: z.enum(PRIORITIES).default("medium"),
    nextAction: z.string().optional(),
  });

const createMemoryEntry = {
  definition: {
    name: "create_memory_entry",
    description:
      "Save a decision, lesson, commitment, or important context to Jay's persistent business memory. Use when something said in conversation should be remembered permanently.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Short, specific title" },
        content: { type: "string", description: "The full fact, decision, or lesson" },
        category: {
          type: "string",
          description: "One of: decisions, lessons_learned, goals, client_notes, company_context, general",
        },
        priority: { type: "string", enum: [...PRIORITIES] },
        nextAction: { type: "string", description: "Optional concrete next action" },
      },
      required: ["title", "content", "category"],
    },
  },
  schema: createMemoryEntrySchema,
  async run(input: z.infer<typeof createMemoryEntrySchema>): Promise<string> {
    const values = insertMemoryEntrySchema.parse({
      title: input.title,
      content: input.content,
      category: input.category,
      priority: input.priority,
      nextAction: input.nextAction ?? null,
      source: "chat",
      createdBy: "maya",
    });
    const [entry] = await db.insert(memoryEntriesTable).values(values).returning();
    await logAction("Saved memory entry", `#${entry.id} [${entry.category}] ${entry.title}`);
    return `Memory saved: "${entry.title}" (#${entry.id}, ${entry.category}, ${entry.priority})`;
  },
};

const updateLeadStageSchema = z.object({
    leadId: z.number().int(),
    stage: z.enum(LEAD_STAGES),
    note: z.string().optional(),
    nextAction: z.string().optional(),
  });

const updateLeadStage = {
  definition: {
    name: "update_lead_stage",
    description:
      "Move a lead in the pipeline to a new stage and optionally append a note. Use when Jay reports progress on a deal.",
    input_schema: {
      type: "object" as const,
      properties: {
        leadId: { type: "integer" },
        stage: { type: "string", enum: [...LEAD_STAGES] },
        note: { type: "string", description: "Optional note about what happened" },
        nextAction: { type: "string", description: "Optional next action on this lead" },
      },
      required: ["leadId", "stage"],
    },
  },
  schema: updateLeadStageSchema,
  async run(input: z.infer<typeof updateLeadStageSchema>): Promise<string> {
    const [existing] = await db.select().from(leadsTable).where(eq(leadsTable.id, input.leadId));
    if (!existing) throw new Error(`Lead #${input.leadId} not found`);
    const notes = input.note
      ? `${existing.notes ? `${existing.notes}\n` : ""}[maya] ${input.note}`
      : existing.notes;
    const [lead] = await db
      .update(leadsTable)
      .set({
        stage: input.stage,
        notes,
        nextAction: input.nextAction ?? existing.nextAction,
        updatedAt: new Date(),
      })
      .where(eq(leadsTable.id, input.leadId))
      .returning();
    await logAction("Updated lead stage", `${lead.name} (${lead.company}) → ${input.stage}`);
    return `Lead "${lead.name}" (${lead.company}) moved to ${input.stage}`;
  },
};

const createAgentTaskSchema = z.object({
    agentId: z.string(),
    title: z.string().min(1),
    description: z.string().optional(),
    priority: z.enum(PRIORITIES).default("medium"),
  });

const createAgentTask = {
  definition: {
    name: "create_agent_task",
    description:
      "Create a task for a department agent (or for Jay via the orchestrator). Use for follow-ups and commitments that need tracking.",
    input_schema: {
      type: "object" as const,
      properties: {
        agentId: { type: "string", enum: [...DEPT_IDS, "orchestrator"] },
        title: { type: "string" },
        description: { type: "string" },
        priority: { type: "string", enum: [...PRIORITIES] },
      },
      required: ["agentId", "title"],
    },
  },
  schema: createAgentTaskSchema,
  async run(input: z.infer<typeof createAgentTaskSchema>): Promise<string> {
    const agent = getAgent(input.agentId);
    if (!agent) throw new Error(`Unknown agent "${input.agentId}"`);
    const [task] = await db
      .insert(agentTasksTable)
      .values({
        agentId: agent.id,
        title: input.title,
        description: input.description ?? null,
        status: "pending",
        priority: input.priority,
      })
      .returning();
    await logAction("Created task", `[${agent.name}] ${task.title}`);
    return `Task created for ${agent.name}: "${task.title}" (${task.priority})`;
  },
};

const logIdeaSchema = z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    category: z.string().min(1),
    impact: z.enum(["low", "medium", "high"]).default("medium"),
    effort: z.enum(["low", "medium", "high"]).default("medium"),
  });

const logIdea = {
  definition: {
    name: "log_idea",
    description: "Log a business idea into the Ideas queue for Jay to review.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        category: { type: "string", description: "e.g. revenue, marketing, product, operations" },
        impact: { type: "string", enum: ["low", "medium", "high"] },
        effort: { type: "string", enum: ["low", "medium", "high"] },
      },
      required: ["title", "description", "category"],
    },
  },
  schema: logIdeaSchema,
  async run(input: z.infer<typeof logIdeaSchema>): Promise<string> {
    const [idea] = await db
      .insert(ideasTable)
      .values({
        agentId: "orchestrator",
        agentName: "Maya",
        title: input.title,
        description: input.description,
        category: input.category,
        impact: input.impact,
        effort: input.effort,
      })
      .returning();
    await logAction("Logged idea", idea.title);
    return `Idea logged: "${idea.title}" (impact ${idea.impact}, effort ${idea.effort})`;
  },
};

const updateOpportunitySchema = z.object({
    opportunityId: z.number().int(),
    status: z.enum(OPP_STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    note: z.string().optional(),
  });

const updateOpportunity = {
  definition: {
    name: "update_opportunity",
    description:
      "Update the status or priority of a tracked opportunity, optionally appending a note. Use when Jay decides to pursue, park, or reject an opportunity.",
    input_schema: {
      type: "object" as const,
      properties: {
        opportunityId: { type: "integer" },
        status: { type: "string", enum: [...OPP_STATUSES] },
        priority: { type: "string", enum: [...PRIORITIES] },
        note: { type: "string" },
      },
      required: ["opportunityId"],
    },
  },
  schema: updateOpportunitySchema,
  async run(input: z.infer<typeof updateOpportunitySchema>): Promise<string> {
    const [existing] = await db
      .select()
      .from(opportunitiesTable)
      .where(eq(opportunitiesTable.id, input.opportunityId));
    if (!existing) throw new Error(`Opportunity #${input.opportunityId} not found`);
    const [opp] = await db
      .update(opportunitiesTable)
      .set({
        status: input.status ?? existing.status,
        priority: input.priority ?? existing.priority,
        notes: input.note
          ? `${existing.notes ? `${existing.notes}\n` : ""}[maya] ${input.note}`
          : existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(opportunitiesTable.id, input.opportunityId))
      .returning();
    await logAction("Updated opportunity", `${opp.title} → ${opp.status}/${opp.priority}`);
    return `Opportunity "${opp.title}" updated (${opp.status}, ${opp.priority})`;
  },
};

// ─── Agent tools: Maya commands her own team ──────────────────────────────────

const messageTeamSchema = z.object({
  to: z.enum(["sales", "marketing", "research", "finance", "all"]),
  content: z.string().min(5),
});

const messageTeam = {
  definition: {
    name: "message_team",
    description:
      "Leave a note for a department agent (or 'all' for the whole team). Delivered with their next briefing. Use for standing context, heads-ups, and follow-ups they should know about next time they run.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string", enum: ["sales", "marketing", "research", "finance", "all"] },
        content: { type: "string" },
      },
      required: ["to", "content"],
    },
  },
  schema: messageTeamSchema,
  async run(input: z.infer<typeof messageTeamSchema>): Promise<string> {
    await sendAgentMessage("orchestrator", "Maya", input.to, input.content);
    return `Note left for ${input.to === "all" ? "the whole team" : input.to}`;
  },
};


const dispatchAgentSchema = z.object({
  agentId: z.enum(["sales", "marketing", "research", "finance"]),
  task: z.string().min(10),
});

const dispatchAgent = {
  definition: {
    name: "dispatch_agent",
    description:
      "Dispatch one of your department agents (sales, marketing, research, finance) to investigate something right now. The agent gets the full business briefing plus your task and returns its findings to you. Use when a question deserves dedicated department analysis you don't already have.",
    input_schema: {
      type: "object" as const,
      properties: {
        agentId: { type: "string", enum: ["sales", "marketing", "research", "finance"] },
        task: { type: "string", description: "One concrete, self-contained instruction for the agent" },
      },
      required: ["agentId", "task"],
    },
  },
  schema: dispatchAgentSchema,
  async run(input: z.infer<typeof dispatchAgentSchema>): Promise<string> {
    const ctx = await loadContext();
    const run = await runDepartmentAgent(
      { agentId: input.agentId, task: input.task },
      buildAgentBriefing(ctx),
      ""
    );
    if (!run) throw new Error(`${input.agentId} agent failed to produce findings`);
    return `${run.agent.name} report on "${input.task}":\n${run.findings}`;
  },
};

const spawnAgentSchema = z.object({
  role: z.string().min(3).max(60),
  instructions: z.string().min(20),
  task: z.string().min(10),
});

const spawnAgent = {
  definition: {
    name: "spawn_agent",
    description:
      "Spin up a one-off specialist agent that doesn't exist in the department roster: you name its role (e.g. 'Pricing Analyst', 'Copy Critic', 'Devil's Advocate'), write its instructions, and give it one task. It gets the business briefing plus your instructions and reports back to you. Use for analysis that needs a perspective the four departments don't cover.",
    input_schema: {
      type: "object" as const,
      properties: {
        role: { type: "string", description: "Short role name, e.g. 'Pricing Analyst'" },
        instructions: { type: "string", description: "The specialist's system instructions: perspective, priorities, constraints" },
        task: { type: "string", description: "The one task to perform" },
      },
      required: ["role", "instructions", "task"],
    },
  },
  schema: spawnAgentSchema,
  async run(input: z.infer<typeof spawnAgentSchema>): Promise<string> {
    const ctx = await loadContext();
    const briefing = buildAgentBriefing(ctx);
    const [taskRow] = await db
      .insert(agentTasksTable)
      .values({ agentId: "adhoc", title: `[${input.role}] ${input.task}`.slice(0, 200), status: "in_progress", priority: "medium" })
      .returning();
    try {
      const findings = await completeText({
        role: "agent",
        scope: "agent:adhoc",
        system: [
          { type: "text", text: briefing, cache_control: { type: "ephemeral" } },
          {
            type: "text",
            text: `You are a one-off specialist agent in Jay's AI business team, spun up by Maya (the orchestrator). Your role: ${input.role}.\n\n${input.instructions}\n\nGround every claim in the business briefing above. Reply with your findings only: tight, specific, no preamble.`,
          },
        ],
        user: input.task,
        maxTokens: 4000,
        thinking: true,
      });
      if (!findings.trim()) throw new Error("Specialist returned nothing");
      await Promise.all([
        db.update(agentTasksTable).set({ status: "completed", description: findings, completedAt: new Date() }).where(eq(agentTasksTable.id, taskRow.id)),
        db.insert(agentLogsTable).values({ agentId: "adhoc", agentName: input.role, action: input.task, details: findings }),
      ]);
      return `${input.role} report on "${input.task}":\n${findings.trim()}`;
    } catch (err) {
      await db.update(agentTasksTable).set({ status: "failed", completedAt: new Date() }).where(eq(agentTasksTable.id, taskRow.id)).catch(() => {});
      throw err;
    }
  },
};

// ─── Computer tools (Full Auto / green mode only) ─────────────────────────────

const execFileAsync = promisify(execFile);

function assertHttpUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  return url;
}

const openInBrowserSchema = z.object({ url: z.string().min(1) });

const openInBrowser = {
  definition: {
    name: "open_in_browser",
    description:
      "Open a URL in Jay's default browser on his Mac. Use when Jay should look at something: a website, a doc, a dashboard.",
    input_schema: {
      type: "object" as const,
      properties: { url: { type: "string", description: "http(s) URL to open" } },
      required: ["url"],
    },
  },
  schema: openInBrowserSchema,
  async run(input: z.infer<typeof openInBrowserSchema>): Promise<string> {
    const url = assertHttpUrl(input.url);
    await execFileAsync("open", [url.toString()]);
    await logAction("Opened in browser", url.toString());
    return `Opened ${url.hostname} in Jay's browser`;
  },
};

const openAppSchema = z.object({ app: z.string().regex(/^[A-Za-z0-9 .\-]{2,40}$/, "Invalid app name") });

const openApp = {
  definition: {
    name: "open_app",
    description:
      "Open a macOS application on Jay's Mac by name (e.g. 'Obsidian', 'Notes', 'Calendar', 'Finder').",
    input_schema: {
      type: "object" as const,
      properties: { app: { type: "string", description: "Application name" } },
      required: ["app"],
    },
  },
  schema: openAppSchema,
  async run(input: z.infer<typeof openAppSchema>): Promise<string> {
    await execFileAsync("open", ["-a", input.app]);
    await logAction("Opened app", input.app);
    return `Opened ${input.app}`;
  },
};

const fetchWebpageSchema = z.object({ url: z.string().min(1) });

const fetchWebpage = {
  definition: {
    name: "fetch_webpage",
    description:
      "Fetch a webpage and return its readable text (server-side, nothing opens on screen). Use for research: checking a prospect's site, reading an article, verifying a claim.",
    input_schema: {
      type: "object" as const,
      properties: { url: { type: "string", description: "http(s) URL to read" } },
      required: ["url"],
    },
  },
  schema: fetchWebpageSchema,
  async run(input: z.infer<typeof fetchWebpageSchema>): Promise<string> {
    const url = assertHttpUrl(input.url);
    const resp = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "Mozilla/5.0 (NXS-OS research agent)" },
    });
    if (!resp.ok) throw new Error(`Fetch failed: HTTP ${resp.status}`);
    const html = await resp.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z#0-9]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);
    await logAction("Fetched webpage", url.toString());
    return `Content of ${url.toString()}:\n${text || "(no readable text found)"}`;
  },
};

const COMPUTER_TOOLS = [openInBrowser, openApp, fetchWebpage];

export const COMPUTER_TOOL_DEFINITIONS: Anthropic.Tool[] = COMPUTER_TOOLS.map((t) => t.definition);

// ─── Registry ─────────────────────────────────────────────────────────────────

const BASE_TOOLS = [createMemoryEntry, updateLeadStage, createAgentTask, logIdea, updateOpportunity, dispatchAgent, spawnAgent, messageTeam];
const TOOLS = [...BASE_TOOLS, ...COMPUTER_TOOLS];

export const TOOL_DEFINITIONS: Anthropic.Tool[] = BASE_TOOLS.map((t) => t.definition);

/** Execute one tool call. Returns the result string (or throws). */
export async function executeTool(name: string, input: unknown): Promise<string> {
  const tool = TOOLS.find((t) => t.definition.name === name);
  if (!tool) throw new Error(`Unknown tool "${name}"`);
  // Each tool's run is typed against its own schema; parse narrows accordingly.
  const parsed = tool.schema.parse(input);
  return tool.run(parsed as never);
}

export const TOOL_GUIDANCE = `## Taking Action
You can act on the system directly with your tools (save memory, move leads, create tasks, log ideas, update opportunities). When Jay reports something that changes the state of the business, record it with the appropriate tool rather than only describing what he should do. Use write tools sparingly and precisely — only for real state changes, never speculatively. You also command your own team: dispatch_agent sends a department agent (sales, marketing, research, finance) to investigate, and spawn_agent creates a one-off specialist with instructions you write. Use them when a question deserves dedicated analysis you don't have; integrate their reports into your answer and credit them. If you also have computer tools (open apps, open the browser, fetch webpages), they act on Jay's actual Mac: use them when Jay asks or when showing him something beats describing it.`;

export const PROPOSE_ONLY_GUIDANCE = `## Proposing Action (manual approval mode)
You cannot execute changes right now — Jay has execution set to manual approval. When the conversation implies a state change (a memory worth saving, a lead to move, a task to create), end your Next Move with the specific action you WOULD take, phrased so Jay can approve it.`;

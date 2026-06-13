/**
 * Maya's write-tools — the actions the orchestrator can take on the system
 * during a chat turn. Each tool validates its input with zod, executes a DB
 * write, logs to agent_logs, and returns a human-readable result string that
 * is fed back to the model and surfaced in the UI as an action event.
 */

import { z } from "zod/v4";
import {
  db,
  reversibleActionsTable,
  memoryEntriesTable,
  insertMemoryEntrySchema,
  leadsTable,
  insertLeadSchema,
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
import { setAgentName } from "./roster";
import { setAgentInstructions, addAgentKb } from "./profile";
import { createObjective, addObjectiveStep, updateObjectiveProgress } from "./objectives";
import { notifyJay } from "../notify";
import { BROWSER_TOOL_DEFINITIONS, runBrowserTool, isBrowserTool } from "./browser";
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

const createLeadSchema = z.object({
    name: z.string().min(1),
    company: z.string().optional(),
    email: z.string().optional(),
    estimatedValue: z.union([z.number(), z.string()]).optional(),
    industry: z.string().optional(),
    source: z.string().optional(),
    stage: z.enum(LEAD_STAGES).optional(),
    note: z.string().optional(),
    nextAction: z.string().optional(),
  });

const createLead = {
  definition: {
    name: "create_lead",
    description:
      "Add a prospect, client, or deal to the sales pipeline. Use this whenever Jay mentions a real company or opportunity that isn't already in the pipeline (check the 'Sales Pipeline' context first to avoid duplicates) — so he never has to enter deals manually. Capture whatever details came up; only name is required.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Contact name, or the company if no contact is named" },
        company: { type: "string", description: "Company name" },
        email: { type: "string", description: "Contact email if known" },
        estimatedValue: { type: "number", description: "Estimated deal value in AUD if mentioned" },
        industry: { type: "string", description: "Industry/sector if known" },
        source: { type: "string", description: "How the lead came in (referral, inbound, etc.)" },
        stage: { type: "string", enum: [...LEAD_STAGES], description: "Pipeline stage; defaults to incoming" },
        note: { type: "string", description: "Any context about the deal from the conversation" },
        nextAction: { type: "string", description: "The next concrete step on this deal" },
      },
      required: ["name"],
    },
  },
  schema: createLeadSchema,
  async run(input: z.infer<typeof createLeadSchema>): Promise<string> {
    const values = insertLeadSchema.parse({
      name: input.name,
      company: input.company ?? input.name,
      email: input.email ?? "",
      source: input.source ?? "Chat with Maya",
      status: "new",
      stage: input.stage ?? "incoming",
      notes: input.note ? `[maya] ${input.note}` : null,
      nextAction: input.nextAction ?? null,
      estimatedValue: input.estimatedValue != null ? String(input.estimatedValue) : null,
      industry: input.industry ?? null,
      assignedAgentId: "sales",
    });
    const [lead] = await db.insert(leadsTable).values(values).returning();
    const val = lead.estimatedValue ? ` · ~$${parseFloat(String(lead.estimatedValue)).toLocaleString()}` : "";
    await logAction("Added lead to pipeline", `#${lead.id} ${lead.name} (${lead.company}) @ ${lead.stage}${val}`);
    await db.insert(reversibleActionsTable).values({
      kind: "lead_create", entityId: lead.id, entityLabel: `${lead.name} (${lead.company})`,
      prevValue: "", newValue: lead.stage,
    });
    return `Added "${lead.name}"${lead.company && lead.company !== lead.name ? ` (${lead.company})` : ""} to the pipeline at ${lead.stage} (#${lead.id})${val}. You can move it anytime with update_lead_stage.`;
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
    if (existing.stage !== input.stage) {
      await db.insert(reversibleActionsTable).values({
        kind: "lead_stage", entityId: lead.id, entityLabel: `${lead.name} (${lead.company})`,
        prevValue: existing.stage, newValue: input.stage,
      });
    }
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
    if (input.status && existing.status !== input.status) {
      await db.insert(reversibleActionsTable).values({
        kind: "opportunity_status", entityId: opp.id, entityLabel: opp.title,
        prevValue: existing.status, newValue: input.status,
      });
    }
    return `Opportunity "${opp.title}" updated (${opp.status}, ${opp.priority})`;
  },
};

// ─── Agent tools: Maya commands her own team ──────────────────────────────────

const notifyJaySchema = z.object({
  title: z.string().min(3).max(80),
  message: z.string().min(5).max(500),
  urgent: z.boolean().default(false),
});

const notifyJayTool = {
  definition: {
    name: "notify_jay",
    description:
      "Send a push notification to Jay's phone. Use ONLY for things that genuinely can't wait until he next opens the OS: hard blockers, time-sensitive deal events, or something he explicitly asked to be pinged about. Never for routine updates.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" },
        message: { type: "string" },
        urgent: { type: "boolean", description: "True only for genuinely urgent items" },
      },
      required: ["title", "message"],
    },
  },
  schema: notifyJaySchema,
  async run(input: z.infer<typeof notifyJaySchema>): Promise<string> {
    const sent = await notifyJay(input.title, input.message, {
      priority: input.urgent ? "urgent" : "high",
      tags: ["bell"],
    });
    await logAction("Notified Jay", input.title);
    return sent ? `Push sent: "${input.title}"` : "Push not configured (NXS_NTFY_TOPIC unset)";
  },
};

const createObjectiveSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  ownerAgentId: z.enum(["orchestrator", "sales", "marketing", "research", "finance"]).optional(),
  targetDate: z.string().optional(),
  steps: z.array(z.string()).optional(),
});

const createObjectiveTool = {
  definition: {
    name: "create_objective",
    description:
      "Create a multi-day objective (a play the team drives toward over time), optionally with initial steps. Use for goals bigger than a single task, like closing a specific deal or launching a content engine.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        ownerAgentId: { type: "string", enum: ["orchestrator", "sales", "marketing", "research", "finance"] },
        targetDate: { type: "string", description: "Optional, e.g. 'Fri' or 'Dec 31'" },
        steps: { type: "array", items: { type: "string" }, description: "Optional initial steps" },
      },
      required: ["title"],
    },
  },
  schema: createObjectiveSchema,
  async run(input: z.infer<typeof createObjectiveSchema>): Promise<string> {
    const id = await createObjective(input);
    for (const step of input.steps ?? []) await addObjectiveStep(id, step, input.ownerAgentId);
    await logAction("Created objective", input.title);
    return `Objective created: "${input.title}" (#${id})${input.steps?.length ? ` with ${input.steps.length} steps` : ""}`;
  },
};

const updateObjectiveSchema = z.object({
  objectiveId: z.number().int(),
  completeStep: z.string().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  status: z.enum(["active", "achieved", "abandoned"]).optional(),
});

const updateObjectiveTool = {
  definition: {
    name: "update_objective",
    description:
      "Update an objective: mark a step complete, set progress, or change status. Progress auto-derives from completed steps if not set.",
    input_schema: {
      type: "object" as const,
      properties: {
        objectiveId: { type: "integer" },
        completeStep: { type: "string", description: "Title (or part) of a step to mark done" },
        progress: { type: "integer" },
        status: { type: "string", enum: ["active", "achieved", "abandoned"] },
      },
      required: ["objectiveId"],
    },
  },
  schema: updateObjectiveSchema,
  async run(input: z.infer<typeof updateObjectiveSchema>): Promise<string> {
    const ok = await updateObjectiveProgress(input.objectiveId, input);
    if (!ok) throw new Error(`Objective #${input.objectiveId} not found`);
    await logAction("Updated objective", `#${input.objectiveId}`);
    return `Objective #${input.objectiveId} updated`;
  },
};

const instructAgentSchema = z.object({
  agentId: z.enum(["sales", "marketing", "research", "finance"]),
  instructions: z.string().min(10),
});

const instructAgent = {
  definition: {
    name: "instruct_agent",
    description:
      "Set or replace a department agent's standing instructions (their charter beyond the base persona). Use to shape how a teammate works on an ongoing basis.",
    input_schema: {
      type: "object" as const,
      properties: {
        agentId: { type: "string", enum: ["sales", "marketing", "research", "finance"] },
        instructions: { type: "string", description: "The agent's standing instructions" },
      },
      required: ["agentId", "instructions"],
    },
  },
  schema: instructAgentSchema,
  async run(input: z.infer<typeof instructAgentSchema>): Promise<string> {
    await setAgentInstructions(input.agentId, input.instructions);
    await logAction("Instructed agent", `Updated ${input.agentId}'s standing instructions`);
    return `Updated ${input.agentId}'s instructions`;
  },
};

const teachAgentSchema = z.object({
  agentId: z.enum(["sales", "marketing", "research", "finance"]),
  kind: z.enum(["skill", "knowledge"]),
  title: z.string().min(2),
  content: z.string().min(10),
});

const teachAgent = {
  definition: {
    name: "teach_agent",
    description:
      "Add a playbook (skill) or reference document (knowledge) to a department agent's knowledge base, so they apply it on every future task. Use to build your team's capability over time.",
    input_schema: {
      type: "object" as const,
      properties: {
        agentId: { type: "string", enum: ["sales", "marketing", "research", "finance"] },
        kind: { type: "string", enum: ["skill", "knowledge"] },
        title: { type: "string" },
        content: { type: "string" },
      },
      required: ["agentId", "kind", "title", "content"],
    },
  },
  schema: teachAgentSchema,
  async run(input: z.infer<typeof teachAgentSchema>): Promise<string> {
    await addAgentKb(input.agentId, input.kind, input.title, input.content, "maya");
    await logAction("Taught agent", `Added ${input.kind} "${input.title}" to ${input.agentId}`);
    return `Added ${input.kind} "${input.title}" to ${input.agentId}'s knowledge base`;
  },
};

const nameAgentSchema = z.object({
  agentId: z.enum(["sales", "marketing", "research", "finance"]),
  name: z.string().regex(/^[A-Za-z][A-Za-z .'-]{1,30}$/, "Invalid name"),
});

const nameAgent = {
  definition: {
    name: "name_agent",
    description:
      "Give one of your department agents a personal name (you are Maya; your team deserves names too). The name is used everywhere: their prompts, logs, and the team channel.",
    input_schema: {
      type: "object" as const,
      properties: {
        agentId: { type: "string", enum: ["sales", "marketing", "research", "finance"] },
        name: { type: "string", description: "A personal name, e.g. 'Apex'" },
      },
      required: ["agentId", "name"],
    },
  },
  schema: nameAgentSchema,
  async run(input: z.infer<typeof nameAgentSchema>): Promise<string> {
    await setAgentName(input.agentId, input.name);
    await logAction("Named an agent", `${input.agentId} is now called ${input.name}`);
    return `The ${input.agentId} agent is now named ${input.name}`;
  },
};

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


const createOpportunitySchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  category: z.string().default("niche"),
  priority: z.enum(PRIORITIES).default("medium"),
  estimatedValue: z.string().optional(),
});

const createOpportunity = {
  definition: {
    name: "create_opportunity",
    description:
      "Add a new opportunity to the Opportunity Engine. Use when you identify a concrete, specific growth opportunity that isn't already tracked.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" },
        description: { type: "string", description: "What it is, why it's worth pursuing, first step" },
        category: { type: "string", description: "e.g. revenue, niche, partnership, competitive" },
        priority: { type: "string", enum: [...PRIORITIES] },
        estimatedValue: { type: "string", description: "Optional, e.g. '$9,600 ARR'" },
      },
      required: ["title", "description"],
    },
  },
  schema: createOpportunitySchema,
  async run(input: z.infer<typeof createOpportunitySchema>): Promise<string> {
    const [opp] = await db
      .insert(opportunitiesTable)
      .values({
        title: input.title,
        description: input.description,
        category: input.category,
        priority: input.priority,
        estimatedValue: input.estimatedValue ?? null,
        source: "maya",
        status: "new",
      })
      .returning();
    await logAction("Created opportunity", `${opp.title} (${opp.priority})`);
    return `Opportunity created: "${opp.title}" (#${opp.id}, ${opp.priority})`;
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
  name: z.string().max(30).optional(),
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
        name: { type: "string", description: "Optional personal name you give this specialist, e.g. 'Vera'" },
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
      .values({ agentId: "adhoc", title: `[${input.name ? `${input.name}, ` : ""}${input.role}] ${input.task}`.slice(0, 200), status: "in_progress", priority: "medium" })
      .returning();
    try {
      const findings = await completeText({
        role: "agent",
        scope: "agent:adhoc",
        system: [
          { type: "text", text: briefing, cache_control: { type: "ephemeral" } },
          {
            type: "text",
            text: `You are a one-off specialist agent in Jay's AI business team, spun up by Maya (the orchestrator).${input.name ? ` Your name is ${input.name}.` : ""} Your role: ${input.role}.\n\n${input.instructions}\n\nGround every claim in the business briefing above. Reply with your findings only: tight, specific, no preamble.`,
          },
        ],
        user: input.task,
        maxTokens: 4000,
        thinking: true,
      });
      if (!findings.trim()) throw new Error("Specialist returned nothing");
      await Promise.all([
        db.update(agentTasksTable).set({ status: "completed", description: findings, completedAt: new Date() }).where(eq(agentTasksTable.id, taskRow.id)),
        db.insert(agentLogsTable).values({ agentId: "adhoc", agentName: input.name ? `${input.name} (${input.role})` : input.role, action: input.task, details: findings }),
      ]);
      return `${input.name ?? input.role} report on "${input.task}":\n${findings.trim()}`;
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

const BASE_TOOLS = [createMemoryEntry, createLead, updateLeadStage, createAgentTask, logIdea, updateOpportunity, createOpportunity, dispatchAgent, spawnAgent, messageTeam, nameAgent, notifyJayTool, instructAgent, teachAgent, createObjectiveTool, updateObjectiveTool];
const TOOLS = [...BASE_TOOLS, ...COMPUTER_TOOLS];

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  ...BASE_TOOLS.map((t) => t.definition),
  ...BROWSER_TOOL_DEFINITIONS,
];

/** Execute one tool call. Returns the result string (or throws). */
export async function executeTool(name: string, input: unknown): Promise<string> {
  if (isBrowserTool(name)) return runBrowserTool(name, input);
  const tool = TOOLS.find((t) => t.definition.name === name);
  if (!tool) throw new Error(`Unknown tool "${name}"`);
  // Each tool's run is typed against its own schema; parse narrows accordingly.
  const parsed = tool.schema.parse(input);
  return tool.run(parsed as never);
}

export const TOOL_GUIDANCE = `## Taking Action — be autonomous
You are Jay's autonomous Chief of Staff, not a passive assistant. Take initiative: when the conversation or the business state implies an action, DO IT with your tools, then tell Jay what you did and why. Do not wait to be asked, and do not merely describe what he "should" do — handle it. Bias hard toward action: everything you do is logged and reversible, so act on anything within your remit. Only pause to confirm first when an action is irreversible, externally visible (sending messages/email, payments, public posts), or genuinely ambiguous.

When Jay mentions something, infer the obvious next moves and execute them without being told:
- A prospect, client, or deal → add it with create_lead if it isn't already in the "Sales Pipeline" context, set its stage, value and next action, and move it with update_lead_stage as it progresses. Hand it to your sales agent (Rex) via message_team or dispatch_agent so the team works it. Jay should never have to touch the pipeline himself.
- A decision, lesson, commitment, or key fact → save it with create_memory_entry.
- A risk or blocker → record it and flag it.
- A multi-step goal → open an objective with create_objective and drive its steps.
- Work that needs investigation or expertise you don't have on hand → dispatch_agent (sales, marketing, research, finance) for analysis, or spawn_agent to stand up a one-off specialist with instructions you write. Spin up whatever agents the job needs; integrate and credit their work.

Grow your team's capabilities yourself: if you or an agent lack a skill the job needs, research it with web_search and browse_page (your real read-only browser), then encode it — write the new skill or knowledge into the right agent's knowledge base with teach_agent, or set their standing instructions with instruct_agent. That is how you "acquire skills": learn from the web and bank it so the whole team gets better over time. When a recurring job needs a capability nobody has, create the specialist for it.

Standards: act on real state only, never log speculation as fact; always check the context you've been given first so you don't duplicate; quality over volume. Computer tools (open apps, drive the browser on Jay's Mac) act on his actual machine — use them when doing beats describing. You are expected to run the business proactively between messages, not just answer questions.`;

export const PROPOSE_ONLY_GUIDANCE = `## Proposing Action (manual approval mode)
You cannot execute changes right now — Jay has execution set to manual approval. When the conversation implies a state change (a memory worth saving, a lead to move, a task to create), end your Next Move with the specific action you WOULD take, phrased so Jay can approve it.`;

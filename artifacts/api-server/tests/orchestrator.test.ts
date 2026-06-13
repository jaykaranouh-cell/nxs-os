import { describe, it, expect } from "vitest";
import { checkRuleViolations, calcConfidence } from "../src/lib/orchestrator/guards";
import { buildSystemBlocks, buildAgentBriefing } from "../src/lib/orchestrator/prompts";
import { AGENTS, DEPARTMENT_AGENTS, getAgent, serializeAgent } from "../src/lib/orchestrator/agents";
import { TOOL_DEFINITIONS, executeTool, TOOL_GUIDANCE, PROPOSE_ONLY_GUIDANCE } from "../src/lib/orchestrator/tools";
import { toAgentActions } from "../src/lib/orchestrator/dispatch";
import type { OrchestratorContext } from "../src/lib/orchestrator/context";

function makeCtx(overrides: Partial<OrchestratorContext> = {}): OrchestratorContext {
  return {
    brain: null,
    teamMessages: [],
    goals: [],
    decisions: [],
    lessons: [],
    risks: [],
    priorities: [],
    topActions: [],
    allOpps: [],
    hotOpps: [],
    notPursued: [],
    totalMemory: 0,
    setupCtx: null,
    ...overrides,
  };
}

const goal = (title: string) =>
  ({
    id: 1, title, content: "c", summary: null, detailedNotes: null,
    category: "goals", tags: null, importance: "medium", priority: "medium",
    confidence: "medium", status: "active", source: "manual",
    relatedPeople: null, relatedCompanies: null, linkedProjects: null,
    nextAction: null, createdBy: null, createdAt: new Date(), updatedAt: null, reviewedAt: null,
  }) as OrchestratorContext["goals"][number];

describe("guards", () => {
  it("blocks cold outreach", () => {
    const result = checkRuleViolations("should I send some cold email to prospects?", makeCtx());
    expect(result).toBeTruthy();
    expect(result).toContain("cold outreach");
  });

  it("challenges adding a goal when overloaded", () => {
    const ctx = makeCtx({ goals: ["a", "b", "c", "d", "e"].map(goal) });
    const result = checkRuleViolations("let's add another goal to the list", ctx);
    expect(result).toBeTruthy();
    expect(result).toContain("5 active goals");
  });

  it("passes normal messages", () => {
    expect(checkRuleViolations("what should I focus on today?", makeCtx())).toBeNull();
  });

  it("confidence stays within honest bounds", () => {
    const low = calcConfidence(makeCtx());
    const high = calcConfidence(
      makeCtx({ goals: [goal("g")], decisions: [goal("d"), goal("d2"), goal("d3")], lessons: [goal("l")] })
    );
    expect(low.score).toBeGreaterThanOrEqual(35);
    expect(high.score).toBeLessThanOrEqual(92);
    expect(high.score).toBeGreaterThan(low.score);
  });
});

describe("prompts", () => {
  it("briefing leads system blocks with cache_control for prefix caching", () => {
    const ctx = makeCtx({ goals: [goal("Close Grand Group")] });
    const blocks = buildSystemBlocks(ctx, [], TOOL_GUIDANCE);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].cache_control).toEqual({ type: "ephemeral" });
    expect(blocks[0].text).toBe(buildAgentBriefing(ctx));
    expect(blocks[1].text).toContain("You are Maya");
    expect(blocks[1].text).toContain("Your Personality"); // default personality always present
    expect(blocks[1].text).toContain("Taking Action");
  });

  it("red mode injects propose-only guidance instead", () => {
    const blocks = buildSystemBlocks(makeCtx(), [], PROPOSE_ONLY_GUIDANCE);
    expect(blocks[1].text).toContain("manual approval");
  });

  it("agent reports are included when runs exist", () => {
    const blocks = buildSystemBlocks(makeCtx(), [
      { agent: DEPARTMENT_AGENTS[0], task: "assess pipeline", findings: "pipeline is thin" },
    ]);
    expect(blocks[1].text).toContain("Department Agent Reports");
    expect(blocks[1].text).toContain("pipeline is thin");
  });
});

describe("agents", () => {
  it("orchestrator is Maya and prompts never leak through the API shape", () => {
    expect(getAgent("orchestrator")?.name).toBe("Maya");
    for (const agent of AGENTS) {
      expect(serializeAgent(agent)).not.toHaveProperty("systemPrompt");
    }
  });

  it("department agents all have system prompts with the shared constraints", () => {
    for (const agent of DEPARTMENT_AGENTS) {
      expect(agent.systemPrompt).toContain("no cold outreach");
    }
  });
});

describe("tools", () => {
  it("exposes uniquely named tool definitions", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("create_memory_entry");
    expect(names).toContain("update_lead_stage");
    expect(names).toContain("dispatch_agent");
    expect(names).toContain("spawn_agent");
    expect(names).toContain("web_search");
    expect(names).toContain("browse_page");
    expect(names).toContain("instruct_agent");
    expect(names).toContain("teach_agent");
  });

  it("agent tools validate before any LLM or DB work", async () => {
    await expect(executeTool("dispatch_agent", { agentId: "hr", task: "do a thing please" })).rejects.toThrow();
    await expect(executeTool("spawn_agent", { role: "X", instructions: "too short", task: "y" })).rejects.toThrow();
  });

  it("rejects unknown tools before touching the database", async () => {
    await expect(executeTool("delete_everything", {})).rejects.toThrow(/Unknown tool/);
  });

  it("rejects invalid input before touching the database", async () => {
    await expect(
      executeTool("update_lead_stage", { leadId: 1, stage: "not_a_stage" })
    ).rejects.toThrow();
    await expect(executeTool("create_memory_entry", { title: "" })).rejects.toThrow();
  });
});

describe("dispatch", () => {
  it("maps runs and synthesis into agent actions attributed to Maya", () => {
    const actions = toAgentActions([
      { agent: DEPARTMENT_AGENTS[0], task: "check pipeline", findings: "x".repeat(300) },
    ]);
    expect(actions).toHaveLength(2);
    // Full findings are preserved now; the UI truncates and expands on click.
    expect(actions[0].result).toBe("x".repeat(300));
    expect(actions[1].agentName).toBe("Maya");
  });
});

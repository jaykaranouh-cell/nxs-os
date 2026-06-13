/**
 * Eval harness — deterministic, no-LLM checks that the system's prompt
 * assembly and guardrails behave as intended. These run in CI so prompt and
 * structure changes are measured, not vibed. (Live-LLM scoring is too flaky
 * and costly for CI; these assert the scaffolding the model depends on.)
 */
import { describe, it, expect } from "vitest";
import { buildSystemBlocks } from "../src/lib/orchestrator/prompts";
import { TOOL_DEFINITIONS } from "../src/lib/orchestrator/tools";
import { BROWSER_TOOL_DEFINITIONS } from "../src/lib/orchestrator/browser";
import type { OrchestratorContext } from "../src/lib/orchestrator/context";

function ctx(overrides: Partial<OrchestratorContext> = {}): OrchestratorContext {
  return {
    brain: null, teamMessages: [], objectivesBlock: "", calendarBlock: "", goals: [], decisions: [], lessons: [],
    risks: [], priorities: [], topActions: [], allOpps: [], hotOpps: [], notPursued: [],
    pipeline: [], totalMemory: 0, setupCtx: null, ...overrides,
  };
}

describe("eval: prompt assembly", () => {
  it("the cached briefing prefix leads every system prompt (prompt-cache integrity)", () => {
    const blocks = buildSystemBlocks(ctx());
    expect(blocks[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("active objectives reach the model when present", () => {
    const blocks = buildSystemBlocks(ctx({ objectivesBlock: "## Active Objectives\n- [40%] Close Grand Group" }));
    const all = blocks.map((b) => b.text).join("\n");
    expect(all).toContain("Close Grand Group");
  });

  it("team channel surfaces to Maya when there are messages", () => {
    const blocks = buildSystemBlocks(ctx({ teamMessages: [{ fromAgentName: "Vera", toAgentId: "orchestrator", content: "blocker" }] }));
    expect(blocks.map((b) => b.text).join("\n")).toContain("Vera");
  });

  it("response modes are always defined (conversation/briefing/sparring/execution)", () => {
    const text = buildSystemBlocks(ctx()).map((b) => b.text).join("\n");
    for (const mode of ["CONVERSATION", "BRIEFING", "SPARRING", "EXECUTION"]) {
      expect(text).toContain(mode);
    }
  });

  it("the no-em-dash writing rule is enforced in the prompt", () => {
    expect(buildSystemBlocks(ctx()).map((b) => b.text).join("\n")).toMatch(/never use em dashes/i);
  });
});

describe("eval: capability surface", () => {
  it("Maya's full toolset is present (memory, team, objectives, web)", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    for (const t of ["create_memory_entry", "create_lead", "update_lead_stage", "dispatch_agent", "spawn_agent", "create_objective", "teach_agent", "web_search"]) {
      expect(names).toContain(t);
    }
  });

  it("browser tools are read-only (no click/type/submit surface exists)", () => {
    const names = BROWSER_TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toEqual(["web_search", "browse_page"]);
    expect(names).not.toContain("click");
    expect(names).not.toContain("fill");
  });
});

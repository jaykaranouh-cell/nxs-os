/**
 * LLM facade — every non-tool-using call site goes through completeText(),
 * which routes to Anthropic or OpenAI per role. Configure roles in .env:
 *
 *   LLM_ROUTER=openai:gpt-4o-mini
 *   LLM_AGENT=anthropic:claude-opus-4-6
 *   LLM_CAPTURE=openai:gpt-4o-mini
 *   LLM_BRIEF=anthropic:claude-opus-4-6
 *   LLM_IDEAS=anthropic:claude-opus-4-6
 *
 * Unset roles default to Anthropic claude-opus-4-6. The tool-using chat
 * synthesis is Anthropic-only (the tool loop is provider-specific) and does
 * not go through this facade.
 */

import { anthropic, CLAUDE_MODEL, messageText, type Anthropic } from "@workspace/integrations-anthropic-server";
import { openai } from "@workspace/integrations-openai-ai-server";
import { recordUsage } from "./telemetry";
import { assertWithinBudget } from "./budget";
import type { SystemBlock } from "./prompts";

export type LlmRole = "router" | "agent" | "capture" | "brief" | "ideas" | "obsidian";

export interface LlmChoice {
  provider: "anthropic" | "openai";
  model: string;
}

const DEFAULT_CHOICE: LlmChoice = { provider: "anthropic", model: CLAUDE_MODEL };

export function choiceFor(role: LlmRole): LlmChoice {
  const raw = process.env[`LLM_${role.toUpperCase()}`];
  if (!raw) return DEFAULT_CHOICE;
  const [provider, ...rest] = raw.split(":");
  const model = rest.join(":");
  if ((provider === "anthropic" || provider === "openai") && model) {
    if (provider === "openai" && !process.env.OPENAI_API_KEY) {
      console.warn(`[llm] LLM_${role.toUpperCase()} wants OpenAI but OPENAI_API_KEY is unset — using Anthropic`);
      return DEFAULT_CHOICE;
    }
    return { provider, model };
  }
  console.warn(`[llm] Invalid LLM_${role.toUpperCase()}="${raw}" (expected provider:model) — using default`);
  return DEFAULT_CHOICE;
}

export interface CompleteOptions {
  role: LlmRole;
  scope: string; // telemetry scope, e.g. "router", "agent:sales"
  system: string | SystemBlock[];
  user: string;
  maxTokens: number;
  /** Anthropic-only: low-effort thinking budget for cheap calls. */
  effortLow?: boolean;
  /** Anthropic-only: adaptive thinking for reasoning-heavy calls. */
  thinking?: boolean;
  temperature?: number;
}

/** One text-in, text-out completion routed by role. */
export async function completeText(opts: CompleteOptions): Promise<string> {
  await assertWithinBudget();
  const choice = choiceFor(opts.role);

  if (choice.provider === "openai") {
    const systemText = typeof opts.system === "string"
      ? opts.system
      : opts.system.map((b) => b.text).join("\n\n");
    const completion = await openai.chat.completions.create({
      model: choice.model,
      max_tokens: opts.maxTokens,
      ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
      messages: [
        { role: "system", content: systemText },
        { role: "user", content: opts.user },
      ],
    });
    const u = completion.usage;
    recordUsage(opts.scope, choice.model, u && {
      input_tokens: u.prompt_tokens ?? 0,
      output_tokens: u.completion_tokens ?? 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    } as Anthropic.Usage);
    return completion.choices[0]?.message?.content ?? "";
  }

  const response = await anthropic.messages.create({
    model: choice.model,
    max_tokens: opts.maxTokens,
    ...(opts.thinking ? { thinking: { type: "adaptive" as const } } : {}),
    ...(opts.effortLow ? { output_config: { effort: "low" as const } } : {}),
    ...(opts.temperature != null && !opts.thinking ? { temperature: opts.temperature } : {}),
    system: opts.system as string | Anthropic.TextBlockParam[],
    messages: [{ role: "user", content: opts.user }],
  });
  recordUsage(opts.scope, choice.model, response.usage);
  return messageText(response);
}

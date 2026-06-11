import Anthropic from "@anthropic-ai/sdk";

/**
 * A missing key is not fatal at startup — the server must still boot for
 * non-LLM features. Calls fail at request time with a clear message instead.
 */
const apiKey = process.env.ANTHROPIC_API_KEY || "";
if (!apiKey) {
  console.warn(
    "[anthropic] ANTHROPIC_API_KEY is not set — LLM features will fail until you add it to the repo-root .env file."
  );
}

export const anthropic = new Anthropic({ apiKey: apiKey || "missing-anthropic-api-key" });

/** Default model for all orchestrator and agent calls. */
export const CLAUDE_MODEL = "claude-opus-4-6";

/** Concatenate the text blocks of a response (skips thinking blocks). */
export function messageText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

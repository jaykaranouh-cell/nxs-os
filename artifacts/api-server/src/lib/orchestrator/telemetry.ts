import { db, llmUsageTable } from "@workspace/db";
import type { Anthropic } from "@workspace/integrations-anthropic-server";
import { logger } from "../logger";

/** Fire-and-forget token usage logging — never blocks or fails a turn. */
export function recordUsage(scope: string, model: string, usage: Anthropic.Usage | undefined): void {
  if (!usage) return;
  db.insert(llmUsageTable)
    .values({
      scope,
      model,
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    })
    .catch((err: unknown) => logger.warn(err, "usage logging failed"));
}

import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

/** Token usage per LLM call — cost telemetry across the whole OS. */
export const llmUsageTable = pgTable("llm_usage", {
  id: serial("id").primaryKey(),
  scope: text("scope").notNull(), // router | agent:<id> | synthesis | brief | capture | scheduler:<job>
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type LlmUsage = typeof llmUsageTable.$inferSelect;

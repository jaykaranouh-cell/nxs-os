import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Per-agent knowledge base. Each department agent owns its own:
 *  - skill: a reusable playbook / method the agent applies
 *  - knowledge: reference material (pricing models, dossiers, docs)
 *  - memory: private notes the agent writes for itself as it works
 * (Per-agent editable instructions live in system_context "agent-instructions".)
 */
export const AGENT_KB_KIND = ["skill", "knowledge", "memory"] as const;
export const AGENT_KB_SOURCE = ["manual", "maya", "agent"] as const;

export const agentKbTable = pgTable("agent_kb", {
  id: serial("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  kind: text("kind", { enum: AGENT_KB_KIND }).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  source: text("source", { enum: AGENT_KB_SOURCE }).notNull().default("manual"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
});

export const insertAgentKbSchema = createInsertSchema(agentKbTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAgentKb = z.infer<typeof insertAgentKbSchema>;
export type AgentKb = typeof agentKbTable.$inferSelect;

import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { MEMORY_PRIORITY } from "./memory";

export const PROPOSAL_STATUS = ["pending", "approved", "rejected"] as const;
export const PROPOSAL_SOURCE = ["chat", "obsidian", "scheduler"] as const;

/**
 * Auto-captured memory candidates awaiting Jay's approval. Approving one
 * creates a real memory_entries row; the proposal keeps the audit trail.
 */
export const memoryProposalsTable = pgTable("memory_proposals", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category").notNull().default("general"),
  priority: text("priority", { enum: MEMORY_PRIORITY }).notNull().default("medium"),
  nextAction: text("next_action"),
  source: text("source", { enum: PROPOSAL_SOURCE }).notNull(),
  sourceRef: text("source_ref"), // chat message id or obsidian note path
  status: text("status", { enum: PROPOSAL_STATUS }).notNull().default("pending"),
  memoryEntryId: integer("memory_entry_id"), // set when approved
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

export const insertMemoryProposalSchema = createInsertSchema(memoryProposalsTable).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
  memoryEntryId: true,
});
export type InsertMemoryProposal = z.infer<typeof insertMemoryProposalSchema>;
export type MemoryProposal = typeof memoryProposalsTable.$inferSelect;

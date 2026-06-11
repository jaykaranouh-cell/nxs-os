import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  company: text("company").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  source: text("source"),
  status: text("status").notNull().default("new"),
  stage: text("stage").notNull().default("incoming"),
  qualificationScore: integer("qualification_score"),
  notes: text("notes"),
  rejectionReason: text("rejection_reason"),
  assignedAgentId: text("assigned_agent_id"),
  nextAction: text("next_action"),
  estimatedValue: numeric("estimated_value", { precision: 12, scale: 2 }),
  industry: text("industry"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
});

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;

import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentTasksTable = pgTable("agent_tasks", {
  id: serial("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("pending"),
  priority: text("priority").notNull().default("medium"),
  relatedLeadId: integer("related_lead_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const agentLogsTable = pgTable("agent_logs", {
  id: serial("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  agentName: text("agent_name").notNull(),
  action: text("action").notNull(),
  details: text("details"),
  relatedLeadId: integer("related_lead_id"),
  relatedLeadName: text("related_lead_name"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const insertAgentTaskSchema = createInsertSchema(agentTasksTable).omit({ id: true, createdAt: true });
export type InsertAgentTask = z.infer<typeof insertAgentTaskSchema>;
export type AgentTask = typeof agentTasksTable.$inferSelect;

export const insertAgentLogSchema = createInsertSchema(agentLogsTable).omit({ id: true });
export type InsertAgentLog = z.infer<typeof insertAgentLogSchema>;
export type AgentLog = typeof agentLogsTable.$inferSelect;

import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Objectives — multi-day plays the team works toward over time, with steps,
 * owners, and progress. The maturity step beyond one-off tasks.
 */
export const OBJECTIVE_STATUS = ["active", "achieved", "abandoned"] as const;

export const objectivesTable = pgTable("objectives", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status", { enum: OBJECTIVE_STATUS }).notNull().default("active"),
  ownerAgentId: text("owner_agent_id").notNull().default("orchestrator"),
  targetDate: text("target_date"),
  progress: integer("progress").notNull().default(0), // 0-100
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
});

export const objectiveStepsTable = pgTable("objective_steps", {
  id: serial("id").primaryKey(),
  objectiveId: integer("objective_id")
    .notNull()
    .references(() => objectivesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  ownerAgentId: text("owner_agent_id").notNull().default("orchestrator"),
  done: boolean("done").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertObjectiveSchema = createInsertSchema(objectivesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type Objective = typeof objectivesTable.$inferSelect;
export type ObjectiveStep = typeof objectiveStepsTable.$inferSelect;
export type InsertObjective = z.infer<typeof insertObjectiveSchema>;

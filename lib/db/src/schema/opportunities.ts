import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const opportunitiesTable = pgTable("opportunities", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("niche"),
  source: text("source").notNull().default("manual"),
  status: text("status").notNull().default("new"),
  priority: text("priority").notNull().default("medium"),
  estimatedValue: text("estimated_value"),
  tags: text("tags"),
  notes: text("notes"),
  discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Opportunity = typeof opportunitiesTable.$inferSelect;
export type InsertOpportunity = typeof opportunitiesTable.$inferInsert;

import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const memoryEntriesTable = pgTable("memory_entries", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  summary: text("summary"),
  detailedNotes: text("detailed_notes"),
  category: text("category").notNull().default("general"),
  tags: text("tags"),
  importance: text("importance").notNull().default("medium"),
  priority: text("priority").notNull().default("medium"),
  confidence: text("confidence").notNull().default("medium"),
  status: text("status").notNull().default("active"),
  source: text("source").notNull().default("manual"),
  relatedPeople: text("related_people"),
  relatedCompanies: text("related_companies"),
  linkedProjects: text("linked_projects"),
  nextAction: text("next_action"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
  reviewedAt: timestamp("reviewed_at"),
});

export const memoryConnectionsTable = pgTable("memory_connections", {
  id: serial("id").primaryKey(),
  fromMemoryId: integer("from_memory_id").notNull(),
  toMemoryId: integer("to_memory_id").notNull(),
  relationshipType: text("relationship_type").notNull().default("related"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMemoryEntrySchema = createInsertSchema(memoryEntriesTable).omit({ id: true, createdAt: true, updatedAt: true, reviewedAt: true });
export type InsertMemoryEntry = z.infer<typeof insertMemoryEntrySchema>;
export type MemoryEntry = typeof memoryEntriesTable.$inferSelect;

export const insertMemoryConnectionSchema = createInsertSchema(memoryConnectionsTable).omit({ id: true, createdAt: true });
export type InsertMemoryConnection = z.infer<typeof insertMemoryConnectionSchema>;
export type MemoryConnection = typeof memoryConnectionsTable.$inferSelect;

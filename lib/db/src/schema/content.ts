import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Content drafts — posts Maya / the marketing agent write for Jay to review
 * and publish (e.g. LinkedIn). Jay keeps control of the actual publish.
 */
export const contentDraftsTable = pgTable("content_drafts", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull().default("linkedin"),
  content: text("content").notNull(),
  hook: text("hook"), // optional short hook/title for the list
  status: text("status").notNull().default("draft"), // draft | posted | archived
  createdBy: text("created_by").notNull().default("maya"),
  source: text("source"), // e.g. "chat", "autonomy", "weekly-ideas"
  postedAt: timestamp("posted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertContentDraftSchema = createInsertSchema(contentDraftsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertContentDraft = z.infer<typeof insertContentDraftSchema>;
export type ContentDraft = typeof contentDraftsTable.$inferSelect;

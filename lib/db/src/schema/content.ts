import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Brands — the accounts content is produced for: Jay's own brand (isSelf) and
 * each client. Lets the studio organise and filter content per brand/client.
 */
export const brandsTable = pgTable("brands", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  handle: text("handle"),
  isSelf: text("is_self").notNull().default("false"), // "true" for Jay's own brand
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertBrandSchema = createInsertSchema(brandsTable).omit({ id: true, createdAt: true });
export type Brand = typeof brandsTable.$inferSelect;

/**
 * Content drafts — posts Maya / the marketing agent write for Jay to review
 * and publish across platforms (LinkedIn, Instagram, TikTok, YouTube).
 * Jay keeps control of the actual publish.
 */
export const contentDraftsTable = pgTable("content_drafts", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull().default("linkedin"), // linkedin | instagram | tiktok | youtube
  brandId: integer("brand_id"),
  content: text("content").notNull(),
  hook: text("hook"), // optional short hook/title for the list
  imageUrl: text("image_url"), // generated visual (served under /generated)
  imagePrompt: text("image_prompt"), // prompt used to generate the image
  videoUrl: text("video_url"), // generated clip (served under /generated)
  videoModel: text("video_model"), // higgsfield model used for the video
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

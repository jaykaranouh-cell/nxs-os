import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const systemContextTable = pgTable("system_context", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SystemContextRow = typeof systemContextTable.$inferSelect;

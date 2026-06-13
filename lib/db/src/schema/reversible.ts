import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Reversible agent actions — state changes an agent made that Jay can undo.
 * Records the previous value so a revert is one click.
 */
export const REVERSIBLE_KIND = ["lead_stage", "opportunity_status"] as const;

export const reversibleActionsTable = pgTable("reversible_actions", {
  id: serial("id").primaryKey(),
  kind: text("kind", { enum: REVERSIBLE_KIND }).notNull(),
  entityId: integer("entity_id").notNull(),
  entityLabel: text("entity_label").notNull(),
  prevValue: text("prev_value").notNull(),
  newValue: text("new_value").notNull(),
  actor: text("actor").notNull().default("maya"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  undoneAt: timestamp("undone_at"),
});

export type ReversibleAction = typeof reversibleActionsTable.$inferSelect;

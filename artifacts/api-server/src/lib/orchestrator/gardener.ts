/**
 * Memory gardener — weekly maintenance so the moat doesn't silt up. Finds
 * near-duplicate active memory entries and archives the weaker of each pair
 * (lower priority, then older). Conservative: bounded scan, capped archives,
 * everything logged. Never deletes.
 */

import { db, memoryEntriesTable } from "@workspace/db";
import { and, eq, isNotNull, ne, sql, inArray } from "drizzle-orm";
import { logger } from "../logger";

const DUP_DISTANCE = 0.08; // very close = effectively the same memory
const MAX_ARCHIVE = 10;
const PRIORITY_RANK: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };

export async function runMemoryGardener(): Promise<number> {
  if (!process.env.OPENAI_API_KEY) return 0; // needs embeddings

  const active = await db
    .select()
    .from(memoryEntriesTable)
    .where(and(eq(memoryEntriesTable.status, "active"), isNotNull(memoryEntriesTable.embedding)))
    .limit(300);

  const archived = new Set<number>();

  for (const entry of active) {
    if (archived.has(entry.id) || archived.size >= MAX_ARCHIVE) continue;
    if (!entry.embedding) continue;

    const [nearest] = await db
      .select({
        id: memoryEntriesTable.id,
        priority: memoryEntriesTable.priority,
        createdAt: memoryEntriesTable.createdAt,
        distance: sql<number>`${memoryEntriesTable.embedding} <=> ${JSON.stringify(entry.embedding)}::vector`,
      })
      .from(memoryEntriesTable)
      .where(and(eq(memoryEntriesTable.status, "active"), ne(memoryEntriesTable.id, entry.id), isNotNull(memoryEntriesTable.embedding)))
      .orderBy(sql`${memoryEntriesTable.embedding} <=> ${JSON.stringify(entry.embedding)}::vector`)
      .limit(1);

    if (!nearest || nearest.distance >= DUP_DISTANCE || archived.has(nearest.id)) continue;

    // Archive the weaker: lower priority, then older.
    const keepEntry =
      (PRIORITY_RANK[entry.priority] ?? 1) !== (PRIORITY_RANK[nearest.priority] ?? 1)
        ? (PRIORITY_RANK[entry.priority] ?? 1) > (PRIORITY_RANK[nearest.priority] ?? 1)
          ? entry.id
          : nearest.id
        : entry.createdAt >= nearest.createdAt
          ? entry.id
          : nearest.id;
    const loser = keepEntry === entry.id ? nearest.id : entry.id;
    archived.add(loser);
  }

  if (archived.size > 0) {
    await db
      .update(memoryEntriesTable)
      .set({ status: "archived", updatedAt: new Date() })
      .where(inArray(memoryEntriesTable.id, [...archived]));
    logger.info({ count: archived.size }, "gardener: archived near-duplicate memories");
  }
  return archived.size;
}

/**
 * Semantic memory — OpenAI embeddings over memory entries so retrieval is
 * by relevance, not just recency. Degrades gracefully: without an OpenAI
 * key (or before backfill) everything falls back to recency-based loading.
 */

import { db, memoryEntriesTable } from "@workspace/db";
import { isNull, isNotNull, sql, eq } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../logger";
import type { MemRow } from "./context";

const EMBED_MODEL = "text-embedding-3-small"; // 1536 dims
const BACKFILL_BATCH = 20;

export const embeddingsEnabled = () => Boolean(process.env.OPENAI_API_KEY);

export async function embedText(text: string): Promise<number[] | null> {
  if (!embeddingsEnabled()) return null;
  try {
    const resp = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: text.slice(0, 8000),
    });
    return resp.data[0]?.embedding ?? null;
  } catch (err) {
    logger.warn(err, "embedding failed");
    return null;
  }
}

/** Embed memory entries that don't have a vector yet. Runs on a schedule. */
export async function backfillEmbeddings(): Promise<void> {
  if (!embeddingsEnabled()) return;
  const missing = await db
    .select()
    .from(memoryEntriesTable)
    .where(isNull(memoryEntriesTable.embedding))
    .limit(BACKFILL_BATCH);
  if (!missing.length) return;

  let done = 0;
  for (const entry of missing) {
    const vec = await embedText(`${entry.title}\n${entry.content}\n${entry.summary ?? ""}`);
    if (!vec) continue;
    await db.update(memoryEntriesTable).set({ embedding: vec }).where(eq(memoryEntriesTable.id, entry.id));
    done++;
  }
  if (done) logger.info({ done }, "embeddings: backfilled");
}

/** Top memory entries by semantic similarity to the query. */
export async function semanticSearch(query: string, limit = 30): Promise<MemRow[]> {
  const vec = await embedText(query);
  if (!vec) return [];
  return db
    .select()
    .from(memoryEntriesTable)
    .where(isNotNull(memoryEntriesTable.embedding))
    .orderBy(sql`${memoryEntriesTable.embedding} <=> ${JSON.stringify(vec)}::vector`)
    .limit(limit);
}

/** Cosine distance via pgvector: returns the nearest existing entry + distance. */
export async function nearestMemory(text: string): Promise<{ id: number; title: string; distance: number } | null> {
  const vec = await embedText(text);
  if (!vec) return null;
  const rows = await db
    .select({
      id: memoryEntriesTable.id,
      title: memoryEntriesTable.title,
      distance: sql<number>`${memoryEntriesTable.embedding} <=> ${JSON.stringify(vec)}::vector`,
    })
    .from(memoryEntriesTable)
    .where(isNotNull(memoryEntriesTable.embedding))
    .orderBy(sql`${memoryEntriesTable.embedding} <=> ${JSON.stringify(vec)}::vector`)
    .limit(1);
  return rows[0] ?? null;
}

/** True when text is near-duplicate of an existing memory (cosine distance < threshold). */
export async function isDuplicateMemory(text: string, threshold = 0.12): Promise<boolean> {
  const near = await nearestMemory(text);
  return near != null && near.distance < threshold;
}

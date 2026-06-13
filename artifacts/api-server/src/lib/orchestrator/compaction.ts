/**
 * Conversation compaction — a rolling summary of older chat history so Maya
 * remembers long working sessions beyond the 20-message window. Stored in
 * system_context under "chat-summary" as { summary, lastMessageId }.
 */

import { db, chatMessagesTable, systemContextTable } from "@workspace/db";
import { asc, eq, gt } from "drizzle-orm";
import { completeText } from "./llm";
import { logger } from "../logger";

const KEY = "chat-summary";
const COMPACT_WHEN_OVER = 40; // un-summarized messages before we compact
const KEEP_RECENT = 20; // newest messages stay verbatim in the window

interface CompactionState {
  summary: string;
  lastMessageId: number;
}

export async function loadConversationSummary(): Promise<CompactionState | null> {
  const [row] = await db.select().from(systemContextTable).where(eq(systemContextTable.key, KEY));
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as CompactionState;
    return parsed.summary ? parsed : null;
  } catch {
    return null;
  }
}

async function saveState(state: CompactionState): Promise<void> {
  const value = JSON.stringify(state);
  await db
    .insert(systemContextTable)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: systemContextTable.key, set: { value, updatedAt: new Date() } });
}

/** Fire-and-forget: fold older messages into the rolling summary when due. */
export function maybeCompactConversation(): void {
  void (async () => {
    try {
      const state = await loadConversationSummary();
      const lastId = state?.lastMessageId ?? 0;

      const fresh = await db
        .select()
        .from(chatMessagesTable)
        .where(gt(chatMessagesTable.id, lastId))
        .orderBy(asc(chatMessagesTable.id));
      if (fresh.length <= COMPACT_WHEN_OVER) return;

      const toFold = fresh.slice(0, fresh.length - KEEP_RECENT);
      const transcript = toFold
        .map((m) => `${m.role === "user" ? "Jay" : "Maya"}: ${m.content.slice(0, 600)}`)
        .join("\n");

      const summary = await completeText({
        role: "capture",
        scope: "compact",
        system:
          "You maintain a running summary of the conversation between Jay (founder) and Maya (his AI chief of staff). Merge the previous summary with the new transcript into ONE updated summary under 300 words: decisions, commitments, open threads, key numbers, and emotional context worth keeping. Plain prose, no headers.",
        user: `Previous summary:\n${state?.summary ?? "(none)"}\n\nNew transcript to fold in:\n${transcript}`,
        maxTokens: 800,
        effortLow: true,
      });
      if (!summary.trim()) return;

      await saveState({ summary: summary.trim(), lastMessageId: toFold[toFold.length - 1].id });
      logger.info({ folded: toFold.length }, "compaction: conversation summary updated");
    } catch (err) {
      logger.warn(err, "compaction failed");
    }
  })();
}

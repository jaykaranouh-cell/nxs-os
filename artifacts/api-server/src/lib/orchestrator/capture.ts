/**
 * Auto-capture — after each chat turn, distill anything worth remembering
 * (decisions, lessons, commitments, key facts) into memory_proposals for
 * Jay to approve. Fire-and-forget: never blocks or fails the chat turn.
 */

import { db, memoryProposalsTable, insertMemoryProposalSchema } from "@workspace/db";
import { completeText } from "./llm";
import { z } from "zod/v4";
import { logger } from "../logger";
import { isDuplicateMemory } from "./embeddings";

const EXTRACTION_PROMPT = `You extract durable business memory from a conversation turn between Jay (founder) and his AI Chief of Staff.

Extract ONLY facts worth remembering permanently: decisions made, lessons learned, commitments with deadlines, important client/deal/financial facts, or strategy changes. Skip questions, advice that wasn't accepted, generic discussion, and anything already implied to be in memory.

Most turns contain NOTHING worth saving — an empty list is the most common correct answer.

Respond with JSON only: {"proposals": [{"title": "...", "content": "...", "category": "decisions|lessons_learned|goals|client_notes|company_context|general", "priority": "low|medium|high|critical", "nextAction": "... or omit"}]}`;

const proposalsSchema = z.object({
  proposals: z
    .array(
      z.object({
        title: z.string().min(1),
        content: z.string().min(1),
        category: z.string().default("general"),
        priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
        nextAction: z.string().optional(),
      })
    )
    .max(4),
});

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

export function captureMemoryFromTurn(
  userMessage: string,
  response: string,
  messageId: number,
  alreadySaved: string[] = []
): void {
  // Trivial turns can't contain durable memory — don't spend a call on them.
  if (userMessage.length < 40 || !response) return;

  void (async () => {
    try {
      const text = await completeText({
        role: "capture",
        scope: "capture",
        system: EXTRACTION_PROMPT,
        user: `Jay said:\n${userMessage}\n\nChief of Staff replied:\n${response}${
          alreadySaved.length
            ? `\n\nAlready saved to memory this turn (do NOT propose these again):\n${alreadySaved.map((s) => `- ${s}`).join("\n")}`
            : ""
        }`,
        maxTokens: 1000,
        effortLow: true,
      });

      const parsed = proposalsSchema.safeParse(JSON.parse(extractJson(text) || "{}"));
      if (!parsed.success || parsed.data.proposals.length === 0) return;

      // Drop candidates that duplicate something already in memory.
      const fresh = [];
      for (const p of parsed.data.proposals) {
        if (await isDuplicateMemory(`${p.title}\n${p.content}`)) continue;
        fresh.push(p);
      }
      if (fresh.length === 0) return;
      const rows = fresh.map((p) =>
        insertMemoryProposalSchema.parse({
          title: p.title,
          content: p.content,
          category: p.category,
          priority: p.priority,
          nextAction: p.nextAction ?? null,
          source: "chat",
          sourceRef: String(messageId),
        })
      );
      await db.insert(memoryProposalsTable).values(rows);
      logger.info({ count: rows.length }, "memory proposals captured");
    } catch (err) {
      logger.warn(err, "auto-capture failed");
    }
  })();
}

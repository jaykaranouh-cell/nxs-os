/**
 * Daily spend guard. When NXS_DAILY_BUDGET_USD is set, LLM calls are blocked
 * once today's estimated spend crosses it — a hard stop against runaway loops.
 */

import { db, llmUsageTable } from "@workspace/db";
import { gte } from "drizzle-orm";
import { rowCost } from "./pricing";

export class BudgetExceededError extends Error {
  constructor(spent: number, cap: number) {
    super(`Daily LLM budget reached: $${spent.toFixed(2)} of $${cap.toFixed(2)}. Calls paused until tomorrow.`);
    this.name = "BudgetExceededError";
  }
}

let cache: { at: number; spent: number } | null = null;
const CACHE_MS = 30_000;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function todaySpendUsd(): Promise<number> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.spent;
  const rows = await db.select().from(llmUsageTable).where(gte(llmUsageTable.createdAt, startOfToday()));
  const spent = rows.reduce((sum, r) => sum + rowCost(r), 0);
  cache = { at: Date.now(), spent };
  return spent;
}

export function dailyCap(): number | null {
  const raw = process.env.NXS_DAILY_BUDGET_USD;
  if (!raw) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Throws BudgetExceededError when today's spend has reached the cap. */
export async function assertWithinBudget(): Promise<void> {
  const cap = dailyCap();
  if (cap == null) return;
  const spent = await todaySpendUsd();
  if (spent >= cap) throw new BudgetExceededError(spent, cap);
}

/** Invalidate the cache after a recorded call so the guard stays current. */
export function bumpSpendCache(deltaUsd: number): void {
  if (cache) cache.spent += deltaUsd;
}

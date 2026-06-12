/**
 * Team roster — Maya-given names for the agents, overlaying the static
 * department definitions. Stored in system_context under "agent-roster"
 * as { [agentId]: name }. Falls back to the definition name when unset.
 */

import { db, systemContextTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAgent } from "./agents";

const ROSTER_KEY = "agent-roster";
const CACHE_TTL_MS = 30_000;

let cache: { data: Record<string, string>; at: number } | null = null;

export async function getRoster(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  const [row] = await db.select().from(systemContextTable).where(eq(systemContextTable.key, ROSTER_KEY));
  let data: Record<string, string> = {};
  if (row) {
    try {
      data = JSON.parse(row.value) as Record<string, string>;
    } catch {}
  }
  cache = { data, at: Date.now() };
  return data;
}

export async function setAgentName(agentId: string, name: string): Promise<void> {
  const roster = { ...(await getRoster()), [agentId]: name };
  const value = JSON.stringify(roster);
  await db
    .insert(systemContextTable)
    .values({ key: ROSTER_KEY, value })
    .onConflictDoUpdate({ target: systemContextTable.key, set: { value, updatedAt: new Date() } });
  cache = { data: roster, at: Date.now() };
}

/** Display name for an agent: Maya-given name, else the definition name. */
export async function displayName(agentId: string): Promise<string> {
  const roster = await getRoster();
  return roster[agentId] ?? getAgent(agentId)?.name ?? agentId;
}

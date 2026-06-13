/**
 * Per-agent profile — each department agent's own charter, playbooks,
 * knowledge, and private memory, assembled into a prompt block that layers
 * on top of the shared business briefing.
 */

import { db, agentKbTable, systemContextTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";

const INSTRUCTIONS_KEY = "agent-instructions";
const MAX_MEMORY = 12;

export interface AgentProfile {
  instructions: string;
  skills: { id: number; title: string; content: string }[];
  knowledge: { id: number; title: string; content: string }[];
  memory: { id: number; title: string; content: string; createdAt: string }[];
}

async function getInstructionsMap(): Promise<Record<string, string>> {
  const [row] = await db.select().from(systemContextTable).where(eq(systemContextTable.key, INSTRUCTIONS_KEY));
  if (!row) return {};
  try {
    return JSON.parse(row.value) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function getAgentInstructions(agentId: string): Promise<string> {
  return (await getInstructionsMap())[agentId] ?? "";
}

export async function setAgentInstructions(agentId: string, instructions: string): Promise<void> {
  const map = { ...(await getInstructionsMap()), [agentId]: instructions };
  const value = JSON.stringify(map);
  await db
    .insert(systemContextTable)
    .values({ key: INSTRUCTIONS_KEY, value })
    .onConflictDoUpdate({ target: systemContextTable.key, set: { value, updatedAt: new Date() } });
}

/** Full profile for the UI / API. */
export async function loadAgentProfile(agentId: string): Promise<AgentProfile> {
  const [instructions, rows] = await Promise.all([
    getAgentInstructions(agentId),
    db.select().from(agentKbTable).where(eq(agentKbTable.agentId, agentId)).orderBy(desc(agentKbTable.createdAt)),
  ]);
  return {
    instructions,
    skills: rows.filter((r) => r.kind === "skill").map((r) => ({ id: r.id, title: r.title, content: r.content })),
    knowledge: rows.filter((r) => r.kind === "knowledge").map((r) => ({ id: r.id, title: r.title, content: r.content })),
    memory: rows
      .filter((r) => r.kind === "memory")
      .map((r) => ({ id: r.id, title: r.title, content: r.content, createdAt: r.createdAt.toISOString() })),
  };
}

/** The agent's own profile rendered as a system-prompt block. */
export async function buildAgentProfileBlock(agentId: string): Promise<string> {
  const [instructions, rows] = await Promise.all([
    getAgentInstructions(agentId),
    db.select().from(agentKbTable).where(eq(agentKbTable.agentId, agentId)).orderBy(desc(agentKbTable.createdAt)),
  ]);

  const skills = rows.filter((r) => r.kind === "skill");
  const knowledge = rows.filter((r) => r.kind === "knowledge");
  const memory = rows.filter((r) => r.kind === "memory").slice(0, MAX_MEMORY);

  const parts: string[] = [];
  if (instructions.trim()) parts.push(`## Your Instructions\n${instructions.trim()}`);
  if (skills.length) {
    parts.push(`## Your Playbooks\n${skills.map((s) => `### ${s.title}\n${s.content}`).join("\n\n")}`);
  }
  if (knowledge.length) {
    parts.push(`## Your Knowledge Base\n${knowledge.map((k) => `### ${k.title}\n${k.content}`).join("\n\n")}`);
  }
  if (memory.length) {
    parts.push(
      `## Your Private Memory (notes you've saved)\n${memory.map((m) => `- ${m.title}: ${m.content}`).join("\n")}`
    );
  }
  return parts.length ? `\n\n${parts.join("\n\n")}` : "";
}

/** An agent writes a private memory note for itself. */
export async function rememberForAgent(agentId: string, title: string, content: string): Promise<void> {
  await db.insert(agentKbTable).values({ agentId, kind: "memory", title, content, source: "agent" });
}

export async function addAgentKb(
  agentId: string,
  kind: "skill" | "knowledge",
  title: string,
  content: string,
  source: "manual" | "maya" = "manual"
): Promise<number> {
  const [row] = await db.insert(agentKbTable).values({ agentId, kind, title, content, source }).returning();
  return row.id;
}

export async function deleteAgentKb(agentId: string, id: number): Promise<boolean> {
  const deleted = await db
    .delete(agentKbTable)
    .where(and(eq(agentKbTable.id, id), eq(agentKbTable.agentId, agentId)))
    .returning({ id: agentKbTable.id });
  return deleted.length > 0;
}

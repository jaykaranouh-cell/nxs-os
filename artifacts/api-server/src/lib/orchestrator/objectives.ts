/**
 * Objectives — multi-day plays the team drives toward. Helpers for assembly
 * into context and for Maya's tools.
 */

import { db, objectivesTable, objectiveStepsTable } from "@workspace/db";
import { and, asc, desc, eq } from "drizzle-orm";

export async function activeObjectivesBlock(): Promise<string> {
  const objectives = await db
    .select()
    .from(objectivesTable)
    .where(eq(objectivesTable.status, "active"))
    .orderBy(desc(objectivesTable.createdAt))
    .limit(6);
  if (!objectives.length) return "";

  const lines: string[] = [];
  for (const o of objectives) {
    const steps = await db
      .select()
      .from(objectiveStepsTable)
      .where(eq(objectiveStepsTable.objectiveId, o.id))
      .orderBy(asc(objectiveStepsTable.id));
    const stepLine = steps.length
      ? steps.map((s) => `${s.done ? "✓" : "○"} ${s.title}`).join("; ")
      : "no steps yet";
    lines.push(
      `- [${o.progress}%] ${o.title}${o.targetDate ? ` (by ${o.targetDate})` : ""}: ${stepLine}`
    );
  }
  return `## Active Objectives\n${lines.join("\n")}`;
}

export async function createObjective(input: {
  title: string;
  description?: string;
  ownerAgentId?: string;
  targetDate?: string;
}): Promise<number> {
  const [row] = await db
    .insert(objectivesTable)
    .values({
      title: input.title,
      description: input.description ?? "",
      ownerAgentId: input.ownerAgentId ?? "orchestrator",
      targetDate: input.targetDate ?? null,
    })
    .returning();
  return row.id;
}

export async function addObjectiveStep(objectiveId: number, title: string, ownerAgentId?: string): Promise<boolean> {
  const [obj] = await db.select().from(objectivesTable).where(eq(objectivesTable.id, objectiveId));
  if (!obj) return false;
  await db.insert(objectiveStepsTable).values({ objectiveId, title, ownerAgentId: ownerAgentId ?? "orchestrator" });
  return true;
}

/** Recompute progress from completed steps, or set it directly. */
export async function updateObjectiveProgress(
  objectiveId: number,
  opts: { progress?: number; status?: "active" | "achieved" | "abandoned"; completeStep?: string }
): Promise<boolean> {
  const [obj] = await db.select().from(objectivesTable).where(eq(objectivesTable.id, objectiveId));
  if (!obj) return false;

  if (opts.completeStep) {
    const steps = await db.select().from(objectiveStepsTable).where(eq(objectiveStepsTable.objectiveId, objectiveId));
    const match = steps.find((s) => s.title.toLowerCase().includes(opts.completeStep!.toLowerCase()) && !s.done);
    if (match) await db.update(objectiveStepsTable).set({ done: true }).where(eq(objectiveStepsTable.id, match.id));
  }

  // Derive progress from steps unless explicitly overridden.
  let progress = opts.progress;
  if (progress == null) {
    const steps = await db.select().from(objectiveStepsTable).where(eq(objectiveStepsTable.objectiveId, objectiveId));
    progress = steps.length ? Math.round((steps.filter((s) => s.done).length / steps.length) * 100) : obj.progress;
  }
  progress = Math.max(0, Math.min(100, progress));

  await db
    .update(objectivesTable)
    .set({ progress, status: opts.status ?? (progress >= 100 ? "achieved" : obj.status), updatedAt: new Date() })
    .where(eq(objectivesTable.id, objectiveId));
  return true;
}

export async function listObjectives() {
  const objectives = await db.select().from(objectivesTable).orderBy(desc(objectivesTable.createdAt));
  const result = [];
  for (const o of objectives) {
    const steps = await db
      .select()
      .from(objectiveStepsTable)
      .where(eq(objectiveStepsTable.objectiveId, o.id))
      .orderBy(asc(objectiveStepsTable.id));
    result.push({
      ...o,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt?.toISOString() ?? null,
      steps: steps.map((st) => ({ id: st.id, title: st.title, done: st.done, ownerAgentId: st.ownerAgentId })),
    });
  }
  return result;
}

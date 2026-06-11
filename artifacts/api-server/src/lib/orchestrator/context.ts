import { db } from "@workspace/db";
import {
  memoryEntriesTable,
  opportunitiesTable,
  systemContextTable,
} from "@workspace/db";
import { desc, inArray } from "drizzle-orm";

export interface BrainBusiness {
  vision?: string;
  mission?: string;
  principles?: string[];
  revenueTarget?: string;
  growthStrategy?: string;
  riskTolerance?: string;
  orchestratorRules?: string[];
}
export interface BrainPersonal {
  vision?: string;
  purpose?: string;
  values?: string[];
  workingStyle?: string;
  healthPriorities?: string[];
  wealthGoals?: string;
  nonNegotiables?: string[];
}
export interface BrainData {
  business?: BrainBusiness;
  personal?: BrainPersonal;
}

export type MemRow = typeof memoryEntriesTable.$inferSelect;
export type OppRow = typeof opportunitiesTable.$inferSelect;

export interface OrchestratorContext {
  brain: BrainData | null;
  goals: MemRow[];
  decisions: MemRow[];
  lessons: MemRow[];
  risks: MemRow[];
  priorities: MemRow[];
  topActions: MemRow[];
  allOpps: OppRow[];
  hotOpps: OppRow[];
  notPursued: OppRow[];
  totalMemory: number;
  setupCtx: Record<string, unknown> | null;
}

export const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const CONTEXT_KEYS = [
  "brain",
  "setup-business-profile",
  "setup-revenue-goal",
  "setup-sales-strategy",
  "setup-services",
  "setup-delivery-process",
  "setup-operating-rules",
];

// Bound context queries so prompt size and latency stay flat as memory grows.
const MEMORY_LIMIT = 400;
const OPPS_LIMIT = 150;

export async function loadContext(): Promise<OrchestratorContext> {
  const [allMemory, allOpps, ctxRows] = await Promise.all([
    db
      .select()
      .from(memoryEntriesTable)
      .orderBy(desc(memoryEntriesTable.createdAt))
      .limit(MEMORY_LIMIT),
    db
      .select()
      .from(opportunitiesTable)
      .orderBy(desc(opportunitiesTable.updatedAt))
      .limit(OPPS_LIMIT),
    db.select().from(systemContextTable).where(inArray(systemContextTable.key, CONTEXT_KEYS)),
  ]);

  let brain: BrainData | null = null;
  let setupCtx: Record<string, unknown> | null = null;

  for (const row of ctxRows) {
    try {
      const parsed = JSON.parse(row.value) as unknown;
      if (row.key === "brain") {
        brain = parsed as BrainData;
      } else if (row.key.startsWith("setup-")) {
        if (!setupCtx) setupCtx = {};
        setupCtx[row.key.replace("setup-", "")] = parsed;
      }
    } catch {}
  }

  const active = allMemory.filter((m) => m.status !== "archived");
  const goals = active.filter((m) => m.category === "goals");
  const decisions = allMemory.filter(
    (m) => m.category === "decisions" || m.category === "decision"
  );
  const lessons = allMemory.filter((m) => m.category === "lessons_learned");
  const risks = active.filter(
    (m) => m.status === "needs_review" || (m.priority === "critical" && m.importance === "critical")
  );
  const priorities = active
    .filter((m) => m.priority === "critical" || m.priority === "high")
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2))
    .slice(0, 8);
  const topActions = active
    .filter((m) => m.nextAction)
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2))
    .slice(0, 5);

  const activeOpps = allOpps.filter((o) => o.status !== "rejected");
  const hotOpps = activeOpps.filter((o) => o.priority === "critical" || o.priority === "high");
  const notPursued = activeOpps.filter((o) => o.status === "new" || o.status === "evaluating");

  return {
    brain,
    goals,
    decisions,
    lessons,
    risks,
    priorities,
    topActions,
    allOpps: activeOpps,
    hotOpps,
    notPursued,
    totalMemory: allMemory.length,
    setupCtx,
  };
}

export function shortMem(m: MemRow, maxChars = 110): string {
  return m.summary ?? m.content.substring(0, maxChars);
}

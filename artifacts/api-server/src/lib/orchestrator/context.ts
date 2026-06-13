import { db } from "@workspace/db";
import {
  memoryEntriesTable,
  opportunitiesTable,
  systemContextTable,
  agentMessagesTable,
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
export interface BrainMaya {
  vibe?: string;
  humour?: string;
  address?: string;
  quirks?: string[];
  signoff?: string;
  extra?: string;
}
export interface BrainData {
  business?: BrainBusiness;
  personal?: BrainPersonal;
  maya?: BrainMaya;
}

/** Maya's default personality — used until Jay customises it in Strategic Brain. */
export const DEFAULT_MAYA: BrainMaya = {
  vibe: "Jay's sparring partner: sharp, loyal, switched-on, and practical. Talks like a real person who actually cares about the outcome, never like a corporate assistant. Warm, but doesn't baby Jay. Challenges weak ideas, pressure-tests assumptions, calls out risks, and never blindly agrees.",
  humour: "Slightly cheeky, dry, and quick. Swearing is allowed when it lands (never forced, never aimed at clients). No corporate nonsense, no robotic disclaimers, no motivational fluff.",
  address: "Jay, casual and direct, like a business partner. Occasionally 'boss' when delivering good news.",
  quirks: [
    "When Jay pitches an idea, opens with 3 to 5 sharp questions, risks, or blind spots before any recommendation",
    "Never says 'great idea' unless it actually is one. If pricing is too cheap or a plan has holes, says so straight",
    "When Jay is rushing, slows him down with useful pushback. When he's overthinking, simplifies the next move",
    "When Jay asks for execution, stops debating and produces the asset: copy, plan, prompt, or structure",
    "Calls out wins explicitly before moving to what's next",
    "Matches Jay's energy: quick messages get quick replies, not essays",
  ],
  signoff: "Occasionally ends a major brief with: 'Go get it.'",
  extra: "Role: strategist, creative partner, business advisor, copywriter, and execution assistant in one. Plain language, practical and actionable, no long-winded theory unless asked. Writing rule: never use em dashes. Use commas, colons, or short sentences instead.",
};

export type MemRow = typeof memoryEntriesTable.$inferSelect;
export type OppRow = typeof opportunitiesTable.$inferSelect;

export interface TeamMessage {
  fromAgentName: string;
  toAgentId: string;
  content: string;
}

export interface OrchestratorContext {
  brain: BrainData | null;
  teamMessages: TeamMessage[];
  objectivesBlock: string;
  calendarBlock: string;
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

export async function loadContext(query?: string): Promise<OrchestratorContext> {
  // Relevance-aware loading: when a query is given and embeddings exist,
  // merge the semantically closest entries with the most recent ones.
  const { semanticSearch, embeddingsEnabled } = await import("./embeddings");
  const { activeObjectivesBlock } = await import("./objectives");
  const { upcomingEventsBlock } = await import("../calendar");
  const semanticPromise =
    query && embeddingsEnabled() ? semanticSearch(query, 30).catch(() => []) : Promise.resolve([]);
  const objectivesPromise = activeObjectivesBlock().catch(() => "");
  const calendarPromise = upcomingEventsBlock().catch(() => "");

  const [recentMemory, allOpps, ctxRows, teamRows, semantic] = await Promise.all([
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
    db
      .select()
      .from(agentMessagesTable)
      .where(inArray(agentMessagesTable.toAgentId, ["orchestrator", "all"]))
      .orderBy(desc(agentMessagesTable.createdAt))
      .limit(8),
    semanticPromise,
  ]);

  // Semantic hits first, then recency; dedupe by id.
  const seen = new Set<number>();
  const allMemory = [...semantic, ...recentMemory].filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

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

  const [objectivesBlock, calendarBlock] = await Promise.all([objectivesPromise, calendarPromise]);

  return {
    brain,
    objectivesBlock,
    calendarBlock,
    teamMessages: teamRows.reverse().map((m) => ({
      fromAgentName: m.fromAgentName,
      toAgentId: m.toAgentId,
      content: m.content,
    })),
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

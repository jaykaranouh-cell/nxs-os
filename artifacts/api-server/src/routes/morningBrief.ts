import { Router } from "express";
import { db } from "@workspace/db";
import {
  memoryEntriesTable,
  opportunitiesTable,
  systemContextTable,
  leadsTable,
} from "@workspace/db";
import { desc, eq, inArray } from "drizzle-orm";
import { completeText } from "../lib/orchestrator/llm";

const router = Router();

const CACHE_KEY = "morning-brief-cache";
const LAST_IDS_KEY = "morning-brief-last-ids";

const CONTEXT_KEYS = [
  "brain",
  "setup-business-profile",
  "setup-revenue-goal",
  "setup-sales-strategy",
  "setup-services",
  "setup-delivery-process",
  "setup-operating-rules",
];

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function safeNum(v: unknown): number {
  const n = parseFloat(String(v ?? "0"));
  return isNaN(n) ? 0 : n;
}

export async function generateBrief() {
  const [allMemory, allOpps, allLeads, ctxRows, lastIdsRow] = await Promise.all([
    db.select().from(memoryEntriesTable).orderBy(desc(memoryEntriesTable.createdAt)),
    db.select().from(opportunitiesTable).orderBy(desc(opportunitiesTable.updatedAt)),
    db.select().from(leadsTable).orderBy(desc(leadsTable.createdAt)),
    db.select().from(systemContextTable).where(inArray(systemContextTable.key, CONTEXT_KEYS)),
    db
      .select()
      .from(systemContextTable)
      .where(eq(systemContextTable.key, LAST_IDS_KEY))
      .then((r) => r[0]),
  ]);

  let brain: Record<string, unknown> | null = null;
  const setup: Record<string, unknown> = {};
  for (const row of ctxRows) {
    try {
      const parsed = JSON.parse(row.value) as unknown;
      if (row.key === "brain") brain = parsed as Record<string, unknown>;
      else setup[row.key.replace("setup-", "")] = parsed;
    } catch {}
  }

  let lastMemIds = new Set<number>();
  let lastOppIds = new Set<number>();
  if (lastIdsRow) {
    try {
      const parsed = JSON.parse(lastIdsRow.value) as { memIds?: number[]; oppIds?: number[] };
      lastMemIds = new Set(parsed.memIds ?? []);
      lastOppIds = new Set(parsed.oppIds ?? []);
    } catch {}
  }

  const activeMemory = allMemory.filter((m) => m.status !== "archived");
  const activeOpps = allOpps.filter((o) => o.status !== "rejected");
  const activeLeads = allLeads.filter((l) => l.status !== "rejected");

  const newMemCount = activeMemory.filter((m) => !lastMemIds.has(m.id)).length;
  const newOppCount = activeOpps.filter((o) => !lastOppIds.has(o.id)).length;

  const brainBiz = (brain as { business?: Record<string, unknown> } | null)?.business ?? {};
  const brainPersonal = (brain as { personal?: Record<string, unknown> } | null)?.personal ?? {};

  const brainText = brain
    ? [
        brainBiz.vision ? `Vision: ${brainBiz.vision}` : "",
        brainBiz.revenueTarget ? `Revenue target: ${brainBiz.revenueTarget}` : "",
        brainBiz.growthStrategy ? `Growth strategy: ${brainBiz.growthStrategy}` : "",
        Array.isArray(brainBiz.orchestratorRules) && brainBiz.orchestratorRules.length
          ? `Rules: ${(brainBiz.orchestratorRules as string[]).join("; ")}`
          : "",
        brainPersonal.nonNegotiables && Array.isArray(brainPersonal.nonNegotiables)
          ? `Non-negotiables: ${(brainPersonal.nonNegotiables as string[]).join("; ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "Not configured";

  const setupText =
    Object.keys(setup).length > 0
      ? Object.entries(setup)
          .map(([k, v]) => `${k}: ${JSON.stringify(v).slice(0, 200)}`)
          .join("\n")
      : "Not configured";

  const topMemLines = activeMemory
    .filter((m) => m.priority === "critical" || m.priority === "high")
    .slice(0, 15)
    .map(
      (m) =>
        `[${m.category}/${m.priority}] ${m.title}: ${(m.summary ?? m.content).slice(0, 120)}${
          m.nextAction ? ` → NEXT: ${m.nextAction}` : ""
        }`
    );

  const topOppLines = activeOpps
    .filter((o) => o.priority === "critical" || o.priority === "high")
    .slice(0, 8)
    .map(
      (o) =>
        `[${o.category}/${o.status}/${o.priority}] ${o.title}: ${o.description.slice(0, 100)}${
          o.estimatedValue ? ` (~${o.estimatedValue})` : ""
        }`
    );

  const hotLeads = activeLeads
    .filter(
      (l) =>
        l.status === "qualified" &&
        (l.stage === "negotiation" || l.stage === "proposal" || l.stage === "sales_review")
    )
    .sort((a, b) => safeNum(b.estimatedValue) - safeNum(a.estimatedValue))
    .slice(0, 4);

  const pipelineValue = activeLeads.reduce((sum, l) => sum + safeNum(l.estimatedValue), 0);

  const hotLeadLines = hotLeads.map(
    (l) =>
      `${l.name} @ ${l.company} — ${l.stage} — $${safeNum(l.estimatedValue).toLocaleString()}${
        l.nextAction ? ` — NEXT: ${l.nextAction}` : ""
      }`
  );

  const prompt = `You are the AI Chief of Staff for Jay, a solo founder building an AI business OS. Generate a concise morning executive briefing as a JSON object.

## Strategic Brain
${brainText}

## Business Context Setup
${setupText}

## High-Priority Memory (${activeMemory.length} total entries)
${topMemLines.join("\n") || "None captured yet"}

## Opportunities (${activeOpps.length} active)
${topOppLines.join("\n") || "None"}

## Pipeline
Total active pipeline value: $${pipelineValue.toLocaleString()}
Hot leads in active stages:
${hotLeadLines.join("\n") || "No hot leads in active stages"}
All leads: ${activeLeads.length} active (${activeLeads.filter((l) => l.status === "qualified").length} qualified)

## Changes Since Last Brief
${newMemCount} new memory entries, ${newOppCount} new opportunities

---

Return ONLY valid JSON with NO markdown fences. Match this exact structure:

{
  "headline": "One direct sentence naming the most important thing right now — be specific, use real names/numbers",
  "situationReport": "2-3 sentence executive summary. Where does the business stand today? Be direct and specific.",
  "weekFocus": {
    "objective": "The single most important thing to own this week — one sentence",
    "rationale": "Why this above everything else — one sentence"
  },
  "pipelinePulse": {
    "summary": "One sentence pipeline read",
    "hotLeads": [{ "name": "string", "company": "string", "stage": "string", "action": "string", "value": 0 }],
    "pipelineValue": 0,
    "insight": "One sentence on what the pipeline signals for the business"
  },
  "risksAndDecisions": [
    { "title": "string", "urgency": "high", "recommendation": "string" }
  ],
  "opportunitiesToPush": [
    { "title": "string", "why": "string", "estimatedValue": "string or null" }
  ],
  "memoryHighlights": [
    { "title": "string", "whatChanged": "One sentence on why this matters" }
  ],
  "chiefOfStaffCall": {
    "action": "The single most important next action — be specific",
    "timeframe": "Now",
    "why": "One sentence — why this above everything"
  },
  "newSinceLastBrief": ["Short description of what is new — max 3 items"]
}

Constraints:
- Address Jay by name once in the headline or situationReport
- risksAndDecisions: 1–3 items max; urgency must be "high" or "critical"
- opportunitiesToPush: 1–3 items max
- memoryHighlights: 1–3 items max; only genuinely notable entries
- hotLeads: 1–4 items; value field must be a number
- newSinceLastBrief: 0–3 items; omit array items if nothing meaningful is new
- If data is thin, be honest. Do not pad with generic advice.
- Be a Chief of Staff, not a report generator. Direct, specific, decisive.`;

  const completion = await completeText({
    role: "brief",
    scope: "brief",
    system: "Respond with a single valid JSON object only — no markdown fences, no surrounding text.",
    user: prompt,
    maxTokens: 4000,
    temperature: 0.35,
  });

  const raw = completion.replace(/^```(?:json)?\s*|```\s*$/g, "").trim() || "{}";
  let brief: Record<string, unknown>;
  try {
    brief = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    brief = { headline: "Brief generation encountered a parsing issue — retry shortly.", situationReport: raw.slice(0, 300) };
  }

  const now = new Date().toISOString();
  const currentMemIds = activeMemory.map((m) => m.id);
  const currentOppIds = activeOpps.map((o) => o.id);

  const cacheValue = JSON.stringify({ ...brief, generatedAt: now, date: todayKey() });
  const idsValue = JSON.stringify({ memIds: currentMemIds, oppIds: currentOppIds });

  await Promise.all([
    db
      .insert(systemContextTable)
      .values({ key: CACHE_KEY, value: cacheValue })
      .onConflictDoUpdate({ target: systemContextTable.key, set: { value: cacheValue, updatedAt: new Date() } }),
    db
      .insert(systemContextTable)
      .values({ key: LAST_IDS_KEY, value: idsValue })
      .onConflictDoUpdate({ target: systemContextTable.key, set: { value: idsValue, updatedAt: new Date() } }),
  ]);

  return { ...brief, generatedAt: now, isFromCache: false };
}

// GET /morning-brief
router.get("/morning-brief", async (req, res) => {
  try {
    const cacheRow = await db
      .select()
      .from(systemContextTable)
      .where(eq(systemContextTable.key, CACHE_KEY))
      .then((r) => r[0]);

    if (cacheRow) {
      try {
        const cached = JSON.parse(cacheRow.value) as { date?: string };
        if (cached.date === todayKey()) {
          return res.json({ ...cached, isFromCache: true });
        }
      } catch {}
    }

    const brief = await generateBrief();
    return res.json(brief);
  } catch (err) {
    req.log.error(err, "Morning brief generation error");
    return res.status(500).json({ error: "Failed to generate morning brief" });
  }
});

// POST /morning-brief/refresh — force regenerate
router.post("/morning-brief/refresh", async (req, res) => {
  try {
    const brief = await generateBrief();
    return res.json(brief);
  } catch (err) {
    req.log.error(err, "Morning brief refresh error");
    return res.status(500).json({ error: "Failed to refresh morning brief" });
  }
});

export default router;

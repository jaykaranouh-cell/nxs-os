import { Router } from "express";
import { db } from "@workspace/db";
import { memoryEntriesTable, opportunitiesTable, systemContextTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

const router = Router();

// GET /daily-plan
router.get("/daily-plan", async (req, res) => {
  interface PlanBrain {
    business?: { vision?: string; revenueTarget?: string; growthStrategy?: string; principles?: string[] };
    personal?: { vision?: string; wealthGoals?: string };
  }

  const [allMemory, allOpps, ctxRows] = await Promise.all([
    db.select().from(memoryEntriesTable).orderBy(desc(memoryEntriesTable.createdAt)),
    db.select().from(opportunitiesTable).orderBy(desc(opportunitiesTable.discoveredAt)),
    db.select().from(systemContextTable).where(eq(systemContextTable.key, "brain")),
  ]);

  let brain: PlanBrain | null = null;
  if (ctxRows[0]) {
    try { brain = JSON.parse(ctxRows[0].value) as PlanBrain; } catch {}
  }

  const brainKeywords: string[] = [
    ...(brain?.business?.vision ?? "").toLowerCase().split(/\s+/),
    ...(brain?.business?.growthStrategy ?? "").toLowerCase().split(/\s+/),
    ...(brain?.business?.revenueTarget ?? "").toLowerCase().split(/\s+/),
  ].filter((w) => w.length > 4);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const activeMemory = allMemory.filter((r) => r.status !== "archived");
  const activeOpps = allOpps.filter((o) => o.status !== "rejected");

  // ── Scoring ──────────────────────────────────────────────────────────────────
  function memScore(r: typeof allMemory[number]): number {
    if (r.status === "archived") return -999;
    const p = r.priority ?? r.importance ?? "low";
    let s = ({ critical: 50, high: 35, medium: 20, low: 5 } as Record<string, number>)[p] ?? 5;
    if (r.category === "goals") s += 25;
    if (r.nextAction) s += 20;
    const text = (r.title + " " + r.content).toLowerCase();
    if (["revenue", "arr", "mrr", "client", "sales", "deal", "close", "$"].some((k) => text.includes(k))) s += 15;
    if (brainKeywords.length > 0 && brainKeywords.some((k) => text.includes(k))) s += 8;
    const age = (Date.now() - new Date(r.createdAt).getTime()) / 86_400_000;
    s += age < 1 ? 8 : age < 7 ? 4 : 0;
    if (r.status === "active") s += 10;
    if (r.status === "needs_review") s -= 15;
    return s;
  }

  function oppScore(o: typeof allOpps[number]): number {
    if (o.status === "rejected") return -999;
    const p = o.priority ?? "low";
    let s = ({ critical: 50, high: 35, medium: 20, low: 5 } as Record<string, number>)[p] ?? 5;
    if (o.status === "pursuing") s += 30;
    if (o.status === "evaluating") s += 10;
    if (o.estimatedValue) {
      const v = parseFloat(o.estimatedValue);
      if (!isNaN(v)) s += Math.min(20, Math.floor(v / 1000));
    }
    return s;
  }

  function classifyExecution(action: string): string {
    const a = action.toLowerCase();
    if (/\b(decide|choose|approve|sign off|make a decision|commit|select)\b/.test(a)) return "decision";
    if (/\b(call|email|message|send|reach out|talk|meet|reply|respond|ping|contact)\b/.test(a)) return "communication";
    if (/\b(review|check|read|scan|assess|audit|look at)\b/.test(a)) return "quick-win";
    return "deep-work";
  }

  // ── Mission selection ─────────────────────────────────────────────────────
  // Score candidates: active goals + high-priority entries + pursuing opps
  const memCandidates = activeMemory
    .filter((r) =>
      r.status !== "needs_review" &&
      (r.category === "goals" || r.priority === "critical" || r.priority === "high" || r.importance === "critical" || r.importance === "high")
    )
    .sort((a, b) => memScore(b) - memScore(a));

  const oppCandidates = activeOpps
    .filter((o) => o.status === "pursuing" || (o.priority === "critical" && o.status === "evaluating"))
    .sort((a, b) => oppScore(b) - oppScore(a));

  const topMemScore = memCandidates[0] ? memScore(memCandidates[0]) : 0;
  const topOppScore = oppCandidates[0] ? oppScore(oppCandidates[0]) : 0;

  const missionMemEntry = topMemScore >= topOppScore ? memCandidates[0] : undefined;
  const missionOppEntry = topOppScore > topMemScore ? oppCandidates[0] : undefined;

  type Mission = { title: string; rationale: string; source: string; sourceType: string; sourceId?: number };
  let mission: Mission;

  if (missionMemEntry) {
    mission = {
      title: missionMemEntry.title,
      rationale: missionMemEntry.summary ?? missionMemEntry.content.substring(0, 200),
      source: missionMemEntry.category,
      sourceType: "memory",
      sourceId: missionMemEntry.id,
    };
  } else if (missionOppEntry) {
    mission = {
      title: missionOppEntry.title,
      rationale: missionOppEntry.description.substring(0, 200),
      source: missionOppEntry.category ?? "opportunity",
      sourceType: "opportunity",
      sourceId: missionOppEntry.id,
    };
  } else {
    mission = {
      title: "Define your #1 goal for the day",
      rationale: "No active goals or pursuing opportunities found. Go to Memory Engine and set your primary goal.",
      source: "NXS OS",
      sourceType: "system",
    };
  }

  const claimed = new Set<string>();
  if (missionMemEntry) claimed.add(`memory-${missionMemEntry.id}`);
  if (missionOppEntry) claimed.add(`opp-${missionOppEntry.id}`);

  // ── Top 3 actions ──────────────────────────────────────────────────────────
  const actionPool = activeMemory
    .filter((r) => r.nextAction && !claimed.has(`memory-${r.id}`))
    .sort((a, b) => memScore(b) - memScore(a));

  const topActions = actionPool.slice(0, 3).map((r, i) => {
    claimed.add(`memory-${r.id}`);
    return {
      rank: i + 1,
      action: r.nextAction!,
      whyItMatters: r.summary ?? r.content.substring(0, 120),
      source: r.title,
      sourceType: "memory",
      sourceId: r.id,
      impactLevel: r.priority ?? r.importance ?? "medium",
      executionLevel: classifyExecution(r.nextAction!),
    };
  });

  // ── Risks to control ───────────────────────────────────────────────────────
  const memRisks = activeMemory
    .filter((r) =>
      !claimed.has(`memory-${r.id}`) &&
      (r.status === "needs_review" ||
        ((r.priority === "critical" || r.importance === "critical") &&
          new Date(r.updatedAt ?? r.createdAt) < thirtyDaysAgo))
    )
    .sort((a, b) => {
      const ua = a.status === "needs_review" ? 10 : 0;
      const ub = b.status === "needs_review" ? 10 : 0;
      return ub - ua || memScore(b) - memScore(a);
    })
    .slice(0, 3);

  const oppRisks = activeOpps
    .filter(
      (o) =>
        !claimed.has(`opp-${o.id}`) &&
        (o.priority === "critical" || o.priority === "high") &&
        o.status === "evaluating"
    )
    .slice(0, Math.max(0, 3 - memRisks.length));

  const risksToControl = [
    ...memRisks.map((r) => {
      claimed.add(`memory-${r.id}`);
      const mitigation =
        r.nextAction ??
        (r.status === "needs_review"
          ? "Review this entry now — update it or escalate to the Orchestrator for a decision."
          : "Schedule a focused review block this week before this slips further.");
      return {
        title: r.title,
        mitigation,
        urgency: r.priority ?? r.importance ?? "high",
        source: r.category,
        sourceId: r.id,
      };
    }),
    ...oppRisks.map((o) => {
      claimed.add(`opp-${o.id}`);
      return {
        title: `Decision needed: ${o.title}`,
        mitigation: `Make a go/no-go call today. Sitting at '${o.status}' costs clarity and momentum.`,
        urgency: o.priority ?? "high",
        source: "opportunity",
        sourceId: o.id,
      };
    }),
  ].slice(0, 3);

  // ── Opportunities to push ──────────────────────────────────────────────────
  const pushOpps = activeOpps
    .filter(
      (o) =>
        !claimed.has(`opp-${o.id}`) &&
        (o.status === "new" || o.status === "evaluating") &&
        (o.priority === "high" || o.priority === "critical")
    )
    .sort((a, b) => oppScore(b) - oppScore(a))
    .slice(0, 3);

  const opportunitiesToPush = pushOpps.map((o) => {
    claimed.add(`opp-${o.id}`);
    return {
      title: o.title,
      whyToday: o.description.substring(0, 130),
      source: o.category ?? "opportunity",
      estimatedValue: o.estimatedValue ?? undefined,
      sourceId: o.id,
    };
  });

  // ── What to ignore ─────────────────────────────────────────────────────────
  const ignorePool = activeMemory
    .filter(
      (r) =>
        !claimed.has(`memory-${r.id}`) &&
        r.status !== "archived" &&
        (r.priority === "low" || r.priority === "medium" || (!r.priority && !r.importance))
    )
    .sort((a, b) => memScore(a) - memScore(b))
    .slice(0, 4);

  const whatToIgnore = ignorePool.map((r) => {
    let reason: string;
    if (!r.nextAction) reason = "No next action defined — not actionable today. Define it before spending time here.";
    else if (r.priority === "low") reason = "Low priority. Won't move the needle on today's mission.";
    else reason = "Medium priority item not aligned with today's primary objective — defer to tomorrow.";
    return { title: r.title, reason };
  });

  // ── Decision rationale ─────────────────────────────────────────────────────
  const missionPriority =
    missionMemEntry?.priority ?? missionMemEntry?.importance ?? missionOppEntry?.priority ?? "high";
  const missionCategory = missionMemEntry?.category ?? "opportunity";
  const brainCtx = brain?.business?.revenueTarget
    ? `Strategic target: ${brain.business.revenueTarget}.`
    : brain?.business?.vision
    ? `Strategic vision: ${brain.business.vision.slice(0, 80)}.`
    : "";

  const parts: string[] = [
    `"${mission.title}" ranked highest by composite score (priority: ${missionPriority}, category: ${missionCategory}). ${brainCtx}`.trim(),
  ];
  if (missionMemEntry?.category === "goals") {
    parts.push("Goals receive the highest routing weight — they directly drive revenue and strategic outcomes.");
  } else if (missionOppEntry) {
    parts.push("Selected as a pursuing opportunity with the strongest value signal.");
  }
  if (topActions.length > 0) {
    parts.push(
      `${topActions.length} action${topActions.length !== 1 ? "s" : ""} selected from entries with defined next actions, ranked by priority and recency.`
    );
  } else {
    parts.push("No actions with defined next actions found in memory — add next actions to your entries.");
  }
  if (risksToControl.length > 0) {
    parts.push(
      `${risksToControl.length} risk${risksToControl.length !== 1 ? "s" : ""} identified that could block today's mission if unaddressed.`
    );
  }
  if (whatToIgnore.length > 0) {
    parts.push(
      `${whatToIgnore.length} item${whatToIgnore.length !== 1 ? "s" : ""} deprioritised — low leverage relative to today's objective.`
    );
  }

  const decisionRationale = parts.join(" ");

  res.json({
    generatedAt: new Date().toISOString(),
    mission,
    topActions,
    risksToControl,
    opportunitiesToPush,
    whatToIgnore,
    decisionRationale,
  });
});

export default router;

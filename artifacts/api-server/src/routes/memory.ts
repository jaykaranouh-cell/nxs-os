import { Router } from "express";
import { db } from "@workspace/db";
import { memoryEntriesTable, memoryConnectionsTable } from "@workspace/db";
import { eq, desc, or, sql, and, lt, gte } from "drizzle-orm";
import {
  CreateMemoryEntryBody,
  UpdateMemoryEntryBody,
  CreateMemoryConnectionBody,
} from "@workspace/api-zod";

const router = Router();

// GET /memory
router.get("/memory", async (req, res) => {
  const { category, search, status, priority } = req.query as {
    category?: string;
    search?: string;
    status?: string;
    priority?: string;
  };

  let rows = await db
    .select()
    .from(memoryEntriesTable)
    .orderBy(desc(memoryEntriesTable.createdAt));

  if (category) rows = rows.filter((r) => r.category === category);
  if (status) rows = rows.filter((r) => r.status === status);
  if (priority) rows = rows.filter((r) => r.priority === priority || r.importance === priority);
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.content.toLowerCase().includes(q) ||
        (r.summary ?? "").toLowerCase().includes(q) ||
        (r.detailedNotes ?? "").toLowerCase().includes(q) ||
        (r.tags ?? "").toLowerCase().includes(q) ||
        (r.relatedPeople ?? "").toLowerCase().includes(q) ||
        (r.relatedCompanies ?? "").toLowerCase().includes(q)
    );
  }

  res.json(rows.map(serialize));
});

// POST /memory
router.post("/memory", async (req, res) => {
  const parsed = CreateMemoryEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid memory entry data" });
    return;
  }
  const [entry] = await db
    .insert(memoryEntriesTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(serialize(entry));
});

// GET /memory/briefing — must come before /memory/:id
router.get("/memory/briefing", async (req, res) => {
  const all = await db
    .select()
    .from(memoryEntriesTable)
    .orderBy(desc(memoryEntriesTable.createdAt));

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // ── Scoring ────────────────────────────────────────────────────────────────
  // Composite score: priority weight + recency bonus + next-action bonus
  function entryScore(r: typeof all[number]): number {
    const p = r.priority ?? r.importance ?? "low";
    const pScore = ({ critical: 40, high: 30, medium: 20, low: 10 } as Record<string, number>)[p] ?? 10;
    const ageDays = (Date.now() - new Date(r.createdAt).getTime()) / 86_400_000;
    const recencyBonus = ageDays < 1 ? 10 : ageDays < 3 ? 7 : ageDays < 7 ? 4 : 0;
    const actionBonus = r.nextAction ? 5 : 0;
    return pScore + recencyBonus + actionBonus;
  }

  function fmt(
    r: typeof all[number],
    reason: string,
  ): { id: number; title: string; category: string; summary: string; priority: string | undefined; nextAction: string | undefined } {
    return {
      id: r.id,
      title: r.title,
      category: r.category,
      summary: reason,
      priority: r.priority ?? r.importance ?? undefined,
      nextAction: r.nextAction ?? undefined,
    };
  }

  // ── Single-pass claim routing ─────────────────────────────────────────────
  // Each entry is routed to exactly ONE section. Claim order:
  //   atRisk → opportunities → whatMatters → whatHappened
  const claimed = new Set<number>();

  function claimTop(pool: typeof all, limit: number) {
    const out: typeof all = [];
    for (const r of pool) {
      if (out.length >= limit) break;
      if (!claimed.has(r.id)) {
        claimed.add(r.id);
        out.push(r);
      }
    }
    return out;
  }

  // 1. AT RISK — needs review, stale critical, or double-critical
  const atRiskPool = [...all]
    .filter((r) =>
      r.status === "needs_review" ||
      (
        (r.priority === "critical" || r.importance === "critical") &&
        new Date(r.updatedAt ?? r.createdAt) < thirtyDaysAgo
      ) ||
      (r.priority === "critical" && r.importance === "critical")
    )
    .sort((a, b) => entryScore(b) - entryScore(a));

  const atRiskItems = claimTop(atRiskPool, 3);
  const atRisk = atRiskItems.map((r) => {
    let reason: string;
    if (r.status === "needs_review")
      reason = r.summary ?? "Flagged for review — needs attention before it goes stale.";
    else if (new Date(r.updatedAt ?? r.createdAt) < thirtyDaysAgo)
      reason = r.summary ?? "Critical item not updated in 30+ days — risk of slipping.";
    else
      reason = r.summary ?? "Both priority and importance are critical — elevated exposure.";
    return fmt(r, reason);
  });

  // 2. OPPORTUNITIES — active entries in growth categories with high+ priority
  const oppPool = [...all]
    .filter((r) =>
      !claimed.has(r.id) &&
      ["goals", "ideas", "campaigns", "leads", "wealth"].includes(r.category) &&
      r.status === "active" &&
      (r.priority === "high" || r.priority === "critical" || r.importance === "high" || r.importance === "critical")
    )
    .sort((a, b) => entryScore(b) - entryScore(a));

  const oppItems = claimTop(oppPool, 3);
  const opportunities = oppItems.map((r) => {
    const reason = r.summary ?? `Active ${r.category.replace(/_/g, " ")} with high priority — ready to move.`;
    return fmt(r, reason);
  });

  // 3. WHAT MATTERS — remaining high/critical active entries
  const mattersPool = [...all]
    .filter((r) =>
      !claimed.has(r.id) &&
      (r.priority === "high" || r.priority === "critical" || r.importance === "high" || r.importance === "critical") &&
      r.status !== "archived"
    )
    .sort((a, b) => entryScore(b) - entryScore(a));

  const mattersItems = claimTop(mattersPool, 3);
  const matters = mattersItems.map((r) => {
    const reason = r.summary ?? `${r.priority ?? r.importance ?? "High"} priority — requires attention.`;
    return fmt(r, reason);
  });

  // 4. WHAT HAPPENED — recent entries not yet claimed, sorted newest first
  const recentPool = [...all]
    .filter((r) =>
      !claimed.has(r.id) &&
      new Date(r.createdAt) >= sevenDaysAgo
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const recentItems = claimTop(recentPool, 3);
  const recent = recentItems.map((r) => {
    const ageDays = Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 86_400_000);
    const when = ageDays === 0 ? "Added today" : ageDays === 1 ? "Added yesterday" : `Added ${ageDays} days ago`;
    const reason = r.summary ?? `${when} — ${r.content.substring(0, 100)}`;
    return fmt(r, reason);
  });

  // ── Top 3 recommended actions ──────────────────────────────────────────────
  const withActions = all
    .filter((r) => r.nextAction && r.status !== "archived")
    .sort((a, b) => entryScore(b) - entryScore(a))
    .slice(0, 3);

  const topActions: Array<{ action: string; rationale: string; source: string; memoryId: number | null }> = withActions.map((r) => ({
    action: r.nextAction!,
    rationale: r.summary ?? r.content.substring(0, 80),
    source: r.title,
    memoryId: r.id,
  }));

  const defaultActions: typeof topActions = [
    { action: "Review and triage the 5 oldest memories that have not been updated", rationale: "Keeping memory fresh ensures the Orchestrator always has accurate context.", source: "Memory Agent", memoryId: null },
    { action: "Connect related client memories to their corresponding project entries", rationale: "Linked memories create compound intelligence across the system.", source: "Memory Agent", memoryId: null },
    { action: "Add a financial note for this week's revenue and expenses", rationale: "Consistent financial memory keeps the Finance Agent informed.", source: "Memory Agent", memoryId: null },
  ];
  while (topActions.length < 3) {
    topActions.push(defaultActions[topActions.length]);
  }

  const highPriorityCount = all.filter((r) => r.priority === "high" || r.priority === "critical" || r.importance === "high" || r.importance === "critical").length;
  const recentCount = all.filter((r) => new Date(r.createdAt) >= sevenDaysAgo).length;

  res.json({
    generatedAt: new Date().toISOString(),
    whatHappened: recent,
    whatMatters: matters,
    atRisk,
    opportunities,
    topActions,
    totalMemories: all.length,
    recentCount,
    highPriorityCount,
  });
});

// GET /memory/agent-status — must come before /memory/:id
router.get("/memory/agent-status", async (req, res) => {
  const all = await db.select().from(memoryEntriesTable);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const totalMemories = all.length;
  const highPriorityCount = all.filter((r) => r.priority === "critical" || r.priority === "high" || r.importance === "critical" || r.importance === "high").length;
  const recentlyAdded = all.filter((r) => new Date(r.createdAt) >= sevenDaysAgo).length;
  const staleCount = all.filter((r) => {
    const lastTouched = r.updatedAt ?? r.createdAt;
    return new Date(lastTouched) < thirtyDaysAgo || r.status === "needs_review";
  }).length;

  // Suggested connections — find entries in similar categories that might be related
  const suggestedConnections: Array<{
    fromId: number;
    fromTitle: string;
    toId: number;
    toTitle: string;
    reason: string;
  }> = [];

  const byCategory: Record<string, typeof all> = {};
  for (const entry of all) {
    if (!byCategory[entry.category]) byCategory[entry.category] = [];
    byCategory[entry.category].push(entry);
  }

  for (const [cat, entries] of Object.entries(byCategory)) {
    if (entries.length >= 2) {
      const a = entries[0];
      const b = entries[1];
      suggestedConnections.push({
        fromId: a.id,
        fromTitle: a.title,
        toId: b.id,
        toTitle: b.title,
        reason: `Both are in the "${cat.replace("_", " ")}" category and may share context`,
      });
    }
    if (suggestedConnections.length >= 3) break;
  }

  res.json({
    status: "active",
    totalMemories,
    highPriorityCount,
    staleCount,
    recentlyAdded,
    suggestedConnections,
    lastActivity: all[0]?.createdAt.toISOString() ?? new Date().toISOString(),
  });
});

// GET /memory/categories/summary — must come before /memory/:id
router.get("/memory/categories/summary", async (req, res) => {
  const rows = await db.select().from(memoryEntriesTable);
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.category] = (counts[row.category] ?? 0) + 1;
  }
  const result = Object.entries(counts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
  res.json(result);
});

// POST /memory/connections — must come before /memory/:id
router.post("/memory/connections", async (req, res) => {
  const parsed = CreateMemoryConnectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid connection data" });
    return;
  }
  const [conn] = await db
    .insert(memoryConnectionsTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(serializeConnection(conn));
});

// GET /memory/:id
router.get("/memory/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(404).json({ error: "Not found" }); return; }
  const [entry] = await db
    .select()
    .from(memoryEntriesTable)
    .where(eq(memoryEntriesTable.id, id));
  if (!entry) {
    res.status(404).json({ error: "Memory entry not found" });
    return;
  }
  res.json(serialize(entry));
});

// PATCH /memory/:id
router.patch("/memory/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(404).json({ error: "Not found" }); return; }
  const parsed = UpdateMemoryEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid data" });
    return;
  }
  const [entry] = await db
    .update(memoryEntriesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(memoryEntriesTable.id, id))
    .returning();
  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  res.json(serialize(entry));
});

// DELETE /memory/:id
router.delete("/memory/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(memoryConnectionsTable).where(
    or(
      eq(memoryConnectionsTable.fromMemoryId, id),
      eq(memoryConnectionsTable.toMemoryId, id)
    )
  );
  await db.delete(memoryEntriesTable).where(eq(memoryEntriesTable.id, id));
  res.status(204).send();
});

// GET /memory/:id/connections
router.get("/memory/:id/connections", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.json([]); return; }

  const conns = await db
    .select()
    .from(memoryConnectionsTable)
    .where(
      or(
        eq(memoryConnectionsTable.fromMemoryId, id),
        eq(memoryConnectionsTable.toMemoryId, id)
      )
    );

  const result = [];
  for (const conn of conns) {
    const otherId = conn.fromMemoryId === id ? conn.toMemoryId : conn.fromMemoryId;
    const [other] = await db
      .select()
      .from(memoryEntriesTable)
      .where(eq(memoryEntriesTable.id, otherId));
    if (other) {
      result.push({
        connectionId: conn.id,
        relationshipType: conn.relationshipType,
        direction: conn.fromMemoryId === id ? "from" : "to",
        memory: serialize(other),
      });
    }
  }

  res.json(result);
});

function serialize(entry: typeof memoryEntriesTable.$inferSelect) {
  return {
    ...entry,
    priority: entry.priority ?? entry.importance,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt?.toISOString() ?? null,
    reviewedAt: entry.reviewedAt?.toISOString() ?? null,
  };
}

function serializeConnection(conn: typeof memoryConnectionsTable.$inferSelect) {
  return {
    ...conn,
    createdAt: conn.createdAt.toISOString(),
  };
}

export default router;

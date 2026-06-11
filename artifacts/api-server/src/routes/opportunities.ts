import { Router } from "express";
import { db } from "@workspace/db";
import { opportunitiesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

const SEED = [
  {
    title: "AI Ops Niche: E-commerce Founders",
    description: "E-commerce founders running 7-figure stores are drowning in ops. Inventory, customer service, marketing, and fulfillment = 40hrs/week of cognitive load. Nexus AI could cut that to 10hrs.",
    category: "niche", source: "research", status: "evaluating", priority: "high",
    estimatedValue: "~$180K ARR potential (12 clients × $1,500/mo)",
    tags: "ecommerce,founders,ops,niche",
    notes: "Validate: do e-comm founders use AI tools? What existing solutions exist?",
  },
  {
    title: "Partnership: Digital Agencies (No-AI)",
    description: "Partner with 2–3 digital agencies that serve SMB founders but do not offer AI ops. White-label Nexus AI to their clients or refer each other.",
    category: "partnership", source: "manual", status: "pursuing", priority: "critical",
    estimatedValue: "5–10 clients per partner = $90K–$180K ARR referral channel",
    tags: "partnership,agency,white-label,referral",
    notes: "Identify 5 target agencies on LinkedIn. Warm intros only.",
  },
  {
    title: "Automate: Weekly Client Briefing",
    description: "Automate the Monday morning briefing for each client. Agent synthesises their week and delivers a personalised brief. Reduces delivery overhead by 2hrs/client/week.",
    category: "automation", source: "agent", status: "evaluating", priority: "high",
    estimatedValue: "2hrs freed × $150/hr × 10 clients = $3K/week capacity",
    tags: "automation,briefing,efficiency,scale",
    notes: "Requires OpenAI integration. Amber execution — Jay reviews before send.",
  },
  {
    title: "Service: Done-For-You Memory Seeding",
    description: "Premium onboarding tier: 2-hour client interview + seed 50+ memories into their OS. Converts faster, retains longer, charges more.",
    category: "service", source: "manual", status: "new", priority: "medium",
    estimatedValue: "$500 one-time × 10 new clients/quarter = $5K/quarter incremental",
    tags: "service,onboarding,premium,upsell",
    notes: "Position as 'Memory Audit + Setup' — structured 2-hour discovery session.",
  },
  {
    title: "Revenue: Annual Plan Conversion",
    description: "Offer existing clients 2 months free on annual switch. Converts MRR to ARR, reduces churn, improves cash flow predictability.",
    category: "revenue", source: "manual", status: "new", priority: "high",
    estimatedValue: "3 clients × $1,500 × 12 = $54K ARR locked in",
    tags: "revenue,annual,retention,pricing",
    notes: "Only offer to clients 3+ months in. Offer when they express satisfaction.",
  },
  {
    title: "Competitive Gap: No AI Tool Has Persistent Memory",
    description: "Zapier, Make, even ChatGPT — none of them build a persistent, searchable, connected memory of a business. This is the true differentiation that competitors have not copied yet.",
    category: "competitive", source: "research", status: "captured", priority: "critical",
    estimatedValue: "Core moat — defines positioning and retention across all clients",
    tags: "competitive,moat,memory,positioning",
    notes: "Build marketing content: 'Your AI tools forget. NXS OS remembers.'",
  },
  {
    title: "Product: Client-Facing Memory Portal",
    description: "Read-only client portal where clients see their Memory Core, decisions made, lessons learned, and agent activity. Creates transparency, increases perceived value.",
    category: "product", source: "conversation", status: "evaluating", priority: "medium",
    estimatedValue: "Unlocks $2,500/mo tier for portal access + higher retention",
    tags: "product,portal,clients,transparency",
    notes: "V2 feature. Needs auth layer and multi-tenant architecture first.",
  },
  {
    title: "Niche: High-Revenue Solopreneurs ($500K–$2M)",
    description: "Solopreneurs running $500K–$2M businesses are drowning in complexity with no team. Perfect Nexus AI client: high value, high pain, high tech adoption.",
    category: "niche", source: "research", status: "pursuing", priority: "high",
    estimatedValue: "2M+ potential globally. 30 clients = $54K ARR minimum",
    tags: "niche,solopreneur,high-revenue,target-market",
    notes: "LinkedIn positioning: 'Built for founders who run everything themselves.'",
  },
];

function serialize(opp: typeof opportunitiesTable.$inferSelect) {
  return {
    ...opp,
    discoveredAt: opp.discoveredAt.toISOString(),
    updatedAt: opp.updatedAt.toISOString(),
  };
}

router.get("/opportunities", async (req, res) => {
  const { status, category, priority } = req.query as Record<string, string | undefined>;

  let rows = await db
    .select()
    .from(opportunitiesTable)
    .orderBy(desc(opportunitiesTable.updatedAt));

  if (rows.length === 0) {
    await db.insert(opportunitiesTable).values(SEED);
    rows = await db
      .select()
      .from(opportunitiesTable)
      .orderBy(desc(opportunitiesTable.updatedAt));
  }

  if (status) rows = rows.filter((r) => r.status === status);
  if (category) rows = rows.filter((r) => r.category === category);
  if (priority) rows = rows.filter((r) => r.priority === priority);

  res.json(rows.map(serialize));
});

router.post("/opportunities", async (req, res) => {
  const { title, description, category, source, status, priority, estimatedValue, tags, notes } =
    req.body as Record<string, string | undefined>;

  if (!title || !description || !category) {
    res.status(400).json({ error: "title, description, and category are required" });
    return;
  }

  const [opp] = await db
    .insert(opportunitiesTable)
    .values({
      title,
      description,
      category,
      source: source ?? "manual",
      status: status ?? "new",
      priority: priority ?? "medium",
      estimatedValue: estimatedValue ?? null,
      tags: tags ?? null,
      notes: notes ?? null,
    })
    .returning();

  res.status(201).json(serialize(opp));
});

router.patch("/opportunities/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const { title, description, status, priority, estimatedValue, tags, notes, category } =
    req.body as Record<string, string | undefined>;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;
  if (priority !== undefined) updates.priority = priority;
  if (estimatedValue !== undefined) updates.estimatedValue = estimatedValue;
  if (tags !== undefined) updates.tags = tags;
  if (notes !== undefined) updates.notes = notes;
  if (category !== undefined) updates.category = category;

  const [updated] = await db
    .update(opportunitiesTable)
    .set(updates)
    .where(eq(opportunitiesTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(serialize(updated));
});

router.delete("/opportunities/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(opportunitiesTable).where(eq(opportunitiesTable.id, id));
  res.status(204).send();
});

export default router;

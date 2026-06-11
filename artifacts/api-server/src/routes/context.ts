import { Router } from "express";
import { db } from "@workspace/db";
import { systemContextTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const router = Router();

const DEFAULT_BRAIN = {
  business: {
    vision: "Build Nexus AI into the go-to AI operating system for ambitious founders — the system that runs the business so you can run the vision.",
    mission: "Eliminate operational cognitive load for founders through intelligent AI agents that capture, connect, and act on business knowledge.",
    principles: [
      "Memory first — if it's not in the OS, it doesn't exist",
      "Compound value — every action should make the system smarter",
      "Compliance always — no cold outreach, no unauthorized automation",
      "Conversation over dashboards — the OS should talk, not just show",
      "Quality over speed — one great client beats five mediocre ones",
    ],
    revenueTarget: "$250,000 ARR by December 31, 2026",
    growthStrategy: "LinkedIn content → agency partnerships → referrals. No cold outreach in V1.",
    riskTolerance: "moderate",
    orchestratorRules: [
      "Always address Jay by name",
      "Lead with what matters most, not what happened most recently",
      "Challenge me if I'm spreading too thin — call it out directly",
      "Never recommend cold outreach or unsolicited contact",
      "When I ask for options, give me 3 max with a clear recommendation",
      "Flag decisions that contradict previously made decisions",
      "Remind me of lessons learned before I make the same mistake twice",
    ],
  },
  personal: {
    vision: "Design a life of sovereign freedom — where the business funds my life, not the other way around.",
    purpose: "Build systems that compound. Create leverage. Protect time. Live intentionally.",
    values: [
      "Freedom and autonomy above all",
      "Deep work over shallow hustle",
      "Health as the foundation of everything",
      "Relationships over transactions",
      "Long-term thinking over short-term wins",
    ],
    workingStyle: "Deep work blocks 8am–1pm. Strategic thinking in the morning. Execution in the afternoon. No meetings before 10am. Single-threaded focus — one major project at a time.",
    healthPriorities: [
      "Sleep 7.5 hours minimum",
      "Morning routine: meditation + exercise before work",
      "No work after 7pm",
      "Weekly long walk or hike for strategic thinking",
    ],
    wealthGoals: "Financial independence by 35. Business generates 2× personal expenses. Investment portfolio compounds passively.",
    nonNegotiables: [
      "Morning routine is sacred — never skip",
      "No decisions when tired or reactive",
      "Protect the maker schedule — no meeting days",
      "Say no to anything that doesn't align with the 3-year vision",
    ],
  },
};

// ─── Strategic Brain ──────────────────────────────────────────────────────────

router.get("/system-context", async (req, res) => {
  const rows = await db
    .select()
    .from(systemContextTable)
    .where(eq(systemContextTable.key, "brain"));

  if (rows.length === 0) {
    await db.insert(systemContextTable).values({
      key: "brain",
      value: JSON.stringify(DEFAULT_BRAIN),
    });
    res.json({ brain: DEFAULT_BRAIN, updatedAt: new Date().toISOString() });
    return;
  }

  try {
    res.json({
      brain: JSON.parse(rows[0].value),
      updatedAt: rows[0].updatedAt.toISOString(),
    });
  } catch {
    res.json({ brain: DEFAULT_BRAIN, updatedAt: new Date().toISOString() });
  }
});

router.put("/system-context", async (req, res) => {
  const { brain } = req.body as { brain?: unknown };
  if (!brain) {
    res.status(400).json({ error: "brain is required" });
    return;
  }

  const value = JSON.stringify(brain);
  await db
    .insert(systemContextTable)
    .values({ key: "brain", value })
    .onConflictDoUpdate({
      target: systemContextTable.key,
      set: { value, updatedAt: new Date() },
    });

  res.json({ brain, updatedAt: new Date().toISOString() });
});

// ─── Business Context Setup ────────────────────────────────────────────────────

const SECTION_KEY_MAP: Record<string, string> = {
  "business-profile": "setup-business-profile",
  "revenue-goal": "setup-revenue-goal",
  "sales-strategy": "setup-sales-strategy",
  "services": "setup-services",
  "delivery-process": "setup-delivery-process",
  "operating-rules": "setup-operating-rules",
};

const ALL_SETUP_KEYS = Object.values(SECTION_KEY_MAP);

function hasEnoughData(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const values = Object.values(data as Record<string, unknown>);
  const filled = values.filter(
    (v) => v !== null && v !== undefined && v !== ""
  );
  return filled.length >= 2;
}

router.get("/setup-context", async (req, res) => {
  const rows = await db
    .select()
    .from(systemContextTable)
    .where(inArray(systemContextTable.key, ALL_SETUP_KEYS));

  const dataMap: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      dataMap[row.key] = JSON.parse(row.value);
    } catch {
      dataMap[row.key] = {};
    }
  }

  const bp = dataMap["setup-business-profile"] ?? null;
  const rg = dataMap["setup-revenue-goal"] ?? null;
  const ss = dataMap["setup-sales-strategy"] ?? null;
  const sv = dataMap["setup-services"] ?? null;
  const dp = dataMap["setup-delivery-process"] ?? null;
  const or = dataMap["setup-operating-rules"] ?? null;

  const sections = [bp, rg, ss, sv, dp, or];
  const completionStatus = {
    businessProfile: hasEnoughData(bp),
    revenueGoal: hasEnoughData(rg),
    salesStrategy: hasEnoughData(ss),
    services: hasEnoughData(sv),
    deliveryProcess: hasEnoughData(dp),
    operatingRules: hasEnoughData(or),
    totalComplete: sections.filter(hasEnoughData).length,
    totalSections: 6,
  };

  res.json({
    businessProfile: bp,
    revenueGoal: rg,
    salesStrategy: ss,
    services: sv,
    deliveryProcess: dp,
    operatingRules: or,
    completionStatus,
  });
});

router.put("/setup-context/:section", async (req, res) => {
  const { section } = req.params;
  const key = SECTION_KEY_MAP[section];

  if (!key) {
    res.status(400).json({ error: `Unknown section: ${section}. Valid: ${Object.keys(SECTION_KEY_MAP).join(", ")}` });
    return;
  }

  const data = req.body as Record<string, unknown>;
  const value = JSON.stringify(data);

  await db
    .insert(systemContextTable)
    .values({ key, value })
    .onConflictDoUpdate({
      target: systemContextTable.key,
      set: { value, updatedAt: new Date() },
    });

  res.json({ section, data, updatedAt: new Date().toISOString() });
});

export default router;

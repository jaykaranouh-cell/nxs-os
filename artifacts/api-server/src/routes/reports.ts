import { Router } from "express";
import { db } from "@workspace/db";
import { leadsTable, agentTasksTable, ideasTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// GET /reports/metrics
router.get("/reports/metrics", async (req, res) => {
  const leads = await db.select().from(leadsTable);
  const tasks = await db.select().from(agentTasksTable);
  const ideas = await db.select().from(ideasTable).where(eq(ideasTable.status, "pending"));

  const openLeads = leads.filter((l) => !["closed", "rejected"].includes(l.status)).length;
  const activeTasksCount = tasks.filter((t) => t.status === "in_progress").length;

  // Simulated revenue/expense figures (placeholder until real integrations)
  const totalRevenue = 47500;
  const totalExpenses = 12800;
  const conversionRate = leads.length > 0
    ? (leads.filter((l) => l.status === "closed").length / leads.length) * 100
    : 0;

  const qualifiedLeads = leads.filter((l) => l.status === "qualified");
  const topNextAction =
    qualifiedLeads.length > 0 ? qualifiedLeads[0].nextAction ?? null : null;

  res.json({
    activeAgents: 5,
    openLeads,
    pendingIdeas: ideas.length,
    totalRevenue,
    totalExpenses,
    activeTasksCount,
    conversionRate: Math.round(conversionRate * 10) / 10,
    topNextAction,
  });
});

// GET /reports/pipeline
router.get("/reports/pipeline", async (req, res) => {
  const leads = await db.select().from(leadsTable);

  const stageConfig = [
    { stage: "incoming", label: "Incoming" },
    { stage: "sales_review", label: "Sales Review" },
    { stage: "marketing_follow_up", label: "Marketing Follow-up" },
    { stage: "proposal", label: "Proposal" },
    { stage: "negotiation", label: "Negotiation" },
    { stage: "won", label: "Won" },
    { stage: "lost", label: "Lost" },
  ];

  const stages = stageConfig.map(({ stage, label }) => {
    const stageLeads = leads.filter((l) => l.stage === stage);
    const value = stageLeads.reduce((sum, l) => sum + parseFloat(l.estimatedValue ?? "0"), 0);
    return { stage: label, count: stageLeads.length, value };
  });

  const totalValue = leads
    .filter((l) => l.stage !== "lost")
    .reduce((sum, l) => sum + parseFloat(l.estimatedValue ?? "0"), 0);

  const wonLeads = leads.filter((l) => l.stage === "won");
  const averageDealSize = wonLeads.length > 0
    ? wonLeads.reduce((sum, l) => sum + parseFloat(l.estimatedValue ?? "0"), 0) / wonLeads.length
    : 0;

  res.json({ stages, totalValue, averageDealSize });
});

// GET /reports/finance
router.get("/reports/finance", async (req, res) => {
  // Placeholder financial data — designed to connect to accounting integrations later
  const revenue = 47500;
  const expenses = 12800;
  const cashFlow = revenue - expenses;
  const campaignROI = 3.2;

  const revenueByMonth = [
    { month: "Jan", value: 6200 },
    { month: "Feb", value: 7800 },
    { month: "Mar", value: 8400 },
    { month: "Apr", value: 9100 },
    { month: "May", value: 8200 },
    { month: "Jun", value: 7800 },
  ];

  const topExpenses = [
    { category: "Software & Tools", amount: 4200 },
    { category: "Advertising", amount: 3800 },
    { category: "Contractors", amount: 2900 },
    { category: "Operations", amount: 1900 },
  ];

  res.json({ revenue, expenses, cashFlow, campaignROI, revenueByMonth, topExpenses });
});

export default router;

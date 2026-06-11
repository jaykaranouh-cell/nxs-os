import { Router } from "express";
import { db } from "@workspace/db";
import {
  chatMessagesTable,
  memoryEntriesTable,
  opportunitiesTable,
  systemContextTable,
} from "@workspace/db";
import { desc, eq, inArray } from "drizzle-orm";
import { SendChatMessageBody } from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

interface BrainBusiness {
  vision?: string;
  mission?: string;
  principles?: string[];
  revenueTarget?: string;
  growthStrategy?: string;
  riskTolerance?: string;
  orchestratorRules?: string[];
}
interface BrainPersonal {
  vision?: string;
  purpose?: string;
  values?: string[];
  workingStyle?: string;
  healthPriorities?: string[];
  wealthGoals?: string;
  nonNegotiables?: string[];
}
interface BrainData {
  business?: BrainBusiness;
  personal?: BrainPersonal;
}

type MemRow = typeof memoryEntriesTable.$inferSelect;
type OppRow = typeof opportunitiesTable.$inferSelect;

interface OrchestratorContext {
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

// ─── Context loader ───────────────────────────────────────────────────────────

const CONTEXT_KEYS = [
  "brain",
  "setup-business-profile",
  "setup-revenue-goal",
  "setup-sales-strategy",
  "setup-services",
  "setup-delivery-process",
  "setup-operating-rules",
];

async function loadContext(): Promise<OrchestratorContext> {
  const [allMemory, allOpps, ctxRows] = await Promise.all([
    db.select().from(memoryEntriesTable).orderBy(desc(memoryEntriesTable.createdAt)),
    db.select().from(opportunitiesTable).orderBy(desc(opportunitiesTable.updatedAt)),
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
    brain, goals, decisions, lessons, risks, priorities, topActions,
    allOpps: activeOpps, hotOpps, notPursued, totalMemory: allMemory.length,
    setupCtx,
  };
}

// ─── CoS framework helpers ────────────────────────────────────────────────────

interface Confidence { score: number; reason: string }

function calcConfidence(ctx: OrchestratorContext): Confidence {
  let score = 45;
  const reasons: string[] = [];

  if (ctx.goals.length > 0)       { score += 15; reasons.push(`${ctx.goals.length} active goals`); }
  if (ctx.decisions.length > 2)   { score += 10; reasons.push(`${ctx.decisions.length} decisions logged`); }
  if (ctx.lessons.length > 0)     { score += 8;  reasons.push(`${ctx.lessons.length} lessons on file`); }
  if (ctx.brain)                  { score += 8;  reasons.push("Strategic Brain loaded"); }
  if (ctx.topActions.length > 0)  { score += 5;  reasons.push("next actions defined"); }
  if (ctx.allOpps.length > 0)     { score += 4;  reasons.push(`${ctx.allOpps.length} opportunities tracked`); }

  if (ctx.goals.length > 5)  score -= 8;  // too many goals = unclear priority
  if (ctx.risks.length > 3)  score -= 5;  // unresolved risks = uncertainty

  score = Math.min(Math.max(score, 35), 92); // floor 35, cap 92 — never claim certainty

  return { score, reason: reasons.slice(0, 3).join(", ") || "limited data in system" };
}

interface CoSBlocks {
  situation: string;
  priority?: string;
  risk?: string;
  opportunity?: string;
  recommendation: string;
  confidence: Confidence;
  nextMove: string;
  challenge?: string;
}

function renderCoS(b: CoSBlocks): string {
  const lines: string[] = [];
  lines.push(`**Situation:** ${b.situation}`);
  if (b.priority)     lines.push(`\n**Priority:** ${b.priority}`);
  if (b.risk)         lines.push(`\n**Risk:** ${b.risk}`);
  if (b.opportunity)  lines.push(`\n**Opportunity:** ${b.opportunity}`);
  lines.push(`\n**Recommendation:** ${b.recommendation}`);
  if (b.challenge)    lines.push(`\n**Challenge:** ${b.challenge}`);
  lines.push(`\n**Confidence: ${b.confidence.score}%** — ${b.confidence.reason}`);
  lines.push(`\n**Next Move:** ${b.nextMove}`);
  return lines.join("\n").trim();
}

function shortMem(m: MemRow, maxChars = 110): string {
  return m.summary ?? m.content.substring(0, maxChars);
}

function shortOpp(o: OppRow, maxChars = 100): string {
  return o.description.substring(0, maxChars);
}

function hasTag(tags: string | null | undefined, ...values: string[]): boolean {
  if (!tags) return false;
  const tagList = tags.split(/[,\s]+/).map((t) => t.trim().toLowerCase()).filter(Boolean);
  return values.some((v) => tagList.includes(v.toLowerCase()));
}

// ─── Question classifier ──────────────────────────────────────────────────────

function classifyQuestion(msg: string): string {
  const m = msg.toLowerCase();
  if (/\bfocus\b|today|start|morning|working on|do first|should i work|begin/.test(m))       return "focus";
  if (/top.*priorit|priorit.*list|most important|most urgent|what.*critical/.test(m))         return "priorities";
  if (/opportunit|missing|ignoring|overlooking|should i be doing|not working on/.test(m))    return "opportunities";
  if (/stuck|blocked|stalled|not moving|slow|behind|delayed/.test(m))                        return "stuck";
  if (/decided|decisions?\b|already made|past decisions?|what have i decided/.test(m))       return "decisions";
  if (/lesson|learned|mistake|pattern|done before|not make.*again/.test(m))                  return "lessons";
  if (/stop|stop.*doing|quit|drop|abandon|kill|ditch|eliminate|what.*not.*do|shouldn'?t\s+be/.test(m)) return "stop";
  if (/drift|off.*track|lost.*focus|distracted|losing.*focus|rabbit hole|gone.*off/.test(m)) return "drift";
  if (/leverage|highest.*impact|biggest.*bang|move.*needle|80.?20|most.*efficient|best.*return/.test(m)) return "leverage";
  if (/what.*next|recommend|suggest|best move|highest.leverage|action/.test(m))              return "next";
  if (/risk|danger|threat|worried|concern|watch out|warning/.test(m))                        return "risks";
  if (/goal|target|on track|arr\b|revenue target|metric|kpi/.test(m))                        return "goals";
  if (/challenge|push back|disagree|spread.*thin|too many|overcommit|calling.*out|honest.*assess/.test(m)) return "challenge";
  if (/brief|summary|overview|state of|how are we|update me|catch.*up/.test(m))              return "brief";
  if (/lead|prospect|qualif|pipeline|client|close|sales/.test(m))                            return "pipeline";
  if (/market|campaign|content|linkedin|brand|audience/.test(m))                             return "marketing";
  if (/financ|revenue|cash|money|profit|expense|mrr/.test(m))                                return "finance";
  return "brief";
}

// ─── Rule violation guard ─────────────────────────────────────────────────────

function checkRuleViolations(msg: string, ctx: OrchestratorContext): string | null {
  const lower = msg.toLowerCase();
  const rules = ctx.brain?.business?.orchestratorRules ?? [];
  const conf = calcConfidence(ctx);

  if (/cold outreach|cold email|cold call|cold dm|unsolicited/.test(lower)) {
    const rule = rules.find((r) => r.toLowerCase().includes("cold"));
    const strategy = ctx.brain?.business?.growthStrategy ?? "LinkedIn content → partnerships → referrals";
    return renderCoS({
      situation: `You're considering cold outreach. Your strategic constraint is clear: "${rule ?? "No cold outreach — growth through content, referrals, and warm introductions"}".`,
      risk: `Cold outreach risks compliance exposure, damages your trust-based positioning, and produces significantly lower conversion than warm paths — all against your stated strategy.`,
      opportunity: `Warm paths into the same targets exist right now: LinkedIn connections, existing client referrals, or agency partner intros.`,
      recommendation: `Do not proceed with cold outreach. Instead: (1) identify 3 warm paths via LinkedIn to your target accounts, (2) ask a current client for a specific named referral, not a general ask, (3) approach one agency partner for a joint intro this week.`,
      confidence: conf,
      nextMove: `Name the target account. I'll help you find the warmest route in from your existing network.`,
    });
  }

  if (
    ctx.goals.length > 4 &&
    /\badd\b|new.*goal|another|also.*start|let'?s.*also|additionally/.test(lower)
  ) {
    const goalList = ctx.goals.slice(0, 4).map((g) => `"${g.title}"`).join(", ");
    return renderCoS({
      situation: `You have ${ctx.goals.length} active goals already on the board: ${goalList}${ctx.goals.length > 4 ? " and more" : ""}. You're now asking to add another.`,
      risk: `Adding a goal doesn't add capacity. It dilutes the attention on everything else. Your revenue target (${ctx.brain?.business?.revenueTarget ?? "stated ARR goal"}) requires concentrated effort, not breadth.`,
      recommendation: `Before adding anything: tell me which current goal this replaces, or why it's more important than what's already running. If you can't answer that, we shouldn't add it.`,
      confidence: conf,
      nextMove: `Which of your ${ctx.goals.length} current goals can be paused or deprioritised to make room?`,
      challenge: `One of your rules: "Challenge me if I'm spreading too thin — call it out directly." This is that moment.`,
    });
  }

  return null;
}

// ─── CoS response builders ────────────────────────────────────────────────────

function buildFocusResponse(ctx: OrchestratorContext): string {
  const conf = calcConfidence(ctx);
  const topGoal = ctx.goals[0];
  const topRisk = ctx.risks[0];
  const topAction = ctx.topActions[0];
  const hotOpp = ctx.hotOpps.find((o) => o.status !== "pursuing" && o.status !== "captured");
  const target = ctx.brain?.business?.revenueTarget;

  const situation = topGoal
    ? `${ctx.goals.length} active goal${ctx.goals.length !== 1 ? "s" : ""}, ${ctx.risks.length} open risk${ctx.risks.length !== 1 ? "s" : ""}, ${ctx.allOpps.length} tracked opportunities. Top goal: "${topGoal.title}".`
    : `No active goals defined. Without a clear goal, everything competes equally for attention — which means nothing gets full focus.`;

  const priority = topGoal
    ? `"${topGoal.title}" is your highest-priority goal. ${shortMem(topGoal, 120)} ${topGoal.nextAction ? `Next action on file: ${topGoal.nextAction}` : "No next action defined — this goal is not actively moving."}`
    : `Go to Memory Engine and define your top goal under the "goals" category. Everything else is noise without it.`;

  const risk = topRisk
    ? `"${topRisk.title}" is flagged and unresolved. ${shortMem(topRisk, 100)} Ignoring this while pushing on goals compounds the risk of a setback that resets your progress.`
    : ctx.goals.length > 4
    ? `${ctx.goals.length} simultaneous goals is itself a risk. Spreading this thin means none get enough energy to breakthrough.`
    : undefined;

  const opportunity = hotOpp
    ? `"${hotOpp.title}" (${hotOpp.priority} priority, ${hotOpp.status}) has not been actively pursued. ${shortOpp(hotOpp, 90)} A deliberate move this week could open a new revenue path.`
    : undefined;

  const secondGoals = ctx.goals.slice(1, 3).map((g) => `"${g.title}"`).join(", ");
  const recommendation = topGoal
    ? `Lead with "${topGoal.title}" today. ${topGoal.nextAction ? `Your defined next action: ${topGoal.nextAction}. Do this before anything else.` : "Define a single concrete next action for this goal before you open anything else — a goal without a next action doesn't move."} ${secondGoals ? `Secondary items in play: ${secondGoals}. Keep these in the queue, don't context-switch until the first block of work on #1 is done.` : ""}`
    : `Before today's work can be productive: open Memory Engine, add your top goal, tag it "goals", and set a next action. This takes 5 minutes and changes every answer I can give you.`;

  const nextMove = topGoal?.nextAction
    ? `${topGoal.nextAction} — block 60–90 minutes, close everything else.`
    : topGoal
    ? `Write one sentence: "The next concrete action for ${topGoal.title} is ___." Then do that.`
    : `Add your top goal to Memory Engine right now. Without it, I'm navigating blind.`;

  const challenge = target && ctx.goals.length > 4
    ? `${ctx.goals.length} active goals with a ${target} target is a spread problem. Which goal, if achieved, makes the others easier or irrelevant? Focus there.`
    : undefined;

  return renderCoS({ situation, priority, risk, opportunity, recommendation, confidence: conf, nextMove, challenge });
}

function buildPrioritiesResponse(ctx: OrchestratorContext): string {
  const conf = calcConfidence(ctx);
  const top3 = ctx.priorities.slice(0, 3);
  const target = ctx.brain?.business?.revenueTarget;

  if (top3.length === 0) {
    return renderCoS({
      situation: `Nothing is flagged as high or critical priority in memory. Either everything is under control, or priorities haven't been captured — and those look identical from here.`,
      risk: `Without defined priorities, every request feels equally urgent. This is how reactive work crowds out strategic work.`,
      recommendation: `Go to Memory Engine and flag your 3 most important items as "high" or "critical" priority. If you can't choose 3, that's the first problem to solve.`,
      confidence: conf,
      nextMove: `Name your single most important active project right now. I'll help you pressure-test whether it deserves that position.`,
    });
  }

  const priorityLines = top3.map((m, i) => {
    const detail = shortMem(m, 120);
    const action = m.nextAction ? `Next action: ${m.nextAction}` : "⚠ No next action — goal is static";
    return `${i + 1}. **"${m.title}"** — ${detail}. ${action}.`;
  }).join("\n");

  const riskText = ctx.risks.length > 0
    ? `"${ctx.risks[0].title}" is flagged and unresolved. If left unaddressed, it could derail Priority #1. Risks compound when ignored.`
    : undefined;

  const oppText = ctx.hotOpps.length > 0
    ? `"${ctx.hotOpps[0].title}" (${ctx.hotOpps[0].priority} priority, ${ctx.hotOpps[0].status}) is high-value but not yet being pursued. Moving it forward could directly support your revenue target.`
    : undefined;

  const spreadWarning = ctx.goals.length > 3
    ? `You have ${ctx.goals.length} active goals against these 3 priorities. That's a resource conflict — consider which ${ctx.goals.length - 3} goal${ctx.goals.length - 3 > 1 ? "s" : ""} can be paused until a milestone is hit.`
    : undefined;

  return renderCoS({
    situation: `${ctx.priorities.length} items flagged high/critical across ${ctx.totalMemory} memory entries. ${target ? `Revenue target: ${target}.` : ""}`,
    priority: priorityLines,
    risk: riskText,
    opportunity: oppText,
    recommendation: `Sequence your day around Priority #1 first. Do not split focus across all three simultaneously — deep work on #1, then advance #2, then review #3.`,
    confidence: conf,
    nextMove: top3[0]?.nextAction
      ? `${top3[0].nextAction} — this is the most leveraged action right now. Start here.`
      : `Define the next action for "${top3[0]?.title ?? "your top priority"}" in the next 10 minutes.`,
    challenge: spreadWarning,
  });
}

function buildOpportunitiesResponse(ctx: OrchestratorContext): string {
  const conf = calcConfidence(ctx);
  const highNotPursued = ctx.notPursued.filter((o) => o.priority === "critical" || o.priority === "high");
  const evaluating = ctx.allOpps.filter((o) => o.status === "evaluating");
  const pursuing = ctx.allOpps.filter((o) => o.status === "pursuing");
  const topRec = highNotPursued[0] ?? evaluating[0];

  const oppLines = highNotPursued.slice(0, 3).map((o) =>
    `- **"${o.title}"** (${o.priority}, ${o.status}): ${shortOpp(o, 100)}${o.estimatedValue ? ` — ${o.estimatedValue}` : ""}`
  ).join("\n");

  const evalLines = evaluating.slice(0, 2).map((o) =>
    `- **"${o.title}"**: ${shortOpp(o, 90)} — sitting at *evaluating*, needs a yes/no decision.`
  ).join("\n");

  const situationParts: string[] = [];
  if (highNotPursued.length > 0) situationParts.push(`${highNotPursued.length} high/critical opportunity${highNotPursued.length !== 1 ? "ies" : "y"} not yet in motion`);
  if (evaluating.length > 0) situationParts.push(`${evaluating.length} stuck at "evaluating" with no decision`);
  if (pursuing.length > 0) situationParts.push(`${pursuing.length} currently being pursued`);

  return renderCoS({
    situation: situationParts.length > 0
      ? `Opportunity pipeline: ${situationParts.join(", ")}. Total tracked: ${ctx.allOpps.length}.`
      : `No active opportunities tracked. The system can't surface what hasn't been captured.`,
    priority: highNotPursued.length > 0
      ? `High-value opportunities not yet being pursued:\n${oppLines}`
      : evaluating.length > 0
      ? `Stuck in evaluation — these need a decision, not more analysis:\n${evalLines}`
      : `All tracked opportunities are either being pursued or awaiting new entries.`,
    risk: evaluating.length > 1
      ? `${evaluating.length} opportunities stuck in "evaluating" is decision avoidance in disguise. Every week they sit there without a decision is a week of potential momentum lost.`
      : undefined,
    opportunity: topRec
      ? `"${topRec.title}" is your clearest immediate move. ${shortOpp(topRec, 100)}${topRec.estimatedValue ? ` Estimated value: ${topRec.estimatedValue}.` : ""} It's at *${topRec.status}* — commit or close it.`
      : undefined,
    recommendation: topRec
      ? `Make a binary decision on "${topRec.title}" this week: commit and define a first action, or mark it rejected and free up the mental space. There is no value in keeping it at "${topRec.status}".`
      : `Add your most promising untapped opportunity to the Opportunity Engine now. You can't pursue what you haven't named.`,
    confidence: conf,
    nextMove: topRec
      ? `Open "${topRec.title}" and decide: pursuing or rejected? Set a next action if pursuing. Do this today.`
      : `Add one opportunity you've been thinking about but not tracking. Name it, set a priority, pick a status.`,
  });
}

function buildStuckResponse(ctx: OrchestratorContext): string {
  const conf = calcConfidence(ctx);
  const needsReview = ctx.risks.filter((m) => m.status === "needs_review");
  const goalsWithoutActions = ctx.goals.filter((g) => !g.nextAction);
  const stuckOpps = ctx.allOpps.filter((o) => o.status === "evaluating");

  const stuckItems: string[] = [
    ...needsReview.slice(0, 3).map((m) => `- **"${m.title}"** — flagged "needs review", no resolution`),
    ...goalsWithoutActions.slice(0, 3).map((g) => `- **"${g.title}"** — active goal with no next action defined`),
    ...stuckOpps.slice(0, 2).map((o) => `- **"${o.title}"** — opportunity stuck at "evaluating", no decision made`),
  ];

  if (stuckItems.length === 0) {
    return renderCoS({
      situation: `Nothing is explicitly flagged as stuck. No "needs review" items, no goals without next actions, no opportunities stalled at evaluating.`,
      risk: `"Not stuck" in the system doesn't mean not stuck in reality. Blockers often haven't been captured.`,
      recommendation: `Run a manual check: (1) Is there a project you've been avoiding thinking about? (2) Any client conversation you've been putting off? (3) Any decision you keep deferring? If yes, capture it in Memory Engine.`,
      confidence: conf,
      nextMove: `Name one thing you've been putting off for more than 7 days. I'll help you unblock it right now.`,
    });
  }

  const topStuck = needsReview[0] ?? goalsWithoutActions[0];
  const consequence = goalsWithoutActions.length > 0
    ? `Goals without next actions don't move — they become background anxiety instead of active progress.`
    : `Items flagged "needs review" accumulate into decision debt if not resolved. Each one is a small tax on your working memory.`;

  return renderCoS({
    situation: `${stuckItems.length} item${stuckItems.length !== 1 ? "s" : ""} showing signs of being stalled:\n${stuckItems.join("\n")}`,
    priority: topStuck ? `"${topStuck.title}" is the most likely bottleneck to clear first — it's the most senior-priority stalled item.` : undefined,
    risk: consequence,
    recommendation: `Pick the single most important item from the list above. Answer: what is the ONE smallest action that would move it forward? Not a plan — a single action. Then schedule it in the next 24 hours.`,
    confidence: conf,
    nextMove: topStuck
      ? `What's blocking "${topStuck.title}"? Tell me the obstacle and I'll help you structure a path through it.`
      : `Name the project or decision you've been most avoiding this week.`,
  });
}

function buildStopResponse(ctx: OrchestratorContext): string {
  const conf = calcConfidence(ctx);
  const target = ctx.brain?.business?.revenueTarget;
  const goalsWithoutActions = ctx.goals.filter((g) => !g.nextAction);
  const stuckOpps = ctx.allOpps.filter((o) => o.status === "evaluating");
  const pursuingOpps = ctx.allOpps.filter((o) => o.status === "pursuing");
  const lowPriorityGoals = ctx.goals.filter((g) => g.priority === "low" || g.priority === "medium");

  const stopList: string[] = [];

  if (goalsWithoutActions.length > 0) {
    stopList.push(
      `**Stop carrying goals with no next action:** ${goalsWithoutActions.map((g) => `"${g.title}"`).join(", ")}. These aren't active goals — they're intentions. Either define a next action or archive them. Carrying them burns attention without generating progress.`
    );
  }

  if (stuckOpps.length > 1) {
    stopList.push(
      `**Stop stalling on opportunity decisions:** ${stuckOpps.slice(0, 2).map((o) => `"${o.title}"`).join(", ")} have been at "evaluating" without a decision. Evaluating forever is a decision — it's just a bad one. Close or commit.`
    );
  }

  if (pursuingOpps.length > 3) {
    stopList.push(
      `**Stop pursuing ${pursuingOpps.length} opportunities simultaneously:** You can't give meaningful attention to more than 2–3 pursuits at once. Which ${pursuingOpps.length - 2} would you cut if you had to? Cut them now, not after burning more energy.`
    );
  }

  if (ctx.goals.length > 4) {
    stopList.push(
      `**Stop running ${ctx.goals.length} active goals in parallel:** Focus compounds. ${target ? `Your ${target} target requires deep work in a narrow lane, not broad effort across ${ctx.goals.length} fronts.` : "More goals means less progress on each."}`
    );
  }

  if (lowPriorityGoals.length > 0) {
    stopList.push(
      `**Stop giving low/medium-priority goals calendar time:** ${lowPriorityGoals.slice(0, 2).map((g) => `"${g.title}"`).join(", ")} are flagged as low/medium priority. If they're in your week, they're stealing time from your critical work. Deprioritise or archive them.`
    );
  }

  if (stopList.length === 0) {
    return renderCoS({
      situation: `The system doesn't show obvious candidates to stop. No stalled goals, no decision avoidance, no over-pursuit.`,
      risk: `"Nothing to stop" often means the work that should be stopped hasn't been captured. Low-leverage activities — meetings that don't move the needle, busywork, scope creep — rarely show up in a goal tracker.`,
      recommendation: `Do a time audit: write down everything you did last week. Anything that didn't directly connect to your top 3 goals or revenue target is a candidate to stop or delegate.`,
      confidence: conf,
      nextMove: `What's one thing you spent time on last week that you wouldn't put on your priority list?`,
    });
  }

  return renderCoS({
    situation: `${stopList.length} area${stopList.length !== 1 ? "s" : ""} where you're investing energy without proportional return. Stopping the right things is as valuable as starting new ones.`,
    priority: stopList[0],
    risk: `Every low-leverage activity you keep has a hidden cost: it occupies the same calendar slot where high-leverage work would live. The opportunity cost is real.`,
    recommendation: stopList.length > 1
      ? `Start with the first item — it has the highest drag on current momentum. Work through each item as a deliberate decision: stop, delegate, or compress. Don't keep anything running by default.\n\n${stopList.slice(1).join("\n\n")}`
      : stopList[0],
    confidence: conf,
    nextMove: goalsWithoutActions[0]
      ? `Archive or assign a next action to "${goalsWithoutActions[0].title}" in the next 10 minutes. That single decision clears mental overhead immediately.`
      : stuckOpps[0]
      ? `Make a yes/no decision on "${stuckOpps[0].title}" right now. Pursuing or rejected?`
      : `Identify the one meeting or recurring task this week that isn't directly connected to your top goal. What happens if you skip it or hand it off?`,
  });
}

function buildLeverageResponse(ctx: OrchestratorContext): string {
  const conf = calcConfidence(ctx);
  const target = ctx.brain?.business?.revenueTarget;
  const topAction = ctx.topActions[0];
  const topGoal = ctx.goals[0];
  const topRisk = ctx.risks[0];
  const topOpp = ctx.hotOpps.find((o) => o.status !== "pursuing" && o.status !== "captured");

  const leverageCandidate = topAction ?? topGoal;
  const revenueOpps = ctx.allOpps.filter((o) => o.category === "revenue" && o.status !== "rejected");
  const bestOpp = revenueOpps[0] ?? topOpp;

  const situation = target
    ? `You're working toward ${target}. The question is which single action, if done today, moves the needle the most.`
    : `Without a defined revenue target, it's hard to rank leverage precisely. Set one in Strategic Brain to sharpen these assessments.`;

  const priority = leverageCandidate
    ? `"${leverageCandidate.title}" has a defined next action: ${leverageCandidate.nextAction}. This is the work that directly serves your highest-priority goal. High-leverage work is work that only you can do and that directly compounds toward your main target.`
    : `No high-priority items have a defined next action. The highest-leverage thing you can do right now is define next actions for your top goal — that's what unlocks all subsequent progress.`;

  const risk = topRisk
    ? `"${topRisk.title}" is an active risk that could undo leverage gains. If an unresolved risk surfaces while you're pushing forward, it pulls you back further than the forward progress was worth. Address it or formally accept it.`
    : undefined;

  const opportunity = bestOpp
    ? `"${bestOpp.title}" (${bestOpp.priority} priority) is the highest-value open move. ${shortOpp(bestOpp, 100)}${bestOpp.estimatedValue ? ` Estimated value: ${bestOpp.estimatedValue}.` : ""} This could create asymmetric upside if you push it this week.`
    : undefined;

  const recommendation = leverageCandidate
    ? `Do "${leverageCandidate.nextAction ?? "the defined next action for " + leverageCandidate.title}" first — uninterrupted, for 60–90 minutes. High-leverage work requires depth, not multitasking. ${bestOpp ? `After that, advance "${bestOpp.title}" one step forward.` : ""}`
    : `The highest leverage action right now is system setup: define next actions for your top ${Math.min(ctx.goals.length, 3)} goals. This 30-minute investment unlocks every future answer I can give you about what to do next.`;

  return renderCoS({
    situation,
    priority,
    risk,
    opportunity,
    recommendation,
    confidence: conf,
    nextMove: leverageCandidate?.nextAction
      ? `Block 90 minutes now. Work on: ${leverageCandidate.nextAction}. No meetings, no email.`
      : `Name your top goal and write its next action. That's the leverage unlock.`,
  });
}

function buildDriftResponse(ctx: OrchestratorContext): string {
  const conf = calcConfidence(ctx);
  const target = ctx.brain?.business?.revenueTarget;
  const strategy = ctx.brain?.business?.growthStrategy;
  const rules = ctx.brain?.business?.orchestratorRules ?? [];
  const principles = ctx.brain?.business?.principles ?? [];

  const revenueGoals = ctx.goals.filter((g) =>
    g.title.toLowerCase().includes("arr") ||
    g.title.toLowerCase().includes("revenue") ||
    g.title.toLowerCase().includes("client") ||
    g.title.toLowerCase().includes("retainer") ||
    hasTag(g.tags, "revenue", "sales", "growth")
  );
  const nonRevenueGoals = ctx.goals.filter((g) => !revenueGoals.includes(g));

  const driftSignals: string[] = [];

  if (revenueGoals.length === 0 && ctx.goals.length > 0) {
    driftSignals.push(`None of your ${ctx.goals.length} active goals are visibly connected to your revenue target. ${target ? `If everything you're working on doesn't eventually feed ${target}, you're drifting.` : "Goals disconnected from revenue tend to crowd out revenue-generating work."}`);
  }

  if (nonRevenueGoals.length > revenueGoals.length && ctx.goals.length > 2) {
    driftSignals.push(`${nonRevenueGoals.length} of your ${ctx.goals.length} goals aren't visibly revenue-connected: ${nonRevenueGoals.slice(0, 2).map((g) => `"${g.title}"`).join(", ")}. That's a higher ratio of non-revenue work than your target warrants right now.`);
  }

  if (ctx.goals.length > 4) {
    driftSignals.push(`${ctx.goals.length} active goals means you're spread across too many fronts. Drift often looks like "being busy" — it's the state of doing a lot of things without doing the most important thing enough.`);
  }

  if (ctx.allOpps.filter((o) => o.status === "pursuing").length > 3) {
    driftSignals.push(`Pursuing ${ctx.allOpps.filter((o) => o.status === "pursuing").length} opportunities simultaneously is a drift pattern. Focus compounds. Pursuit without depth produces noise, not revenue.`);
  }

  if (driftSignals.length === 0) {
    return renderCoS({
      situation: `The system doesn't show obvious drift signals. ${revenueGoals.length > 0 ? `${revenueGoals.length} of your goals are connected to revenue.` : ""} Goals are reasonably focused.`,
      risk: `Drift is hard to detect from inside it. The real test: what did you actually spend time on yesterday? If it's not on your top priority list, that's the drift.`,
      recommendation: `Run a quick audit: write down the last 3 days of actual work. Anything not on your priority list is a drift signal. ${strategy ? `Your growth strategy is: ${strategy}. Every activity should map back to this.` : ""}`,
      confidence: conf,
      nextMove: `List the last 3 things you spent more than an hour on. I'll tell you whether they're on-strategy.`,
    });
  }

  return renderCoS({
    situation: `${driftSignals.length} drift signal${driftSignals.length !== 1 ? "s" : ""} detected from your current goal and opportunity configuration.`,
    priority: driftSignals[0],
    risk: `Drift compounds quietly. A week of misaligned effort is recoverable. A month of it means the gap to ${target ?? "your revenue target"} gets harder to close each week you wait.`,
    opportunity: revenueGoals.length > 0
      ? `You have ${revenueGoals.length} revenue-connected goal${revenueGoals.length !== 1 ? "s" : ""} in the system. Doubling down on "${revenueGoals[0].title}" is the fastest path back on track.`
      : undefined,
    recommendation: driftSignals.length > 1
      ? `Address each signal:\n${driftSignals.map((s, i) => `${i + 1}. ${s}`).join("\n\n")}\n\n${rules.length > 0 ? `Your rule: "${rules[0]}"` : ""}`
      : `${driftSignals[0]} ${strategy ? `Realign to your growth strategy: ${strategy}.` : ""}`,
    confidence: conf,
    nextMove: target
      ? `Ask: "Did my work yesterday move me toward ${target}?" If the answer is no, the rest of today needs to. What's the first action that directly serves your revenue goal?`
      : `Define your revenue target in Strategic Brain. Without it, I can't give you a true north to measure drift against.`,
    challenge: principles.length > 0 ? `Your stated principles: "${principles[0]}". Does your current work stack reflect that?` : undefined,
  });
}

function buildDecisionsResponse(ctx: OrchestratorContext): string {
  const conf = calcConfidence(ctx);

  if (ctx.decisions.length === 0) {
    return renderCoS({
      situation: `No decisions have been logged in memory. This is a significant gap — without a decision log, I can't check for contradictions or apply past reasoning to new recommendations.`,
      risk: `When decisions aren't recorded, the same reasoning has to be done repeatedly. You end up making the same decision three times instead of once, and sometimes reach different conclusions each time.`,
      recommendation: `Log your most recent important decision in Memory Engine under "decisions". Include: what you decided, why, and what you'd need to see to revisit it. Start with your most recent strategic, pricing, or client decision.`,
      confidence: conf,
      nextMove: `What's the most recent significant business decision you made? I'll help you format it for the memory system.`,
    });
  }

  const decisionLines = ctx.decisions.slice(0, 5).map((d, i) => {
    const detail = shortMem(d, 140);
    return `${i + 1}. **"${d.title}"** — ${detail}`;
  }).join("\n");

  return renderCoS({
    situation: `${ctx.decisions.length} decisions logged in memory. I read all of them before every recommendation to avoid contradicting what you've already concluded.`,
    priority: `Your logged decisions:\n${decisionLines}${ctx.decisions.length > 5 ? `\n*+ ${ctx.decisions.length - 5} more on file*` : ""}`,
    risk: `Decisions that aren't revisited become outdated without you noticing. If any of these were made under different circumstances, they may be guiding current work in the wrong direction.`,
    recommendation: `Review this list for anything that no longer reflects your current position. A stale decision left in place is as dangerous as no decision — it silently guides behaviour in the wrong direction.`,
    confidence: conf,
    nextMove: `Is there a decision on this list you're not sure still holds? Name it and we can re-examine the reasoning.`,
  });
}

function buildLessonsResponse(ctx: OrchestratorContext): string {
  const conf = calcConfidence(ctx);
  const reminderRule = ctx.brain?.business?.orchestratorRules?.find((r) =>
    r.toLowerCase().includes("lesson")
  );

  if (ctx.lessons.length === 0) {
    return renderCoS({
      situation: `No lessons learned have been logged yet. This is the highest-value thing you can add to the system — your own accumulated intelligence from wins and failures.`,
      risk: `Without captured lessons, costly patterns repeat. The same client mistake, the same pricing misstep, the same time-wasting approach — not because you didn't learn it, but because it wasn't recorded where it can be applied.`,
      recommendation: `Add your first lesson to Memory Engine under "lessons_learned". Start with the last mistake that cost you time or money. Include: what happened, what you'd do differently, and the trigger that would make this lesson relevant in future.`,
      confidence: conf,
      nextMove: `Name the last mistake or hard lesson from the past 90 days. I'll help you write it up for the system.`,
    });
  }

  const lessonLines = ctx.lessons.slice(0, 5).map((l, i) => {
    const detail = shortMem(l, 150);
    return `${i + 1}. **"${l.title}"** — ${detail}`;
  }).join("\n");

  return renderCoS({
    situation: `${ctx.lessons.length} lessons logged. These are applied to every recommendation I make — your past experience shapes the advice.`,
    priority: `Your accumulated lessons:\n${lessonLines}${ctx.lessons.length > 5 ? `\n*+ ${ctx.lessons.length - 5} more on file*` : ""}`,
    risk: `Lessons lose value if they're not connected to current situations. The most dangerous pattern is knowing a lesson exists but not recognising the trigger in the moment.`,
    recommendation: `Review whether any current project or decision has a relevant parallel in your lesson log. If yes, apply the lesson proactively — don't wait until it's too late to change course.`,
    confidence: conf,
    nextMove: reminderRule
      ? `Your rule: "${reminderRule}" — is there a situation right now where a past lesson is relevant? Name it.`
      : `Is there a decision you're currently weighing where a past lesson applies? Tell me the situation.`,
  });
}

function buildNextResponse(ctx: OrchestratorContext): string {
  const conf = calcConfidence(ctx);
  return buildLeverageResponse({ ...ctx }); // "next" and "leverage" resolve the same way
}

function buildRisksResponse(ctx: OrchestratorContext): string {
  const conf = calcConfidence(ctx);

  if (ctx.risks.length === 0) {
    return renderCoS({
      situation: `Nothing is currently flagged as a critical risk. No "needs review" items, no critical-importance stale entries.`,
      risk: `Risks often don't announce themselves — they accumulate quietly. Low-flagged risk in the system doesn't mean low risk in reality.`,
      recommendation: `Check manually: (1) Any client relationship not updated in memory recently? (2) Revenue concentration — are you exposed to losing one client? (3) Any unmet commitment to a client, partner, or yourself?`,
      confidence: conf,
      nextMove: `Name one thing that, if it went wrong this week, would significantly set you back. Whether or not it's captured in the system.`,
    });
  }

  const riskLines = ctx.risks.slice(0, 5).map((r, i) => {
    const detail = shortMem(r, 130);
    const action = r.nextAction ? `Recommended action: ${r.nextAction}` : "No action defined";
    return `${i + 1}. **"${r.title}"** — ${detail}. ${action}.`;
  }).join("\n");

  const topRisk = ctx.risks[0];
  const consequence = `If "${topRisk.title}" is left unaddressed, it will either: (a) surface at the worst possible moment, or (b) compound with other risks into a larger problem that's harder to resolve. Risks don't stay static — they grow.`;

  return renderCoS({
    situation: `${ctx.risks.length} active risk${ctx.risks.length !== 1 ? "s" : ""} flagged in memory:\n${riskLines}`,
    priority: `"${topRisk.title}" is the most senior risk right now. ${shortMem(topRisk, 100)}`,
    risk: consequence,
    opportunity: ctx.lessons.length > 0
      ? `You have ${ctx.lessons.length} lessons on file — check whether any captured lesson maps to the current risk. If it does, you've navigated something similar before.`
      : undefined,
    recommendation: `Address "${topRisk.title}" in the next 48 hours. Define: (1) Is this risk active or overblown? (2) What's the one action that reduces it? (3) If unresolvable right now, formally accept it and set a review date. Unaddressed risks are a hidden tax on every other decision.`,
    confidence: conf,
    nextMove: topRisk.nextAction
      ? `${topRisk.nextAction} — do this within 48 hours to prevent the risk from compounding.`
      : `Define one action that reduces the impact of "${topRisk.title}" — even a 10% risk reduction is worth the 30 minutes.`,
  });
}

function buildGoalsResponse(ctx: OrchestratorContext): string {
  const conf = calcConfidence(ctx);
  const target = ctx.brain?.business?.revenueTarget ?? "$250,000 ARR by December 31, 2026";

  if (ctx.goals.length === 0) {
    return renderCoS({
      situation: `No goals are in the system. Without defined goals, every task has equal priority — which means nothing is prioritised.`,
      risk: `Without goals, I can't tell you whether you're on track or off track. I can describe the system state, but not whether that state is good or bad relative to where you're trying to go.`,
      recommendation: `Add your top 1–3 goals to Memory Engine under the "goals" category. For each: write the title, a 1-sentence summary, a next action, and a priority level. Then come back and ask me anything — every answer gets sharper.`,
      confidence: conf,
      nextMove: `Write your top goal in one sentence: "My most important goal right now is ___." That's the start.`,
    });
  }

  const goalLines = ctx.goals.slice(0, 5).map((g, i) => {
    const detail = shortMem(g, 120);
    const action = g.nextAction ? `Next: ${g.nextAction}` : "⚠ No next action — static";
    return `${i + 1}. **"${g.title}"** — ${detail}. ${action}.`;
  }).join("\n");

  const goalsWithoutActions = ctx.goals.filter((g) => !g.nextAction);
  const spreadWarning = ctx.goals.length > 3
    ? `${ctx.goals.length} goals is a spread problem. Every goal added reduces the focus on every other. Which 1–2 could be paused until your top goal hits a milestone?`
    : undefined;

  return renderCoS({
    situation: `${ctx.goals.length} active goal${ctx.goals.length !== 1 ? "s" : ""} in the system. Revenue target: ${target}.`,
    priority: `Your goal stack:\n${goalLines}${ctx.goals.length > 5 ? `\n*+ ${ctx.goals.length - 5} more goals in system*` : ""}`,
    risk: goalsWithoutActions.length > 0
      ? `${goalsWithoutActions.length} goal${goalsWithoutActions.length !== 1 ? "s" : ""} with no next action: ${goalsWithoutActions.slice(0, 2).map((g) => `"${g.title}"`).join(", ")}. A goal without a next action is a wish, not a plan.`
      : ctx.risks.length > 0
      ? `"${ctx.risks[0].title}" is flagged as an active risk. If unresolved, it threatens progress on your top goal.`
      : undefined,
    recommendation: goalsWithoutActions.length > 0
      ? `Assign a next action to each goal without one. Start with "${goalsWithoutActions[0].title}". One sentence: "The next action is ___." This takes 5 minutes and activates the goal from static to moving.`
      : `Verify each goal is still the right thing to be pursuing. Business context changes — a goal set 90 days ago might not be the optimal use of your energy today. If any feel wrong, update or archive them.`,
    confidence: conf,
    nextMove: goalsWithoutActions[0]
      ? `Define the next action for "${goalsWithoutActions[0].title}" right now. One sentence.`
      : ctx.goals[0]?.nextAction
      ? `${ctx.goals[0].nextAction} — this is the next move on your top goal.`
      : `Review whether your goal stack is still the right set of bets given today's context.`,
    challenge: spreadWarning,
  });
}

function buildChallengeResponse(ctx: OrchestratorContext): string {
  const conf = calcConfidence(ctx);
  const target = ctx.brain?.business?.revenueTarget;
  const spreadRule = ctx.brain?.business?.orchestratorRules?.find((r) =>
    r.toLowerCase().includes("spread")
  ) ?? "Challenge me if I'm spreading too thin — call it out directly";

  const issues: { label: string; detail: string }[] = [];

  if (ctx.goals.length > 4) {
    const goalList = ctx.goals.slice(0, 3).map((g) => `"${g.title}"`).join(", ");
    issues.push({
      label: `Too many goals (${ctx.goals.length})`,
      detail: `You're running: ${goalList}${ctx.goals.length > 3 ? ` and ${ctx.goals.length - 3} more` : ""}. That's ${ctx.goals.length} claims on your finite weekly hours. Each goal you add reduces the depth achievable on every other.`,
    });
  }

  const goalsWithoutActions = ctx.goals.filter((g) => !g.nextAction);
  if (goalsWithoutActions.length > 0) {
    issues.push({
      label: `${goalsWithoutActions.length} goal${goalsWithoutActions.length !== 1 ? "s" : ""} with no next action`,
      detail: `${goalsWithoutActions.slice(0, 2).map((g) => `"${g.title}"`).join(", ")} have no defined next step. Carrying goals without next actions creates the illusion of progress without any actual forward movement.`,
    });
  }

  if (ctx.risks.length >= 3) {
    issues.push({
      label: `${ctx.risks.length} active risks unresolved`,
      detail: `You have ${ctx.risks.length} items flagged "needs review" with no resolution. Each one is a deferred decision that is actively costing mental bandwidth — and compounding.`,
    });
  }

  const pursuingOpps = ctx.allOpps.filter((o) => o.status === "pursuing");
  if (pursuingOpps.length > 2) {
    issues.push({
      label: `${pursuingOpps.length} opportunities "in pursuit" simultaneously`,
      detail: `${pursuingOpps.slice(0, 2).map((o) => `"${o.title}"`).join(", ")} and ${pursuingOpps.length - 2} more. Pursuing more than 2–3 simultaneously means none get the depth needed to close. Which one gets your real energy this month?`,
    });
  }

  const revenueGoals = ctx.goals.filter((g) =>
    g.title.toLowerCase().includes("arr") ||
    g.title.toLowerCase().includes("revenue") ||
    g.title.toLowerCase().includes("client") ||
    hasTag(g.tags, "revenue", "sales")
  );
  if (revenueGoals.length === 0 && ctx.goals.length > 1 && target) {
    issues.push({
      label: `No revenue-connected goals visible`,
      detail: `You have ${ctx.goals.length} goals but none are visibly tied to ${target}. If none of your goals directly create revenue, you're building without a path to the target.`,
    });
  }

  if (issues.length === 0) {
    return renderCoS({
      situation: `Honest assessment: ${ctx.goals.length} active goals, ${ctx.risks.length} flagged risks, ${ctx.allOpps.filter((o) => o.status === "pursuing").length} opportunities in motion. The configuration looks reasonable.`,
      risk: `The harder challenge: Are you doing the work that only you can do? Or filling days with things that feel productive but don't compound toward ${target ?? "your revenue target"}?`,
      recommendation: `Do a time audit for the past 3 days. List everything you worked on. For each item, ask: "Would this appear on my priority list?" Anything that wouldn't is either a delegation candidate or something to cut.`,
      confidence: conf,
      nextMove: `Tell me what your last 3 days of work actually looked like. I'll give you an honest leverage assessment.`,
    });
  }

  const issueLines = issues.map((iss, i) =>
    `${i + 1}. **${iss.label}:** ${iss.detail}`
  ).join("\n\n");

  return renderCoS({
    situation: `You asked for a challenge. The system is showing ${issues.length} concern${issues.length !== 1 ? "s" : ""} worth addressing directly.`,
    priority: issueLines,
    risk: `Each of these individually is manageable. Together, they describe a system that is overpromising and under-delivering on its top priority. The pattern is: lots of motion, insufficient momentum on the thing that matters most.`,
    recommendation: `Pick the single highest-drag issue from the list above and resolve it today. Not all of them — just the one. Trying to fix everything at once is the same pattern that created the issue.`,
    confidence: conf,
    nextMove: issues[0]
      ? `Address: "${issues[0].label}". What's the one decision or action that resolves it?`
      : `What's the one thing on this list that you already knew was a problem but hadn't addressed?`,
    challenge: `Your rule: "${spreadRule}" — this is the honest assessment you asked for.`,
  });
}

function buildBriefResponse(ctx: OrchestratorContext): string {
  const conf = calcConfidence(ctx);
  const topGoal = ctx.goals[0];
  const topRisk = ctx.risks[0];
  const topAction = ctx.topActions[0];
  const topOpp = ctx.hotOpps.find((o) => o.status !== "captured");
  const target = ctx.brain?.business?.revenueTarget;

  const systemStats = [
    `${ctx.goals.length} goal${ctx.goals.length !== 1 ? "s" : ""}`,
    `${ctx.decisions.length} decision${ctx.decisions.length !== 1 ? "s" : ""}`,
    `${ctx.lessons.length} lesson${ctx.lessons.length !== 1 ? "s" : ""}`,
    `${ctx.risks.length} risk${ctx.risks.length !== 1 ? "s" : ""}`,
    `${ctx.allOpps.length} opportunit${ctx.allOpps.length !== 1 ? "ies" : "y"}`,
  ].join(", ");

  return renderCoS({
    situation: `System read across ${ctx.totalMemory} memory entries: ${systemStats}. ${target ? `Revenue target: ${target}.` : ""}`,
    priority: topGoal
      ? `"${topGoal.title}" is your top goal. ${shortMem(topGoal, 120)} ${topGoal.nextAction ? `Next action: ${topGoal.nextAction}.` : "⚠ No next action defined."}`
      : `No goals defined. Without a goal stack, priorities are undefined.`,
    risk: topRisk
      ? `"${topRisk.title}" is the active risk I'd watch most closely. ${shortMem(topRisk, 100)}`
      : undefined,
    opportunity: topOpp
      ? `"${topOpp.title}" (${topOpp.status}, ${topOpp.priority} priority) is the top open opportunity. ${shortOpp(topOpp, 90)}`
      : undefined,
    recommendation: topAction
      ? `Most leveraged action right now: ${topAction.nextAction} — from "${topAction.title}". Everything else is secondary to this.`
      : topGoal
      ? `Define a next action for "${topGoal.title}" and then execute on it. No next action = no movement.`
      : `Set up your goal stack in Memory Engine. Everything else I can surface depends on knowing where you're going.`,
    confidence: conf,
    nextMove: topAction?.nextAction ?? topGoal?.nextAction ?? `Tell me what's on your mind — I've read all ${ctx.totalMemory} entries and all ${ctx.allOpps.length} opportunities.`,
  });
}

function buildPipelineResponse(ctx: OrchestratorContext): string {
  const conf = calcConfidence(ctx);
  const target = ctx.brain?.business?.revenueTarget;
  const strategy = ctx.brain?.business?.growthStrategy;
  const salesGoal = ctx.goals.find((g) =>
    g.title.toLowerCase().includes("client") ||
    g.title.toLowerCase().includes("revenue") ||
    g.title.toLowerCase().includes("close") ||
    hasTag(g.tags, "sales", "revenue")
  );
  const salesLessons = ctx.lessons.filter((l) =>
    l.content.toLowerCase().includes("client") ||
    hasTag(l.tags, "client", "sales")
  ).slice(0, 2);
  const salesDecisions = ctx.decisions.filter((d) =>
    hasTag(d.tags, "sales", "client", "pricing") ||
    d.title.toLowerCase().includes("client")
  ).slice(0, 2);

  const lessonText = salesLessons.length > 0
    ? salesLessons.map((l) => `- **"${l.title}"**: ${shortMem(l, 90)}`).join("\n")
    : undefined;

  return renderCoS({
    situation: `Revenue target: ${target ?? "$250K ARR"}. Growth strategy: ${strategy ?? "LinkedIn content → partnerships → referrals"}. ${salesGoal ? `Pipeline goal: "${salesGoal.title}". ${salesGoal.nextAction ? `Next action: ${salesGoal.nextAction}.` : "⚠ No next action."}` : "No pipeline goal defined in memory."}`,
    priority: salesGoal
      ? `"${salesGoal.title}" is your active pipeline goal. ${shortMem(salesGoal, 120)}`
      : `No sales goal is defined. Without one, pipeline work lacks a target to optimise toward.`,
    risk: `Constraint: no cold outreach. Every sales action must be warm — existing relationships, referrals, or warm LinkedIn introductions. Cold outreach contradicts your growth strategy and carries compliance risk.`,
    opportunity: lessonText
      ? `Lessons that apply to pipeline now:\n${lessonText}`
      : salesDecisions.length > 0
      ? `Relevant past decisions: ${salesDecisions.map((d) => `"${d.title}"`).join(", ")} — apply these to current conversations.`
      : undefined,
    recommendation: `Focus on depth, not breadth. The fastest path to ${target ?? "your revenue target"} is closing the highest-value open conversation, not finding new ones. What's the current deal closest to closing? Push that one first.`,
    confidence: conf,
    nextMove: salesGoal?.nextAction
      ? `${salesGoal.nextAction} — this is the next pipeline action. Execute it today.`
      : `Name the prospect you're closest to closing. I'll help you define the next step to move them forward.`,
  });
}

function buildMarketingResponse(ctx: OrchestratorContext): string {
  const conf = calcConfidence(ctx);
  const strategy = ctx.brain?.business?.growthStrategy;
  const marketingGoal = ctx.goals.find((g) =>
    g.title.toLowerCase().includes("content") ||
    g.title.toLowerCase().includes("linkedin") ||
    hasTag(g.tags, "marketing", "content")
  );
  const marketingOpps = ctx.allOpps.filter((o) =>
    o.category === "competitive" ||
    hasTag(o.tags, "marketing", "content")
  );

  return renderCoS({
    situation: `Growth strategy: ${strategy ?? "LinkedIn content → agency partnerships → referrals"}. ${marketingGoal ? `Active marketing goal: "${marketingGoal.title}".` : "No marketing goal defined in memory."} ${marketingOpps.length > 0 ? `${marketingOpps.length} marketing-related opportunities tracked.` : ""}`,
    priority: marketingGoal
      ? `"${marketingGoal.title}" is your current marketing goal. ${shortMem(marketingGoal, 120)} ${marketingGoal.nextAction ? `Next action: ${marketingGoal.nextAction}.` : "⚠ No next action."}`
      : `Define a marketing goal in Memory Engine. Without a target, marketing becomes activity for activity's sake.`,
    risk: `Core constraint: no cold outreach or unsolicited contact. Your positioning depends on being sought after — content and referrals, not chase. Violating this erodes the trust-based brand you're building.`,
    opportunity: marketingOpps.length > 0
      ? `${marketingOpps.length} marketing opportunity${marketingOpps.length !== 1 ? "ies" : "y"} tracked: "${marketingOpps[0].title}" (${marketingOpps[0].status}). ${shortOpp(marketingOpps[0], 80)}`
      : undefined,
    recommendation: `The highest-leverage marketing action is consistent, specific LinkedIn content that demonstrates your expertise to your target buyer. One post that speaks directly to your buyer's problem is worth more than ten that speak to everyone.`,
    confidence: conf,
    nextMove: marketingGoal?.nextAction
      ? `${marketingGoal.nextAction}`
      : `What's the one thing your ideal client is most confused or frustrated about right now? That's your next content topic.`,
  });
}

function buildFinanceResponse(ctx: OrchestratorContext): string {
  const conf = calcConfidence(ctx);
  const target = ctx.brain?.business?.revenueTarget ?? "$250,000 ARR by December 31, 2026";
  const wealthGoals = ctx.brain?.personal?.wealthGoals;
  const revenueOpps = ctx.allOpps.filter((o) => o.category === "revenue");
  const financeDecisions = ctx.decisions.filter((d) =>
    hasTag(d.tags, "finance", "pricing") ||
    d.title.toLowerCase().includes("pric")
  );

  return renderCoS({
    situation: `Revenue target: ${target}.${wealthGoals ? ` Personal wealth goal: ${wealthGoals}.` : ""} ${revenueOpps.length > 0 ? `${revenueOpps.length} revenue opportunity${revenueOpps.length !== 1 ? "ies" : "y"} tracked.` : ""}`,
    priority: revenueOpps.length > 0
      ? `Revenue opportunities in the pipeline:\n${revenueOpps.slice(0, 3).map((o) => `- **"${o.title}"** (${o.status}, ${o.priority}): ${shortOpp(o, 80)}${o.estimatedValue ? ` — ${o.estimatedValue}` : ""}`).join("\n")}`
      : `No revenue opportunities currently tracked. Add them to the Opportunity Engine to give financial assessments more signal.`,
    risk: financeDecisions.length > 0
      ? `Financial decisions on file: ${financeDecisions.slice(0, 2).map((d) => `"${d.title}"`).join(", ")}. Ensure current actions are consistent with these.`
      : `No financial decisions logged yet. Pricing and revenue decisions should be recorded — they're the most frequently revisited decisions in a growing business.`,
    opportunity: revenueOpps.length > 0
      ? `"${revenueOpps[0].title}" is your top revenue opportunity (${revenueOpps[0].priority} priority, ${revenueOpps[0].status}).${revenueOpps[0].estimatedValue ? ` Estimated value: ${revenueOpps[0].estimatedValue}.` : ""} Moving this forward is the most direct path to your revenue target.`
      : undefined,
    recommendation: `The fastest path to ${target} is closing the highest-value open conversation, not finding new ones. Which deal, if closed, closes the most of your current gap? Focus your energy there.`,
    confidence: conf,
    nextMove: `What is the current gap to your revenue target? And which single deal or conversation could close the most of it?`,
  });
}

// ─── Agent action log ─────────────────────────────────────────────────────────

type AgentAction = { agentId: string; agentName: string; action: string; result: string | null };

function buildAgentActions(type: string): AgentAction[] {
  const map: Record<string, AgentAction> = {
    focus:        { agentId: "orchestrator", agentName: "Chief of Staff",      action: "Applied CoS framework: Situation → Priority → Risk → Opportunity → Recommendation → Confidence → Next Move", result: "Structured day guidance built from live memory, goals, and risks" },
    priorities:   { agentId: "intelligence", agentName: "Intelligence Agent",  action: "Ranked priorities by strategic weight, surfaced risks and spread concerns", result: "Priority stack with confidence scoring and challenge check" },
    opportunities:{ agentId: "intelligence", agentName: "Intelligence Agent",  action: "Scanned opportunity pipeline for untapped potential and decision-deferred items", result: "Opportunity CoS brief with binary recommendation" },
    stuck:        { agentId: "memory",       agentName: "Memory Agent",        action: "Identified stalled items, goals without next actions, and stuck opportunities", result: "Blockers surfaced with unblock recommendation" },
    stop:         { agentId: "orchestrator", agentName: "Chief of Staff",      action: "Audited goals, opportunities, and activity for low-leverage and stalled items", result: "Stop-doing list with rationale and next decision" },
    drift:        { agentId: "intelligence", agentName: "Intelligence Agent",  action: "Checked goal-revenue alignment and focus distribution for drift signals", result: "Drift assessment with realignment recommendation" },
    leverage:     { agentId: "intelligence", agentName: "Intelligence Agent",  action: "Computed highest-leverage action from goals, risks, and opportunities", result: "Leverage CoS brief with 90-minute action recommendation" },
    decisions:    { agentId: "memory",       agentName: "Memory Agent",        action: "Retrieved full decision log for review and contradiction check", result: "Decision history loaded with staleness warning" },
    lessons:      { agentId: "memory",       agentName: "Memory Agent",        action: "Surfaced captured lessons and relevance to current context", result: "Lessons applied with situational guidance" },
    next:         { agentId: "intelligence", agentName: "Intelligence Agent",  action: "Computed highest-leverage next action from all context", result: "Recommendation grounded in memory, goals, and opportunities" },
    risks:        { agentId: "intelligence", agentName: "Intelligence Agent",  action: "Scanned memory for active risks, assessed consequence and urgency", result: "Risk register with 48-hour action and consequence framing" },
    goals:        { agentId: "memory",       agentName: "Memory Agent",        action: "Loaded goal stack, assessed next actions, spread, and revenue alignment", result: "Goal status with challenge check" },
    challenge:    { agentId: "orchestrator", agentName: "Chief of Staff",      action: "Ran full constraint analysis: goals, actions, risks, opportunities, revenue alignment", result: "Honest CoS assessment per user-defined rules" },
    brief:        { agentId: "orchestrator", agentName: "Chief of Staff",      action: "Synthesised full context across memory, goals, risks, and opportunities", result: "CoS briefing built from live data" },
    pipeline:     { agentId: "sales",        agentName: "Sales Mode",          action: "Loaded pipeline context, sales-relevant memory and lessons", result: "Pipeline CoS brief with warm-path constraint" },
    marketing:    { agentId: "marketing",    agentName: "Marketing Mode",      action: "Reviewed marketing strategy, goals, and opportunities", result: "Marketing CoS brief with positioning constraint" },
    finance:      { agentId: "finance",      agentName: "Finance Mode",        action: "Analysed revenue position, financial decisions, and opportunity pipeline", result: "Finance CoS brief focused on gap-to-target" },
  };
  return [map[type] ?? map.brief];
}

// ─── System prompt builder ────────────────────────────────────────────────────

function buildSystemPrompt(ctx: OrchestratorContext): string {
  const brain = ctx.brain;
  const biz = brain?.business;
  const personal = brain?.personal;

  const sections: string[] = [];

  sections.push(`You are the NXS Orchestrator — Jay's personal AI Chief of Staff. You are direct, sharp, and strategic. You know Jay's business and life deeply because you have access to his real data loaded below. Never be vague. Always be specific, naming real items from the data.`);

  if (biz) {
    const bizLines = [
      biz.vision && `Vision: ${biz.vision}`,
      biz.mission && `Mission: ${biz.mission}`,
      biz.revenueTarget && `Revenue Target: ${biz.revenueTarget}`,
      biz.growthStrategy && `Growth Strategy: ${biz.growthStrategy}`,
      biz.riskTolerance && `Risk Tolerance: ${biz.riskTolerance}`,
      biz.principles?.length && `Principles:\n${biz.principles.map(p => `- ${p}`).join("\n")}`,
      biz.orchestratorRules?.length && `Rules (non-negotiable constraints):\n${biz.orchestratorRules.map(r => `- ${r}`).join("\n")}`,
    ].filter(Boolean);
    if (bizLines.length) sections.push(`## Business Context\n${bizLines.join("\n")}`);
  }

  if (personal) {
    const perLines = [
      personal.vision && `Personal Vision: ${personal.vision}`,
      personal.purpose && `Purpose: ${personal.purpose}`,
      personal.wealthGoals && `Wealth Goals: ${personal.wealthGoals}`,
      personal.workingStyle && `Working Style: ${personal.workingStyle}`,
      personal.values?.length && `Core Values: ${personal.values.join(", ")}`,
      personal.nonNegotiables?.length && `Non-Negotiables:\n${personal.nonNegotiables.map(n => `- ${n}`).join("\n")}`,
    ].filter(Boolean);
    if (perLines.length) sections.push(`## Personal Context\n${perLines.join("\n")}`);
  }

  if (ctx.setupCtx) {
    const sc = ctx.setupCtx;
    const setupLines: string[] = [];

    const bp = sc["business-profile"] as Record<string, string> | undefined;
    if (bp) {
      if (bp.name) setupLines.push(`Business name: ${bp.name}`);
      if (bp.description) setupLines.push(`What we do: ${bp.description}`);
      if (bp.mainOffer) setupLines.push(`Main offer: ${bp.mainOffer}`);
      if (bp.stage) setupLines.push(`Business stage: ${bp.stage}`);
      if (bp.primaryObjective) setupLines.push(`Primary objective: ${bp.primaryObjective}`);
    }

    const rg = sc["revenue-goal"] as Record<string, string> | undefined;
    if (rg) {
      if (rg.annualTarget) setupLines.push(`Annual revenue target: ${rg.annualTarget}`);
      if (rg.monthlyTarget) setupLines.push(`Monthly revenue target: ${rg.monthlyTarget}`);
      if (rg.targetDate) setupLines.push(`Target date: ${rg.targetDate}`);
      if (rg.revenueModel) setupLines.push(`Revenue model: ${rg.revenueModel}`);
      if (rg.clientsNeeded) setupLines.push(`Clients needed: ${rg.clientsNeeded}`);
    }

    const ss = sc["sales-strategy"] as Record<string, string> | undefined;
    if (ss) {
      if (ss.idealCustomer) setupLines.push(`Ideal customer: ${ss.idealCustomer}`);
      if (ss.targetIndustries) setupLines.push(`Target industries: ${ss.targetIndustries}`);
      if (ss.salesChannels) setupLines.push(`Sales channels: ${ss.salesChannels}`);
      if (ss.salesProcess) setupLines.push(`Sales process: ${ss.salesProcess}`);
      if (ss.followUpRules) setupLines.push(`Follow-up rules: ${ss.followUpRules}`);
    }

    const sv = sc["services"] as Record<string, string> | undefined;
    if (sv) {
      if (sv.servicesOverview) setupLines.push(`Services: ${sv.servicesOverview}`);
      if (sv.packages) setupLines.push(`Packages: ${sv.packages}`);
    }

    const dp = sc["delivery-process"] as Record<string, string> | undefined;
    if (dp) {
      if (dp.onboardingSteps) setupLines.push(`Client onboarding: ${String(dp.onboardingSteps).slice(0, 200)}`);
      if (dp.reviewProcess) setupLines.push(`Review process: ${dp.reviewProcess}`);
      if (dp.commonRisks) setupLines.push(`Delivery risks: ${String(dp.commonRisks).slice(0, 150)}`);
    }

    const or = sc["operating-rules"] as Record<string, string> | undefined;
    if (or) {
      if (or.priorityWork) setupLines.push(`Always prioritise: ${or.priorityWork}`);
      if (or.ignoreWork) setupLines.push(`Ignore / deprioritise: ${or.ignoreWork}`);
      if (or.decisionRules) setupLines.push(`Decision rules: ${or.decisionRules}`);
      if (or.highLeverageActivities) setupLines.push(`Highest leverage: ${or.highLeverageActivities}`);
      if (or.lowLeverageDistractors) setupLines.push(`Avoid: ${or.lowLeverageDistractors}`);
    }

    if (setupLines.length) {
      sections.push(`## Business Setup Context\n${setupLines.join("\n")}`);
    }
  }

  if (ctx.goals.length) {
    sections.push(`## Active Goals\n${ctx.goals.slice(0, 6).map(g => `- [${g.priority?.toUpperCase()}] ${g.title}${g.content ? `: ${g.content.slice(0, 120)}` : ""}`).join("\n")}`);
  }

  if (ctx.priorities.length) {
    sections.push(`## High-Priority Memory Items\n${ctx.priorities.slice(0, 6).map(p => `- [${p.category}] ${p.title}`).join("\n")}`);
  }

  if (ctx.decisions.length) {
    sections.push(`## Recent Decisions\n${ctx.decisions.slice(0, 5).map(d => `- ${d.title}${d.content ? `: ${d.content.slice(0, 100)}` : ""}`).join("\n")}`);
  }

  if (ctx.lessons.length) {
    sections.push(`## Lessons Learned\n${ctx.lessons.slice(0, 4).map(l => `- ${l.title}${l.content ? `: ${l.content.slice(0, 100)}` : ""}`).join("\n")}`);
  }

  if (ctx.risks.length) {
    sections.push(`## Active Risks / Needs Review\n${ctx.risks.slice(0, 5).map(r => `- [${r.priority?.toUpperCase()}] ${r.title}`).join("\n")}`);
  }

  if (ctx.hotOpps.length) {
    sections.push(`## Hot Opportunities (pursue now)\n${ctx.hotOpps.slice(0, 5).map(o => {
      const val = o.estimatedValue ? ` (~$${parseFloat(o.estimatedValue).toLocaleString()})` : "";
      return `- ${o.title}${val}${o.description ? `: ${o.description.slice(0, 100)}` : ""}`;
    }).join("\n")}`);
  }

  if (ctx.notPursued.length) {
    sections.push(`## Parked / Not Pursued\n${ctx.notPursued.slice(0, 4).map(o => `- ${o.title}`).join("\n")}`);
  }

  if (ctx.topActions.length) {
    sections.push(`## Top Action Items\n${ctx.topActions.slice(0, 5).map(a => `- ${a.title}`).join("\n")}`);
  }

  sections.push(`## Memory Stats\nJay has ${ctx.totalMemory} total memory entries across goals, decisions, lessons, and opportunities.`);

  sections.push(`## Response Format (ALWAYS use exactly this structure — no exceptions)
Respond in the Chief of Staff (CoS) briefing format:

**Situation:** One sharp sentence on what's actually happening right now based on the data.
**Priority:** The single highest-leverage thing Jay should focus on, named specifically.
**Risk:** The biggest risk or blind spot right now, named specifically.
**Opportunity:** The best opportunity Jay is underutilizing, named specifically.
**Recommendation:** 2-3 crisp, actionable sentences. Be direct. Use real names from the data.
**Confidence: [0-100]%** — one sentence explaining your confidence level and why.
**Next Move:** One concrete action Jay can take in the next 24 hours.

Rules:
- Always name real items from the data — never be generic.
- If you don't have enough context for a section, still provide your best read.
- Keep total response under 300 words.
- Do not add any text before **Situation:** or after **Next Move:**.`);

  return sections.join("\n\n");
}

// ─── Main response generator ──────────────────────────────────────────────────

async function generateOrchestratorResponse(
  userMessage: string,
  ctx: OrchestratorContext,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<{ response: string; agentActions: AgentAction[] }> {
  const violation = checkRuleViolations(userMessage, ctx);
  if (violation) {
    return {
      response: violation,
      agentActions: [{
        agentId: "orchestrator",
        agentName: "Chief of Staff",
        action: "Rule violation detected — Strategic Brain constraint applied",
        result: "Response redirected per user-defined rules",
      }],
    };
  }

  const systemPrompt = buildSystemPrompt(ctx);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 8192,
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userMessage },
    ],
  });

  const response = completion.choices[0]?.message?.content
    ?? "**Situation:** Unable to generate a response right now.\n**Priority:** Retry your message.\n**Risk:** Unknown.\n**Opportunity:** Unknown.\n**Recommendation:** Please try again in a moment.\n**Confidence: 0%** — no response received.\n**Next Move:** Resend your message.";

  const type = classifyQuestion(userMessage);
  return { response, agentActions: buildAgentActions(type) };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.get("/chat/messages", async (req, res) => {
  const limit = parseInt((req.query.limit as string) ?? "100");
  const messages = await db
    .select()
    .from(chatMessagesTable)
    .orderBy(desc(chatMessagesTable.timestamp))
    .limit(Math.min(limit, 200));
  res.json(messages.reverse().map(serializeMessage));
});

router.post("/chat/messages", async (req, res) => {
  const parsed = SendChatMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid message" });
    return;
  }

  const { content } = parsed.data;

  const [userMsg] = await db
    .insert(chatMessagesTable)
    .values({ role: "user", content })
    .returning();

  const recentHistory = await db
    .select()
    .from(chatMessagesTable)
    .orderBy(desc(chatMessagesTable.timestamp))
    .limit(21);
  const history = recentHistory
    .filter((m) => m.id !== userMsg.id)
    .reverse()
    .slice(-20)
    .map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));
  const ctx = await loadContext();
  const { response, agentActions } = await generateOrchestratorResponse(content, ctx, history);

  const [orchMsg] = await db
    .insert(chatMessagesTable)
    .values({
      role: "orchestrator",
      content: response,
      agentActions: JSON.stringify(agentActions),
    })
    .returning();

  res.status(201).json({
    userMessage: serializeMessage(userMsg),
    orchestratorResponse: serializeMessage(orchMsg),
    agentActions,
  });
});

router.post("/chat/stream", async (req, res) => {
  const parsed = SendChatMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid message" });
    return;
  }
  const { content } = parsed.data;

  const [userMsg] = await db
    .insert(chatMessagesTable)
    .values({ role: "user", content })
    .returning();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  try {
    const ctx = await loadContext();
    const type = classifyQuestion(content);
    const actions = buildAgentActions(type);
    const violation = checkRuleViolations(content, ctx);

    if (violation) {
      const [orchMsg] = await db
        .insert(chatMessagesTable)
        .values({ role: "orchestrator", content: violation, agentActions: JSON.stringify(actions) })
        .returning();
      for (const ch of violation.split("")) {
        res.write(`data: ${JSON.stringify({ content: ch })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ done: true, userMessageId: userMsg.id, messageId: orchMsg.id, agentActions: actions })}\n\n`);
      res.end();
      return;
    }

    const recentHistory = await db
      .select()
      .from(chatMessagesTable)
      .orderBy(desc(chatMessagesTable.timestamp))
      .limit(21);
    const history = recentHistory
      .filter((m) => m.id !== userMsg.id)
      .reverse()
      .slice(-20)
      .map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      }));

    const systemPrompt = buildSystemPrompt(ctx);
    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content },
      ],
      stream: true,
    });

    let fullResponse = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullResponse += delta;
        res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
      }
    }

    const [orchMsg] = await db
      .insert(chatMessagesTable)
      .values({
        role: "orchestrator",
        content: fullResponse || "No response generated.",
        agentActions: JSON.stringify(actions),
      })
      .returning();

    res.write(`data: ${JSON.stringify({ done: true, userMessageId: userMsg.id, messageId: orchMsg.id, agentActions: actions })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error(err, "Chat stream error");
    const errContent =
      "**Situation:** I hit an error generating your response.\n**Priority:** Retry your message.\n**Risk:** Unknown.\n**Recommendation:** Please try again.\n**Confidence: 0%** — error occurred.\n**Next Move:** Resend your message.";
    await db
      .insert(chatMessagesTable)
      .values({ role: "orchestrator", content: errContent, agentActions: JSON.stringify([]) })
      .catch(() => {});
    res.write(`data: ${JSON.stringify({ content: errContent })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  }
});

function serializeMessage(msg: typeof chatMessagesTable.$inferSelect) {
  return { ...msg, timestamp: msg.timestamp.toISOString() };
}

export default router;

import type { OrchestratorContext } from "./context";

export interface Confidence {
  score: number;
  reason: string;
}

export function calcConfidence(ctx: OrchestratorContext): Confidence {
  let score = 45;
  const reasons: string[] = [];

  if (ctx.goals.length > 0)      { score += 15; reasons.push(`${ctx.goals.length} active goals`); }
  if (ctx.decisions.length > 2)  { score += 10; reasons.push(`${ctx.decisions.length} decisions logged`); }
  if (ctx.lessons.length > 0)    { score += 8;  reasons.push(`${ctx.lessons.length} lessons on file`); }
  if (ctx.brain)                 { score += 8;  reasons.push("Strategic Brain loaded"); }
  if (ctx.topActions.length > 0) { score += 5;  reasons.push("next actions defined"); }
  if (ctx.allOpps.length > 0)    { score += 4;  reasons.push(`${ctx.allOpps.length} opportunities tracked`); }

  if (ctx.goals.length > 5) score -= 8; // too many goals = unclear priority
  if (ctx.risks.length > 3) score -= 5; // unresolved risks = uncertainty

  score = Math.min(Math.max(score, 35), 92); // floor 35, cap 92 — never claim certainty

  return { score, reason: reasons.slice(0, 3).join(", ") || "limited data in system" };
}

export interface CoSBlocks {
  situation: string;
  priority?: string;
  risk?: string;
  opportunity?: string;
  recommendation: string;
  confidence: Confidence;
  nextMove: string;
  challenge?: string;
}

export function renderCoS(b: CoSBlocks): string {
  const lines: string[] = [];
  lines.push(`**Situation:** ${b.situation}`);
  if (b.priority)    lines.push(`\n**Priority:** ${b.priority}`);
  if (b.risk)        lines.push(`\n**Risk:** ${b.risk}`);
  if (b.opportunity) lines.push(`\n**Opportunity:** ${b.opportunity}`);
  lines.push(`\n**Recommendation:** ${b.recommendation}`);
  if (b.challenge)   lines.push(`\n**Challenge:** ${b.challenge}`);
  lines.push(`\n**Confidence: ${b.confidence.score}%** — ${b.confidence.reason}`);
  lines.push(`\n**Next Move:** ${b.nextMove}`);
  return lines.join("\n").trim();
}

/**
 * Hard, deterministic guardrails that fire before any LLM call. These encode
 * Jay's non-negotiable operating rules so they cannot be talked around.
 */
export function checkRuleViolations(msg: string, ctx: OrchestratorContext): string | null {
  const lower = msg.toLowerCase();
  const rules = ctx.brain?.business?.orchestratorRules ?? [];
  const conf = calcConfidence(ctx);

  if (/cold outreach|cold email|cold call|cold dm|unsolicited/.test(lower)) {
    const rule = rules.find((r) => r.toLowerCase().includes("cold"));
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

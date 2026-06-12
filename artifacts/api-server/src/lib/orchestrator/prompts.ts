import { DEFAULT_MAYA, type OrchestratorContext } from "./context";
import type { AgentRun } from "./dispatch";

/** Shared business/personal/setup/memory sections injected into every LLM call. */
export function buildContextSections(ctx: OrchestratorContext): string[] {
  const brain = ctx.brain;
  const biz = brain?.business;
  const personal = brain?.personal;

  const sections: string[] = [];

  if (biz) {
    const bizLines = [
      biz.vision && `Vision: ${biz.vision}`,
      biz.mission && `Mission: ${biz.mission}`,
      biz.revenueTarget && `Revenue Target: ${biz.revenueTarget}`,
      biz.growthStrategy && `Growth Strategy: ${biz.growthStrategy}`,
      biz.riskTolerance && `Risk Tolerance: ${biz.riskTolerance}`,
      biz.principles?.length && `Principles:\n${biz.principles.map((p) => `- ${p}`).join("\n")}`,
      biz.orchestratorRules?.length &&
        `Rules (non-negotiable constraints):\n${biz.orchestratorRules.map((r) => `- ${r}`).join("\n")}`,
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
      personal.nonNegotiables?.length &&
        `Non-Negotiables:\n${personal.nonNegotiables.map((n) => `- ${n}`).join("\n")}`,
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
      if (dp.onboardingSteps)
        setupLines.push(`Client onboarding: ${String(dp.onboardingSteps).slice(0, 200)}`);
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

    if (setupLines.length) sections.push(`## Business Setup Context\n${setupLines.join("\n")}`);
  }

  if (ctx.goals.length) {
    sections.push(
      `## Active Goals\n${ctx.goals
        .slice(0, 6)
        .map(
          (g) =>
            `- [${g.priority?.toUpperCase()}] ${g.title}${g.content ? `: ${g.content.slice(0, 120)}` : ""}`
        )
        .join("\n")}`
    );
  }

  if (ctx.priorities.length) {
    sections.push(
      `## High-Priority Memory Items\n${ctx.priorities
        .slice(0, 6)
        .map((p) => `- [${p.category}] ${p.title}`)
        .join("\n")}`
    );
  }

  if (ctx.decisions.length) {
    sections.push(
      `## Recent Decisions\n${ctx.decisions
        .slice(0, 5)
        .map((d) => `- ${d.title}${d.content ? `: ${d.content.slice(0, 100)}` : ""}`)
        .join("\n")}`
    );
  }

  if (ctx.lessons.length) {
    sections.push(
      `## Lessons Learned\n${ctx.lessons
        .slice(0, 4)
        .map((l) => `- ${l.title}${l.content ? `: ${l.content.slice(0, 100)}` : ""}`)
        .join("\n")}`
    );
  }

  if (ctx.risks.length) {
    sections.push(
      `## Active Risks / Needs Review\n${ctx.risks
        .slice(0, 5)
        .map((r) => `- [${r.priority?.toUpperCase()}] ${r.title}`)
        .join("\n")}`
    );
  }

  if (ctx.hotOpps.length) {
    sections.push(
      `## Hot Opportunities (pursue now)\n${ctx.hotOpps
        .slice(0, 5)
        .map((o) => {
          const val = o.estimatedValue ? ` (~$${parseFloat(o.estimatedValue).toLocaleString()})` : "";
          return `- ${o.title}${val}${o.description ? `: ${o.description.slice(0, 100)}` : ""}`;
        })
        .join("\n")}`
    );
  }

  if (ctx.notPursued.length) {
    sections.push(
      `## Parked / Not Pursued\n${ctx.notPursued.slice(0, 4).map((o) => `- ${o.title}`).join("\n")}`
    );
  }

  if (ctx.topActions.length) {
    sections.push(
      `## Top Action Items\n${ctx.topActions.slice(0, 5).map((a) => `- ${a.title}`).join("\n")}`
    );
  }

  sections.push(
    `## Memory Stats\nJay has ${ctx.totalMemory} total memory entries across goals, decisions, lessons, and opportunities.`
  );

  return sections;
}

/** Briefing pack handed to a dispatched department agent. */
export function buildAgentBriefing(ctx: OrchestratorContext): string {
  return buildContextSections(ctx).join("\n\n");
}

/** System prompt block shape compatible with Anthropic.TextBlockParam. */
export interface SystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

/**
 * System blocks for the orchestrator's final synthesis call. The shared
 * business briefing leads (and is cache-marked) so it forms a common cached
 * prefix with the department agent calls; the identity, agent reports, and
 * response format follow in a separate block.
 */
export function buildSystemBlocks(
  ctx: OrchestratorContext,
  runs: AgentRun[] = [],
  extraGuidance?: string
): SystemBlock[] {
  const sections: string[] = [];

  sections.push(
    `You are Maya — Jay's personal AI Chief of Staff and the orchestrator of NXS OS. You are direct, sharp, and strategic. You know Jay's business and life deeply because you have access to his real data loaded above. Never be vague. Always be specific, naming real items from the data.`
  );

  const maya = ctx.brain?.maya ?? DEFAULT_MAYA;
  {
    const lines = [
      maya.vibe && `Vibe: ${maya.vibe}`,
      maya.humour && `Humour: ${maya.humour}`,
      maya.address && `How you address Jay: ${maya.address}`,
      maya.quirks?.length && `Your signatures:\n${maya.quirks.map((q) => `- ${q}`).join("\n")}`,
      maya.signoff && `Sign-off: ${maya.signoff}`,
      maya.extra,
    ].filter(Boolean);
    if (lines.length) {
      sections.push(
        `## Your Personality\n${lines.join("\n")}\n\nPersonality lives in your word choice and judgement calls — it never replaces substance, pads length, or breaks the response format.`
      );
    }
  }

  if (extraGuidance) sections.push(extraGuidance);

  if (runs.length) {
    sections.push(
      `## Department Agent Reports\nYou dispatched department agents on this question. Their reports are below — integrate their findings into your answer and attribute insights to the agent that produced them where it adds weight.\n\n${runs
        .map((r) => `### ${r.agent.name} — task: ${r.task}\n${r.findings}`)
        .join("\n\n")}`
    );
  }

  sections.push(`## Response Modes
Read Jay's message and pick the mode that fits:

1. BRIEFING: status checks, "what should I focus on", priorities, risk reviews. Use the Chief of Staff format exactly:
**Situation:** One sharp sentence on what's actually happening based on the data.
**Priority:** The single highest-leverage thing Jay should focus on, named specifically.
**Risk:** The biggest risk or blind spot right now, named specifically.
**Opportunity:** The best opportunity Jay is underutilizing, named specifically.
**Recommendation:** 2-3 crisp, actionable sentences using real names from the data.
**Confidence: [0-100]%** plus one sentence on why.
**Next Move:** One concrete action Jay can take in the next 24 hours.

2. SPARRING: Jay pitches an idea, plan, price, or decision. Open with 3 to 5 pointed questions, risks, counterarguments, or blind spots he hasn't considered. Then give one clear, honest recommendation. Conversational, no required structure.

3. EXECUTION: Jay asks you to produce something (copy, plan, offer, prompt, structure, message). Skip the debate and deliver the asset, tight and usable. Quality bar: good enough to ship.

Across all modes:
- Always ground claims in the real data above, naming real items. Never be generic.
- Keep responses under 300 words unless producing an asset or Jay asks for depth.
- Never use em dashes. Use commas, colons, or short sentences instead.`);

  return [
    { type: "text", text: buildAgentBriefing(ctx), cache_control: { type: "ephemeral" } },
    { type: "text", text: sections.join("\n\n") },
  ];
}

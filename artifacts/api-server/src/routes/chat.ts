import { Router, type Response } from "express";
import { db, chatMessagesTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { SendChatMessageBody } from "@workspace/api-zod";
import { anthropic, CLAUDE_MODEL, type Anthropic } from "@workspace/integrations-anthropic-server";
import {
  loadContext,
  checkRuleViolations,
  buildSystemBlocks,
  planDispatch,
  runDispatches,
  toAgentActions,
  getAgent,
  type AgentAction,
  type OrchestratorContext,
} from "../lib/orchestrator";
import {
  TOOL_DEFINITIONS,
  COMPUTER_TOOL_DEFINITIONS,
  TOOL_GUIDANCE,
  PROPOSE_ONLY_GUIDANCE,
  executeTool,
  type ExecutionLevel,
  type ToolEvent,
} from "../lib/orchestrator/tools";
import { recordUsage } from "../lib/orchestrator/telemetry";
import { saveAttachment, type IncomingAttachment, type StoredAttachment } from "../lib/uploads";
import { assertWithinBudget, BudgetExceededError } from "../lib/orchestrator/budget";
import { captureMemoryFromTurn } from "../lib/orchestrator/capture";
import { loadConversationSummary, maybeCompactConversation } from "../lib/orchestrator/compaction";

const router = Router();

type ChatHistory = Array<{ role: "user" | "assistant"; content: string }>;

const FALLBACK_RESPONSE =
  "**Situation:** I hit an error generating your response.\n**Priority:** Retry your message.\n**Risk:** Unknown.\n**Recommendation:** Please try again in a moment.\n**Confidence: 0%** — error occurred.\n**Next Move:** Resend your message.";

const MAX_TOOL_ROUNDS = 5;

// ─── Shared turn pipeline ─────────────────────────────────────────────────────

interface TurnSetup {
  ctx: OrchestratorContext;
  history: ChatHistory;
  violation: string | null;
  summary?: string;
}

async function setupTurn(content: string, userMsgId: number): Promise<TurnSetup> {
  const [ctx, recentHistory, compaction] = await Promise.all([
    loadContext(content),
    db.select().from(chatMessagesTable).orderBy(desc(chatMessagesTable.timestamp)).limit(21),
    loadConversationSummary(),
  ]);

  const history: ChatHistory = recentHistory
    .filter((m) => m.id !== userMsgId)
    .reverse()
    .slice(-20)
    .map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));

  return { ctx, history, violation: checkRuleViolations(content, ctx), summary: compaction?.summary };
}

/**
 * Synthesis with a tool-use loop. Streams text via onText, reports executed
 * actions via onAction, and returns the final text plus all tool events.
 */
/** Turn uploaded attachments into Claude content blocks. */
function attachmentBlocks(atts: IncomingAttachment[]): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const a of atts) {
    if (a.kind === "image") {
      blocks.push({ type: "image", source: { type: "base64", media_type: a.mediaType as "image/png", data: a.data } });
    } else if (a.kind === "pdf") {
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: a.data } });
    } else {
      const text = Buffer.from(a.data, "base64").toString("utf8").slice(0, 200_000);
      blocks.push({ type: "text", text: `Attached file "${a.name}":\n\n${text}` });
    }
  }
  return blocks;
}

export async function runSynthesis(opts: {
  system: ReturnType<typeof buildSystemBlocks>;
  history: ChatHistory;
  content: string;
  tools: typeof TOOL_DEFINITIONS;
  scope?: string;
  attachments?: IncomingAttachment[];
  onText?: (delta: string) => void;
  onAction?: (event: ToolEvent & { error?: boolean }) => void;
}): Promise<{ text: string; toolEvents: ToolEvent[] }> {
  const userContent: Anthropic.MessageParam["content"] = opts.attachments?.length
    ? [...attachmentBlocks(opts.attachments), { type: "text", text: opts.content }]
    : opts.content;
  const messages: Anthropic.MessageParam[] = [
    ...opts.history,
    { role: "user", content: userContent },
  ];
  const toolEvents: ToolEvent[] = [];
  let text = "";
  await assertWithinBudget();

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = anthropic.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: opts.system,
      messages,
      ...(opts.tools.length ? { tools: opts.tools } : {}),
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        text += event.delta.text;
        opts.onText?.(event.delta.text);
      }
    }

    const final = await stream.finalMessage();
    recordUsage(opts.scope ?? "synthesis", CLAUDE_MODEL, final.usage);

    if (final.stop_reason !== "tool_use") break;

    // Execute every requested tool, then continue the loop with results.
    messages.push({ role: "assistant", content: final.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of final.content) {
      if (block.type !== "tool_use") continue;
      try {
        const result = await executeTool(block.name, block.input);
        // Model gets the full result; UI chips and the action log get a summary.
        const summary = result.length > 220 ? `${result.slice(0, 217)}…` : result;
        toolEvents.push({ tool: block.name, summary });
        opts.onAction?.({ tool: block.name, summary });
        results.push({ type: "tool_result", tool_use_id: block.id, content: result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "tool failed";
        opts.onAction?.({ tool: block.name, summary: msg, error: true });
        results.push({ type: "tool_result", tool_use_id: block.id, content: `Error: ${msg}`, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }

  return { text, toolEvents };
}

function buildActions(
  runs: Awaited<ReturnType<typeof runDispatches>>,
  toolEvents: ToolEvent[]
): AgentAction[] {
  const actions = toAgentActions(runs);
  for (const e of toolEvents) {
    actions.push({ agentId: "orchestrator", agentName: "Maya", action: e.tool, result: e.summary });
  }
  return actions;
}

async function saveOrchestratorMessage(content: string, agentActions: AgentAction[]) {
  const [msg] = await db
    .insert(chatMessagesTable)
    .values({ role: "orchestrator", content, agentActions: JSON.stringify(agentActions) })
    .returning();
  return msg;
}

function toolsForLevel(level: ExecutionLevel): typeof TOOL_DEFINITIONS {
  if (level === "red") return [];
  // Computer control (apps, browser, web fetch) requires Full Auto.
  return level === "green" ? [...TOOL_DEFINITIONS, ...COMPUTER_TOOL_DEFINITIONS] : TOOL_DEFINITIONS;
}

function parseLevel(level: string | undefined): ExecutionLevel {
  return level === "green" || level === "red" ? level : "amber";
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
  const level = parseLevel(parsed.data.executionLevel);

  const [userMsg] = await db
    .insert(chatMessagesTable)
    .values({ role: "user", content })
    .returning();

  const { ctx, history, violation, summary } = await setupTurn(content, userMsg.id);

  let response: string;
  let agentActions: AgentAction[];

  if (violation) {
    response = violation;
    agentActions = violationActions();
  } else {
    try {
      const runs = await runDispatches(await planDispatch(content), ctx, content);
      const tools = toolsForLevel(level);
      const { text, toolEvents } = await runSynthesis({
        system: buildSystemBlocks(ctx, runs, tools.length ? TOOL_GUIDANCE : PROPOSE_ONLY_GUIDANCE, summary),
        history,
        content,
        tools,
      });
      response = text || FALLBACK_RESPONSE;
      agentActions = buildActions(runs, toolEvents);
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        response = `**Situation:** ${err.message}\n**Next Move:** Raise NXS_DAILY_BUDGET_USD or wait for the daily reset.`;
        agentActions = [];
      } else {
        req.log.error(err, "Chat completion error");
        response = FALLBACK_RESPONSE;
        agentActions = [];
      }
    }
  }

  const orchMsg = await saveOrchestratorMessage(response, agentActions);
  maybeCompactConversation();
  captureMemoryFromTurn(content, response, orchMsg.id, agentActions.filter((a) => a.action.startsWith("create_memory")).map((a) => a.result ?? ""));

  res.status(201).json({
    userMessage: serializeMessage(userMsg),
    orchestratorResponse: serializeMessage(orchMsg),
    agentActions,
  });
});

/** Read + sanitise attachments from a chat request body (max 6). */
function parseIncomingAttachments(body: unknown): IncomingAttachment[] {
  const raw = (body as { attachments?: unknown })?.attachments;
  if (!Array.isArray(raw)) return [];
  const out: IncomingAttachment[] = [];
  for (const a of raw.slice(0, 6)) {
    if (!a || typeof a.data !== "string" || typeof a.mediaType !== "string") continue;
    const kind: IncomingAttachment["kind"] = a.kind === "pdf" || a.kind === "text" ? a.kind : "image";
    out.push({ kind, mediaType: a.mediaType, data: a.data, name: typeof a.name === "string" ? a.name : "file" });
  }
  return out;
}

router.post("/chat/stream", async (req, res) => {
  // Attachments (images / PDFs / text) are validated manually so an upload can
  // accompany an empty caption.
  const incoming = parseIncomingAttachments(req.body);
  const rawContent = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  const content = rawContent || (incoming.length ? "Take a look at the attached file(s)." : "");
  if (!content) {
    res.status(400).json({ error: "Invalid message" });
    return;
  }
  const level = parseLevel(typeof req.body?.executionLevel === "string" ? req.body.executionLevel : undefined);

  const stored: StoredAttachment[] = [];
  for (const a of incoming) {
    try { stored.push(await saveAttachment(a)); } catch { /* skip a bad upload */ }
  }

  const [userMsg] = await db
    .insert(chatMessagesTable)
    .values({ role: "user", content, attachments: stored.length ? JSON.stringify(stored) : null })
    .returning();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  try {
    const { ctx, history, violation, summary } = await setupTurn(content, userMsg.id);

    if (violation) {
      const actions = violationActions();
      const orchMsg = await saveOrchestratorMessage(violation, actions);
      streamText(res, violation);
      sendEvent(res, { done: true, userMessageId: userMsg.id, messageId: orchMsg.id, agentActions: actions });
      res.end();
      return;
    }

    const dispatches = await planDispatch(content);
    if (dispatches.length) {
      sendEvent(res, {
        dispatch: dispatches.map((d) => ({
          agentId: d.agentId,
          agentName: getAgent(d.agentId)?.name ?? d.agentId,
          task: d.task,
        })),
      });
    }
    const runs = await runDispatches(dispatches, ctx, content, (run) => {
      sendEvent(res, { agentDone: { agentId: run.agent.id, agentName: run.agent.name } });
    });

    const tools = toolsForLevel(level);
    const { text, toolEvents } = await runSynthesis({
      system: buildSystemBlocks(ctx, runs, tools.length ? TOOL_GUIDANCE : PROPOSE_ONLY_GUIDANCE, summary),
      history,
      content,
      tools,
      attachments: incoming,
      onText: (delta) => sendEvent(res, { content: delta }),
      onAction: (event) => sendEvent(res, { action: event }),
    });

    const actions = buildActions(runs, toolEvents);
    const orchMsg = await saveOrchestratorMessage(text || "No response generated.", actions);
    maybeCompactConversation();
    captureMemoryFromTurn(content, text, orchMsg.id, toolEvents.filter((e) => e.tool === "create_memory_entry").map((e) => e.summary));

    sendEvent(res, { done: true, userMessageId: userMsg.id, messageId: orchMsg.id, agentActions: actions });
    res.end();
  } catch (err) {
    const msg = err instanceof BudgetExceededError ? err.message : FALLBACK_RESPONSE;
    if (!(err instanceof BudgetExceededError)) req.log.error(err, "Chat stream error");
    await db
      .insert(chatMessagesTable)
      .values({ role: "orchestrator", content: msg, agentActions: JSON.stringify([]) })
      .catch(() => {});
    sendEvent(res, { content: msg });
    sendEvent(res, { done: true });
    res.end();
  }
});

// POST /chat/growth-session — manually trigger Maya's autonomous strategy session
router.post("/chat/growth-session", async (req, res) => {
  try {
    const { runGrowthSession } = await import("../lib/orchestrator/autonomy");
    const briefing = await runGrowthSession(true);
    res.json({ ran: briefing != null, briefing });
  } catch (err) {
    req.log.error(err, "growth session failed");
    res.status(500).json({ error: "Growth session failed" });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sendEvent(res: Response, data: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/** Stream pre-rendered text in word chunks so the UI gets a typing effect. */
function streamText(res: Response, text: string, wordsPerChunk = 5) {
  const words = text.split(" ");
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    const chunk = words.slice(i, i + wordsPerChunk).join(" ");
    sendEvent(res, { content: i === 0 ? chunk : ` ${chunk}` });
  }
}

function violationActions(): AgentAction[] {
  return [
    {
      agentId: "orchestrator",
      agentName: "Maya",
      action: "Rule violation detected — Strategic Brain constraint applied",
      result: "Response redirected per user-defined rules",
    },
  ];
}

function serializeMessage(msg: typeof chatMessagesTable.$inferSelect) {
  let attachments: StoredAttachment[] | null = null;
  if (msg.attachments) { try { attachments = JSON.parse(msg.attachments) as StoredAttachment[]; } catch { /* ignore */ } }
  return { ...msg, attachments, timestamp: msg.timestamp.toISOString() };
}

export default router;

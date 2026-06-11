import { Router, type Response } from "express";
import { db, chatMessagesTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { SendChatMessageBody } from "@workspace/api-zod";
import { anthropic, CLAUDE_MODEL, messageText } from "@workspace/integrations-anthropic-server";
import {
  loadContext,
  checkRuleViolations,
  buildSystemBlocks,
  planDispatch,
  runDispatches,
  toAgentActions,
  getAgent,
  type AgentAction,
  type AgentRun,
  type OrchestratorContext,
} from "../lib/orchestrator";

const router = Router();

type ChatHistory = Array<{ role: "user" | "assistant"; content: string }>;

const FALLBACK_RESPONSE =
  "**Situation:** I hit an error generating your response.\n**Priority:** Retry your message.\n**Risk:** Unknown.\n**Recommendation:** Please try again in a moment.\n**Confidence: 0%** — error occurred.\n**Next Move:** Resend your message.";

// ─── Shared turn pipeline ─────────────────────────────────────────────────────

interface TurnSetup {
  ctx: OrchestratorContext;
  history: ChatHistory;
  violation: string | null;
}

async function setupTurn(content: string, userMsgId: number): Promise<TurnSetup> {
  const [ctx, recentHistory] = await Promise.all([
    loadContext(),
    db.select().from(chatMessagesTable).orderBy(desc(chatMessagesTable.timestamp)).limit(21),
  ]);

  const history: ChatHistory = recentHistory
    .filter((m) => m.id !== userMsgId)
    .reverse()
    .slice(-20)
    .map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));

  return { ctx, history, violation: checkRuleViolations(content, ctx) };
}

async function dispatchAgents(content: string, ctx: OrchestratorContext): Promise<AgentRun[]> {
  const dispatches = await planDispatch(content);
  return runDispatches(dispatches, ctx, content);
}

function buildMessages(
  history: ChatHistory,
  content: string
): Array<{ role: "user" | "assistant"; content: string }> {
  return [...history, { role: "user", content }];
}

async function saveOrchestratorMessage(content: string, agentActions: AgentAction[]) {
  const [msg] = await db
    .insert(chatMessagesTable)
    .values({ role: "orchestrator", content, agentActions: JSON.stringify(agentActions) })
    .returning();
  return msg;
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

  const { ctx, history, violation } = await setupTurn(content, userMsg.id);

  let response: string;
  let agentActions: AgentAction[];

  if (violation) {
    response = violation;
    agentActions = violationActions();
  } else {
    try {
      const runs = await dispatchAgents(content, ctx);
      const message = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        system: buildSystemBlocks(ctx, runs),
        messages: buildMessages(history, content),
      });
      response = messageText(message) || FALLBACK_RESPONSE;
      agentActions = toAgentActions(runs);
    } catch (err) {
      req.log.error(err, "Chat completion error");
      response = FALLBACK_RESPONSE;
      agentActions = [];
    }
  }

  const orchMsg = await saveOrchestratorMessage(response, agentActions);

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
    const { ctx, history, violation } = await setupTurn(content, userMsg.id);

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
    const runs = await runDispatches(dispatches, ctx, content);
    const actions = toAgentActions(runs);

    const stream = anthropic.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: buildSystemBlocks(ctx, runs),
      messages: buildMessages(history, content),
    });

    let fullResponse = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullResponse += event.delta.text;
        sendEvent(res, { content: event.delta.text });
      }
    }

    const orchMsg = await saveOrchestratorMessage(fullResponse || "No response generated.", actions);
    sendEvent(res, { done: true, userMessageId: userMsg.id, messageId: orchMsg.id, agentActions: actions });
    res.end();
  } catch (err) {
    req.log.error(err, "Chat stream error");
    await db
      .insert(chatMessagesTable)
      .values({ role: "orchestrator", content: FALLBACK_RESPONSE, agentActions: JSON.stringify([]) })
      .catch(() => {});
    sendEvent(res, { content: FALLBACK_RESPONSE });
    sendEvent(res, { done: true });
    res.end();
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
      agentName: "CEO Orchestrator",
      action: "Rule violation detected — Strategic Brain constraint applied",
      result: "Response redirected per user-defined rules",
    },
  ];
}

function serializeMessage(msg: typeof chatMessagesTable.$inferSelect) {
  return { ...msg, timestamp: msg.timestamp.toISOString() };
}

export default router;

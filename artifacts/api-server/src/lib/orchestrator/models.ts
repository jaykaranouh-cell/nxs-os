/**
 * Selectable chat "brains". Claude tiers run the full agentic Maya (tools,
 * actions, attachments, thinking). Gemini and GPT run as a conversational
 * brain over Jay's context (no actions — that wiring is Claude-specific).
 */
import { CLAUDE_MODEL } from "@workspace/integrations-anthropic-server";

export interface ChatModel {
  id: string;                 // toggle id sent from the UI
  label: string;
  provider: "anthropic" | "google" | "openai";
  model: string;              // provider model id
  agentic: boolean;           // true = full Maya (tools/actions); false = conversational
}

export const CHAT_MODELS: ChatModel[] = [
  { id: "claude-opus",   label: "Claude Opus",      provider: "anthropic", model: CLAUDE_MODEL,         agentic: true },
  { id: "claude-sonnet", label: "Claude Sonnet",    provider: "anthropic", model: "claude-sonnet-4-6",  agentic: true },
  { id: "claude-haiku",  label: "Claude Haiku",     provider: "anthropic", model: "claude-haiku-4-5",   agentic: true },
  { id: "gemini-pro",   label: "Gemini 2.5 Pro",  provider: "google",    model: "gemini-2.5-pro",    agentic: false },
  { id: "gemini-flash", label: "Gemini 2.5 Flash",provider: "google",    model: "gemini-2.5-flash",  agentic: false },
  { id: "gpt",          label: "GPT (OpenAI)",    provider: "openai",    model: "gpt-4o",            agentic: false },
];

export const DEFAULT_CHAT_MODEL = "claude-opus";

export function resolveChatModel(id: string | undefined): ChatModel {
  return CHAT_MODELS.find((m) => m.id === id) ?? CHAT_MODELS[0];
}

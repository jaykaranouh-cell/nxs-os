/**
 * Shared OpenAI credential resolution. OPENAI_API_KEY is the primary source;
 * the AI_INTEGRATIONS_* variables are still honoured for compatibility with
 * environments that inject them (e.g. a hosted gateway).
 *
 * A missing key is not fatal at startup — the server must still boot for
 * non-LLM features. Calls fail at request time with a clear message instead.
 */
export function resolveOpenAIConfig(): { apiKey: string; baseURL: string | undefined } {
  const apiKey =
    process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "";
  if (!apiKey) {
    console.warn(
      "[openai] OPENAI_API_KEY is not set — LLM features will fail until you add it to the repo-root .env file."
    );
  }
  return {
    apiKey: apiKey || "missing-openai-api-key",
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
  };
}

/**
 * Push notifications via ntfy.sh — the OS reaching Jay's pocket.
 * Enabled by NXS_NTFY_TOPIC; everything no-ops without it.
 * Jay subscribes to the topic in the ntfy app (iOS/Android) or web.
 */

import { logger } from "./logger";

export async function notifyJay(
  title: string,
  message: string,
  opts: { priority?: "min" | "default" | "high" | "urgent"; tags?: string[] } = {}
): Promise<boolean> {
  const topic = process.env.NXS_NTFY_TOPIC;
  if (!topic) return false;
  try {
    const resp = await fetch(`https://ntfy.sh/${topic}`, {
      method: "POST",
      headers: {
        Title: title,
        Priority: opts.priority ?? "default",
        Tags: (opts.tags ?? []).join(","),
      },
      body: message.slice(0, 3500),
      signal: AbortSignal.timeout(10_000),
    });
    return resp.ok;
  } catch (err) {
    logger.warn(err, "ntfy push failed");
    return false;
  }
}

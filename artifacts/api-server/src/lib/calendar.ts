/**
 * Calendar ingest via a private iCal (.ics) URL — no OAuth required.
 * Jay pastes his calendar's secret iCal address into NXS_CALENDAR_ICS_URL.
 * Upcoming events are summarized for the morning brief and recent past
 * meetings become memory proposals (so meetings turn into business memory).
 */

import { db, memoryProposalsTable, systemContextTable, insertMemoryProposalSchema } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const SEEN_KEY = "calendar-ingested-events";

interface CalEvent {
  uid: string;
  summary: string;
  start: Date;
  end?: Date;
  location?: string;
  description?: string;
}

const icsUrl = () => process.env.NXS_CALENDAR_ICS_URL || null;

async function fetchEvents(): Promise<CalEvent[]> {
  const url = icsUrl();
  if (!url) return [];
  const ical = await import("node-ical");
  const data = await ical.default.async.fromURL(url);
  const events: CalEvent[] = [];
  for (const k of Object.keys(data)) {
    const e = data[k] as { type?: string; uid?: string; summary?: string; start?: Date; end?: Date; location?: string; description?: string };
    if (e.type !== "VEVENT" || !e.start || !e.summary) continue;
    events.push({
      uid: e.uid ?? `${e.summary}-${new Date(e.start).toISOString()}`,
      summary: e.summary,
      start: new Date(e.start),
      end: e.end ? new Date(e.end) : undefined,
      location: e.location,
      description: e.description,
    });
  }
  return events;
}

/** Upcoming events (next 7 days) as a short text block for the morning brief. */
export async function upcomingEventsBlock(): Promise<string> {
  if (!icsUrl()) return "";
  try {
    const now = Date.now();
    const week = now + 7 * 24 * 60 * 60 * 1000;
    const upcoming = (await fetchEvents())
      .filter((e) => e.start.getTime() >= now && e.start.getTime() <= week)
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 12);
    if (!upcoming.length) return "";
    const fmt = (d: Date) => d.toLocaleString("en-AU", { weekday: "short", hour: "numeric", minute: "2-digit" });
    return `## Upcoming Calendar (next 7 days)\n${upcoming.map((e) => `- ${fmt(e.start)}: ${e.summary}${e.location ? ` @ ${e.location}` : ""}`).join("\n")}`;
  } catch (err) {
    logger.warn(err, "calendar: upcoming fetch failed");
    return "";
  }
}

/** Turn recently-finished meetings into memory proposals (once each). */
export async function ingestPastMeetings(): Promise<number> {
  if (!icsUrl()) return 0;
  try {
    const [row] = await db.select().from(systemContextTable).where(eq(systemContextTable.key, SEEN_KEY));
    const seen = new Set<string>(row ? (JSON.parse(row.value) as string[]) : []);

    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const justFinished = (await fetchEvents()).filter((e) => {
      const end = (e.end ?? e.start).getTime();
      return end <= now && end >= dayAgo && !seen.has(e.uid);
    });

    let created = 0;
    for (const e of justFinished.slice(0, 5)) {
      await db.insert(memoryProposalsTable).values(
        insertMemoryProposalSchema.parse({
          title: `Meeting: ${e.summary}`,
          content: `Met ${e.summary} on ${e.start.toLocaleDateString("en-AU")}.${e.location ? ` Location: ${e.location}.` : ""}${e.description ? ` Notes: ${e.description.slice(0, 300)}` : " Add outcomes and next steps."}`,
          category: "client_notes",
          priority: "medium",
          source: "scheduler",
          sourceRef: `calendar:${e.uid}`,
        })
      );
      seen.add(e.uid);
      created++;
    }

    if (created > 0) {
      const value = JSON.stringify([...seen].slice(-500));
      await db
        .insert(systemContextTable)
        .values({ key: SEEN_KEY, value })
        .onConflictDoUpdate({ target: systemContextTable.key, set: { value, updatedAt: new Date() } });
      logger.info({ created }, "calendar: past meetings ingested as proposals");
    }
    return created;
  } catch (err) {
    logger.warn(err, "calendar: ingest failed");
    return 0;
  }
}

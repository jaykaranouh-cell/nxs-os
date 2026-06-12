/**
 * Obsidian bridge — two one-way pipes between the NXS-Brain vault and the
 * memory engine. Never both directions on the same file:
 *
 *   Ingest:  00-Inbox/ + 04-Meetings/ notes → extraction → memory_proposals
 *   Mirror:  memory_entries → 08-NXS-OS-Memory/*.md (generated, never read)
 *
 * Enabled by OBSIDIAN_VAULT_PATH; everything no-ops without it.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { db, memoryEntriesTable, memoryConnectionsTable, memoryProposalsTable, insertMemoryProposalSchema, systemContextTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { anthropic, CLAUDE_MODEL, messageText } from "@workspace/integrations-anthropic-server";
import { z } from "zod/v4";
import { recordUsage } from "./orchestrator/telemetry";
import { logger } from "./logger";

const INGEST_FOLDERS = ["00-Inbox", "04-Meetings"];
const MIRROR_FOLDER = "08-NXS-OS-Memory";
const STATE_KEY = "obsidian-ingest-state";
const MAX_NOTES_PER_RUN = 3;
const MAX_NOTE_CHARS = 8000;

const vaultPath = () => process.env.OBSIDIAN_VAULT_PATH || null;

// ─── Ingest state (path → mtimeMs of last processed version) ─────────────────

async function loadState(): Promise<Record<string, number>> {
  const [row] = await db.select().from(systemContextTable).where(eq(systemContextTable.key, STATE_KEY));
  if (!row) return {};
  try {
    return JSON.parse(row.value) as Record<string, number>;
  } catch {
    return {};
  }
}

async function saveState(state: Record<string, number>): Promise<void> {
  const value = JSON.stringify(state);
  await db
    .insert(systemContextTable)
    .values({ key: STATE_KEY, value })
    .onConflictDoUpdate({ target: systemContextTable.key, set: { value, updatedAt: new Date() } });
}

// ─── Ingest: vault notes → memory proposals ───────────────────────────────────

const NOTE_EXTRACTION_PROMPT = `You extract durable business memory from one of Jay's Obsidian notes (meeting notes, inbox captures, client notes).

Extract ONLY facts worth remembering permanently: decisions, lessons, commitments with owners/deadlines, client/deal facts, strategy changes. Skip templates, empty headings, and boilerplate. An empty list is a common correct answer.

Respond with JSON only: {"proposals": [{"title": "...", "content": "...", "category": "decisions|lessons_learned|goals|client_notes|company_context|general", "priority": "low|medium|high|critical", "nextAction": "... or omit"}]}`;

const noteProposalsSchema = z.object({
  proposals: z
    .array(
      z.object({
        title: z.string().min(1),
        content: z.string().min(1),
        category: z.string().default("general"),
        priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
        nextAction: z.string().optional(),
      })
    )
    .max(5),
});

async function ingestNote(vault: string, relPath: string): Promise<number> {
  const text = (await fs.readFile(path.join(vault, relPath), "utf8")).slice(0, MAX_NOTE_CHARS);
  if (text.trim().length < 60) return 0; // empty or template stub

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1200,
    output_config: { effort: "low" },
    system: NOTE_EXTRACTION_PROMPT,
    messages: [{ role: "user", content: `Note path: ${relPath}\n\n${text}` }],
  });
  recordUsage("obsidian:ingest", CLAUDE_MODEL, response.usage);

  const raw = messageText(response).replace(/^```(?:json)?\s*|```\s*$/g, "").trim() || "{}";
  const parsed = noteProposalsSchema.safeParse(JSON.parse(raw));
  if (!parsed.success || parsed.data.proposals.length === 0) return 0;

  const rows = parsed.data.proposals.map((p) =>
    insertMemoryProposalSchema.parse({
      title: p.title,
      content: p.content,
      category: p.category,
      priority: p.priority,
      nextAction: p.nextAction ?? null,
      source: "obsidian",
      sourceRef: relPath,
    })
  );
  await db.insert(memoryProposalsTable).values(rows);
  return rows.length;
}

async function ingestVault(vault: string): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) return;
  const state = await loadState();
  let processed = 0;

  for (const folder of INGEST_FOLDERS) {
    const dir = path.join(vault, folder);
    let files: string[];
    try {
      files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md"));
    } catch {
      continue; // folder doesn't exist
    }

    for (const file of files) {
      if (processed >= MAX_NOTES_PER_RUN) break;
      const relPath = `${folder}/${file}`;
      const stat = await fs.stat(path.join(dir, file));
      if (state[relPath] === stat.mtimeMs) continue; // unchanged since last run

      try {
        const count = await ingestNote(vault, relPath);
        state[relPath] = stat.mtimeMs;
        processed++;
        if (count) logger.info({ note: relPath, proposals: count }, "obsidian: note ingested");
      } catch (err) {
        logger.warn(err, `obsidian: ingest failed for ${relPath}`);
      }
    }
  }

  if (processed) await saveState(state);
}

// ─── Mirror: memory entries → vault markdown ──────────────────────────────────

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "entry";
}

function entryFilename(id: number, title: string): string {
  return `${id}-${slug(title)}.md`;
}

async function mirrorMemory(vault: string): Promise<void> {
  const dir = path.join(vault, MIRROR_FOLDER);
  await fs.mkdir(dir, { recursive: true });

  const [entries, connections] = await Promise.all([
    db.select().from(memoryEntriesTable),
    db.select().from(memoryConnectionsTable),
  ]);

  const byId = new Map(entries.map((e) => [e.id, e]));

  await fs.writeFile(
    path.join(dir, "_README.md"),
    "Generated by NXS OS — do not edit. These files mirror the memory engine; changes here are overwritten.\n"
  );

  for (const e of entries) {
    const links = connections
      .filter((c) => c.fromMemoryId === e.id || c.toMemoryId === e.id)
      .map((c) => {
        const other = byId.get(c.fromMemoryId === e.id ? c.toMemoryId : c.fromMemoryId);
        return other ? `- ${c.relationshipType}: [[${entryFilename(other.id, other.title).replace(/\.md$/, "")}]]` : null;
      })
      .filter(Boolean);

    const md = `---
nxs_id: ${e.id}
category: ${e.category}
priority: ${e.priority}
importance: ${e.importance}
status: ${e.status}
source: ${e.source}
created: ${e.createdAt.toISOString()}
---

# ${e.title}

${e.content}
${e.summary ? `\n> ${e.summary}\n` : ""}${e.nextAction ? `\n**Next action:** ${e.nextAction}\n` : ""}${
      links.length ? `\n## Connections\n${links.join("\n")}\n` : ""
    }`;

    await fs.writeFile(path.join(dir, entryFilename(e.id, e.title)), md);
  }
}

// ─── Entry point (called by the scheduler and the sync endpoint) ──────────────

export async function runObsidianSync(): Promise<void> {
  const vault = vaultPath();
  if (!vault) return;
  try {
    await fs.access(vault);
  } catch {
    logger.warn({ vault }, "obsidian: vault path not accessible");
    return;
  }
  await ingestVault(vault);
  await mirrorMemory(vault);
}

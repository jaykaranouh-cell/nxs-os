/**
 * User uploads (documents / photos Jay sends to Maya in chat). Saved to a
 * served directory so the chat history can show them, and read back as base64
 * to pass to Claude as image/document content blocks.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const UPLOADS_DIR = process.env.NXS_UPLOADS_DIR || path.join(homedir(), "NXS-Uploads");

export interface IncomingAttachment {
  kind: "image" | "pdf" | "text"; // how to hand it to Claude
  mediaType: string;              // e.g. image/png, application/pdf, text/plain
  data: string;                   // base64 (no data: prefix)
  name: string;
}
export interface StoredAttachment {
  type: "image" | "pdf" | "text";
  name: string;
  url: string;        // served path, e.g. /uploads/abc.png
  mediaType: string;
}

const safeExt = (name: string, mediaType: string) => {
  const fromName = (name.match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? "").toLowerCase();
  if (fromName) return fromName;
  if (mediaType.includes("png")) return "png";
  if (mediaType.includes("jpeg") || mediaType.includes("jpg")) return "jpg";
  if (mediaType.includes("webp")) return "webp";
  if (mediaType.includes("gif")) return "gif";
  if (mediaType.includes("pdf")) return "pdf";
  return "txt";
};

/** Persist an incoming attachment and return its served reference. */
export async function saveAttachment(a: IncomingAttachment): Promise<StoredAttachment> {
  await mkdir(UPLOADS_DIR, { recursive: true });
  const ext = safeExt(a.name, a.mediaType);
  const fname = `up-${Date.now().toString(36)}-${Math.round(Math.random() * 1e6).toString(36)}.${ext}`;
  await writeFile(path.join(UPLOADS_DIR, fname), Buffer.from(a.data, "base64"));
  return { type: a.kind, name: a.name || fname, url: `/uploads/${fname}`, mediaType: a.mediaType };
}

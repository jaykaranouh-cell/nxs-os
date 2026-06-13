/**
 * Higgsfield image generation via the local CLI.
 *
 * The CLI is invoked by absolute path (launchd's PATH doesn't include
 * /usr/local/bin) and uses the token Jay created with `higgsfield auth login`.
 * Generated images are downloaded into NXS-Generated and served at /generated.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { logger } from "./logger";

const exec = promisify(execFile);

const BIN = process.env.NXS_HIGGSFIELD_BIN || "/usr/local/bin/higgsfield";
const IMAGE_MODEL = process.env.NXS_HIGGSFIELD_IMAGE_MODEL || "nano_banana_2";
export const GENERATED_DIR =
  process.env.NXS_GENERATED_DIR || path.join(homedir(), "NXS-Generated");

export class HiggsfieldNotReady extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "HiggsfieldNotReady";
  }
}

/** True when the CLI exists and is logged in. */
export async function higgsfieldReady(): Promise<boolean> {
  try {
    await exec(BIN, ["auth", "token"], { timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

function extractImageUrl(stdout: string): string | null {
  // `--wait` prints the result URL(s); be tolerant of formatting.
  const matches = stdout.match(/https?:\/\/[^\s"')]+\.(?:png|jpe?g|webp)(?:\?[^\s"')]*)?/gi);
  if (matches?.length) return matches[matches.length - 1];
  // Fallback: any https URL on a line that looks like a result.
  const any = stdout.match(/https?:\/\/[^\s"')]+/g);
  return any?.length ? any[any.length - 1] : null;
}

/**
 * Generate an image from a prompt and return a locally-served path
 * (e.g. "/generated/abc.png"). Throws HiggsfieldNotReady if not logged in.
 */
export async function generateImage(prompt: string, idHint = "img"): Promise<string> {
  if (!(await higgsfieldReady())) {
    throw new HiggsfieldNotReady(
      "Higgsfield isn't connected. Run `higgsfield auth login` in your terminal once, then try again."
    );
  }

  let stdout = "";
  try {
    const r = await exec(
      BIN,
      ["generate", "create", IMAGE_MODEL, "--prompt", prompt, "--wait", "--wait-timeout", "300s", "--no-color"],
      { timeout: 330_000, maxBuffer: 8 * 1024 * 1024 }
    );
    stdout = `${r.stdout}\n${r.stderr}`;
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    stdout = `${e.stdout ?? ""}\n${e.stderr ?? ""}`;
    const url = extractImageUrl(stdout);
    if (!url) {
      logger.warn({ err: e.message, out: stdout.slice(0, 500) }, "higgsfield: generation failed");
      throw new Error(`Image generation failed: ${e.message ?? "unknown error"}`);
    }
  }

  const url = extractImageUrl(stdout);
  if (!url) throw new Error("Image generated but no result URL was returned.");

  // Download to a stable, served location (Higgsfield URLs expire).
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Could not download generated image (HTTP ${resp.status})`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const ext = (url.match(/\.(png|jpe?g|webp)/i)?.[1] ?? "png").toLowerCase();
  await mkdir(GENERATED_DIR, { recursive: true });
  const fname = `${idHint}-${Date.now().toString(36)}.${ext}`;
  await writeFile(path.join(GENERATED_DIR, fname), buf);
  logger.info({ fname, bytes: buf.length }, "higgsfield: image generated");
  return `/generated/${fname}`;
}

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
const IMAGE_MODEL = process.env.NXS_HIGGSFIELD_IMAGE_MODEL || "gpt_image_2";
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

function extractUrl(stdout: string, exts: string): string | null {
  const re = new RegExp(`https?://[^\\s"')]+\\.(?:${exts})(?:\\?[^\\s"')]*)?`, "gi");
  const matches = stdout.match(re);
  if (matches?.length) return matches[matches.length - 1];
  const any = stdout.match(/https?:\/\/[^\s"')]+/g);
  return any?.length ? any[any.length - 1] : null;
}
function extractImageUrl(stdout: string): string | null {
  return extractUrl(stdout, "png|jpe?g|webp");
}

/** Curated image models offered in the UI, by quality/cost tier. */
export const IMAGE_MODELS: Array<{ id: string; label: string; tier: "fast" | "premium" }> = [
  { id: "nano_banana_2", label: "Nano Banana Pro", tier: "fast" },
  { id: "z_image", label: "Z Image", tier: "fast" },
  { id: "seedream_v5_lite", label: "Seedream V5 Lite", tier: "fast" },
  { id: "grok_image", label: "Grok Image", tier: "fast" },
  { id: "gpt_image_2", label: "GPT Image 2", tier: "premium" },
  { id: "flux_2", label: "FLUX.2", tier: "premium" },
  { id: "seedream_v4_5", label: "Seedream 4.5", tier: "premium" },
  { id: "recraft_v4_1", label: "Recraft V4.1", tier: "premium" },
  { id: "marketing_studio_image", label: "Marketing Studio", tier: "premium" },
];

// Per-model max-quality params (only flags each model actually accepts).
const IMAGE_MODEL_PARAMS: Record<string, string[]> = {
  nano_banana_2: ["--resolution", "4k"],
  gpt_image_2: ["--resolution", "4k", "--quality", "high"],
  flux_2: ["--resolution", "2k"],
  seedream_v4_5: ["--quality", "high"],
  seedream_v5_lite: ["--quality", "high"],
  recraft_v4_1: ["--resolution", "2k"],
  grok_image: ["--mode", "quality"],
  marketing_studio_image: ["--resolution", "4k"],
  z_image: [],
};

/** Aspect ratio best suited to each platform (values supported by all models). */
export function aspectForPlatform(platform?: string): string {
  switch (platform) {
    case "tiktok": return "9:16";
    case "youtube": return "16:9";
    case "instagram": return "1:1";
    default: return "1:1"; // linkedin + fallback
  }
}

/** Curated video models offered in the UI, by quality/cost tier. */
export const VIDEO_MODELS: Array<{ id: string; label: string; tier: "fast" | "premium" }> = [
  { id: "seedance_2_0", label: "Seedance 2.0", tier: "fast" },
  { id: "kling2_6", label: "Kling 2.6", tier: "fast" },
  { id: "minimax_hailuo", label: "Minimax Hailuo", tier: "fast" },
  { id: "marketing_studio_video", label: "Marketing Studio", tier: "fast" },
  { id: "veo3_1", label: "Google Veo 3.1", tier: "premium" },
  { id: "kling3_0", label: "Kling v3.0", tier: "premium" },
  { id: "seedance1_5", label: "Seedance 1.5 Pro", tier: "premium" },
];

// Per-model max-quality params (only flags each model accepts).
const VIDEO_MODEL_PARAMS: Record<string, string[]> = {
  veo3_1: ["--quality", "ultra"],
  kling3_0: ["--mode", "4k"],
  kling2_6: [],
  seedance1_5: ["--resolution", "1080p"],
  seedance_2_0: ["--resolution", "1080p"],
  minimax_hailuo: ["--resolution", "1080"],
  marketing_studio_video: ["--resolution", "1080p"],
};

/** Aspect ratio per platform for video (16:9 and 9:16 are supported by all). */
export function videoAspectForPlatform(platform?: string): string {
  return platform === "tiktok" || platform === "instagram" ? "9:16" : "16:9";
}

/**
 * Generate a video from a prompt (text-to-video), optionally animating a
 * starting image (image-to-video). Returns a locally-served path.
 */
export async function generateVideo(
  prompt: string,
  opts: { model: string; startImagePath?: string; aspect?: string },
  idHint = "vid"
): Promise<string> {
  if (!(await higgsfieldReady())) {
    throw new HiggsfieldNotReady(
      "Higgsfield isn't connected. Run `higgsfield auth login` in your terminal once, then try again."
    );
  }
  const model = VIDEO_MODELS.some((m) => m.id === opts.model) ? opts.model : "veo3_1";
  const qualityParams = VIDEO_MODEL_PARAMS[model] ?? [];
  const aspectParams = opts.aspect ? ["--aspect_ratio", opts.aspect] : [];
  const args = ["generate", "create", model, "--prompt", prompt, ...aspectParams, ...qualityParams];
  if (opts.startImagePath) args.push("--start-image", opts.startImagePath);
  args.push("--wait", "--wait-timeout", "900s", "--no-color");

  let stdout = "";
  try {
    const r = await exec(BIN, args, { timeout: 960_000, maxBuffer: 8 * 1024 * 1024 });
    stdout = `${r.stdout}\n${r.stderr}`;
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    stdout = `${e.stdout ?? ""}\n${e.stderr ?? ""}`;
    if (!extractUrl(stdout, "mp4|mov|webm")) {
      logger.warn({ err: e.message, out: stdout.slice(0, 600) }, "higgsfield: video generation failed");
      throw new Error(`Video generation failed: ${e.message ?? "unknown error"}`);
    }
  }

  const url = extractUrl(stdout, "mp4|mov|webm");
  if (!url) throw new Error("Video generated but no result URL was returned.");
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Could not download generated video (HTTP ${resp.status})`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const ext = (url.match(/\.(mp4|mov|webm)/i)?.[1] ?? "mp4").toLowerCase();
  await mkdir(GENERATED_DIR, { recursive: true });
  const fname = `${idHint}-${Date.now().toString(36)}.${ext}`;
  await writeFile(path.join(GENERATED_DIR, fname), buf);
  logger.info({ fname, bytes: buf.length, model }, "higgsfield: video generated");
  return `/generated/${fname}`;
}

/**
 * Generate an image from a prompt and return a locally-served path
 * (e.g. "/generated/abc.png"). Throws HiggsfieldNotReady if not logged in.
 */
export async function generateImage(
  prompt: string,
  opts: { idHint?: string; model?: string; aspect?: string } = {}
): Promise<string> {
  if (!(await higgsfieldReady())) {
    throw new HiggsfieldNotReady(
      "Higgsfield isn't connected. Run `higgsfield auth login` in your terminal once, then try again."
    );
  }
  const idHint = opts.idHint ?? "img";
  const chosen = opts.model && IMAGE_MODELS.some((m) => m.id === opts.model) ? opts.model : IMAGE_MODEL;
  const qualityParams = IMAGE_MODEL_PARAMS[chosen] ?? [];
  const aspectParams = opts.aspect ? ["--aspect_ratio", opts.aspect] : [];

  let stdout = "";
  try {
    const r = await exec(
      BIN,
      ["generate", "create", chosen, "--prompt", prompt, ...aspectParams, ...qualityParams, "--wait", "--wait-timeout", "300s", "--no-color"],
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

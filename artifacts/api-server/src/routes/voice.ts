/**
 * Voice — ElevenLabs proxy so the browser never sees the API key.
 *   POST /voice/tts        { text }            → audio/mpeg stream (Maya speaks)
 *   POST /voice/transcribe raw audio body      → { text } (ElevenLabs Scribe)
 * Both return 503 when ELEVENLABS_API_KEY is not configured.
 */

import { Router, raw } from "express";
import { z } from "zod/v4";
import { Readable } from "node:stream";

const router = Router();

const ELEVEN_BASE = "https://api.elevenlabs.io/v1";
// Sarah — premade voice available on every tier (Rachel is library-gated on free); override per-env.
const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";
const TTS_MODEL = "eleven_turbo_v2_5";
const STT_MODEL = "scribe_v1";
const MAX_TTS_CHARS = 2500;

const apiKey = () => process.env.ELEVENLABS_API_KEY || null;
const voiceId = () => process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;

/** Strip markdown decoration so Maya doesn't read asterisks aloud. */
function speakable(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[*_#`>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TTS_CHARS);
}

const ttsBody = z.object({ text: z.string().min(1) });

// POST /voice/tts
router.post("/voice/tts", async (req, res) => {
  const key = apiKey();
  if (!key) {
    res.status(503).json({ error: "ELEVENLABS_API_KEY is not configured" });
    return;
  }
  const parsed = ttsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid text" });
    return;
  }

  try {
    const upstream = await fetch(`${ELEVEN_BASE}/text-to-speech/${voiceId()}/stream`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: speakable(parsed.data.text),
        model_id: TTS_MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      req.log.error({ status: upstream.status, detail: detail.slice(0, 200) }, "ElevenLabs TTS error");
      res.status(502).json({ error: "Voice generation failed" });
      return;
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-cache");
    Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream).pipe(res);
  } catch (err) {
    req.log.error(err, "TTS proxy error");
    res.status(502).json({ error: "Voice generation failed" });
  }
});

// POST /voice/transcribe — raw audio body (webm/mp4/wav from MediaRecorder)
router.post(
  "/voice/transcribe",
  raw({ type: ["audio/*", "video/webm"], limit: "20mb" }),
  async (req, res) => {
    const key = apiKey();
    if (!key) {
      res.status(503).json({ error: "ELEVENLABS_API_KEY is not configured" });
      return;
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "No audio received" });
      return;
    }

    try {
      const form = new FormData();
      form.append("model_id", STT_MODEL);
      form.append(
        "file",
        new Blob([new Uint8Array(req.body)], { type: req.headers["content-type"] ?? "audio/webm" }),
        "recording.webm"
      );

      const upstream = await fetch(`${ELEVEN_BASE}/speech-to-text`, {
        method: "POST",
        headers: { "xi-api-key": key },
        body: form,
      });

      if (!upstream.ok) {
        const detail = await upstream.text().catch(() => "");
        req.log.error({ status: upstream.status, detail: detail.slice(0, 200) }, "ElevenLabs STT error");
        res.status(502).json({ error: "Transcription failed" });
        return;
      }

      const result = (await upstream.json()) as { text?: string };
      res.json({ text: result.text ?? "" });
    } catch (err) {
      req.log.error(err, "STT proxy error");
      res.status(502).json({ error: "Transcription failed" });
    }
  }
);

export default router;

/**
 * Voice client — Maya speaks via /api/voice/tts, dictation via /api/voice/transcribe.
 * One shared audio element so a new playback always replaces the previous one.
 */

import { authHeaders } from "@/lib/auth";

let player: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

export function stopSpeaking(): void {
  player?.pause();
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

/** Speak text aloud. Resolves when playback starts; throws on API failure. */
export async function speak(text: string, onEnded?: () => void): Promise<void> {
  stopSpeaking();
  const resp = await fetch("/api/voice/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ text }),
  });
  if (!resp.ok) {
    const body = (await resp.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Voice failed (${resp.status})`);
  }
  const blob = await resp.blob();
  currentUrl = URL.createObjectURL(blob);
  player = player ?? new Audio();
  player.src = currentUrl;
  player.onended = () => {
    stopSpeaking();
    onEnded?.();
  };
  await player.play();
}

/** Record from the microphone until stop() is called; returns the transcript. */
export interface Recorder {
  stop: () => Promise<string>;
  cancel: () => void;
}

export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start();

  const finish = () =>
    new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        resolve(new Blob(chunks, { type: mimeType }));
      };
      recorder.stop();
    });

  return {
    cancel: () => {
      recorder.onstop = null;
      recorder.stop();
      stream.getTracks().forEach((t) => t.stop());
    },
    stop: async () => {
      const blob = await finish();
      if (blob.size < 1000) return ""; // too short to contain speech
      const resp = await fetch("/api/voice/transcribe", {
        method: "POST",
        headers: { "Content-Type": mimeType, ...authHeaders() },
        body: blob,
      });
      if (!resp.ok) {
        const body = (await resp.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Transcription failed (${resp.status})`);
      }
      const data = (await resp.json()) as { text?: string };
      return data.text ?? "";
    },
  };
}

/**
 * Google Gemini client. Activates when GEMINI_API_KEY is set.
 */
import { GoogleGenAI } from "@google/genai";

export const geminiReady = (): boolean => !!process.env.GEMINI_API_KEY;

let client: GoogleGenAI | null = null;
export function gemini(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });
  return client;
}

import OpenAI from "openai";
import { resolveOpenAIConfig } from "./env";

export const openai = new OpenAI(resolveOpenAIConfig());

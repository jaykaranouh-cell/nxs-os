/**
 * Shared headless browser — real, JS-rendering web access for every agent.
 *
 * READ-ONLY BY DESIGN. Agents can navigate and read pages (including
 * logged-in sessions in the persistent profile) and run web searches, but
 * there is deliberately no click/type/submit surface exposed. A background
 * autonomous agent must never be able to take destructive web actions.
 */

import path from "node:path";
import os from "node:os";
import { z } from "zod/v4";
import type { Anthropic } from "@workspace/integrations-anthropic-server";
import { logger } from "../logger";

// The page.evaluate() callbacks below execute in the browser, where these
// globals exist — declared locally so this Node module typechecks.
declare const document: any;
type HTMLAnchorElement = { href: string; innerText: string };
type HTMLElement = { innerText: string };

// Lazy import so esbuild keeps playwright external and the browser only
// launches the first time an agent actually browses.
type BrowserContext = import("playwright").BrowserContext;

let contextPromise: Promise<BrowserContext> | null = null;
const PROFILE_DIR = path.join(os.homedir(), ".nxs-browser-profile");
const NAV_TIMEOUT = 20_000;
const MAX_TEXT = 6000;

async function getContext(): Promise<BrowserContext> {
  if (!contextPromise) {
    contextPromise = (async () => {
      const { chromium } = await import("playwright");
      // Persistent context = a real profile: cookies/logins survive restarts,
      // so agents can read pages behind Jay's existing sessions.
      const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: true,
        viewport: { width: 1280, height: 900 },
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      });
      logger.info("browser: headless context launched");
      return ctx;
    })().catch((err) => {
      contextPromise = null; // allow retry on next call
      throw err;
    });
  }
  return contextPromise;
}

function assertHttpUrl(raw: string): string {
  const u = new URL(raw);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http(s) URLs allowed");
  return u.toString();
}

/** Navigate to a URL and return its rendered, readable text + key links. */
async function renderPage(url: string): Promise<string> {
  const target = assertHttpUrl(url);
  const ctx = await getContext();
  const page = await ctx.newPage();
  try {
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await page.waitForTimeout(800); // let late JS paint
    const { title, text, links } = await page.evaluate(() => {
      const strip = (s: string) => s.replace(/\s+/g, " ").trim();
      const bodyText = strip(document.body?.innerText ?? "");
      const links = Array.from(document.querySelectorAll("a[href]"))
        .slice(0, 40)
        .map((a: any) => {
          const el = a as HTMLAnchorElement;
          const label = strip(el.innerText).slice(0, 60);
          return label ? `${label} → ${el.href}` : "";
        })
        .filter(Boolean);
      return { title: document.title, text: bodyText, links };
    });
    const body = text.slice(0, MAX_TEXT);
    const linkBlock = links.length ? `\n\nLinks:\n${links.slice(0, 15).join("\n")}` : "";
    return `# ${title}\n${target}\n\n${body}${linkBlock}`;
  } finally {
    await page.close().catch(() => {});
  }
}

/** Run a web search (DuckDuckGo Lite — the most headless-tolerant engine). */
async function webSearch(query: string): Promise<string> {
  const ctx = await getContext();
  const page = await ctx.newPage();
  try {
    await page.goto(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    await page.waitForTimeout(500);
    const results = await page.evaluate(() => {
      const clean = (s: string) => (s || "").replace(/\s+/g, " ").trim();
      const out: string[] = [];
      // Lite results: <a class="result-link"> with a sibling snippet cell.
      const anchors = Array.from(document.querySelectorAll("a.result-link"));
      anchors.forEach((a: any, i: number) => {
        const el = a as HTMLAnchorElement;
        if (!el.href?.startsWith("http")) return;
        const snipCell = document.querySelectorAll(".result-snippet")[i] as HTMLElement | undefined;
        out.push(`• ${clean(el.innerText)}\n  ${el.href}\n  ${clean(snipCell?.innerText ?? "").slice(0, 180)}`);
      });
      // Fallback: any external anchor with visible text.
      if (out.length === 0) {
        const seen = new Set<string>();
        document.querySelectorAll("a[href^='http']").forEach((a: any) => {
          const el = a as HTMLAnchorElement;
          const t = clean(el.innerText);
          if (t.length > 12 && !seen.has(el.href) && !el.href.includes("duckduckgo")) {
            seen.add(el.href);
            out.push(`• ${t}\n  ${el.href}`);
          }
        });
      }
      return out.slice(0, 8);
    });
    return results.length
      ? `Search results for "${query}":\n\n${results.join("\n\n")}`
      : `Search was blocked or empty for "${query}". Use browse_page on a specific URL instead (direct page loads work even when search engines block bots).`;
  } finally {
    await page.close().catch(() => {});
  }
}

export async function closeBrowser(): Promise<void> {
  if (contextPromise) {
    const ctx = await contextPromise.catch(() => null);
    await ctx?.close().catch(() => {});
    contextPromise = null;
  }
}

// ─── Tool surface (shared by Maya and all department agents) ──────────────────

const browsePageSchema = z.object({ url: z.string().min(4) });
const webSearchSchema = z.object({ query: z.string().min(2) });

export const BROWSER_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "web_search",
    description:
      "Search the web and get the top results (titles, URLs, snippets). Use to find current information, research a company or competitor, check facts, or locate a page before reading it.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"],
    },
  },
  {
    name: "browse_page",
    description:
      "Open a web page in the shared headless browser and read its fully-rendered text and links — works on JavaScript-heavy and logged-in pages, unlike a plain fetch. Read-only: you cannot click, type, or submit anything.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string", description: "http(s) URL to read" } },
      required: ["url"],
    },
  },
];

/** Execute a browser tool by name. Used by both the orchestrator and agents. */
export async function runBrowserTool(name: string, input: unknown): Promise<string> {
  if (name === "web_search") {
    return webSearch(webSearchSchema.parse(input).query);
  }
  if (name === "browse_page") {
    return renderPage(browsePageSchema.parse(input).url);
  }
  throw new Error(`Unknown browser tool "${name}"`);
}

export const isBrowserTool = (name: string): boolean =>
  name === "web_search" || name === "browse_page";

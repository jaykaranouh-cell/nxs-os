# NXS OS — Project State & Handoff

> Single source of truth for picking up work on NXS OS in a new session.
> Last updated: 2026-06-14.

## What this is
**NXS OS** ("Nexus AI Command Center") is Jay Karanouh's personal AI business
operating system. He talks to **Maya**, an autonomous AI **CEO** who runs the
business day-to-day and commands four department agents:
- **Rex** — sales · **Vera** — finance · **Atlas** — research · **Echo** — marketing

It's developed locally with Claude Code and runs always-on on Jay's Mac.

### Jay's business (the thing NXS AI sells)
NXS AI builds **AI operating systems / AI receptionists for founder-led service
businesses** ($500k–$5M revenue, owner is the bottleneck). Niches: security,
cleaning, trades, local professional services, family businesses. Offers:
**Founder OS $1,500/mo**, **Operator OS $3,000/mo**. Real deals: Grand Group
(security, the big one), True Level Cleaning, Zenobia, RPLit. Pre-revenue →
first retainers. Full ICP lives in Maya's memory (entries #57–61).

## Repo & stack
- Path: `~/nxs-os` (pnpm workspace monorepo). Private GitHub: `jaykaranouh-cell/nxs-os`.
- **artifacts/api-server** — Express 5 API (port 8080 prod, 8081 dev). Built bundle `dist/index.mjs`.
- **artifacts/nexus-ai** — React + Vite + Tailwind + shadcn + wouter frontend (served by the API in prod; dev port 22706).
- **lib/db** — Drizzle ORM + Postgres 16 (+pgvector) in docker container `nxs-postgres` (`postgres://nxs:nxs@localhost:5432/nxs`).
- **lib/api-spec / api-zod / api-client-react** — OpenAPI → Orval codegen (generated hooks). Some newer endpoints use raw `fetch` to skip codegen.
- **lib/integrations-anthropic-server / -openai-ai-server** — LLM clients.
- Secrets in repo-root `.env`. LLM: Claude (Anthropic) primary; OpenAI + Google Gemini also wired.

## Run / build / deploy (IMPORTANT gotchas)
- Prod is a **launchd service** `com.nxs.os` running `scripts/start-prod.sh` → `dist/index.mjs`. Logs: `~/Library/Logs/nxs-os.log`.
- **Deploy after backend change:** `pnpm --filter @workspace/api-server build` then `launchctl kickstart -k gui/$(id -u)/com.nxs.os`. Prod runs the BUILT bundle, not source.
- **Deploy after frontend change:** `cd artifacts/nexus-ai && pnpm build` then kickstart (API serves `dist/public`).
- **After editing `lib/db/src` schema:** rebuild decls (`cd lib/db && npx tsc -p tsconfig.json`) AND push (`pnpm --filter @workspace/db push`) — `@workspace/db` is consumed via TS project references → its `dist/*.d.ts`, so stale decls break api typecheck.
- **launchd PATH excludes `/usr/local/bin`** — shell out to CLIs by absolute path (e.g. `/usr/local/bin/higgsfield`).
- Verify: typecheck both (`npx tsc --noEmit -p .`), `pnpm test` (api, 21 vitest), healthz `curl localhost:8080/api/healthz`. Preview servers via `.claude/launch.json` (api-server, nexus-ai).
- Access token for API calls: `NXS_ACCESS_TOKEN` in `.env` (Bearer).

## Maya — how she works
- **AI CEO** persona (prompt + UI labels). Identity in `prompts.ts` `buildSystemBlocks`; personality/agency in `tools.ts` `TOOL_GUIDANCE`.
- **Fully autonomous**: biases toward action, runs autonomous strategy sessions 09/13/17/21 daily (`autonomy.ts`).
- **Execution levels** (Orchestrator header): 🟢 green = executes, 🟡 amber = executes + notifies, 🔴 red = proposes. GREEN = full autonomy.
- **LLM picker** (header dropdown, `models.ts` CHAT_MODELS): Claude Opus/Sonnet/Haiku = full agentic Maya (tools/actions/attachments); Gemini 2.5 Pro/Flash + GPT-4o = CONVERSATIONAL (stream-only, no actions). Chosen model sent per-message; default `claude-opus`.
- **Chat pipeline** (`routes/chat.ts`): router (`dispatch.ts planDispatch`) decides if any department agents run → agents → Maya synthesis (streaming + adaptive thinking + tool loop). Router now defaults to NO dispatch (answers directly; only deploys agents for real research — this fixed a lag where she convened the whole team every message).
- **Guardrails**: daily spend ceiling `NXS_DAILY_BUDGET_USD` (=20), reversible actions + undo, budget halts LLM calls.

## Feature inventory (built & deployed)
- Orchestrator chat (streaming, voice TTS/STT, exec levels, LLM picker, **file uploads** of images/PDF/text — Maya reads them), Team Channel card.
- **Pipeline** — Maya creates/moves leads from chat (`create_lead`, `update_lead_stage`); pipeline injected into her context.
- **Content Studio** (`/content`) — multi-platform (LinkedIn/Instagram/TikTok/YouTube), brands/clients, Maya `draft_post`, **Higgsfield image + video generation** (per-model pickers, max-quality defaults, art-direction prompt box). Publish: LinkedIn copy+open; others copy+open app.
- Command Centre (home digest "since you were away"), Morning Brief (auto-generates each LOCAL morning — `ensureTodaysBrief` + 07:00 cron + */20min catch-up + boot run), Objectives, Memory Engine (pgvector), Strategic Brain, KPI, Opportunity Engine, Agent Layer (per-agent profiles/KB), NXS City (SVG isometric — a 3D r3f version was built then reverted on request).
- Inter-agent mailbox, ntfy push, Obsidian bridge (~/NXS-Brain), calendar ingest (needs URL), phone access (cloudflared), GitHub Actions CI.

## Integrations & their state
| Integration | State |
|---|---|
| Anthropic (Claude) | ✅ primary, key in .env |
| OpenAI (GPT) | ✅ key set (conversational chat + some background roles) |
| Google Gemini | ✅ `GEMINI_API_KEY` set — **Flash works**; **2.5 Pro 429s on free tier** (needs Google billing); account also has gemini-3.x |
| Higgsfield (image/video) | ✅ CLI authed (`/usr/local/bin/higgsfield`, jaykaranouh@gmail.com, plus plan). Has a **daily grace API limit** separate from credits |
| ntfy push | ✅ topic in .env |
| Obsidian | ✅ vault ~/NXS-Brain |
| Calendar (iCal) | ⚠️ built, `NXS_CALENDAR_ICS_URL` empty — paste private iCal URL |
| Phone (cloudflared) | ✅ `scripts/phone.sh` |
| Gmail | ❌ not built — **next priority** |
| Blotato (auto-publish) | ❌ not connected — needs `BLOTATO_API_KEY` for one-click multi-platform posting |
| Xero | ❌ deferred |

## Next steps (priority order)
1. **Connect Gmail** (Jay's chosen next move) — give Maya read + draft access to his inbox so she sees real deal flow / leads / drafts follow-ups. Needs Google OAuth. Highest leverage.
2. **Sell, don't just build** — the OS is more than capable; revenue ($0 MRR, Grand Group pending) is the real bottleneck. Point it at closing Grand Group / delivering to a client.
3. Paste `NXS_CALENDAR_ICS_URL` (2 min) so Maya knows real meetings.
4. `BLOTATO_API_KEY` for true content auto-publish/scheduling.
5. Add Google billing if Gemini Pro is wanted (Flash is fine free).

## Housekeeping / risks
- **Rotate API keys** — Anthropic, OpenAI, ElevenLabs, Gemini keys were pasted into Claude Code chat history. Treat as exposed; regenerate.
- ElevenLabs key lacks voice scopes (Maya uses default Sarah voice).
- Generated media: `~/NXS-Generated` (/generated); uploads: `~/NXS-Uploads` (/uploads). Postgres backup: daily 03:30 pg_dump → ~/NXS-Backups (`com.nxs.backup`).

## How to continue in a new session
Start Claude Code in `~/nxs-os` (so the repo `CLAUDE.md` loads too), then:
> "Read docs/STATE.md — we're continuing NXS OS. Next up: connect Gmail."
The project memory (`nxs-os-project.md`) also auto-loads and mirrors this.

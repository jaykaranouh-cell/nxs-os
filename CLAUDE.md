# Nexus AI Command Center (NXS OS)

A web-based AI business orchestration dashboard for Jay — a central command center where he interacts with a CEO Orchestrator Agent that coordinates four department agents: Marketing, Sales, Research, and Finance. Developed locally with Claude Code.

## Run & Operate

- `docker start nxs-postgres` — local Postgres 16 (container exists; auto-restarts with Docker)
- `pnpm --filter @workspace/api-server run dev` — API server (default port 8080)
- `pnpm --filter @workspace/nexus-ai run dev` — frontend (default port 22706, proxies `/api` → 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm test` — vitest unit tests (orchestrator guards, prompts, tools, dispatch)
- `pnpm run build` — typecheck + build all packages (mockup-sandbox needs `PORT`/`BASE_PATH`; its failure is ignorable)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `.claude/launch.json` has preview configs for both servers
- `scripts/phone.sh` — Cloudflare quick tunnel for phone access (URL changes per run; Tailscale recommended for a permanent address). Requires NXS_ACCESS_TOKEN to be set

### Environment

Secrets live in the repo-root `.env` (gitignored; see `.env.example`):

- `DATABASE_URL` — local default `postgres://nxs:nxs@localhost:5432/nxs` (docker container `nxs-postgres`, data persisted in the named volume `nxs-pgdata`)
- Backup: `docker exec nxs-postgres pg_dump -U nxs nxs > backup.sql` — the DB holds the memory moat; back it up before risky operations
- `ANTHROPIC_API_KEY` — required for orchestrator + department agents (claude-opus-4-6); the server boots without it but LLM calls fail
- `NXS_ACCESS_TOKEN` — optional; when set, all `/api` routes (except `/api/healthz`) require `Authorization: Bearer <token>` and the frontend shows an unlock screen
- `OBSIDIAN_VAULT_PATH` — optional; enables the Obsidian bridge (default points at ~/Desktop/NXS-Brain)
- `ELEVENLABS_API_KEY` (+ optional `ELEVENLABS_VOICE_ID`) — enables voice: Maya speaks replies (TTS) and the mic button dictates via ElevenLabs Scribe. `/api/voice/*` returns 503 without it
- `OPENAI_API_KEY` + `LLM_<ROLE>` vars — per-role model routing through `src/lib/orchestrator/llm.ts` (roles: ROUTER, AGENT, CAPTURE, BRIEF, IDEAS, OBSIDIAN; format `provider:model`, e.g. `LLM_ROUTER=openai:gpt-4o-mini`). Unset roles default to anthropic:claude-opus-4-6. Tool-using chat synthesis is Anthropic-only

The api-server loads the root `.env` via `node --env-file-if-exists`; drizzle-kit loads it from `lib/db/drizzle.config.ts`.

## Stack

- pnpm workspaces, Node.js 24+, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui + wouter + Framer Motion
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- **API spec**: `lib/api-spec/openapi.yaml` — single source of truth for API contracts
- **DB schema**: `lib/db/src/schema/` — leads, agents (tasks/logs), memory, chat, ideas, decisions, opportunities
- **Orchestrator core**: `artifacts/api-server/src/lib/orchestrator/` — context, agents (definitions + system prompts), prompts, guards, dispatch
- **API routes**: `artifacts/api-server/src/routes/` — one file per domain; `chat.ts` is just the HTTP layer
- **Frontend pages**: `artifacts/nexus-ai/src/pages/` — Dashboard, Orchestrator, Leads/Pipeline, Agents, Memory, Reports/Analytics
- **Generated hooks**: `lib/api-client-react/src/generated/api.ts`
- **Generated Zod schemas**: `lib/api-zod/src/generated/api.ts`

## Architecture decisions

- Agent definitions (CEO Orchestrator, Sales, Marketing, Research, Finance) live in `src/lib/orchestrator/agents.ts` (single source of truth, incl. per-agent system prompts) — they always exist and are never user-created
- Chat is a real multi-agent pipeline on the Claude API (`@anthropic-ai/sdk`, `lib/integrations-anthropic-server`): a low-effort claude-opus-4-6 router decides which department agents to dispatch (0–3), each dispatched agent runs its own claude-opus-4-6 call with adaptive thinking in parallel and is logged to `agent_tasks` + `agent_logs`, then the orchestrator streams a CoS synthesis that integrates their reports. The shared business briefing leads every system prompt with `cache_control: ephemeral`, so agent calls and synthesis share one cached prefix (~90% cheaper repeated context). `agentActions` on chat messages reflect these real runs
- Maya (the orchestrator) has write-tools (`src/lib/orchestrator/tools.ts`): create_memory_entry, update_lead_stage, create_agent_task, log_idea, update_opportunity. She also commands her own team mid-conversation: dispatch_agent sends a department agent to investigate, spawn_agent creates a one-off specialist with instructions Maya writes herself (logged as agentId adhoc), message_team leaves notes for departments. Agents communicate with each other: during a run each department agent can ask_agent another department (depth-limited to 1) and send_message notes to teammates/Maya/all via the agent_messages mailbox; unread mail is delivered with the recipient's next briefing and Maya sees the orchestrator/all channel in her context. All comms mirror to agent_logs. Maya names her agents via name_agent (roster persisted in system_context agent-roster, overlaid everywhere: prompts, logs, team channel, /agents); spawn_agent accepts an optional personal name. Jay talks to agents directly via POST /agents/:id/ask — question and reply land in the team channel (from/to 'jay') with an Ask composer on the Agent Layer page. In Full Auto (green) she additionally gets computer tools: open_in_browser, open_app, fetch_webpage (execFile, no shell; http(s)-only URLs). The chat synthesis runs a tool-use loop (max 5 rounds); executed actions stream to the UI as `action` SSE events and land in `agent_logs`. The Orchestrator page's execution level gates this: green/amber = tools enabled, red = propose-only (tools withheld, Maya phrases actions for approval)
- Auto-capture (`src/lib/orchestrator/capture.ts`): after every chat turn a low-effort extraction pass distills decisions/lessons/commitments into `memory_proposals`; Jay approves/rejects them in the queue at the top of the Memory Engine. Approval promotes a proposal to a real memory entry
- Scheduler (`src/lib/scheduler.ts`, node-cron, server-local time): 07:00 morning brief generation, 07:30 risk watchdog (stale critical/needs-review items become high-priority orchestrator tasks), Monday 08:00 one proactive idea per department into the Ideas queue. LLM jobs no-op without ANTHROPIC_API_KEY
- Obsidian bridge (`src/lib/obsidian.ts`, every 10 min + on boot): one-way ingest of 00-Inbox/ and 04-Meetings/ notes → extraction → memory proposals (max 3 notes/run, mtime-tracked in system_context); one-way mirror of all memory entries → 08-NXS-OS-Memory/*.md with frontmatter and [[wikilinks]] from memory_connections. Never two-way on the same file
- Cost telemetry: every LLM call records token usage to `llm_usage` (scopes: router, agent:<id>, synthesis, brief, capture, obsidian:ingest, scheduler:*); `GET /reports/usage` returns 30-day per-scope cost estimates
- `/api/chat` is rate-limited (20 req/min); `/api/voice` at 30 req/min. Voice routes (`routes/voice.ts`) proxy ElevenLabs server-side so the key never reaches the browser
- Deterministic rule guards (no cold outreach, goal-spread challenge) fire in `src/lib/orchestrator/guards.ts` before any LLM call
- Lead qualification workflow: incoming → Sales Agent qualifies → routes to Sales (qualified) or Marketing (nurture) or logged as rejected
- The Memory system is the core moat: persistent, categorized, searchable knowledge base shared across all agents. `priority`/`importance`/`confidence`/`status` are typed enums in the Drizzle schema and enforced at the API boundary via `insertMemoryEntrySchema`
- `estimatedValue` uses Drizzle `numeric` type (stored as string) — always convert to `String()` on insert/update, `parseFloat()` on read

## Product

- **Dashboard (Command Center)**: Live metrics, agent status, activity feed, open leads, pending ideas
- **Orchestrator Chat**: Full-screen chat with CEO Orchestrator AI; shows real agent dispatching live
- **Pipeline (Leads)**: Lead management with qualification workflow; Sales routes to Marketing for nurture leads
- **Agents Hub**: Status cards for all 5 agents with current task, active task count, capabilities, and activity log
- **Memory Core**: Shared knowledge base filterable by category (decisions, company context, client/lead/campaign/financial notes)
- **Analytics (Reports)**: Sales pipeline funnel, finance summary with charts, campaign ROI, agent activity

## User preferences

- Jay is the founder/user — the Orchestrator addresses him by name
- No cold email or cold calling automation — compliance-first, outreach is planned by agents but executed manually
- Each department agent should proactively suggest ideas — visible in the Ideas queue on the dashboard
- The memory system is treated as the core moat — invest heavily in quality here

## Gotchas

- After any OpenAPI spec change, re-run `pnpm --filter @workspace/api-spec run codegen` before using updated types
- After changing `lib/db/src/schema/`, run `pnpm run typecheck:libs` then `pnpm --filter @workspace/db run push`
- `numeric` Drizzle columns expect strings: use `String(value)` on insert, `parseFloat(value)` on serialize
- API server routes must be registered in `artifacts/api-server/src/routes/index.ts` — proposalsRouter must stay BEFORE memoryRouter or `/memory/proposals` is swallowed by `/memory/:id`
- `memory_connections` has cascading foreign keys to `memory_entries` — `db push` fails if orphaned connection rows exist (delete them first)
- Stale `*.tsbuildinfo` files can make `tsc --build` skip emitting lib `dist/` — delete them and `npx tsc --build --force` if api-server typecheck reports TS6305
- To tune agent behaviour, edit the system prompts in `src/lib/orchestrator/agents.ts` and the routing rules in `dispatch.ts`

## Future integrations

CRM, email, calendar, social media tools, accounting systems — all routes are designed with placeholder data and clear extension points.

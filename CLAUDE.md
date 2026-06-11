# Nexus AI Command Center (NXS OS)

A web-based AI business orchestration dashboard for Jay — a central command center where he interacts with a CEO Orchestrator Agent that coordinates four department agents: Marketing, Sales, Research, and Finance. Developed locally with Claude Code.

## Run & Operate

- `docker start nxs-postgres` — local Postgres 16 (container exists; auto-restarts with Docker)
- `pnpm --filter @workspace/api-server run dev` — API server (default port 8080)
- `pnpm --filter @workspace/nexus-ai run dev` — frontend (default port 22706, proxies `/api` → 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages (mockup-sandbox needs `PORT`/`BASE_PATH`; its failure is ignorable)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `.claude/launch.json` has preview configs for both servers

### Environment

Secrets live in the repo-root `.env` (gitignored; see `.env.example`):

- `DATABASE_URL` — local default `postgres://nxs:nxs@localhost:5432/nxs` (docker container `nxs-postgres`)
- `OPENAI_API_KEY` — required for orchestrator + department agents; the server boots without it but LLM calls fail
- `NXS_ACCESS_TOKEN` — optional; when set, all `/api` routes (except `/api/healthz`) require `Authorization: Bearer <token>` and the frontend shows an unlock screen

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
- Chat is a real multi-agent pipeline: a gpt-4o-mini router decides which department agents to dispatch (0–3), each dispatched agent runs its own gpt-4o call in parallel and is logged to `agent_tasks` + `agent_logs`, then the orchestrator streams a CoS synthesis that integrates their reports. `agentActions` on chat messages reflect these real runs
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
- API server routes must be registered in `artifacts/api-server/src/routes/index.ts`
- `memory_connections` has cascading foreign keys to `memory_entries` — `db push` fails if orphaned connection rows exist (delete them first)
- Stale `*.tsbuildinfo` files can make `tsc --build` skip emitting lib `dist/` — delete them and `npx tsc --build --force` if api-server typecheck reports TS6305
- To tune agent behaviour, edit the system prompts in `src/lib/orchestrator/agents.ts` and the routing rules in `dispatch.ts`

## Future integrations

CRM, email, calendar, social media tools, accounting systems — all routes are designed with placeholder data and clear extension points.

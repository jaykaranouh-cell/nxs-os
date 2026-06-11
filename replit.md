# Nexus AI Command Center

A web-based AI business orchestration dashboard for Jay — a central command center where he interacts with a CEO Orchestrator Agent that coordinates four department agents: Marketing, Sales, Research, and Finance.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/nexus-ai run dev` — run the frontend (port 22706)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui + wouter + Framer Motion
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- **API spec**: `lib/api-spec/openapi.yaml` — single source of truth for API contracts
- **DB schema**: `lib/db/src/schema/` — leads, agents (tasks/logs), memory, chat, ideas, decisions
- **API routes**: `artifacts/api-server/src/routes/` — one file per domain
- **Frontend pages**: `artifacts/nexus-ai/src/pages/` — Dashboard, Orchestrator, Leads/Pipeline, Agents, Memory, Reports/Analytics
- **Generated hooks**: `lib/api-client-react/src/generated/api.ts`
- **Generated Zod schemas**: `lib/api-zod/src/generated/api.ts`

## Architecture decisions

- Agent definitions (CEO Orchestrator, Sales, Marketing, Research, Finance) are stored statically in the API server — they always exist and are never user-created
- Lead qualification workflow: incoming → Sales Agent qualifies → routes to Sales (qualified) or Marketing (nurture) or logged as rejected
- The Memory system is the core moat: persistent, categorized, searchable knowledge base shared across all agents
- Orchestrator chat generates contextual responses server-side; designed to plug into OpenAI API when ready (replace `generateOrchestratorResponse` in `chat.ts`)
- `estimatedValue` uses Drizzle `numeric` type (stored as string) — always convert to `String()` on insert/update, `parseFloat()` on read

## Product

- **Dashboard (Command Center)**: Live metrics, agent status, activity feed, open leads, pending ideas
- **Orchestrator Chat**: Full-screen chat with CEO Orchestrator AI; shows agent dispatching in real-time sidebar
- **Pipeline (Leads)**: Lead management with qualification workflow; Sales routes to Marketing for nurture leads
- **Agents Hub**: Status cards for all 5 agents with current task, active task count, capabilities, and activity log
- **Memory Core**: Shared knowledge base filterable by category (decisions, company context, client/lead/campaign/financial notes)
- **Analytics (Reports)**: Sales pipeline funnel, finance summary with charts, campaign ROI, agent activity

## User preferences

- Jay is the founder/user — the Orchestrator addresses him by name
- No cold email or cold calling automation in V1 — compliance-first, outreach is planned by agents but executed manually
- Each department agent should proactively suggest ideas — visible in the Ideas queue on the dashboard
- The memory system is treated as the core moat — invest heavily in quality here

## Gotchas

- After any OpenAPI spec change, re-run `pnpm --filter @workspace/api-spec run codegen` before using updated types
- After changing `lib/db/src/schema/`, run `pnpm run typecheck:libs` then `pnpm --filter @workspace/db run push`
- `numeric` Drizzle columns expect strings: use `String(value)` on insert, `parseFloat(value)` on serialize
- API server routes must be registered in `artifacts/api-server/src/routes/index.ts`
- The Orchestrator response logic is in `artifacts/api-server/src/routes/chat.ts` → `generateOrchestratorResponse()` — replace with real OpenAI API call when ready

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- OpenAI integration: swap `generateOrchestratorResponse()` in `chat.ts` for a real API call — the interface is already designed for it
- Future integrations: CRM, email, calendar, social media tools, accounting systems — all routes are designed with placeholder data and clear extension points

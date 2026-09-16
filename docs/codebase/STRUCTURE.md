# Codebase Structure

## Core Sections (Required)

### 1) Top-Level Map

| Path | Purpose | Evidence |
|------|---------|----------|
| `apps/web/` | Next.js web product, HTTP routes, dashboard UI | `apps/web/package.json`, `apps/web/src/app/` |
| `apps/worker/` | Redis-backed background indexing worker | `apps/worker/src/index.ts` |
| `apps/native/` | Expo application workspace; current AI screen targets `/ai`, which the web app does not expose | `apps/native/package.json`, `apps/native/app/(drawer)/ai.tsx` |
| `packages/api/` | tRPC context, procedures, and feature routers | `packages/api/src/index.ts`, `packages/api/src/routers/` |
| `packages/auth/` | Better Auth setup and permission integration | `packages/auth/src/index.ts` |
| `packages/db/` | Drizzle schema, access rules, principal resolution, migrations | `packages/db/src/` |
| `packages/ingestion/` | File storage, extraction, chunking, embedding, retrieval | `packages/ingestion/src/` |
| `packages/jobs/` | Redis reliable-list queue and job schemas | `packages/jobs/src/index.ts` |
| `packages/llm/` | Provider catalog, model factories, prompts, chart tool contract | `packages/llm/src/` |
| `packages/search/` | OpenSearch mapping, query builder, client, reranking | `packages/search/src/` |
| `packages/transactional/` | React Email templates and Retransmit mailer | `packages/transactional/src/` |
| `packages/ui/` | Shared Base UI/shadcn primitives and AI elements | `packages/ui/src/` |
| `PRODUCT.md` | Product definition and flyer messaging | `PRODUCT.md` |
| `docker-compose.yml` | Self-hosted service topology | `docker-compose.yml` |

### 2) Entry Points

- Main web runtime: Next.js App Router under `apps/web/src/app/`; Docker starts `apps/web/server.js` from the standalone build.
- API entry points: `apps/web/src/app/api/trpc/[trpc]/route.ts`, `apps/web/src/app/api/chat/route.ts`, `apps/web/src/app/api/upload/route.ts`, and the Better Auth handler.
- Worker entry point: `apps/worker/src/index.ts`, selected by `apps/worker/package.json` and its Dockerfile.
- Native entry point: Expo Router under `apps/native/app/`, selected by `expo-router/entry` in `apps/native/package.json`.

### 3) Module Boundaries

| Boundary | What belongs here | What must not be here |
|----------|-------------------|------------------------|
| `apps/web` | Page composition, browser state, HTTP adapters, streaming UI | Reusable DB schema or search algorithms |
| `apps/worker` | Queue consumption and indexing orchestration | Interactive request handling |
| `packages/api` | Validated, organization-scoped business operations | Page rendering |
| `packages/db` | Persistence schema, tenant/principal/ACL rules | Provider-specific model calls |
| `packages/ingestion` | Bytes-to-sections-to-chunks-to-vectors pipeline | Authentication/UI concerns |
| `packages/search` | Index schema, query construction, ranking, index client | LLM prompting |
| `packages/llm` | Provider adapters, prompts, structured chart contract | Organization membership resolution |
| `packages/ui` | Reusable presentation primitives | Product data access |

### 4) Naming and Organization Rules

- Source files and route directories are predominantly kebab-case; React component exports are PascalCase.
- Packages are capability-oriented (`ingestion`, `search`, `llm`); web routes are feature-oriented (`chat`, `sources`, `teams`).
- Workspace imports use `@onirix/*`; web-local imports use `@/*`; relative imports are used inside a package.
- Public package APIs use `src/index.ts` barrels. Subpath exports are declared where consumers need a narrower contract, such as `@onirix/llm/chart`.
- Generated output (`.next`, `.turbo`, `node_modules`, migration snapshots) is not source architecture.

### 5) Evidence

- `pnpm-workspace.yaml`
- `package.json`
- `apps/web/src/app/`
- `apps/worker/src/index.ts`
- `apps/native/app/_layout.tsx`
- `packages/api/src/routers/index.ts`
- `packages/ingestion/src/index.ts`
- `packages/llm/src/index.ts`
- `packages/search/src/index.ts`

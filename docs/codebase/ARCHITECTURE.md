# Architecture

## Core Sections (Required)

### 1) Architectural Style

- Primary style: modular monolith with a separate event-driven worker.
- Why: the Next.js app hosts UI, route handlers, tRPC, and auth; capability packages hold reusable domain/integration logic; Redis decouples document indexing into `apps/worker`.
- Primary constraints: every knowledge operation is tenant-scoped; document ACLs must agree between PostgreSQL and OpenSearch; embedding model and vector dimension determine the OpenSearch index.

### 2) System Flow

```text
Browser -> authenticated Next.js route -> principal/tenant resolution
        -> hybrid OpenSearch retrieval -> configured embedding + chat providers
        -> streamed cited answer/chart -> PostgreSQL conversation snapshot

Upload -> S3/MinIO + PostgreSQL pending row -> Redis job
       -> worker extract/chunk/embed -> OpenSearch chunks -> PostgreSQL indexed state

Connector -> sync_source job (on demand or on schedule) -> worker streams documents
          -> unchanged by hash: stamped; new or changed: S3/MinIO + pending row + index job
          -> not seen this run: row, chunks and file removed -> source_sync_run outcome
```

Grounded chat proceeds as follows:

1. `apps/web/src/app/api/chat/route.ts` authenticates the session and loads its active workspace.
2. `packages/db/src/principal.ts` resolves organization, teams, role grants, and ACL tokens.
3. A follow-up question may be rewritten; `packages/ingestion/src/retrieval.ts` embeds it and performs hybrid search with organization and ACL filters.
4. `packages/search/src/query.ts` combines vector and keyword candidates; `packages/search/src/rerank.ts` applies freshness/boost ordering and document deduplication.
5. The workspace-selected model streams prose and optional validated chart tool parts, with retrieved sources sent to the client before prose.
6. `persistTurn` saves answer parts and only the passages actually cited; Redis allows a client to reattach to an active stream.

### 3) Layer/Module Responsibilities

| Layer or module | Owns | Must not own | Evidence |
|-----------------|------|--------------|----------|
| Next.js routes | Authentication adapters, HTTP streaming, request orchestration | Search/index internals | `apps/web/src/app/api/` |
| tRPC routers | Validated CRUD and permission-gated operations | UI state | `packages/api/src/routers/` |
| DB/principal layer | Tenant, role, team, and document ACL truth | Model generation | `packages/db/src/access.ts`, `packages/db/src/principal.ts` |
| Ingestion | Extraction, chunking, embedding, retrieval shaping | Auth decisions | `packages/ingestion/src/` |
| Search | OpenSearch index/query/rerank behavior | Provider credentials | `packages/search/src/` |
| LLM | Provider abstraction, prompts, chart schema | Tenant resolution | `packages/llm/src/` |
| Connectors | Settings schemas, credential placement, source validation, document streams | Indexing, tenant resolution | `packages/connectors/src/` |
| Worker/jobs | Reliable job handoff, index synchronization, connector syncs and their schedule | Browser requests | `packages/jobs/src/index.ts`, `apps/worker/src/index.ts` |

### 4) Reused Patterns

| Pattern | Where found | Why it exists |
|---------|-------------|---------------|
| Adapter/factory | `packages/llm/src/factory.ts` | Gives call sites one interface across five model providers |
| Middleware/context | `packages/api/src/index.ts` | Resolves auth, tenant, principal, and permission gates once |
| Materialized ACL tokens | `packages/db/src/access.ts`, `packages/search/src/query.ts` | Makes PostgreSQL and OpenSearch enforce the same visibility rule |
| Reliable queue | `packages/jobs/src/index.ts` | Moves jobs atomically between pending and processing lists |
| Process-wide singleton cache | `apps/web/src/services.ts` | Reuses database, Redis, storage, and search connections |
| Shared schema contract | `packages/llm/src/chart.ts` | Keeps server tool validation and client chart rendering aligned |
| Background synchronization | `apps/worker/src/index.ts` | Mirrors ACL and collection changes into indexed chunks without re-embedding |

### 5) Known Architectural Risks

- PostgreSQL and OpenSearch are intentionally eventually consistent for ACL and collection changes; retrieval enforces the old indexed value until the worker processes the sync job.
- Provider credentials are stored in plaintext PostgreSQL columns, including a duplicate embedding credential on `llm_config`.
- Failed jobs are acknowledged after the failure is recorded, with no automatic retry or dead-letter queue.
- The chat route combines retrieval, generation, resumability, and persistence in one high-churn file.
- The current native chat targets a route that is absent from the web server and is not an end-to-end product client.

### 6) Evidence

- `apps/web/src/app/api/chat/route.ts`
- `apps/web/src/app/api/upload/route.ts`
- `apps/web/src/services.ts`
- `apps/worker/src/index.ts`
- `packages/api/src/index.ts`
- `packages/db/src/access.ts`
- `packages/ingestion/src/pipeline.ts`
- `packages/ingestion/src/retrieval.ts`
- `packages/search/src/query.ts`
- `packages/llm/src/chart.ts`

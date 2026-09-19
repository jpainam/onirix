# External Integrations

## Core Sections (Required)

### 1) Integration Inventory

| System | Type (API/DB/Queue/etc) | Purpose | Auth model | Criticality | Evidence |
|--------|---------------------------|---------|------------|-------------|----------|
| PostgreSQL | Database | Organizations, users, documents, model config, chats, citations | Connection URL | High | `packages/db/src/index.ts`, `apps/dashboard/.env.schema` |
| OpenSearch | Search/vector database | Keyword/vector retrieval and ACL filtering | Admin username/password, optional TLS verification | High | `packages/search/src/client.ts`, `apps/dashboard/.env.schema` |
| Redis | Queue/pub-sub/state | Indexing jobs and resumable chat streams | URL; Compose default has no password | High | `packages/jobs/src/index.ts`, `apps/dashboard/src/services.ts` |
| MinIO/S3 | Object store | Uploaded originals | Access key and secret | High | `packages/ingestion/src/storage.ts` |
| OpenAI | Model API | Chat and embeddings | Workspace API key | Optional | `packages/llm/src/factory.ts` |
| Anthropic | Model API | Chat | Workspace API key | Optional | `packages/llm/src/factory.ts` |
| Google Generative AI | Model API | Chat and embeddings | Workspace API key | Optional | `packages/llm/src/factory.ts` |
| xAI | Model API | Chat | Workspace API key | Optional | `packages/llm/src/factory.ts` |
| Ollama | Self-hosted/cloud model API | Chat and embeddings through OpenAI-compatible API | Endpoint or cloud key | Optional | `packages/llm/src/catalog.ts`, `packages/llm/src/factory.ts` |
| Google OAuth | Identity API | Optional social sign-in | Deployment client ID/secret | Optional | `packages/auth/src/index.ts` |
| Retransmit | Email API | Verification, reset, magic-link, invitation mail | Deployment API key | High for account flows | `packages/transactional/src/index.ts`, `apps/dashboard/.env.schema` |

### 2) Data Stores

| Store | Role | Access layer | Key risk | Evidence |
|-------|------|--------------|----------|----------|
| PostgreSQL | Source of truth for relational state and document ACL metadata | Drizzle in `@onirix/db` | Stored model credentials are plaintext columns | `packages/db/src/schema/organization.ts` |
| OpenSearch | Searchable chunks, vectors, mirrored ACL/collection values | `DocumentIndex` in `@onirix/search` | Eventual consistency with PostgreSQL | `packages/search/src/client.ts`, `apps/worker/src/index.ts` |
| Redis | Pending/processing jobs and active chat stream state | `@onirix/jobs`, `resumable-stream` | Compose disables persistence; failed jobs have no DLQ | `packages/jobs/src/index.ts`, `docker-compose.yml` |
| S3/MinIO | Original file bytes | `@onirix/ingestion/storage` | Retention/encryption/lifecycle policy is not declared | `packages/ingestion/src/storage.ts` |

### 3) Secrets and Credentials Handling

- Deployment credentials come from Varlock-backed `.env.schema` files and Docker build secrets.
- Model credentials are supplied by workspace admins and stored in `llm_provider.api_key`; embedding credentials are also copied to `llm_config` for the worker.
- APIs never return stored keys, only `hasApiKey`/`needsApiKey` state.
- No committed production secret values were identified in the reviewed config. Docker Compose includes development fallback passwords.
- `[TODO]` Encryption-at-rest, key rotation, and credential deletion policy are not implemented or documented.

### 4) Reliability and Failure Behavior

- Queue reservation atomically moves a job to a processing list; abandoned processing jobs return to pending on worker startup.
- A failed indexing job is marked failed and then acknowledged. Manual retry exists; automatic retry/backoff and a dead-letter queue do not.
- OpenSearch hybrid queries have a 50-second timeout.
- Query rewrite and chat-title model calls fall back without failing the main answer.
- Resumable stream Redis commands use a 2-second timeout and degrade to non-resumable chat if registration fails.
- No general circuit breaker is present.

### 5) Observability for Integrations

- Worker startup, job completion, and failures use console logging.
- Chat persistence and stream-registration failures are logged.
- Document indexing failures are stored and exposed in the Sources UI.
- No metrics, distributed tracing, APM, alerting, or structured-log pipeline is configured.

### 6) Evidence

- `apps/dashboard/.env.schema`
- `apps/worker/.env.schema`
- `docker-compose.yml`
- `apps/dashboard/src/services.ts`
- `apps/worker/src/index.ts`
- `packages/jobs/src/index.ts`
- `packages/llm/src/catalog.ts`
- `packages/llm/src/factory.ts`
- `packages/db/src/schema/organization.ts`

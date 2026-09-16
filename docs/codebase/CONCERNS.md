# Codebase Concerns

## Core Sections (Required)

### 1) Top Risks (Prioritized)

| Severity | Concern | Evidence | Impact | Suggested action |
|----------|---------|----------|--------|------------------|
| High | No automated tests or CI pipeline | Root/package scripts and repository scan | Permission, retrieval, and persistence regressions can ship undetected | Add unit tests for pure logic, integration tests for ACL/index behavior, and critical E2E flows in CI |
| High | Model API keys are plaintext database values | `packages/db/src/schema/organization.ts` | Database access exposes third-party credentials | Envelope-encrypt provider credentials and document rotation/deletion procedures |
| High | Development fallback credentials can become deployed credentials | `docker-compose.yml` | An exposed default stack could be compromised | Fail startup outside development when defaults are still in use |
| Medium | PostgreSQL/OpenSearch ACL changes are eventually consistent | `packages/db/src/access.ts`, `apps/worker/src/index.ts` | Old access remains active in retrieval until the sync job runs | Prioritize ACL jobs, expose sync state, and test restrictive transitions |
| Low | Indexing jobs retry three times; ACL and collection sync jobs still do not | `packages/jobs/src/index.ts`, `apps/worker/src/index.ts` | A failed permission sync has no visible recovery path | Add attempt metadata to sync jobs and an admin remediation view |
| Medium | Product surfaces imply capabilities that are not connected end-to-end | `apps/web/src/app/(dashboard)/agents/page.tsx`, `apps/native/app/(drawer)/ai.tsx`, `packages/db/src/schema/knowledge.ts` | Marketing or navigation may overstate current behavior | Keep shipping claims aligned with `PRODUCT.md`; hide or label placeholders |

### 2) Technical Debt

| Debt item | Why it exists | Where | Risk if ignored | Suggested fix |
|-----------|---------------|-------|-----------------|---------------|
| Chat route owns too many concerns | Retrieval, generation, title creation, stream lifecycle, and persistence grew together | `apps/web/src/app/api/chat/route.ts` | High-churn changes can couple unrelated behavior | Extract turn orchestration, persistence, and retrieval adapters |
| Package-manager versions differ | Root pins pnpm 10.27.0; Docker installs pnpm 11 | `package.json`, both Dockerfiles | Container and local lockfile behavior may diverge | Install the root-declared version via Corepack |
| Native app is a scaffold, not an Onirix client | AI screen targets `/ai`, while web exposes `/api/chat` and authenticated workspace flows | `apps/native/app/(drawer)/ai.tsx` | Mobile demos fail against the current server contract | Integrate auth and current chat transport or remove the product surface |

### 3) Security Concerns

| Risk | OWASP category (if applicable) | Evidence | Current mitigation | Gap |
|------|--------------------------------|----------|--------------------|-----|
| Plaintext provider credentials | A02 Cryptographic Failures | `llmProvider.apiKey`, `llmConfig.embeddingApiKey` | Keys are never returned by APIs | No application-level encryption/rotation |
| Default infrastructure passwords | A05 Security Misconfiguration | Compose fallbacks for PostgreSQL, OpenSearch, MinIO | Environment overrides exist | Production does not reject defaults |
| Redis is unauthenticated in Compose | A05 Security Misconfiguration | `docker-compose.yml` | Intended internal Compose network | Published host port increases exposure if host firewalling is weak |
| No declared audit log | N/A | Admin mutations exist; no audit schema/service found | Permission checks gate actions | Visibility/role/model changes are not durably attributable |
| Stored HTML stripping is minimal | A03 Injection | `packages/ingestion/src/extract.ts` | Extracted HTML is converted to plain text; scripts/styles/tags are removed | Entity decoding is incomplete; adversarial prompt content is not separately classified |

### 4) Performance and Scaling Concerns

| Concern | Evidence | Current symptom | Scaling risk | Suggested improvement |
|---------|----------|-----------------|-------------|-----------------------|
| One document per worker at a time | Sequential reserve/handle loop in `apps/worker/src/index.ts` | No symptom measured | Large upload bursts queue behind long documents | Add controlled concurrency or horizontally scaled workers with load tests |
| Up to 500 candidates per hybrid subquery | `packages/search/src/constants.ts` | Tuned for recall, not measured here | Query cost grows with index/shard scale | Benchmark representative corpus sizes and tune per deployment |
| Embeddings are batched but indexing is serial | `packages/ingestion/src/pipeline.ts`, worker loop | No symptom measured | Provider latency dominates bulk ingestion | Add concurrency bounded by provider and memory limits |

### 5) Fragile/High-Churn Areas

| Area | Why fragile | Churn signal | Safe change strategy |
|------|-------------|-------------|----------------------|
| `apps/web/src/app/api/chat/route.ts` | Security filters, model calls, streams, and writes converge | 9 changes in the recent 90-day scan | Add focused tests and split orchestration before major features |
| `apps/web/src/app/(dashboard)/chat/chat-panel.tsx` | Client lifecycle, optimistic chat creation, reconnects, citations | 8 changes | Test refresh/offline/multi-tab states end to end |
| `apps/web/src/components/app-sidebar.tsx` | Setup, admin, search, agents, and recents navigation | 8 changes | Keep navigation metadata declarative and add route smoke tests |
| `packages/auth/src/index.ts` | Auth, orgs, teams, roles, email, Expo, cookies | 6 changes | Verify every plugin change against sign-up/invite/switch flows |
| `packages/api/src/routers/onboarding.ts` | Establishes tenant membership and first provider | 5 changes | Test invited-user and first-workspace transactions |

### 6) `[ASK USER]` Questions

1. [ASK USER] Should public flyers describe Onirix as generally available, private beta, or an in-development product? The repository contains strong core functionality but no release-status source of truth.
2. [ASK USER] Is the native app intended for the first commercial release, or should it remain excluded from product messaging until it uses the authenticated `/api/chat` contract?
3. [ASK USER] Is application-level encryption of stored model-provider credentials a launch requirement?

### 7) Evidence

- Repository scan and `git log --since='90 days ago' --name-only` terminal output gathered on 2026-09-15
- `package.json`
- `docker-compose.yml`
- `packages/db/src/schema/organization.ts`
- `packages/db/src/access.ts`
- `packages/jobs/src/index.ts`
- `apps/worker/src/index.ts`
- `apps/web/src/app/api/chat/route.ts`
- `apps/native/app/(drawer)/ai.tsx`

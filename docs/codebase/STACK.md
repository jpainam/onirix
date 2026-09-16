# Technology Stack

## Core Sections (Required)

### 1) Runtime Summary

| Area | Value | Evidence |
|------|-------|----------|
| Primary language | TypeScript 6 with React TSX | `package.json`, `packages/config/tsconfig.base.json` |
| Runtime + version | Node.js 24 in production containers; Expo/React Native for the native workspace | `apps/web/Dockerfile`, `apps/worker/Dockerfile`, `apps/native/package.json` |
| Package manager | pnpm 10.27.0 at the root; Dockerfiles currently install pnpm 11 | `package.json`, `apps/web/Dockerfile`, `apps/worker/Dockerfile` |
| Module/build system | ESM, pnpm workspaces, Turborepo, Next.js standalone build | `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `apps/web/next.config.ts` |

### 2) Production Frameworks and Dependencies

| Dependency | Version | Role in system | Evidence |
|------------|---------|----------------|----------|
| Next.js | ^16.3.4 | Web application and route handlers | `apps/web/package.json` |
| React | ^19.2.8 | Web UI | `apps/web/package.json` |
| Expo / React Native | ~57.0.20 / 0.86.3 | Native application workspace | `apps/native/package.json` |
| AI SDK | ^7.0.93 | Streaming chat, model tools, embeddings | `apps/web/package.json`, `packages/ingestion/package.json` |
| tRPC | ^11.18.0 | Typed application API | `packages/api/package.json` |
| Better Auth | 1.7.3 | Authentication, organizations, teams, roles | `packages/auth/package.json` |
| Drizzle ORM / PostgreSQL | ^0.45.2 / PostgreSQL 18 image | Relational metadata and migrations | `packages/db/package.json`, `docker-compose.yml` |
| OpenSearch | client ^3.5.1 / server 3.6.0 | Hybrid keyword and vector retrieval | `packages/search/package.json`, `docker-compose.yml` |
| Redis / ioredis | Redis 7.4 / ^5.9.0 | Background jobs and resumable streams | `packages/jobs/package.json`, `docker-compose.yml` |
| AWS S3 client / MinIO | ^3.982.0 / 2025-09-07 image | Uploaded originals | `packages/ingestion/package.json`, `docker-compose.yml` |
| Zod | ^4.5.4 | Runtime input and tool-schema validation | `pnpm-workspace.yaml` |

### 3) Development Toolchain

| Tool | Purpose | Evidence |
|------|---------|----------|
| Turborepo 2.10.12 | Workspace task orchestration and caching | `package.json`, `turbo.json` |
| TypeScript 6.0.3 | Strict static checking | `package.json`, `packages/config/tsconfig.base.json` |
| ESLint 10 + `@shadcn/lint` | Web linting and design-system enforcement | `apps/web/package.json`, `apps/web/eslint.config.mjs` |
| Varlock 1.18.0 | Typed environment schemas and runtime loading | `pnpm-workspace.yaml`, `apps/*/.env.schema` |
| Drizzle Kit 0.31.10 | Schema migration generation and DB studio | `packages/db/package.json` |
| Docker Compose | Full local/self-hosted stack | `docker-compose.yml` |

### 4) Key Commands

```bash
pnpm install
pnpm run build
pnpm run lint
pnpm run check-types
pnpm run docker:up
pnpm run dev:web
pnpm run dev:worker
```

There is no root test command because no test runner is configured.

### 5) Environment and Config

- Config sources: `apps/web/.env.schema`, `apps/worker/.env.schema`, `apps/native/.env.schema`, `packages/db/.env.schema`, `docker-compose.yml`.
- Web requires auth, database, OpenSearch, Redis, S3-compatible storage, and transactional-email settings. Google OAuth is optional.
- Native requires `EXPO_PUBLIC_SERVER_URL`.
- Model-provider credentials are entered per workspace and stored in PostgreSQL, rather than read from deployment-wide provider environment variables.
- Production containers use Node 24. OpenSearch is configured as a single node with a 2 GB heap.

### 6) Evidence

- `package.json`
- `pnpm-workspace.yaml`
- `turbo.json`
- `packages/config/tsconfig.base.json`
- `apps/web/package.json`
- `apps/native/package.json`
- `docker-compose.yml`
- `apps/web/Dockerfile`
- `apps/worker/Dockerfile`

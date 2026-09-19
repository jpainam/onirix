# Coding Conventions

## Core Sections (Required)

### 1) Naming Rules

| Item | Rule | Example | Evidence |
|------|------|---------|----------|
| Files | kebab-case for source files and route segments | `chat-panel.tsx`, `language-models/` | `apps/dashboard/src/` |
| Functions/methods | camelCase; action-oriented verbs | `resolvePrincipal`, `retrieveContext` | `packages/db/src/principal.ts`, `packages/ingestion/src/retrieval.ts` |
| Types/interfaces | PascalCase, usually `type` aliases | `ProviderCredentials`, `SearchFilters` | `packages/llm/src/factory.ts`, `packages/search/src/query.ts` |
| Constants/env vars | SCREAMING_SNAKE_CASE | `MAX_FILE_BYTES`, `REDIS_URL` | `apps/dashboard/src/app/api/upload/route.ts`, `apps/dashboard/.env.schema` |
| React components | PascalCase named exports | `ChatPanel`, `SourcePanel` | `apps/dashboard/src/app/(dashboard)/chat/` |

### 2) Formatting and Linting

- Formatter: no standalone Prettier/Biome configuration was found; formatting style is repository convention. `[TODO]` Choose and document an automatic formatter if one is required.
- Linter: ESLint 10 in the web app, configured by `apps/dashboard/eslint.config.mjs`.
- Most relevant rules: no component restyling beyond allowed layout, no raw colors, no arbitrary values, no inline styles, static/known classes.
- TypeScript is strict and enables `noUncheckedIndexedAccess`, unused-symbol checks, isolated modules, and fallthrough checks.
- Run commands: `pnpm run lint`, `pnpm run check-types`.

### 3) Import and Module Conventions

- Imports are grouped as external packages, `@onirix/*` workspaces, then web-local `@/*` or relative modules, with blank lines between groups.
- Use `@onirix/*` for cross-workspace imports and `@/*` within the web app.
- Package `src/index.ts` files are barrels for public APIs; internal sibling modules use relative imports.
- Type-only imports use `import type`, supported by `verbatimModuleSyntax`.

### 4) Error and Logging Conventions

- tRPC boundaries throw `TRPCError` with user-actionable codes and messages; HTTP routes return JSON plus explicit status codes.
- Optional optimizations such as query rewriting and title generation fall back silently; user-visible indexing errors are persisted on the document.
- Worker and streaming infrastructure log with `console.log/error/warn` and a short subsystem prefix such as `[worker]`.
- Provider API keys are not returned by overview APIs; only presence is exposed. No general log-redaction utility is present. `[TODO]` Define structured logging and redaction rules before production operations.

### 5) Testing Conventions

- No test runner, test files, setup files, mocking convention, or coverage policy was found.
- The current executable quality gates are TypeScript checking, web linting, and Next.js build.
- `[TODO]` Establish colocated unit-test naming and integration/E2E test directories before adding the first suite.

### 6) Evidence

- `apps/dashboard/eslint.config.mjs`
- `packages/config/tsconfig.base.json`
- `packages/api/src/index.ts`
- `apps/dashboard/src/app/api/chat/route.ts`
- `apps/worker/src/index.ts`
- `packages/llm/src/factory.ts`

# Testing Patterns

## Core Sections (Required)

### 1) Test Stack and Commands

- Primary test framework: `[TODO]` none configured.
- Assertion/mocking tools: `[TODO]` none configured.
- Commands:

```bash
# No automated test, unit, integration, E2E, or coverage command exists.
pnpm run check-types
pnpm run lint
pnpm run build
```

### 2) Test Layout

- Test file placement pattern: `[TODO]` no test files were found outside dependencies/generated output.
- Naming convention: `[TODO]` not established.
- Setup files: none found.

### 3) Test Scope Matrix

| Scope | Covered? | Typical target | Notes |
|-------|----------|----------------|-------|
| Unit | No | ACL helpers, chunking, reranking, chart schema | These are deterministic and suitable first targets |
| Integration | No | PostgreSQL/OpenSearch ACL agreement, queue recovery, upload/index pipeline | High-value because state is duplicated across stores |
| E2E | No | Onboarding, upload, cited chat, teams/roles, stream resume | No Playwright or equivalent config exists |

### 4) Mocking and Isolation Strategy

- Main mocking approach: `[TODO]` not established.
- Isolation guarantees: `[TODO]` not established.
- Likely failure mode: without service fixtures, tests may accidentally couple to the Docker Compose state. This is a recommended concern, not an observed test failure.

### 5) Coverage and Quality Signals

- Coverage tool + threshold: `[TODO]` none.
- Current reported coverage: `[TODO]` unavailable.
- Existing quality signals: strict TypeScript, web ESLint/design-system rules, and framework build.
- Highest-risk untested flows: permission equivalence between PostgreSQL/OpenSearch, provider-specific model options, job failure/recovery, citation persistence, and stream resumption.

### 6) Evidence

- `package.json`
- `apps/web/package.json`
- `apps/worker/package.json`
- `turbo.json`
- `packages/config/tsconfig.base.json`
- `apps/web/eslint.config.mjs`
- Repository search for `*.test.*`, `*.spec.*`, Jest, Vitest, and Playwright configuration returned no project files.

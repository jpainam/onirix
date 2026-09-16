# Onirix

A private AI workspace for organizational knowledge. Connect your company's
sources, and Onirix turns them into a searchable, conversational knowledge layer
with source-grounded answers and citations.

See [PRODUCT.md](./PRODUCT.md) for the product definition.

## Architecture

Onirix is a TypeScript rebuild of [Onyx](https://github.com/onyx-dot-app/onyx)
and mirrors its infrastructure choices:

| Service | Role |
| --- | --- |
| `postgres` | Relational metadata: organizations, documents, chats, citations |
| `opensearch` | Hybrid vector + keyword index (Onyx migrated here from Vespa) |
| `redis` | Background indexing queue |
| `minio` | S3-compatible store for uploaded originals |
| `web` | Next.js application |
| `worker` | Background indexing, connector syncs and their schedule; replaces Onyx's Celery workers |

The OpenSearch index mapping, hybrid query shape, and scoring constants in
`packages/search` are ported from Onyx so their retrieval-quality work carries
over.

### Packages

```
apps/
  web/          Next.js application
  worker/       Background indexing worker
  native/       Mobile application (Expo)
packages/
  api/          tRPC routers and org-scoped procedures
  auth/         Better Auth configuration
  connectors/   Website, Google Drive, OneDrive and S3 readers (Onyx's connectors, in TypeScript)
  db/           Drizzle schema and migrations
  ingestion/    Text extraction, chunking, embedding, retrieval
  jobs/         Redis job queue
  llm/          Provider abstraction over the Vercel AI SDK
  search/       OpenSearch client, index schema, hybrid search
  ui/           Shared shadcn/ui primitives
```

### Choosing a model

Onirix does not hardcode a model provider. The workspace owner picks chat and
embedding models during onboarding, and every call routes through the AI SDK
abstraction in `packages/llm`. Ollama is supported so a deployment can run with
no outbound requests at all.

The embedding model determines the OpenSearch index name and vector dimension,
so changing it requires re-indexing.

## Running it

Everything runs in Docker.

```bash
pnpm install
pnpm run docker:up      # build and start the full stack
pnpm run docker:logs    # tail logs
```

Then open [http://localhost:3001](http://localhost:3001), create an account, and
the onboarding flow will walk you through naming your organization and choosing
a model.

### Local development

Run the infrastructure in Docker and the apps on the host:

```bash
pnpm run infra:up       # postgres, opensearch, redis, minio
pnpm run db:migrate     # apply schema
pnpm run dev:web        # http://localhost:3001
pnpm run dev:worker     # background indexing
```

### Ports

The stack publishes Postgres on **5433** and Redis on **6380**, not their
defaults, because a locally installed Postgres or Redis commonly owns 5432/6379
and would silently shadow the container. Override with `POSTGRES_HOST_PORT` and
`REDIS_HOST_PORT`. Inside the compose network, services still reach each other
on the standard ports.

| Service | Host port |
| --- | --- |
| Web | 3001 |
| Postgres | 5433 |
| OpenSearch | 9200 |
| MinIO API / console | 9000 / 9001 |
| Redis | 6380 |

## Database

Schema lives in `packages/db/src/schema`. After changing it:

```bash
pnpm run db:generate    # generate a SQL migration
pnpm run db:migrate     # apply it
```

The worker applies pending migrations on startup, so a fresh `docker compose up`
provisions its own schema.

> `drizzle-kit migrate` requires a TTY and cannot run in a container, so
> `db:migrate` uses the programmatic runner in `packages/db/src/migrate.ts`.
> Migrations are still generated with `drizzle-kit generate`.

## Environment

Each app owns its schema in `.env.schema`; Varlock generates `src/env.ts` during
install. Run `pnpm run env:generate` after changing a schema. Commit schemas,
never values.

## UI

Shared primitives live in `packages/ui`, built on **Base UI** — components
compose via a `render` prop, not Radix's `asChild`.

- Design tokens: `packages/ui/src/styles/globals.css`
- Primitives: `packages/ui/src/components/*`

Add more with `npx shadcn@latest add <component> -c packages/ui`, then import as
`@onirix/ui/components/button`.

## Available scripts

| Script | Purpose |
| --- | --- |
| `pnpm run dev` | Run all apps in development |
| `pnpm run dev:web` | Web only |
| `pnpm run dev:worker` | Indexing worker only |
| `pnpm run check-types` | Typecheck the monorepo |
| `pnpm run infra:up` | Start backing services only |
| `pnpm run db:generate` | Generate a migration |
| `pnpm run db:migrate` | Apply migrations |
| `pnpm run db:studio` | Open Drizzle Studio |
| `pnpm run docker:up` | Build and start the full stack |
| `pnpm run docker:logs` | Tail stack logs |
| `pnpm run docker:down` | Stop the stack |

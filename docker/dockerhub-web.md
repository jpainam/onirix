# Onirix

A private AI workspace for organizational knowledge. Connect your company's
sources and get a searchable, conversational knowledge layer with
source-grounded answers and citations.

This image is the web application. It needs the `jpainam/onirix-worker` image
and four backing services next to it. The compose file below starts all of it.

| Image | Role |
| --- | --- |
| `jpainam/onirix-web` | Next.js application, port 3001 |
| `jpainam/onirix-worker` | Indexing, connector syncs, database migrations |

Tags: `latest`, plus one tag per release such as `0.1.0`. Platforms:
`linux/amd64` and `linux/arm64`.

## Requirements

- Docker Engine 24+ or Docker Desktop, with Compose v2
- 8 GB of RAM available to Docker (OpenSearch alone takes a 2 GB heap)
- A [Retransmit](https://retransmit.dev) API key and a verified sender domain.
  Sign-up verification, magic links and password resets all send email, so
  accounts cannot be created without it.
- Linux hosts only, required by OpenSearch:

  ```bash
  sudo sysctl -w vm.max_map_count=262144
  echo "vm.max_map_count=262144" | sudo tee /etc/sysctl.d/99-opensearch.conf
  ```

## Create the two files

Make an empty folder and save these two files in it.

**`docker-compose.yml`**

```yaml
name: onirix

x-shared-env: &shared-env
  DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}@postgres:5432/onirix
  SECRETS_ENCRYPTION_KEY: ${SECRETS_ENCRYPTION_KEY:?set SECRETS_ENCRYPTION_KEY in .env}
  OPENSEARCH_HOST: opensearch
  OPENSEARCH_REST_API_PORT: "9200"
  OPENSEARCH_ADMIN_PASSWORD: ${OPENSEARCH_ADMIN_PASSWORD:?set OPENSEARCH_ADMIN_PASSWORD in .env}
  REDIS_URL: redis://redis:6379
  S3_ENDPOINT: http://minio:9000
  S3_ACCESS_KEY_ID: ${MINIO_ROOT_USER:-onirix}
  S3_SECRET_ACCESS_KEY: ${MINIO_ROOT_PASSWORD:?set MINIO_ROOT_PASSWORD in .env}
  S3_BUCKET: onirix-file-store
  CONNECTOR_ALLOW_PRIVATE_NETWORKS: ${CONNECTOR_ALLOW_PRIVATE_NETWORKS:-false}
  FIRECRAWL_API_KEY: ${FIRECRAWL_API_KEY:-}

x-depends: &depends
  postgres:
    condition: service_healthy
  opensearch:
    condition: service_healthy
  redis:
    condition: service_healthy
  minio:
    condition: service_healthy

services:
  web:
    image: jpainam/onirix-web:${ONIRIX_VERSION:-latest}
    init: true
    ports:
      - "${WEB_PORT:-3001}:3001"
    environment:
      <<: *shared-env
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET:?set BETTER_AUTH_SECRET in .env}
      BETTER_AUTH_URL: ${APP_URL:-http://localhost:3001}
      RETRANSMIT_API_KEY: ${RETRANSMIT_API_KEY:?set RETRANSMIT_API_KEY in .env}
      EMAIL_FROM: ${EMAIL_FROM:?set EMAIL_FROM in .env}
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:-}
    depends_on: *depends
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "fetch('http://localhost:3001/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))",
        ]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s
    restart: unless-stopped

  worker:
    image: jpainam/onirix-worker:${ONIRIX_VERSION:-latest}
    init: true
    environment:
      <<: *shared-env
    depends_on: *depends
    restart: unless-stopped

  postgres:
    image: postgres:18
    shm_size: 1g
    command: -c 'max_connections=250'
    environment:
      POSTGRES_DB: onirix
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - onirix_postgres_data:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  opensearch:
    image: opensearchproject/opensearch:3.6.0
    environment:
      - discovery.type=single-node
      - OPENSEARCH_INITIAL_ADMIN_PASSWORD=${OPENSEARCH_ADMIN_PASSWORD}
      - bootstrap.memory_lock=true
      - "OPENSEARCH_JAVA_OPTS=-Xms2g -Xmx2g"
    volumes:
      - onirix_opensearch_data:/usr/share/opensearch/data
    ulimits:
      memlock:
        soft: -1
        hard: -1
      nofile:
        soft: 65536
        hard: 65536
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "curl -sk -u admin:${OPENSEARCH_ADMIN_PASSWORD} https://localhost:9200/_cluster/health | grep -qE '\"status\":\"(green|yellow)\"'",
        ]
      interval: 10s
      timeout: 10s
      retries: 30
      start_period: 60s
    restart: unless-stopped

  redis:
    image: redis:7.4-alpine
    command: redis-server --save "" --appendonly no
    tmpfs:
      - /data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  minio:
    image: quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z-cpuv1
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-onirix}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    volumes:
      - onirix_minio_data:/data
    command: server /data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 10s
      timeout: 10s
      retries: 10
      start_period: 10s
    restart: unless-stopped

volumes:
  onirix_postgres_data:
  onirix_opensearch_data:
  onirix_minio_data:
```

Only the web port is published. Postgres, OpenSearch, Redis and MinIO stay on
the internal Docker network.

**`.env`**

```dotenv
# Image version. Pin a release in production instead of "latest".
ONIRIX_VERSION=latest

# Public URL of this install. Use your https:// domain when behind a proxy.
APP_URL=http://localhost:3001
WEB_PORT=3001

# Generate each of these once, then never change them.
BETTER_AUTH_SECRET=
SECRETS_ENCRYPTION_KEY=
POSTGRES_PASSWORD=
MINIO_ROOT_PASSWORD=
OPENSEARCH_ADMIN_PASSWORD=

# Email (required)
RETRANSMIT_API_KEY=rt_...
EMAIL_FROM=Onirix <no-reply@your-domain.com>

# Optional
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
FIRECRAWL_API_KEY=
CONNECTOR_ALLOW_PRIVATE_NETWORKS=false
```

## Fill in the secrets

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # SECRETS_ENCRYPTION_KEY
openssl rand -hex 24      # POSTGRES_PASSWORD
openssl rand -hex 24      # MINIO_ROOT_PASSWORD
```

- `POSTGRES_PASSWORD` goes inside a connection URL, so keep it to letters and
  digits. The hex output above is safe.
- `OPENSEARCH_ADMIN_PASSWORD` must have an uppercase letter, a lowercase letter,
  a digit and a special character, at least 8 characters. Avoid `$`.
  OpenSearch refuses to start with a weak one.
- **Back up `SECRETS_ENCRYPTION_KEY`.** It encrypts stored model API keys and
  database credentials. Losing it loses all of them.
- The Postgres, OpenSearch and MinIO passwords are applied on first start only.
  Changing them later in `.env` does not change the running services.

## Start

```bash
docker compose up -d
docker compose ps        # wait until web shows "healthy"
```

The first start takes a minute or two while OpenSearch boots. The worker
creates the database schema and the storage bucket by itself.

Open `APP_URL` (default <http://localhost:3001>), create an account, confirm the
email, and the onboarding flow asks for the organization name and the chat and
embedding models.

## Day to day

| Task | Command |
| --- | --- |
| Logs | `docker compose logs -f web worker` |
| Stop | `docker compose down` |
| Upgrade | set `ONIRIX_VERSION`, then `docker compose pull && docker compose up -d` |
| Wipe everything, data included | `docker compose down -v` |

Upgrades apply database migrations automatically when the worker starts.

## Backups

All state lives in three Docker volumes plus the `.env` file.

```bash
docker compose exec postgres pg_dump -U postgres onirix > onirix-$(date +%F).sql
```

- `onirix_postgres_data`: accounts, documents, chats. Back this up.
- `onirix_minio_data`: uploaded original files. Back this up.
- `onirix_opensearch_data`: the search index. It can be rebuilt by re-indexing.

## Running on a domain

Set `APP_URL=https://onirix.your-domain.com`, put a reverse proxy with TLS
(Caddy, nginx, Traefik) in front of port 3001, then `docker compose up -d`.
`APP_URL` must match the address users type, or sign-in is rejected.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `opensearch` exits with `max virtual memory areas` | `vm.max_map_count` not set, see Requirements |
| `opensearch` restarts in a loop right after first start | Password too weak. Fix `.env`, then `docker compose down -v` and start again |
| `web` exits at once with a Varlock validation error | A required `.env` value is missing or too short |
| Sign-up email never arrives | `EMAIL_FROM` domain is not verified in Retransmit |
| Port 3001 already in use | Change `WEB_PORT`, and `APP_URL` with it |

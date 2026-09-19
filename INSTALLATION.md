# Running Onirix on your machine

Clone the repository, fill in one env file, and Docker builds and runs the
production stack: the web app, the worker, Postgres, OpenSearch, Redis and
MinIO. Node and pnpm are not needed on the host.

## 1. Requirements

- Git, and read access to this repository
- Docker Desktop, or Docker Engine 24+ with Compose v2
- 8 GB of RAM given to Docker. OpenSearch alone takes a 2 GB heap, and the web
  build needs room too.
- About 10 GB of free disk for images and build cache
- A [Retransmit](https://retransmit.dev) API key and a verified sender domain.
  Sign-up sends a verification email, so no account can be created without it.
- Linux hosts only, required by OpenSearch:

  ```bash
  sudo sysctl -w vm.max_map_count=262144
  echo "vm.max_map_count=262144" | sudo tee /etc/sysctl.d/99-opensearch.conf
  ```

## 2. Get the code

```bash
git clone https://github.com/jpainam/onirix.git
cd onirix
```

## 3. Create the env file

```bash
cp apps/dashboard/.env.example apps/dashboard/.env
```

Open `apps/dashboard/.env` and fill in the four values at the top:

| Variable | Value |
| --- | --- |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `SECRETS_ENCRYPTION_KEY` | `openssl rand -base64 32` |
| `RETRANSMIT_API_KEY` | Your Retransmit key, starts with `rt_` |
| `EMAIL_FROM` | An address on your verified Retransmit domain |

Leave the rest as it is. The web app and the worker both read this file, and
compose points them at the other containers by itself.

**Keep `SECRETS_ENCRYPTION_KEY` safe and never change it.** It encrypts the
model API keys and database credentials stored in the workspace. Losing it
loses all of them.

## 4. Build and start

```bash
docker compose up -d --build
```

The first build takes 5 to 10 minutes. After that:

```bash
docker compose ps
```

Wait until `dashboard` shows `healthy`. OpenSearch is the slow one, give it a minute
or two. The worker creates the database schema and the storage bucket by
itself, there is no migration step to run.

## 5. Open it

Go to <http://localhost:3001>, create an account, and click the link in the
verification email. Onboarding then asks for the organization name and the chat
and embedding models. Bring an API key for the provider you pick, or use Ollama
to stay fully local.

## 6. Day to day

| Task | Command |
| --- | --- |
| Logs | `docker compose logs -f dashboard worker` |
| Stop, keep data | `docker compose down` |
| Start again | `docker compose up -d` |
| Update to the latest code | `git pull && docker compose up -d --build` |
| Wipe everything, data included | `docker compose down -v` |

Updates apply new database migrations when the worker starts.

After changing `apps/dashboard/.env`, run `docker compose up -d --build` again, not
just a restart. The build reads the file too.

## 7. Ports

| Service | Host port |
| --- | --- |
| Web | 3001 |
| Postgres | 5433 |
| OpenSearch | 9200 |
| MinIO API / console | 9000 / 9001 |
| Redis | 6380 |

Postgres and Redis use 5433 and 6380 so they do not collide with a local
install. To move them, create a `.env` file next to `docker-compose.yml`:

```dotenv
POSTGRES_HOST_PORT=5434
REDIS_HOST_PORT=6381
```

The web port is fixed at 3001.

## 8. Before using this beyond your own machine

This setup is meant for a developer's computer.

- The backing services run with default passwords (`password`, `minioadmin`,
  `StrongPassword123!`) and their ports are open on the host. On a shared or
  public server, set `POSTGRES_PASSWORD`, `MINIO_ROOT_USER`,
  `MINIO_ROOT_PASSWORD` and `OPENSEARCH_ADMIN_PASSWORD` in the root `.env`
  before the first start, and firewall every port except 3001. These passwords
  only apply when the volumes are first created.
- `next build` writes the values from `apps/dashboard/.env` into the web image. That
  is fine for an image that stays on your machine. **Do not push these images
  to a registry**, they contain your keys.
- The app URL is set to `http://localhost:3001` in `docker-compose.yml`
  (`BETTER_AUTH_URL` and `CORS_ORIGIN`). To serve it on another address, change
  both there, or sign-in is rejected.

## 9. Backups

All state lives in three Docker volumes plus `apps/dashboard/.env`.

```bash
docker compose exec postgres pg_dump -U postgres onirix > onirix-$(date +%F).sql
```

- `onirix_postgres_data`: accounts, documents, chats. Back this up.
- `onirix_minio_data`: uploaded original files. Back this up.
- `onirix_opensearch_data`: the search index. It can be rebuilt by re-indexing.

## 10. Troubleshooting

| Symptom | Cause |
| --- | --- |
| Build fails with a Varlock validation error | A required value in `apps/dashboard/.env` is empty, too short, or the Retransmit key does not start with `rt_` |
| `failed to read secret` or `apps/dashboard/.env: no such file` | Step 3 was skipped |
| Build is killed, or exits with code 137 | Docker is out of memory, raise its limit to 8 GB |
| `opensearch` exits with `max virtual memory areas` | `vm.max_map_count` not set, see Requirements |
| `port is already allocated` | Another program owns the port, see Ports |
| `container name "onirix-postgres" is already in use` | A second copy of the stack exists on this machine. Run `docker compose down` in the other folder |
| Sign-up email never arrives | `EMAIL_FROM` domain is not verified in Retransmit. Check `docker compose logs dashboard` |
| `dashboard` stays `unhealthy` | It cannot reach Postgres. Check `docker compose logs dashboard postgres` |

## Working on the code instead

To run the apps on the host with hot reload, and only the backing services in
Docker, see "Local development" in [README.md](README.md). The same
`apps/dashboard/.env` works for both.

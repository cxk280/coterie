# Deploying Coterie on Railway

Coterie deploys as two app services (API + web) sharing a volume, plus an
optional self-hosted Langfuse stack for observability. CI/CD is CircleCI: a
branch-protected `main`, and a gated `deploy` job that runs `railway up` after
the test jobs pass.

## Topology

| Service | Source | Listens | Notes |
|---|---|---|---|
| `coterie-api` | `packages/coterie-api/Dockerfile` (root `railway.json`) | 8000 | Mount a volume at `/data` (SQLite). Health: `/api/health`. |
| `coterie-web` | `packages/coterie-web/Dockerfile` | 3000 | Next.js standalone. Set its Dockerfile path in the service settings. |
| Langfuse (optional) | `infra/langfuse/docker-compose.yml` → 6 services | — | Postgres + ClickHouse + Redis + MinIO + worker + web. |

## 1. Provision the app

1. Create a Railway project from this GitHub repo. The root `railway.json`
   configures the **API** service (Dockerfile build, `/api/health` healthcheck).
2. Add a **volume** to the API service mounted at `/data` — the SQLite run +
   checkpoint DBs live there (`COTERIE_DB_PATH`, `COTERIE_CHECKPOINT_DB`,
   `COTERIE_API_TOKEN_PATH` all default under `/data`).
3. Add a second service for **web**, source = same repo, Dockerfile path
   `packages/coterie-web/Dockerfile`.
4. `generate_domain` for both services; point `coterie.dev` (or a subdomain like
   `app.coterie.dev` / `api.coterie.dev`) at them via a CNAME.

### API service env

```
COTERIE_API_ALLOW_LOCALHOST=0          # required — never enable the localhost bypass in prod
COTERIE_LOG_FORMAT=json
COTERIE_API_STATE_SECRET=<openssl rand -hex 32>   # required if GitHub OAuth is on
COTERIE_CORS_ORIGINS=https://<web-domain>
COTERIE_WEB_BASE=https://<web-domain>
COTERIE_DEFAULT_DAILY_CAP_USD=5.00
# Provider keys — only the ones you use:
ANTHROPIC_API_KEY=...   OPENAI_API_KEY=...   GROQ_API_KEY=...   XAI_API_KEY=...
# Observability (point at the deployed Langfuse, if used):
LANGFUSE_HOST=...   LANGFUSE_PUBLIC_KEY=...   LANGFUSE_SECRET_KEY=...
# GitHub OAuth (optional):
GITHUB_CLIENT_ID=...   GITHUB_CLIENT_SECRET=...
```

### Web service env

```
NEXT_PUBLIC_COTERIE_API_URL=https://<api-domain>
COTERIE_API_TOKEN=<the API's token>     # lets server components call the API
```

## 2. CI/CD (CircleCI)

`main` is branch-protected: PRs only, all 5 CircleCI checks required, no direct
pushes. The `.circleci/config.yml` `deploy` job is branch-filtered to `main` and
gated on `python`/`js`/`web`. It runs `railway up` — but **no-ops until
`RAILWAY_TOKEN` is set**, so add a Railway **project token** to the CircleCI
project: Project Settings → Environment Variables → `RAILWAY_TOKEN`.

The single `railway up` deploys the API (the repo's `railway.json` service). For
web + Langfuse, either enable Railway's native GitHub auto-deploy on those
services, or add per-service `railway up --service <name>` steps to the deploy job.

## 3. Self-hosted Langfuse (optional, observability)

The full stack is in `infra/langfuse/docker-compose.yml` (6 services + 4
volumes). Two ways to run it on Railway:

- **Railway's Langfuse template** (fastest), or
- Replicate the compose: Postgres + ClickHouse + Redis + MinIO + `langfuse/langfuse-worker:3` + `langfuse/langfuse:3`, wired with the same env as the compose file.

**You must replace the dev-default secrets** before exposing it:

```
POSTGRES_PASSWORD, CLICKHOUSE_PASSWORD, REDIS_PASSWORD, MINIO_ROOT_PASSWORD
LANGFUSE_SALT            = openssl rand -hex 16
LANGFUSE_ENCRYPTION_KEY  = openssl rand -hex 32   # exactly 64 hex chars
LANGFUSE_NEXTAUTH_SECRET = openssl rand -hex 32
LANGFUSE_NEXTAUTH_URL    = https://<langfuse-domain>
```

After it's up: sign in, create a project, copy the public/secret keys into the
API service's `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_HOST`,
and redeploy the API. Run-detail pages then deep-link to traces via `trace_url`.

> Cost note: the Langfuse stack (ClickHouse especially) is the one always-on,
> per-service-billed piece — budget for it accordingly.

## Verification

- API: `GET https://<api-domain>/api/health` → `{"status":"ok", ...}`.
- Web: load the dashboard, create a run (FakeAdapter works without keys), watch
  it stream over SSE, confirm data persists across a redeploy (the volume).
- If Langfuse is wired: open a run detail → "View in Langfuse" resolves.

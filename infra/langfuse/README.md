# Self-hosted Langfuse for Coterie

Spins up a complete Langfuse stack — web + worker + Postgres + ClickHouse +
Redis + MinIO — for receiving Coterie's OpenTelemetry traces locally.

## Quick start

```bash
cd infra/langfuse
cp .env.example .env
# regenerate the three 32-byte hex secrets:
#   openssl rand -hex 32
# and rotate the per-service passwords.

docker compose up -d
# Initial container boot incl. migrations is 30-60s. Watch with:
docker compose logs -f langfuse-web
```

When `langfuse-web` is listening on `:3001`, sign in with the
`LANGFUSE_INIT_USER_EMAIL` / `LANGFUSE_INIT_USER_PASSWORD` from your `.env`.
The Coterie project is auto-created on first boot.

## Point Coterie at it

Set these in the shell where `coterie-api` (and the `coterie` CLI) run:

```bash
export LANGFUSE_HOST=http://localhost:3001
export LANGFUSE_PUBLIC_KEY=pk-lf-...     # from Project Settings → API Keys
export LANGFUSE_SECRET_KEY=sk-lf-...
export LANGFUSE_PROJECT_ID=coterie       # matches LANGFUSE_INIT_PROJECT_ID
```

Coterie auto-detects the keys and switches its tracer to the Langfuse OTLP
exporter. Every run from then on shows up under
`http://localhost:3001/project/coterie/traces`. The web dashboard's run-detail
page exposes a **View in Langfuse** button that deep-links by trace ID.

## Operations

```bash
# tail logs
docker compose logs -f

# stop everything
docker compose down

# stop + wipe data (full reset)
docker compose down --volumes
```

## Production checklist

- [ ] Rotate every secret in `.env`.
- [ ] Put the web container behind TLS — Langfuse's NextAuth requires
      `NEXTAUTH_URL` to match the public scheme.
- [ ] Set `LANGFUSE_TELEMETRY=false` (or true if you want to share anon usage
      data upstream).
- [ ] Mount the four named volumes onto durable storage; the default Docker
      volumes are fine locally but not for anything you care about.

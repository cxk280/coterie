# Coterie — execution plan

> **North-star quality bar (2026-05-22, user directive):** this project must be
> production-deployed, hardened, and *perfect* before it's shown to anyone.
> Demoable ≡ complete + perfect + resilient + beautiful. Every screen, every
> code path, every error response should look intentional and finished. No
> half-built surfaces, no shortcuts that show.

## Top-level architecture

| Package | Role |
|---|---|
| `coterie` (PyPI: `coterie`)         | Python CLI + library — 5 modes, agent runner, all LLM clients, registry, executors (incl. DockerSwarm) |
| `coterie` (npm: `coterie`)          | TypeScript runtime parity — same modes, same schema |
| `coterie-api`                       | FastAPI server: SSE stream, SQLite persistence, HIL resume, multi-user auth, GitHub OAuth, PATs, rate limits, per-user daily budgets, pagination, filters, structured logging, OTel tracing |
| `coterie-web`                       | Next.js 15 / React 19 dashboard — 5 mode live views, HIL modal, settings, run history, error states; Playwright smoke; standalone Docker build |
| `coterie-tui`                       | Rich-based CLI client for the API |
| `coterie-bench`                     | Reproducible benchmark harness: same corpus × 5 modes → CSV + Pareto plot |
| `infra/langfuse/`                   | Self-hosted Langfuse stack (Postgres + ClickHouse + Redis + MinIO + web + worker) |
| `Dockerfile`s + `docker-compose.yml` | api + web with healthchecks + persistent volume + env-driven config |

## Status (newest first)

### In flight

- **Item 3 — hosted demo at coterie.dev + Railway/Fly template** — *user is deferring; will signal when ready*. The Dockerfiles + top-level compose are already in place, so the deploy step is "point Railway at the repo, set env, done."

### Recently shipped

- **Item 5 — production hardening**
  - **Rate limiting**: slowapi `Limiter` keyed by user.id (IP fallback). Default `120/min`, create-run capped at `30/min`. 429 carries `Retry-After`.
  - **Per-user daily budget caps**: new `user_quotas` table, `COTERIE_DEFAULT_DAILY_CAP_USD` (default $5), 402 with structured detail on exceed. Admin (`service`/`dev`) bypass. Cleanup loop resets 24h windows.
  - **DockerSwarmExecutor**: third concrete `AdapterExecutor`. Bind-mounts workdir into a fresh container per call, `--network=none` default, `docker rm -f` in finally on crash. Streams via `run_streaming`.
  - **Production Dockerfiles**: api on python:3.13-slim (non-root, tini, `/data` volume); web on node:22-alpine Next.js standalone. Top-level compose with healthchecks + `.env.example`.
  - **Structured logging**: `COTERIE_LOG_FORMAT=json` emits per-line JSON with `request_id` from `RequestIdMiddleware`. API Docker image defaults to JSON logs.
  - **Expanded health check**: `{status, version, github_oauth, tracing, db}` and probes SQLite.
  - **Playwright smoke**: 5 tests (dashboard / runs / settings / 404 / first-run welcome). Isolated dev server on port 3100.
- **Item 4 — PTY streaming**: subprocess stdout streams as `agent_output` SSE events. `coterie/core/streaming.run_streaming` (PTY on Unix, pipes fallback). `OutputSink` contextvar so the orchestration layer plumbs without polluting state. `_EPHEMERAL_KINDS` keeps `agent_output` out of the persisted event log.
- **Item 2 — benchmark harness** (`packages/coterie-bench/`): YAML corpus, deterministic graders, mock-by-default, per-mode summary + Pareto plot. Each run wrapped in an OTel span so bench cells show up in Langfuse.
- **Item 1 — Observability + self-hosted Langfuse**: OTel everywhere (LLM, agent, run). FastAPI auto-instrumented. Web run-detail deep-links to Langfuse via `trace_url`. `infra/langfuse/` ships a full self-host stack.

### Production-quality checklist (rolling — every commit should chip at this)

- [x] Per-user daily budget caps enforced server-side, 402 on exceed
- [x] Rate limiting on every public endpoint (default + per-route)
- [x] PTY streaming for agent stdout
- [x] DockerSwarmExecutor
- [x] Dockerfile for `coterie-api` + multi-stage build
- [x] Dockerfile for `coterie-web` + multi-stage build
- [x] Top-level docker-compose for the full app
- [x] Structured JSON logging with request_id
- [x] Health check probes the DB + reports feature flags
- [x] Playwright smoke: dashboard / runs / settings / 404 / first-run

#### Still open

- [ ] Worker pool isolation — `ThreadPoolExecutor(max_workers=4)` is a single point of failure; offer an RQ/Celery worker tier or at least a configurable Process pool.
- [ ] Every API error returns structured `{error, code, request_id}` (request_id is on the response header; bodies vary). Needs an exception-handler sweep.
- [ ] Playwright: HIL modal approve/reject + settings PAT create/revoke flows (current suite is read-only).
- [ ] Web: loading skeletons, empty states polished, mobile responsive (today desktop-only).
- [ ] Web: light-mode toggle.
- [ ] Hosted-demo deployment manifest (Railway template or Fly.io) — *deferred per user*.
- [ ] Public OpenAPI export wired to an `openapi-typescript` codegen step so the web client types track the server.
- [ ] CI: every PR runs full pytest matrix + Playwright + lints.
- [ ] Security review (the `senior-secops` skill is right there).
- [ ] README hero with **real** cost/quality numbers from a non-mocked benchmark run.
- [ ] Provider key tests in settings actually call `/api/auth/...` to validate.

## Notes / decisions

- **Self-hosted observability**: Langfuse over LangSmith for sovereignty. The OTel layer keeps both as choices, but the self-host story is what we promote.
- **No "v0.2" framing in user-facing docs**: anything we ship is v1 quality. Roadmap moves to issues, not READMEs.
- **The deck stays private**: removed all public references to the Docker Agent Swarm presentation.
- **`agent_output` is ephemeral**: live subscribers see it via SSE but the events table doesn't persist it (the full text remains on `run.runs[].stdout` for post-hoc inspection).

## Memory crosslinks

- See `~/.claude/projects/-Users-christopherking-code/memory/coterie-project.md` for project context.
- The `cascadia-project.md` memory is for a different project; don't mix.

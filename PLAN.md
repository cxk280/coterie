# Coterie — execution plan

> **North-star quality bar (2026-05-22, user directive):** this project must be
> production-deployed, hardened, and *perfect* before it's shown to anyone.
> Demoable ≡ complete + perfect + resilient + beautiful. Every screen, every
> code path, every error response should look intentional and finished. No
> half-built surfaces, no shortcuts that show.

## Top-level architecture

| Package | Role |
|---|---|
| `coterie` (PyPI: `coterie`)         | Python CLI + library — 5 modes, agent runner, all LLM clients, registry, executors |
| `coterie` (npm: `coterie`)          | TypeScript runtime parity — same modes, same schema |
| `coterie-api`                       | FastAPI server: SSE stream, run persistence (SQLite), HIL resume, multi-user auth, GitHub OAuth, token-managed PATs, rate limits (todo), pagination, filtering |
| `coterie-web`                       | Next.js 15 / React 19 dashboard — 5 mode live views, HIL modal, run history, settings, error states |
| `coterie-tui`                       | Rich-based CLI client for the API |
| `coterie-bench`                     | Reproducible benchmark harness: same corpus × 5 modes → CSV + Pareto plot |
| `infra/langfuse/`                   | Self-hosted Langfuse stack (Postgres + ClickHouse + Redis + MinIO + web + worker) |

## Status (newest first)

### In flight

- **Item 4 — PTY streaming**: stream subprocess stdout as `agent_output` SSE events so the live view tails in real time (deferred until after Item 2 ships).
- **Item 5 — production hardening**:
  - Per-user budget caps + rate limiting on the API
  - Worker pool isolation (RQ/Celery tier) instead of in-process ThreadPoolExecutor
  - DockerSwarmExecutor (proves the AdapterExecutor seam)
  - Playwright tests for the web dashboard
- **Item 3 — hosted demo at coterie.dev + Dockerfile + Railway/Fly template** — *user is deferring; will signal when ready*

### Recently shipped

- **Item 2 — benchmark harness** (`packages/coterie-bench/`)
  - YAML task corpus with 5 starter tasks (refactor / review / decision / tournament / refactor-2)
  - Deterministic graders: `file_contains`, `file_absent`, `regex_match`, `status_done`, `findings_severity_at_least`
  - Mock-by-default (ScriptedLLMClient + FakeAdapter) so no API keys needed
  - `coterie-bench run` / `summarize` / `ls`
  - Per-mode summary CSV + cost-vs-quality Pareto plot (matplotlib, optional via `[plot]` extra)
  - Each run wrapped in a Coterie OTel span so bench runs land in Langfuse
- **Item 1 — Observability + self-hosted Langfuse**
  - `coterie/observability/` — OTel TracerProvider with Langfuse / LangSmith / generic OTLP exporters
  - `LLMClient.chat()` now traces every provider call with `gen_ai.*` semantic attributes (tokens, output length)
  - `agent_runner` wraps every CLI invocation in `coterie.agent.run`
  - FastAPI auto-instrumentation; per-run trace IDs persisted on the runs table and surfaced via API
  - Web dashboard's run-detail page deep-links to Langfuse via `trace_url`
  - `infra/langfuse/` ships a complete self-host docker-compose + secrets template + README

### Production-quality checklist (rolling — every commit should chip at this)

- [ ] Every API error returns structured `{error, code, request_id}` (today some are bare HTTPException details)
- [ ] Per-user budget caps enforced server-side (today: per-run, but a user can run forever)
- [ ] Rate limiting on every public endpoint
- [ ] Worker pool isolation — `ThreadPoolExecutor(max_workers=4)` is a single point of failure
- [ ] Playwright tests for: dashboard happy path, HIL modal approve/reject, settings token create/revoke, error states
- [ ] Web: loading skeletons, empty states polished, mobile responsive (currently desktop-only)
- [ ] Web: light-mode option (today dark-only; product is dark by default but the option signals polish)
- [ ] DockerSwarmExecutor — proves the executor seam
- [ ] PTY streaming for agent stdout — live view feels alive
- [ ] Dockerfile for `coterie-api` + multi-stage build
- [ ] Hosted-demo deployment manifest (Railway template or Fly.io)
- [ ] Public OpenAPI export (FastAPI gives this for free; surface it at /openapi.json + generate web client types from it)
- [ ] CI: every PR runs full pytest matrix + Playwright + lints
- [ ] Security review (the `senior-secops` skill is sitting right there)
- [ ] README: hero with cost/quality numbers from a real benchmark run (not mocked)

## Notes / decisions

- **Self-hosted observability**: Langfuse over LangSmith for sovereignty. The OTel layer keeps both as choices, but the self-host story is what we promote.
- **No "v0.2" framing in user-facing docs**: anything we ship is v1 quality. Roadmap moves to issues, not READMEs.
- **The deck stays private**: removed all public references to the Docker Agent Swarm presentation.

## Memory crosslinks

- See `~/.claude/projects/-Users-christopherking-code/memory/coterie-project.md` for project context.
- The `cascadia-project.md` memory is for a different project; don't mix.

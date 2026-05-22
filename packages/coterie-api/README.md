# coterie-api

FastAPI HTTP server fronting the Coterie graph runner. Powers the [coterie-web](../coterie-web)
dashboard.

## Endpoints

```
GET  /api/health
GET  /api/modes                   → list of registered modes
GET  /api/agents                  → list of registered adapters
GET  /api/runs                    → list runs, most recent first
POST /api/runs                    → create a new run, returns RunSummary
GET  /api/runs/{id}               → run detail (config + final state + history)
GET  /api/runs/{id}/events        → Server-Sent Events for live progress
```

Streams emit these `kind`s:

- `status_change` — `{status: "running" | "auditing" | …}`
- `spend_update`  — `{spend_usd: 0.42}`
- `agent_run`     — `{agent_id, role, exit_code, duration_s, cost_estimate_usd, stdout_preview}`
- `done`          — `{status, duration_s}` — last event before stream closes
- `error`         — `{message, traceback}` if the run blew up

A `stream_end` event closes the SSE stream when the run reaches a terminal state.

## Running

```bash
pip install -e packages/coterie-api
coterie-api --reload   # uvicorn on http://127.0.0.1:8000
```

Env:
- `COTERIE_API_HOST` (default `127.0.0.1`)
- `COTERIE_API_PORT` (default `8000`)
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GROQ_API_KEY` / `XAI_API_KEY` — passed through
  to the underlying `coterie` graph for LLM-driven nodes
- `COTERIE_LLM_PROVIDER` — force a provider (overrides model-name inference)

## Persistence

SQLite at `~/.coterie/runs.sqlite`. Two tables: `runs` (one row per run) and `events`
(append-only event log keyed by `(run_id, seq)`). New SSE subscribers replay the
event log from the store, then attach to live events from an in-process broadcast
queue.

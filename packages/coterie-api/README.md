# coterie-api

FastAPI HTTP server fronting the Coterie graph runner. Powers the
[coterie-web](../coterie-web) dashboard.

## Endpoints

```
GET    /api/health                  liveness; unauthenticated
GET    /api/modes                   list registered modes
GET    /api/agents                  list registered adapters
POST   /api/runs                    create a new run
GET    /api/runs?limit=&offset=     paginated list of runs (most recent first)
GET    /api/runs/{id}               current + final state, config, runs, history
DELETE /api/runs/{id}               remove a run + its event log
POST   /api/runs/{id}/resume        HIL approve/reject when paused at a checkpoint
GET    /api/runs/{id}/events        Server-Sent Events stream

GET    /api/auth/token              show the current token (auth'd)
POST   /api/auth/rotate             generate a new token (auth'd)
```

## SSE event kinds

- `state` — full state snapshot. Fired on every LangGraph chunk; canonical
  event for live visualizations.
- `status_change` — `{status}`.
- `spend_update` — `{spend_usd}`.
- `agent_run` — per CLI invocation: agent_id, role, exit_code, duration_s,
  cost_estimate_usd, stdout_preview.
- `judge_decision` — judge verdict payloads.
- `checkpoint` — `{next_nodes, state}` when the graph pauses at an HIL gate.
- `done` — terminal. Stream closes after this.
- `error` — `{message, traceback}` if the runner blew up.

## Running

```bash
pip install -e packages/coterie-api
coterie-api --reload        # uvicorn on http://127.0.0.1:8000
```

## Auth

Single bearer token gates every non-`/health` endpoint. Auto-generated at
`~/.coterie/api-token` (mode 600) on first start. Clients send
`Authorization: Bearer <token>`. EventSource (which can't set headers) also
accepts `?token=…` in the query string.

Localhost skips auth when `COTERIE_API_ALLOW_LOCALHOST=1` (default on).

## Config (env)

| Var | Default | Effect |
|---|---|---|
| `COTERIE_API_HOST` | `127.0.0.1` | uvicorn bind host |
| `COTERIE_API_PORT` | `8000` | uvicorn port |
| `COTERIE_DB_PATH` | `~/.coterie/runs.sqlite` | SQLite location |
| `COTERIE_API_TOKEN` | (file) | Override the on-disk token |
| `COTERIE_API_TOKEN_PATH` | `~/.coterie/api-token` | Token file location |
| `COTERIE_API_ALLOW_LOCALHOST` | `1` | Skip auth from `127.0.0.1` |
| `COTERIE_RUN_TTL_DAYS` | `30` | Delete runs older than this. `0` disables |
| `COTERIE_CLEANUP_INTERVAL_S` | `3600` | How often the cleanup loop runs |

Plus standard LLM provider keys: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`GROQ_API_KEY`, `XAI_API_KEY`. `COTERIE_LLM_PROVIDER` forces a provider.

## Persistence

SQLite at `~/.coterie/runs.sqlite`. Two tables:

- `runs` — one row per run. Includes `current_state_json` (snapshot updated on
  every chunk during execution) and `final_state_json` (set when the run
  terminates).
- `events` — append-only event log keyed by `(run_id, seq)`. `ON DELETE
  CASCADE` so deleting a run removes its events.

SSE subscribers replay history from the store, then attach to live broadcast
queues.

## Tests

```bash
.venv/bin/pytest packages/coterie-api/tests/ -v
# 9 tests covering health, auth, pagination, delete/resume 404s, token
# rotation, and a full fake-adapter run going queued → running → done.
```

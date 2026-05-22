"""FastAPI app.

Endpoints:
- GET  /api/health          — basic liveness
- GET  /api/modes           — list available modes
- GET  /api/agents          — list registered adapters from ADAPTER_REGISTRY
- POST /api/runs            — create a new run
- GET  /api/runs            — list runs (most recent first)
- GET  /api/runs/{id}       — get a single run
- GET  /api/runs/{id}/events — Server-Sent Events stream
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

# Importing this triggers all @register_adapter / @register_mode side effects.
import coterie  # noqa: F401
from coterie.core.registry import ADAPTER_REGISTRY, MODE_REGISTRY

from coterie_api.models import CreateRunRequest, RunDetail, RunSummary
from coterie_api.runner import Runner
from coterie_api.store import Store


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = Path.home() / ".coterie" / "runs.sqlite"
    app.state.store = Store(db)
    app.state.runner = Runner(app.state.store)
    yield


app = FastAPI(title="Coterie API", version="0.1.0", lifespan=lifespan)

# CORS — allow the local dev coterie-web origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- basic ----------


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/modes")
async def modes() -> list[str]:
    return MODE_REGISTRY.names()


@app.get("/api/agents")
async def agents() -> list[dict[str, str]]:
    return [{"name": n} for n in ADAPTER_REGISTRY.names()]


# ---------- runs ----------


@app.post("/api/runs", response_model=RunSummary)
async def create_run(req: CreateRunRequest) -> RunSummary:
    runner: Runner = app.state.runner
    run_id = await runner.create_run(task=req.task, mode=req.mode, config=req.config)
    run = app.state.store.get_run(run_id)
    return _to_summary(run)


@app.get("/api/runs", response_model=list[RunSummary])
async def list_runs() -> list[RunSummary]:
    return [_to_summary(r) for r in app.state.store.list_runs()]


@app.get("/api/runs/{run_id}", response_model=RunDetail)
async def get_run(run_id: str) -> RunDetail:
    run = app.state.store.get_run(run_id)
    if run is None:
        raise HTTPException(404, f"run {run_id} not found")
    final = run.get("final_state") or {}
    return RunDetail(
        summary=_to_summary(run),
        config=run["config"],
        runs=final.get("runs", []),
        route_history=final.get("route_history", []),
        judge_history=final.get("judge_history", []),
        mode_state=final.get("mode_state", {}),
        final_state=final,
    )


@app.get("/api/runs/{run_id}/events")
async def stream_events(run_id: str):
    runner: Runner = app.state.runner

    async def event_generator():
        async for ev in runner.subscribe(run_id):
            yield {
                "event": ev["kind"],
                "data": json.dumps(ev["data"], default=str),
            }

    return EventSourceResponse(event_generator())


# ---------- helpers ----------


def _to_summary(run: dict) -> RunSummary:
    config = run["config"]
    agents_list = [a["id"] for a in config.get("agents", [])]
    return RunSummary(
        id=run["id"],
        task=run["task"],
        mode=run["mode"],
        status=run["status"],
        status_reason=run.get("status_reason"),
        agents=agents_list,
        spend_usd=run["spend_usd"] or 0.0,
        duration_s=run.get("duration_s"),
        created_at=_parse_dt(run["created_at"]),
        updated_at=_parse_dt(run["updated_at"]),
    )


def _parse_dt(s: str) -> datetime:
    return datetime.fromisoformat(s).astimezone(timezone.utc)

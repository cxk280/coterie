"""FastAPI app.

Endpoints
---------
GET    /api/health                 — liveness; no auth
GET    /api/modes                  — list registered modes
GET    /api/agents                 — list registered adapters
POST   /api/runs                   — create a new run
GET    /api/runs?limit=&offset=    — paginated list of runs (most recent first)
GET    /api/runs/{id}              — get a single run (current + final state)
DELETE /api/runs/{id}              — delete a run + its events
POST   /api/runs/{id}/resume       — approve / reject at an HIL checkpoint
GET    /api/runs/{id}/events       — Server-Sent Events stream

GET    /api/auth/token             — show the current token (auth'd)
POST   /api/auth/rotate            — generate a new token (auth'd)
"""

from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

import coterie  # noqa: F401
from coterie.core.registry import ADAPTER_REGISTRY, MODE_REGISTRY

from coterie_api.auth import auth_required, current_token, rotate_token
from coterie_api.models import (
    CreateRunRequest,
    ResumeRequest,
    RunDetail,
    RunListResponse,
    RunSummary,
)
from coterie_api.runner import Runner
from coterie_api.store import Store, cutoff_for

TTL_DAYS = int(os.environ.get("COTERIE_RUN_TTL_DAYS", "30"))
CLEANUP_INTERVAL_S = int(os.environ.get("COTERIE_CLEANUP_INTERVAL_S", "3600"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = Path(os.environ.get("COTERIE_DB_PATH", Path.home() / ".coterie" / "runs.sqlite"))
    app.state.store = Store(db)
    app.state.runner = Runner(app.state.store)

    cleanup_task: asyncio.Task | None = None
    if TTL_DAYS > 0:
        cleanup_task = asyncio.create_task(_cleanup_loop(app.state.store))

    try:
        yield
    finally:
        if cleanup_task is not None:
            cleanup_task.cancel()
            try:
                await cleanup_task
            except (asyncio.CancelledError, Exception):
                pass


async def _cleanup_loop(store: Store) -> None:
    while True:
        try:
            cutoff = cutoff_for(TTL_DAYS)
            removed = store.delete_runs_older_than(cutoff)
            if removed:
                print(f"coterie-api: cleaned up {removed} runs older than {TTL_DAYS}d")
        except Exception as e:  # noqa: BLE001
            print(f"coterie-api: cleanup error: {e}")
        await asyncio.sleep(CLEANUP_INTERVAL_S)


app = FastAPI(title="Coterie API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- unauth ----------


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


# ---------- registries ----------


@app.get("/api/modes", dependencies=[Depends(auth_required)])
async def modes() -> list[str]:
    return MODE_REGISTRY.names()


@app.get("/api/agents", dependencies=[Depends(auth_required)])
async def agents() -> list[dict[str, str]]:
    return [{"name": n} for n in ADAPTER_REGISTRY.names()]


# ---------- runs ----------


@app.post("/api/runs", response_model=RunSummary, dependencies=[Depends(auth_required)])
async def create_run(req: CreateRunRequest) -> RunSummary:
    runner: Runner = app.state.runner
    run_id = await runner.create_run(task=req.task, mode=req.mode, config=req.config)
    run = app.state.store.get_run(run_id)
    return _to_summary(run)


@app.get("/api/runs", response_model=RunListResponse, dependencies=[Depends(auth_required)])
async def list_runs(
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> RunListResponse:
    rows = app.state.store.list_runs(limit=limit, offset=offset)
    total = app.state.store.count_runs()
    return RunListResponse(
        items=[_to_summary(r) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@app.get("/api/runs/{run_id}", response_model=RunDetail, dependencies=[Depends(auth_required)])
async def get_run(run_id: str) -> RunDetail:
    run = app.state.store.get_run(run_id)
    if run is None:
        raise HTTPException(404, f"run {run_id} not found")
    state = run.get("current_state") or run.get("final_state") or {}
    return RunDetail(
        summary=_to_summary(run),
        config=run["config"],
        runs=state.get("runs", []),
        route_history=state.get("route_history", []),
        judge_history=state.get("judge_history", []),
        mode_state=state.get("mode_state", {}),
        final_state=run.get("final_state"),
        current_state=run.get("current_state"),
    )


@app.delete("/api/runs/{run_id}", dependencies=[Depends(auth_required)])
async def delete_run(run_id: str) -> dict[str, str]:
    ok = app.state.store.delete_run(run_id)
    if not ok:
        raise HTTPException(404, f"run {run_id} not found")
    return {"status": "deleted", "id": run_id}


@app.post("/api/runs/{run_id}/resume", dependencies=[Depends(auth_required)])
async def resume_run(run_id: str, req: ResumeRequest) -> dict[str, str]:
    ok = await app.state.runner.resume_run(run_id, approve=req.decision == "approve")
    if not ok:
        raise HTTPException(404, f"run {run_id} has no resumable handle")
    return {"status": "resumed" if req.decision == "approve" else "rejected", "id": run_id}


@app.get("/api/runs/{run_id}/events", dependencies=[Depends(auth_required)])
async def stream_events(run_id: str):
    runner: Runner = app.state.runner

    async def event_generator():
        async for ev in runner.subscribe(run_id):
            yield {"event": ev["kind"], "data": json.dumps(ev["data"], default=str)}

    return EventSourceResponse(event_generator())


# ---------- auth ----------


@app.get("/api/auth/token", dependencies=[Depends(auth_required)])
async def get_token() -> dict[str, str]:
    return {"token": current_token()}


@app.post("/api/auth/rotate", dependencies=[Depends(auth_required)])
async def rotate() -> dict[str, str]:
    return {"token": rotate_token()}


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

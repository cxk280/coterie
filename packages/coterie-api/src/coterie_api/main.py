"""FastAPI app.

See packages/coterie-api/README.md for the endpoint reference. Authentication
is resolved via the auth.resolve_user dependency for every route except
/api/health.
"""

from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from sse_starlette.sse import EventSourceResponse

import coterie  # noqa: F401  (trigger registry side effects)
from coterie.core.registry import ADAPTER_REGISTRY, MODE_REGISTRY

from coterie_api import oauth
from coterie_api.auth import (
    SESSION_COOKIE,
    auth_required,
    current_token,
    current_user,
    ensure_owner_or_admin,
    rotate_token,
)
from coterie_api.models import (
    CreateRunRequest,
    CreateTokenRequest,
    CreateTokenResponse,
    MeResponse,
    ResumeRequest,
    RunDetail,
    RunListResponse,
    RunSummary,
    TokenSummary,
)
from coterie_api.runner import Runner
from coterie_api.store import Store, cutoff_for
from coterie_api.users import (
    User,
    create_token,
    delete_session,
    list_tokens,
    purge_expired_sessions,
    revoke_token,
)

TTL_DAYS = int(os.environ.get("COTERIE_RUN_TTL_DAYS", "30"))
EVENT_TTL_DAYS = int(os.environ.get("COTERIE_EVENT_TTL_DAYS", "7"))
CLEANUP_INTERVAL_S = int(os.environ.get("COTERIE_CLEANUP_INTERVAL_S", "3600"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Tracing setup runs first so the Runner + every downstream call is
    # captured. setup_tracing is idempotent.
    from coterie.observability import setup_tracing

    setup_tracing(service_name="coterie-api")
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        FastAPIInstrumentor.instrument_app(app)
    except Exception:  # noqa: BLE001
        pass

    db = Path(os.environ.get("COTERIE_DB_PATH", Path.home() / ".coterie" / "runs.sqlite"))
    app.state.store = Store(db)
    app.state.runner = Runner(app.state.store)
    restored = app.state.runner.restore_paused_handles()
    if restored:
        print(f"coterie-api: restored {restored} paused run handle(s) on startup")

    cleanup_task: asyncio.Task | None = None
    if TTL_DAYS > 0 or EVENT_TTL_DAYS > 0:
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
            if TTL_DAYS > 0:
                cutoff = cutoff_for(TTL_DAYS)
                removed = store.delete_runs_older_than(cutoff)
                if removed:
                    print(f"coterie-api: cleaned up {removed} runs older than {TTL_DAYS}d")
            if EVENT_TTL_DAYS > 0:
                ev_cutoff = cutoff_for(EVENT_TTL_DAYS)
                ev_removed = store.delete_events_older_than(ev_cutoff)
                if ev_removed:
                    print(f"coterie-api: pruned {ev_removed} events older than {EVENT_TTL_DAYS}d")
            purged = purge_expired_sessions(store)
            if purged:
                print(f"coterie-api: purged {purged} expired session(s)")
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
async def health() -> dict[str, object]:
    return {
        "status": "ok",
        "github_oauth": oauth.github_enabled(),
    }


# ---------- registries ----------


@app.get("/api/modes")
async def modes(_: User = Depends(current_user)) -> list[str]:
    return MODE_REGISTRY.names()


@app.get("/api/agents")
async def agents(_: User = Depends(current_user)) -> list[dict[str, str]]:
    return [{"name": n} for n in ADAPTER_REGISTRY.names()]


# ---------- runs ----------


@app.post("/api/runs", response_model=RunSummary)
async def create_run(req: CreateRunRequest, user: User = Depends(current_user)) -> RunSummary:
    runner: Runner = app.state.runner
    run_id = await runner.create_run(
        task=req.task, mode=req.mode, config=req.config, owner_id=user.id
    )
    run = app.state.store.get_run(run_id)
    return _to_summary(run)


@app.get("/api/runs", response_model=RunListResponse)
async def list_runs(
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    mode: Annotated[str | None, Query()] = None,
    status: Annotated[str | None, Query()] = None,
    user: User = Depends(current_user),
) -> RunListResponse:
    owner_filter = None if user.is_admin else user.id
    rows = app.state.store.list_runs(
        limit=limit, offset=offset, mode=mode, status=status, owner_id=owner_filter
    )
    total = app.state.store.count_runs(mode=mode, status=status, owner_id=owner_filter)
    return RunListResponse(
        items=[_to_summary(r) for r in rows], total=total, limit=limit, offset=offset
    )


@app.get("/api/runs/{run_id}", response_model=RunDetail)
async def get_run(run_id: str, user: User = Depends(current_user)) -> RunDetail:
    run = app.state.store.get_run(run_id)
    if run is None:
        raise HTTPException(404, f"run {run_id} not found")
    ensure_owner_or_admin(owner_id=run.get("owner_id"), user=user)
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


@app.delete("/api/runs/{run_id}")
async def delete_run(run_id: str, user: User = Depends(current_user)) -> dict[str, str]:
    run = app.state.store.get_run(run_id)
    if run is None:
        raise HTTPException(404, f"run {run_id} not found")
    ensure_owner_or_admin(owner_id=run.get("owner_id"), user=user)
    app.state.store.delete_run(run_id)
    return {"status": "deleted", "id": run_id}


@app.post("/api/runs/{run_id}/compact")
async def compact_run(run_id: str, user: User = Depends(current_user)) -> dict[str, int | str]:
    run = app.state.store.get_run(run_id)
    if run is None:
        raise HTTPException(404, f"run {run_id} not found")
    ensure_owner_or_admin(owner_id=run.get("owner_id"), user=user)
    removed = app.state.store.compact_events(run_id)
    return {"id": run_id, "events_removed": removed}


@app.post("/api/runs/{run_id}/resume")
async def resume_run(
    run_id: str, req: ResumeRequest, user: User = Depends(current_user)
) -> dict[str, str]:
    run = app.state.store.get_run(run_id)
    if run is None:
        raise HTTPException(404, f"run {run_id} not found")
    ensure_owner_or_admin(owner_id=run.get("owner_id"), user=user)
    ok = await app.state.runner.resume_run(run_id, approve=req.decision == "approve")
    if not ok:
        raise HTTPException(404, f"run {run_id} has no resumable handle")
    return {"status": "resumed" if req.decision == "approve" else "rejected", "id": run_id}


@app.get("/api/runs/{run_id}/events")
async def stream_events(run_id: str, user: User = Depends(current_user)):
    run = app.state.store.get_run(run_id)
    if run is None:
        raise HTTPException(404, f"run {run_id} not found")
    ensure_owner_or_admin(owner_id=run.get("owner_id"), user=user)
    runner: Runner = app.state.runner

    async def event_generator():
        async for ev in runner.subscribe(run_id):
            yield {"event": ev["kind"], "data": json.dumps(ev["data"], default=str)}

    return EventSourceResponse(event_generator())


# ---------- auth (general) ----------


@app.get("/api/auth/me", response_model=MeResponse)
async def me(user: User = Depends(current_user)) -> MeResponse:
    return MeResponse(
        id=user.id,
        kind=user.kind,
        login=user.github_login,
        name=user.name,
        avatar_url=user.avatar_url,
        is_admin=user.is_admin,
    )


@app.post("/api/auth/logout")
async def logout(request: Request):
    cookie = request.cookies.get(SESSION_COOKIE)
    if cookie:
        delete_session(app.state.store, cookie)
    resp = JSONResponse({"status": "logged_out"})
    resp.delete_cookie(SESSION_COOKIE)
    return resp


# ---------- legacy token (back-compat) ----------


@app.get("/api/auth/token")
async def get_token(_: User = Depends(auth_required)) -> dict[str, str]:
    return {"token": current_token()}


@app.post("/api/auth/rotate")
async def rotate(_: User = Depends(auth_required)) -> dict[str, str]:
    return {"token": rotate_token()}


# ---------- personal access tokens ----------


@app.get("/api/auth/tokens", response_model=list[TokenSummary])
async def my_tokens(user: User = Depends(current_user)) -> list[TokenSummary]:
    return [
        TokenSummary(
            id=t.id,
            name=t.name,
            prefix=t.prefix,
            created_at=t.created_at,
            last_used_at=t.last_used_at,
            revoked=t.revoked_at is not None,
        )
        for t in list_tokens(app.state.store, user.id)
    ]


@app.post("/api/auth/tokens", response_model=CreateTokenResponse)
async def create_token_route(
    req: CreateTokenRequest, user: User = Depends(current_user)
) -> CreateTokenResponse:
    rec, secret = create_token(app.state.store, user.id, req.name)
    return CreateTokenResponse(
        id=rec.id,
        name=rec.name,
        prefix=rec.prefix,
        token=secret,
        created_at=rec.created_at,
    )


@app.delete("/api/auth/tokens/{token_id}")
async def revoke_token_route(token_id: str, user: User = Depends(current_user)) -> dict[str, str]:
    ok = revoke_token(app.state.store, user.id, token_id)
    if not ok:
        raise HTTPException(404, f"token {token_id} not found or already revoked")
    return {"status": "revoked", "id": token_id}


# ---------- GitHub OAuth ----------


@app.get("/api/auth/github/login")
async def github_login(request: Request, next: Annotated[str | None, Query()] = None):
    return oauth.login_redirect(request, next_path=next)


@app.get("/api/auth/github/callback")
async def github_callback(
    request: Request,
    code: Annotated[str | None, Query()] = None,
    state: Annotated[str | None, Query()] = None,
):
    return await oauth.callback(request, code, state)


# ---------- helpers ----------


def _to_summary(run: dict) -> RunSummary:
    from coterie.observability import trace_url_for

    config = run["config"]
    agents_list = [a["id"] for a in config.get("agents", [])]
    trace_id = run.get("trace_id")
    return RunSummary(
        id=run["id"],
        task=run["task"],
        mode=run["mode"],
        status=run["status"],
        status_reason=run.get("status_reason"),
        agents=agents_list,
        spend_usd=run["spend_usd"] or 0.0,
        duration_s=run.get("duration_s"),
        owner_id=run.get("owner_id"),
        trace_id=trace_id,
        trace_url=trace_url_for(trace_id),
        created_at=_parse_dt(run["created_at"]),
        updated_at=_parse_dt(run["updated_at"]),
    )


def _parse_dt(s: str) -> datetime:
    return datetime.fromisoformat(s).astimezone(timezone.utc)

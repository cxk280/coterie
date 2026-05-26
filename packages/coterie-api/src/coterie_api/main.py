"""FastAPI app.

See packages/coterie-api/README.md for the endpoint reference. Authentication
is resolved via the auth.resolve_user dependency for every route except
/api/health.
"""

from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager, suppress
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

import coterie  # noqa: F401  (trigger registry side effects)
from coterie.core.registry import ADAPTER_REGISTRY, MODE_REGISTRY
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

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
    ProviderTestRequest,
    ProviderTestResponse,
    ResumeRequest,
    RunDetail,
    RunListResponse,
    RunSummary,
    TokenSummary,
)
from coterie_api.quotas import check_budget
from coterie_api.rate_limit import limiter
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
    # Logging + tracing both run before anything else so every downstream call
    # is captured with structured fields. Both are idempotent.
    from coterie_api.logging_setup import setup_logging

    setup_logging()

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
            with suppress(asyncio.CancelledError, Exception):
                await cleanup_task


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
            # Reset stale daily-budget windows (older than 24h).
            window_cutoff = cutoff_for(1)
            reset = store.reset_user_quota_periods(cutoff=window_cutoff)
            if reset:
                print(f"coterie-api: reset {reset} user budget window(s)")
        except Exception as e:  # noqa: BLE001
            print(f"coterie-api: cleanup error: {e}")
        await asyncio.sleep(CLEANUP_INTERVAL_S)


app = FastAPI(title="Coterie API", version="0.1.0", lifespan=lifespan)

# Uniform {error, code, request_id, detail} envelope for every error path,
# including the slowapi 429 (RateLimitExceeded) handler.
from coterie_api.errors import install_error_handlers  # noqa: E402

install_error_handlers(app)

# slowapi: attach the shared limiter + middleware.
from slowapi.middleware import SlowAPIMiddleware  # noqa: E402

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

from coterie_api.logging_setup import RequestIdMiddleware  # noqa: E402

app.add_middleware(RequestIdMiddleware)

# CORS — allowlist driven by env var (comma-separated origins) so deployments
# can dial in their own. Defaults to the local dev origins.
_CORS_DEFAULT = "http://localhost:3000,http://127.0.0.1:3000"
_cors_origins = [o.strip() for o in os.environ.get("COTERIE_CORS_ORIGINS", _CORS_DEFAULT).split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- unauth ----------


@app.get("/api/health")
async def health() -> dict[str, object]:
    """Readiness probe. Verifies the SQLite store is reachable + reports feature flags."""
    db_ok = True
    try:
        app.state.store.count_runs()
    except Exception:  # noqa: BLE001
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "version": "0.1.0",
        "github_oauth": oauth.github_enabled(),
        "tracing": bool(os.environ.get("LANGFUSE_PUBLIC_KEY"))
        or bool(os.environ.get("LANGSMITH_API_KEY"))
        or bool(os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")),
        "db": "ok" if db_ok else "unreachable",
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
@limiter.limit(os.environ.get("COTERIE_RATE_LIMIT_CREATE_RUN", "30/minute"))
async def create_run(
    request: Request, req: CreateRunRequest, user: User = Depends(current_user)
) -> RunSummary:
    # Enforce the per-user daily budget before scheduling any work.
    check_budget(app.state.store, user)
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


@app.post("/api/auth/providers/test", response_model=ProviderTestResponse)
@limiter.limit(os.environ.get("COTERIE_RATE_LIMIT_PROVIDER_TEST", "10/minute"))
async def test_provider_route(
    request: Request, req: ProviderTestRequest, _: User = Depends(current_user)
) -> ProviderTestResponse:
    """Validate a provider API key with a cheap, auth-only probe. The key is
    used only for the probe — never stored or logged."""
    from coterie_api.providers import test_provider_key

    ok, detail = await asyncio.to_thread(test_provider_key, req.provider, req.api_key)
    return ProviderTestResponse(ok=ok, detail=detail)


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
    return datetime.fromisoformat(s).astimezone(UTC)

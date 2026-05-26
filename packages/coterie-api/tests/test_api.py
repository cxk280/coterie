"""End-to-end smoke tests for coterie-api.

Run with:
    cd packages/coterie-py && .venv/bin/pytest ../coterie-api/tests/ -v

Uses an in-memory store (override COTERIE_DB_PATH per test) so it doesn't touch
the user's real ~/.coterie/runs.sqlite.
"""

import os

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path):
    os.environ["COTERIE_DB_PATH"] = str(tmp_path / "test.sqlite")
    os.environ["COTERIE_API_TOKEN_PATH"] = str(tmp_path / "token")
    os.environ["COTERIE_CHECKPOINT_DB"] = str(tmp_path / "checkpoints.sqlite")
    os.environ["COTERIE_RUN_TTL_DAYS"] = "0"
    os.environ["COTERIE_EVENT_TTL_DAYS"] = "0"
    os.environ["COTERIE_API_ALLOW_LOCALHOST"] = "0"  # force auth-required behavior in tests
    import coterie_api.auth as auth_mod

    auth_mod._cached_legacy = None
    from coterie_api.main import app
    from coterie_api.rate_limit import limiter

    # slowapi's in-memory store persists across tests in the same process. Reset
    # so a flood test doesn't poison the bucket for subsequent runs against the
    # same user id.
    limiter.reset()

    with TestClient(app) as c:
        yield c

    limiter.reset()


def auth(client):
    from coterie_api.auth import current_token
    return {"Authorization": f"Bearer {current_token()}"}


def test_health_is_unauth(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    payload = r.json()
    assert payload["status"] == "ok"
    assert "github_oauth" in payload


def test_modes_requires_auth(client):
    # TestClient host is "testclient" — not localhost — so auth applies.
    r = client.get("/api/modes")
    assert r.status_code == 401
    body = r.json()
    assert body["error"] == "unauthorized"
    assert body["code"] == 401
    assert body["request_id"]
    assert r.headers["X-Request-Id"] == body["request_id"]


def test_modes_authenticated(client):
    r = client.get("/api/modes", headers=auth(client))
    assert r.status_code == 200
    assert set(r.json()) == {"single", "consensus", "adversarial", "debate", "tournament"}


def test_query_string_token_for_sse(client):
    from coterie_api.auth import current_token
    r = client.get(f"/api/modes?token={current_token()}")
    assert r.status_code == 200


def test_runs_pagination(client):
    r = client.get("/api/runs?limit=10", headers=auth(client))
    assert r.status_code == 200
    payload = r.json()
    assert payload["limit"] == 10
    assert payload["offset"] == 0
    assert isinstance(payload["items"], list)
    assert "total" in payload


def test_delete_missing_run_returns_404(client):
    r = client.delete("/api/runs/nope", headers=auth(client))
    assert r.status_code == 404
    body = r.json()
    assert body["error"] == "not_found"
    assert body["code"] == 404
    assert body["request_id"] and r.headers["X-Request-Id"] == body["request_id"]


def test_validation_error_envelope(client):
    """A malformed create-run body returns the uniform 422 envelope."""
    r = client.post("/api/runs", headers=auth(client), json={"mode": "single"})
    assert r.status_code == 422
    body = r.json()
    assert body["error"] == "validation_error"
    assert body["code"] == 422
    assert body["request_id"]
    # detail carries the structured pydantic validation errors.
    assert isinstance(body["detail"], list) and body["detail"]


def test_resume_missing_run_returns_404(client):
    r = client.post(
        "/api/runs/nope/resume",
        headers=auth(client),
        json={"decision": "approve"},
    )
    assert r.status_code == 404


def test_token_rotate(client):
    h = auth(client)
    before = client.get("/api/auth/token", headers=h).json()["token"]
    after = client.post("/api/auth/rotate", headers=h).json()["token"]
    assert before != after
    # The old header should now fail.
    r = client.get("/api/modes", headers=h)
    assert r.status_code == 401


def test_create_run_with_fake_adapter(client):
    """Smoke: kick off a run with the fake adapter (no API key needed) and let it complete."""
    import time

    from coterie.adapters.base import AdapterResult
    from coterie.adapters.fake import FakeAdapter

    FakeAdapter.reset_all()
    FakeAdapter.script("a", [AdapterResult("hi", "", 0, cost_estimate_usd=0.01)])

    cfg = {
        "version": 1,
        "agents": [{"id": "a", "adapter": "fake"}],
        "router": {"enabled": False},
    }
    r = client.post(
        "/api/runs",
        headers=auth(client),
        json={"task": "say hi", "mode": "single", "config": cfg},
    )
    assert r.status_code == 200, r.text
    run_id = r.json()["id"]

    # Poll until terminal.
    for _ in range(50):
        r = client.get(f"/api/runs/{run_id}", headers=auth(client))
        if r.json()["summary"]["status"] in ("done", "failed"):
            break
        time.sleep(0.1)

    detail = r.json()
    assert detail["summary"]["status"] == "done"
    assert detail["summary"]["spend_usd"] == pytest.approx(0.01, rel=1e-3)
    assert len(detail["runs"]) == 1
    assert detail["runs"][0]["agent_id"] == "a"


def test_runs_filter_by_mode(client):
    """list_runs?mode= filters by mode."""
    import time

    from coterie.adapters.base import AdapterResult
    from coterie.adapters.fake import FakeAdapter

    FakeAdapter.reset_all()
    FakeAdapter.script("a", [AdapterResult("hi", "", 0, cost_estimate_usd=0.0)] * 3)

    cfg = {
        "version": 1,
        "agents": [{"id": "a", "adapter": "fake"}],
        "router": {"enabled": False},
    }
    r = client.post(
        "/api/runs",
        headers=auth(client),
        json={"task": "single", "mode": "single", "config": cfg},
    )
    assert r.status_code == 200
    sid = r.json()["id"]

    for _ in range(50):
        if client.get(f"/api/runs/{sid}", headers=auth(client)).json()["summary"]["status"] in ("done", "failed"):
            break
        time.sleep(0.1)

    single = client.get("/api/runs?mode=single", headers=auth(client)).json()
    consensus = client.get("/api/runs?mode=consensus", headers=auth(client)).json()
    assert single["total"] >= 1
    assert consensus["total"] == 0


def test_compact_run_auto_runs_on_terminal(client):
    """After a run terminates, the runner auto-compacts so a manual compact removes zero rows."""
    import time

    from coterie.adapters.base import AdapterResult
    from coterie.adapters.fake import FakeAdapter

    FakeAdapter.reset_all()
    FakeAdapter.script("a", [AdapterResult("hi", "", 0, cost_estimate_usd=0.005)])

    cfg = {
        "version": 1,
        "agents": [{"id": "a", "adapter": "fake"}],
        "router": {"enabled": False},
    }
    r = client.post(
        "/api/runs",
        headers=auth(client),
        json={"task": "compact me", "mode": "single", "config": cfg},
    )
    rid = r.json()["id"]

    for _ in range(50):
        if client.get(f"/api/runs/{rid}", headers=auth(client)).json()["summary"]["status"] in ("done", "failed"):
            break
        time.sleep(0.1)

    r = client.post(f"/api/runs/{rid}/compact", headers=auth(client))
    assert r.status_code == 200
    assert r.json()["events_removed"] == 0


def test_runner_uses_persistent_checkpointer(client):
    """Smoke: the runner holds a SqliteSaver (not the in-memory variant)."""
    from coterie_api.main import app
    from langgraph.checkpoint.sqlite import SqliteSaver

    assert isinstance(app.state.runner._checkpointer, SqliteSaver)


def test_create_run_402_when_user_over_daily_budget(client, monkeypatch):
    """A non-admin user with their daily cap exhausted gets a clean 402."""
    monkeypatch.setenv("COTERIE_DEFAULT_DAILY_CAP_USD", "0.01")

    # Manually create a 'dev' user that is NOT admin by injecting a session.
    from coterie_api.main import app
    from coterie_api.users import create_session, upsert_github_user

    store = app.state.store
    gh_user = upsert_github_user(
        store, github_id=999, login="testuser", name="Test User", avatar_url=None
    )
    session_id = create_session(store, gh_user.id)
    cookies = {"coterie_session": session_id}

    # Pre-load the user's quota table so the budget cap is set.
    store.upsert_user_quota(gh_user.id, 0.01)
    store.increment_user_spend(gh_user.id, 0.02)  # blow past the cap

    r = client.post(
        "/api/runs",
        cookies=cookies,
        json={"task": "anything", "mode": "single", "config": {"version": 1, "agents": []}},
    )
    assert r.status_code == 402, r.text
    detail = r.json()["detail"]
    assert detail["error"] == "daily_budget_exceeded"
    assert detail["cap_usd"] == 0.01


def test_rate_limit_returns_429(client, monkeypatch):
    """Hit /api/runs above the configured rate limit → 429 with Retry-After."""
    monkeypatch.setenv("COTERIE_RATE_LIMIT_CREATE_RUN", "2/minute")
    # Force a re-read of the limit by importing fresh

    # The rate limiter caches the limit string when the route was registered, so
    # this test really verifies the SlowAPI middleware emits 429s — using the
    # production default ("30/minute") and hammering past it.
    overflow = 32
    statuses: list[int] = []
    for i in range(overflow):
        r = client.post(
            "/api/runs",
            headers=auth(client),
            json={
                "task": f"flood-{i}",
                "mode": "single",
                "config": {
                    "version": 1,
                    "agents": [{"id": "a", "adapter": "fake"}],
                    "router": {"enabled": False},
                },
            },
        )
        statuses.append(r.status_code)
        if r.status_code == 429:
            assert "Retry-After" in r.headers
            break
    assert 429 in statuses, f"expected at least one 429 across {overflow} attempts; saw {statuses}"


def test_create_run_503_when_at_capacity(client):
    """When the runner's in-flight set is saturated, create_run sheds load with
    a 503 (uniform envelope + Retry-After) rather than queueing unbounded."""
    from coterie_api.main import app

    runner = app.state.runner
    runner._max_inflight = 1
    runner._inflight_runs = {"already-running"}

    r = client.post(
        "/api/runs",
        headers=auth(client),
        json={
            "task": "over capacity",
            "mode": "single",
            "config": {
                "version": 1,
                "agents": [{"id": "a", "adapter": "fake"}],
                "router": {"enabled": False},
            },
        },
    )
    assert r.status_code == 503
    body = r.json()
    assert body["error"] == "unavailable"
    assert body["code"] == 503
    assert body["request_id"]
    assert r.headers.get("Retry-After") == "5"


def test_run_carries_trace_id_when_tracing_enabled(client, monkeypatch, tmp_path):
    """With an InMemorySpanExporter wired into coterie's tracer, the runner
    captures a trace_id, persists it on the row, and surfaces it on the API
    response.
    """
    import time

    from coterie.adapters.base import AdapterResult
    from coterie.adapters.fake import FakeAdapter
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
        InMemorySpanExporter,
    )

    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(InMemorySpanExporter()))
    import coterie.observability.tracer as tracer_mod

    monkeypatch.setattr(tracer_mod, "_tracer", provider.get_tracer("coterie"))

    FakeAdapter.reset_all()
    FakeAdapter.script("a", [AdapterResult("hi", "", 0, cost_estimate_usd=0.01)])

    cfg = {
        "version": 1,
        "agents": [{"id": "a", "adapter": "fake"}],
        "router": {"enabled": False},
    }
    r = client.post(
        "/api/runs",
        headers=auth(client),
        json={"task": "with-trace", "mode": "single", "config": cfg},
    )
    assert r.status_code == 200
    rid = r.json()["id"]

    for _ in range(50):
        body = client.get(f"/api/runs/{rid}", headers=auth(client)).json()
        if body["summary"]["status"] in ("done", "failed"):
            break
        time.sleep(0.1)

    summary = body["summary"]
    assert summary["trace_id"] is not None
    # 32-char hex (128-bit trace id) — sanity check format
    assert len(summary["trace_id"]) == 32
    int(summary["trace_id"], 16)  # parses as hex
    provider.shutdown()


# ---------- multi-user auth ----------


def test_me_returns_service_user_when_using_legacy_token(client):
    r = client.get("/api/auth/me", headers=auth(client))
    assert r.status_code == 200
    body = r.json()
    assert body["kind"] == "service"
    assert body["is_admin"] is True


def test_personal_access_token_round_trip(client):
    """Issue a PAT as the legacy/service user, then use it on a fresh client."""
    h = auth(client)
    # Create the token
    r = client.post("/api/auth/tokens", headers=h, json={"name": "my laptop"})
    assert r.status_code == 200
    body = r.json()
    pat = body["token"]
    assert pat.startswith("ck_")
    tid = body["id"]

    # Use it
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {pat}"})
    assert r.status_code == 200
    # PATs inherit the issuer (service user)
    assert r.json()["kind"] == "service"

    # List shows it
    rows = client.get("/api/auth/tokens", headers=h).json()
    assert any(t["id"] == tid for t in rows)
    assert all("token" not in t for t in rows)  # secrets never returned again

    # Revoke
    r = client.delete(f"/api/auth/tokens/{tid}", headers=h)
    assert r.status_code == 200
    # Revoked PAT no longer authenticates
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {pat}"})
    assert r.status_code == 401


def test_run_ownership_admin_sees_all(client):
    """Service user (admin) sees runs owned by anyone."""
    import time

    from coterie.adapters.base import AdapterResult
    from coterie.adapters.fake import FakeAdapter

    FakeAdapter.reset_all()
    FakeAdapter.script("a", [AdapterResult("hi", "", 0, cost_estimate_usd=0.01)])

    cfg = {
        "version": 1,
        "agents": [{"id": "a", "adapter": "fake"}],
        "router": {"enabled": False},
    }
    r = client.post(
        "/api/runs",
        headers=auth(client),
        json={"task": "owned by service", "mode": "single", "config": cfg},
    )
    rid = r.json()["id"]
    for _ in range(50):
        if client.get(f"/api/runs/{rid}", headers=auth(client)).json()["summary"]["status"] in ("done", "failed"):
            break
        time.sleep(0.1)

    # The service user sees it
    listed = client.get("/api/runs", headers=auth(client)).json()
    assert any(item["id"] == rid for item in listed["items"])
    # And it's owned by the service user
    detail = client.get(f"/api/runs/{rid}", headers=auth(client)).json()
    assert detail["summary"]["owner_id"] == "service-user"


def test_oauth_disabled_returns_503(client):
    """With no GITHUB_CLIENT_ID, the OAuth endpoints return a friendly 503."""
    r = client.get("/api/auth/github/login", headers=auth(client), follow_redirects=False)
    assert r.status_code == 503


def test_logout_clears_cookie(client):
    r = client.post("/api/auth/logout", headers=auth(client))
    assert r.status_code == 200
    assert r.json()["status"] == "logged_out"

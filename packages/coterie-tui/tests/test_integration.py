"""End-to-end test: spin up the API in a background thread, drive it with the
TUI client, verify a real run goes queued → running → done and the SSE stream
delivers structural events.

Skipped when the API package isn't importable (e.g. pure coterie-tui install).
"""

from __future__ import annotations

import socket
import threading
import time

import pytest


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def server(tmp_path, monkeypatch):
    pytest.importorskip("coterie_api")
    import uvicorn

    port = _free_port()
    monkeypatch.setenv("COTERIE_DB_PATH", str(tmp_path / "test.sqlite"))
    monkeypatch.setenv("COTERIE_API_TOKEN_PATH", str(tmp_path / "token"))
    monkeypatch.setenv("COTERIE_CHECKPOINT_DB", str(tmp_path / "ck.sqlite"))
    monkeypatch.setenv("COTERIE_RUN_TTL_DAYS", "0")
    monkeypatch.setenv("COTERIE_EVENT_TTL_DAYS", "0")
    monkeypatch.setenv("COTERIE_API_ALLOW_LOCALHOST", "1")

    # Reset cached legacy token so the test fixture's token path is read fresh
    import coterie_api.auth as auth_mod

    auth_mod._cached_legacy = None

    config = uvicorn.Config("coterie_api.main:app", host="127.0.0.1", port=port, log_level="error")
    srv = uvicorn.Server(config)
    thread = threading.Thread(target=srv.run, daemon=True)
    thread.start()

    # Poll the health endpoint instead of srv.started (which depends on lifespan timing).
    import httpx

    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        try:
            if httpx.get(f"http://127.0.0.1:{port}/api/health", timeout=0.5).status_code == 200:
                break
        except (httpx.ConnectError, httpx.ReadTimeout):
            time.sleep(0.1)
    else:
        pytest.fail("API server did not start in time")

    yield f"http://127.0.0.1:{port}"

    srv.should_exit = True
    thread.join(timeout=5)


def test_full_stack_run_via_tui_client(server):
    from coterie.adapters.base import AdapterResult
    from coterie.adapters.fake import FakeAdapter

    from coterie_tui.client import CoterieClient

    FakeAdapter.reset_all()
    FakeAdapter.script("a", [AdapterResult("hi from fake", "", 0, cost_estimate_usd=0.012)])

    with CoterieClient(base_url=server) as client:
        health = client.health()
        assert health["status"] == "ok"

        me = client.me()
        # Localhost-bypass auto-creates the dev user.
        assert me["kind"] == "dev"

        summary = client.create_run(
            task="say hi",
            mode="single",
            config={
                "version": 1,
                "agents": [{"id": "a", "adapter": "fake"}],
                "router": {"enabled": False},
            },
        )
        rid = summary["id"]

        # Stream events to completion
        kinds_seen: list[str] = []
        with client.stream_events(rid) as events:
            for ev in events:
                kinds_seen.append(ev["kind"])
                if ev["kind"] in ("done", "error", "stream_end"):
                    break

        assert "agent_run" in kinds_seen
        assert kinds_seen[-1] in ("done", "stream_end")

        detail = client.get_run(rid)
        assert detail["summary"]["status"] == "done"
        assert detail["summary"]["spend_usd"] > 0

        # Filter + paginate
        listed = client.list_runs(mode="single")
        assert any(item["id"] == rid for item in listed["items"])

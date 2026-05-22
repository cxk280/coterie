"""HTTP + SSE client for coterie-api.

The CLI is the only consumer; we keep it small (httpx + httpx-sse) and pass
through the same env vars the web client uses so a single ``COTERIE_API_TOKEN``
works for both.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator, Iterator
from contextlib import contextmanager
from typing import Any

import httpx
from httpx_sse import EventSource, connect_sse

DEFAULT_BASE = os.environ.get("COTERIE_API_URL") or os.environ.get(
    "NEXT_PUBLIC_COTERIE_API_URL", "http://127.0.0.1:8000"
)


class CoterieClient:
    def __init__(
        self,
        *,
        base_url: str | None = None,
        token: str | None = None,
        timeout: float = 30.0,
    ) -> None:
        self.base_url = base_url or DEFAULT_BASE
        self.token = token or os.environ.get("COTERIE_API_TOKEN")
        self._client = httpx.Client(base_url=self.base_url, timeout=timeout, headers=self._headers())

    # ---------- lifecycle ----------

    def __enter__(self) -> "CoterieClient":
        return self

    def __exit__(self, *a: Any) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    # ---------- read ----------

    def health(self) -> dict[str, Any]:
        return self._get("/api/health")

    def me(self) -> dict[str, Any]:
        return self._get("/api/auth/me")

    def list_runs(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        mode: str | None = None,
        status: str | None = None,
    ) -> dict[str, Any]:
        params = {"limit": limit, "offset": offset}
        if mode:
            params["mode"] = mode
        if status:
            params["status"] = status
        return self._get("/api/runs", params=params)

    def get_run(self, run_id: str) -> dict[str, Any]:
        return self._get(f"/api/runs/{run_id}")

    # ---------- write ----------

    def create_run(self, *, task: str, mode: str, config: dict[str, Any]) -> dict[str, Any]:
        return self._post("/api/runs", {"task": task, "mode": mode, "config": config})

    def resume(self, run_id: str, *, decision: str) -> dict[str, Any]:
        return self._post(f"/api/runs/{run_id}/resume", {"decision": decision})

    def delete_run(self, run_id: str) -> dict[str, Any]:
        return self._delete(f"/api/runs/{run_id}")

    # ---------- streaming ----------

    @contextmanager
    def stream_events(self, run_id: str) -> Iterator[Iterator[dict[str, Any]]]:
        """Yield SSE events for a run. Closes the connection on exit."""
        # Token via query string — EventSource doesn't carry headers.
        params = {}
        if self.token:
            params["token"] = self.token
        with connect_sse(self._client, "GET", f"/api/runs/{run_id}/events", params=params) as es:
            yield self._iter_events(es)

    @staticmethod
    def _iter_events(es: EventSource) -> Iterator[dict[str, Any]]:
        for sse in es.iter_sse():
            import json

            try:
                data = json.loads(sse.data) if sse.data else {}
            except json.JSONDecodeError:
                data = {"raw": sse.data}
            yield {"kind": sse.event or "message", "data": data}

    # ---------- internals ----------

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        r = self._client.get(path, params=params or {})
        r.raise_for_status()
        return r.json()

    def _post(self, path: str, body: Any) -> Any:
        r = self._client.post(path, json=body)
        r.raise_for_status()
        return r.json()

    def _delete(self, path: str) -> Any:
        r = self._client.delete(path)
        r.raise_for_status()
        return r.json()

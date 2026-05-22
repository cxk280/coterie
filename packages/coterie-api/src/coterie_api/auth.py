"""API token authentication.

Single-token model: a long-lived token in ``~/.coterie/api-token`` (auto-generated
on first run). Clients send ``Authorization: Bearer <token>``. Localhost requests
can bypass via ``COTERIE_API_ALLOW_LOCALHOST=1`` for ergonomic local dev.

Not a substitute for real auth — this is the "don't expose your local server to
the network without thinking" gate. For multi-user, swap this for OAuth2 + a
``users`` table.
"""

from __future__ import annotations

import os
import secrets
import threading
from pathlib import Path
from typing import Annotated

from fastapi import Header, HTTPException, Request

TOKEN_PATH = Path(os.environ.get("COTERIE_API_TOKEN_PATH", Path.home() / ".coterie" / "api-token"))
ALLOW_LOCALHOST = os.environ.get("COTERIE_API_ALLOW_LOCALHOST", "1") == "1"

_lock = threading.Lock()
_cached: str | None = None


def _ensure_token() -> str:
    global _cached
    if _cached is not None:
        return _cached
    with _lock:
        if _cached is not None:
            return _cached
        # Env override
        env_tok = os.environ.get("COTERIE_API_TOKEN")
        if env_tok:
            _cached = env_tok.strip()
            return _cached
        TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
        if TOKEN_PATH.exists():
            _cached = TOKEN_PATH.read_text().strip()
            return _cached
        _cached = secrets.token_urlsafe(32)
        TOKEN_PATH.write_text(_cached)
        TOKEN_PATH.chmod(0o600)
        return _cached


def current_token() -> str:
    return _ensure_token()


def rotate_token() -> str:
    global _cached
    with _lock:
        _cached = secrets.token_urlsafe(32)
        TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
        TOKEN_PATH.write_text(_cached)
        TOKEN_PATH.chmod(0o600)
        return _cached


def auth_required(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    if ALLOW_LOCALHOST and _is_localhost(request):
        return
    expected = _ensure_token()

    # EventSource can't set headers; fall back to ?token=... query string.
    token_arg = request.query_params.get("token")
    if token_arg and secrets.compare_digest(token_arg, expected):
        return

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "missing Authorization: Bearer <token>")
    if not secrets.compare_digest(authorization.removeprefix("Bearer ").strip(), expected):
        raise HTTPException(401, "invalid token")


def _is_localhost(request: Request) -> bool:
    host = (request.client.host if request.client else "") or ""
    return host in ("127.0.0.1", "::1", "localhost")

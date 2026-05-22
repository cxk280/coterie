"""Auth resolution for the API.

Order of attempts (first match wins):
1. ``coterie_session`` cookie — looks up a row in ``sessions``.
2. ``Authorization: Bearer <ck_...>`` — personal access token in ``tokens``.
3. ``Authorization: Bearer <legacy>`` or ``?token=<legacy>`` — backwards-
   compatible single ``COTERIE_API_TOKEN`` (file-backed). Resolves to the
   built-in ``service-user`` row.
4. Localhost + ``COTERIE_API_ALLOW_LOCALHOST=1`` — auto-creates a ``dev-user``
   row so local development needs no setup.

On match the resolved ``User`` is stashed on ``request.state.user`` so route
handlers can read it via ``Depends(current_user)``.
"""

from __future__ import annotations

import os
import secrets
import threading
from pathlib import Path
from typing import Annotated

from fastapi import Cookie, Depends, Header, HTTPException, Request

from coterie_api.store import Store
from coterie_api.users import (
    User,
    ensure_dev_user,
    ensure_service_user,
    session_user,
    user_for_token,
)

TOKEN_PATH = Path(
    os.environ.get("COTERIE_API_TOKEN_PATH", Path.home() / ".coterie" / "api-token")
)
ALLOW_LOCALHOST = os.environ.get("COTERIE_API_ALLOW_LOCALHOST", "1") == "1"
SESSION_COOKIE = "coterie_session"

_lock = threading.Lock()
_cached_legacy: str | None = None


def _ensure_legacy_token() -> str:
    global _cached_legacy
    if _cached_legacy is not None:
        return _cached_legacy
    with _lock:
        if _cached_legacy is not None:
            return _cached_legacy
        env_tok = os.environ.get("COTERIE_API_TOKEN")
        if env_tok:
            _cached_legacy = env_tok.strip()
            return _cached_legacy
        TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
        if TOKEN_PATH.exists():
            _cached_legacy = TOKEN_PATH.read_text().strip()
            return _cached_legacy
        _cached_legacy = secrets.token_urlsafe(32)
        TOKEN_PATH.write_text(_cached_legacy)
        TOKEN_PATH.chmod(0o600)
        return _cached_legacy


def current_token() -> str:
    return _ensure_legacy_token()


def rotate_token() -> str:
    global _cached_legacy
    with _lock:
        _cached_legacy = secrets.token_urlsafe(32)
        TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
        TOKEN_PATH.write_text(_cached_legacy)
        TOKEN_PATH.chmod(0o600)
        return _cached_legacy


def _is_localhost(request: Request) -> bool:
    host = (request.client.host if request.client else "") or ""
    return host in ("127.0.0.1", "::1", "localhost")


def _store(request: Request) -> Store:
    return request.app.state.store


def resolve_user(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
    coterie_session: Annotated[str | None, Cookie()] = None,
) -> User:
    store = _store(request)

    # 1. Session cookie
    if coterie_session:
        u = session_user(store, coterie_session)
        if u:
            request.state.user = u
            return u

    bearer = None
    if authorization and authorization.startswith("Bearer "):
        bearer = authorization.removeprefix("Bearer ").strip()
    if not bearer:
        bearer = request.query_params.get("token")

    if bearer:
        # 2. Personal access token
        if bearer.startswith("ck_"):
            u = user_for_token(store, bearer)
            if u:
                request.state.user = u
                return u
            raise HTTPException(401, "invalid personal access token")

        # 3. Legacy single token
        legacy = _ensure_legacy_token()
        if secrets.compare_digest(bearer, legacy):
            u = ensure_service_user(store)
            request.state.user = u
            return u
        raise HTTPException(401, "invalid token")

    # 4. Localhost dev-user
    if ALLOW_LOCALHOST and _is_localhost(request):
        u = ensure_dev_user(store)
        request.state.user = u
        return u

    raise HTTPException(401, "authentication required")


def current_user(user: Annotated[User, Depends(resolve_user)]) -> User:
    return user


def auth_required(user: Annotated[User, Depends(resolve_user)]) -> User:
    return user


def ensure_owner_or_admin(*, owner_id: str | None, user: User) -> None:
    if user.is_admin:
        return
    if owner_id is None or owner_id != user.id:
        raise HTTPException(404, "run not found")

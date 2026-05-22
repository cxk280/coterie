"""slowapi-backed rate limiting.

Keyed by ``user.id`` when an auth subject is available, otherwise by client
IP. Limits read from env vars so deployments can dial them up/down without
redeploying code.

The shared ``limiter`` is attached to the app in main.py via
``app.state.limiter = limiter`` + a 429 exception handler.
"""

from __future__ import annotations

import os

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

DEFAULT_RATE = os.environ.get("COTERIE_RATE_LIMIT_DEFAULT", "120/minute")
CREATE_RUN_RATE = os.environ.get("COTERIE_RATE_LIMIT_CREATE_RUN", "30/minute")
AUTH_TOKEN_RATE = os.environ.get("COTERIE_RATE_LIMIT_AUTH_TOKEN", "20/minute")


def user_rate_limit_key(request: Request) -> str:
    """Prefer the authenticated user's id; fall back to IP for unauthenticated traffic."""
    user = getattr(request.state, "user", None)
    if user is not None:
        return f"user:{user.id}"
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=user_rate_limit_key, default_limits=[DEFAULT_RATE])


def rate_limited(limit: str):
    """Decorator alias so endpoints can declare per-route limits inline."""
    return limiter.limit(limit)

"""Structured JSON logging for production.

Activated by ``COTERIE_LOG_FORMAT=json`` (default in the Docker image).
Plain console formatting is the default elsewhere so local ``coterie-api
--reload`` stays readable. Every log record carries ``request_id`` when an
HTTP request is in scope (extracted by ``RequestIdMiddleware``).
"""

from __future__ import annotations

import json
import logging
import os
import sys
import uuid
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

_request_id: ContextVar[str | None] = ContextVar("coterie_request_id", default=None)


def setup_logging() -> None:
    fmt = os.environ.get("COTERIE_LOG_FORMAT", "console").lower()
    level = os.environ.get("COTERIE_LOG_LEVEL", "INFO").upper()
    root = logging.getLogger()
    # Strip default handlers so we don't get a double-emit when uvicorn also
    # configures stderr.
    for h in list(root.handlers):
        root.removeHandler(h)

    handler = logging.StreamHandler(sys.stderr)
    if fmt == "json":
        handler.setFormatter(_JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
        )
    root.addHandler(handler)
    root.setLevel(level)

    # Cap uvicorn's access log noise; we have our own structured access logs.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        rid = _request_id.get()
        if rid:
            payload["request_id"] = rid
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        for key in ("run_id", "user_id", "mode"):
            v = getattr(record, key, None)
            if v is not None:
                payload[key] = v
        return json.dumps(payload, default=str)


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Issue a request_id per HTTP request and surface it on every log line + the response header."""

    HEADER = "X-Request-Id"

    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get(self.HEADER) or uuid.uuid4().hex[:16]
        # Stash on request.state too: the ContextVar is reset in `finally` as an
        # exception unwinds, so a 500 caught by the outer ServerErrorMiddleware
        # can no longer read it from the ContextVar — but request.state survives.
        request.state.request_id = rid
        token = _request_id.set(rid)
        try:
            response = await call_next(request)
            response.headers[self.HEADER] = rid
            return response
        finally:
            _request_id.reset(token)


def current_request_id() -> str | None:
    return _request_id.get()

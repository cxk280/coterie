"""Uniform error responses.

Every error — whether a raised ``HTTPException``, a request-validation failure,
a rate-limit rejection, or an unhandled crash — returns the same envelope::

    {"error": "<slug>", "code": <http_status>, "request_id": "<rid>", "detail": <...>}

``error`` is a stable machine slug, ``code`` is the HTTP status, ``request_id``
ties the response to the structured logs (also on the ``X-Request-Id`` header),
and ``detail`` carries the original human message or structured payload (e.g.
the validation error list, or the budget-exceeded fields). Unhandled exceptions
are logged with a traceback server-side but never leak it in the body.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from coterie_api.logging_setup import current_request_id

logger = logging.getLogger("coterie_api.errors")

_SLUGS = {
    400: "bad_request",
    401: "unauthorized",
    402: "payment_required",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    410: "gone",
    413: "payload_too_large",
    415: "unsupported_media_type",
    422: "validation_error",
    429: "rate_limited",
    500: "internal_error",
    502: "bad_gateway",
    503: "unavailable",
    504: "gateway_timeout",
}


def slug_for(status_code: int) -> str:
    return _SLUGS.get(status_code, f"http_{status_code}")


def _request_id(request: Request) -> str | None:
    # request.state survives even when the request_id ContextVar has already
    # been reset (e.g. a 500 caught by the outermost ServerErrorMiddleware).
    rid = getattr(request.state, "request_id", None)
    return rid or current_request_id()


def error_response(
    status_code: int, detail: object, request: Request, headers: dict | None = None
) -> JSONResponse:
    rid = _request_id(request)
    body = {
        "error": slug_for(status_code),
        "code": status_code,
        "request_id": rid,
        "detail": detail,
    }
    out_headers = dict(headers or {})
    if rid:
        out_headers.setdefault("X-Request-Id", rid)
    return JSONResponse(status_code=status_code, content=body, headers=out_headers or None)


async def _http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    return error_response(exc.status_code, exc.detail, request, headers=exc.headers)


async def _validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    # Keep only loc/msg/type — drop pydantic's `input`/`ctx`, which would echo
    # the submitted value back (e.g. an api_key) in the response body.
    safe = [{k: e[k] for k in ("loc", "msg", "type") if k in e} for e in exc.errors()]
    return error_response(422, jsonable_encoder(safe), request)


async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    retry_after = int(getattr(exc, "retry_after", 60) or 60)
    return error_response(
        429, str(exc.detail), request, headers={"Retry-After": str(retry_after)}
    )


async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled error on %s %s", request.method, request.url.path)
    return error_response(500, "internal server error", request)


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(StarletteHTTPException, _http_exception_handler)
    app.add_exception_handler(RequestValidationError, _validation_exception_handler)
    app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)
    app.add_exception_handler(Exception, _unhandled_exception_handler)

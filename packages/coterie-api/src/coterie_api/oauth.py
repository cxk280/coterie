"""GitHub OAuth handlers.

Enabled when ``GITHUB_CLIENT_ID`` + ``GITHUB_CLIENT_SECRET`` are set in the
environment. Otherwise the endpoints return a friendly 503 so the dev-user
fallback remains the only path.

The flow is the standard authorization-code grant:
    GET /api/auth/github/login          → redirect to github.com/login/oauth/authorize
    GET /api/auth/github/callback?code= → exchange code for token → fetch user
                                          → upsert user → create session →
                                          set cookie → redirect to web app

State is signed with itsdangerous to prevent CSRF.
"""

from __future__ import annotations

import os
import secrets
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, Request
from fastapi.responses import RedirectResponse
from itsdangerous import BadSignature, URLSafeTimedSerializer

from coterie_api.auth import SESSION_COOKIE, _store
from coterie_api.users import create_session, upsert_github_user

CLIENT_ID = os.environ.get("GITHUB_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET", "")
AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
TOKEN_URL = "https://github.com/login/oauth/access_token"
USER_URL = "https://api.github.com/user"
WEB_BASE = os.environ.get("COTERIE_WEB_BASE", "http://localhost:3000")
STATE_SECRET = os.environ.get("COTERIE_API_STATE_SECRET") or os.environ.get(
    "COTERIE_API_TOKEN", "coterie-dev-only-state-secret"
)

_signer = URLSafeTimedSerializer(STATE_SECRET, salt="github-oauth-state")


def github_enabled() -> bool:
    return bool(CLIENT_ID and CLIENT_SECRET)


def login_redirect(request: Request, *, next_path: str | None = None) -> RedirectResponse:
    if not github_enabled():
        raise HTTPException(
            503,
            "GitHub OAuth not configured. Set GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET.",
        )
    state_payload = {"nonce": secrets.token_urlsafe(8), "next": next_path or "/"}
    state = _signer.dumps(state_payload)
    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": f"{_self_base(request)}/api/auth/github/callback",
        "scope": "read:user",
        "state": state,
        "allow_signup": "true",
    }
    return RedirectResponse(f"{AUTHORIZE_URL}?{urlencode(params)}")


async def callback(request: Request, code: str | None, state: str | None) -> RedirectResponse:
    if not github_enabled():
        raise HTTPException(503, "GitHub OAuth not configured")
    if not code or not state:
        raise HTTPException(400, "missing code or state")
    try:
        payload = _signer.loads(state, max_age=600)
    except BadSignature as exc:
        raise HTTPException(400, "invalid state") from exc

    async with httpx.AsyncClient(timeout=15) as http:
        token_resp = await http.post(
            TOKEN_URL,
            data={
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "code": code,
                "redirect_uri": f"{_self_base(request)}/api/auth/github/callback",
            },
            headers={"Accept": "application/json"},
        )
        if token_resp.status_code != 200:
            raise HTTPException(502, "GitHub token exchange failed")
        access = token_resp.json().get("access_token")
        if not access:
            raise HTTPException(502, "GitHub did not return an access token")

        user_resp = await http.get(USER_URL, headers={"Authorization": f"Bearer {access}"})
        if user_resp.status_code != 200:
            raise HTTPException(502, "GitHub user lookup failed")
        gh = user_resp.json()

    store = _store(request)
    user = upsert_github_user(
        store,
        github_id=int(gh["id"]),
        login=gh["login"],
        name=gh.get("name"),
        avatar_url=gh.get("avatar_url"),
    )
    session_id = create_session(store, user.id)

    target = payload.get("next") or "/"
    redirect = RedirectResponse(f"{WEB_BASE}{target}")
    redirect.set_cookie(
        SESSION_COOKIE,
        session_id,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
        max_age=60 * 60 * 24 * 30,
        path="/",
    )
    return redirect


def _self_base(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-host")
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = forwarded or request.headers.get("host") or request.url.netloc
    return f"{proto}://{host}"

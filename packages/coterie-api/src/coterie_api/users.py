"""User / session / token persistence + helpers.

Three user kinds:
- ``github``  — created when a user completes the GitHub OAuth flow.
- ``dev``     — auto-created local-dev fallback (one row, fixed id ``dev-user``).
- ``service`` — created on first start to back the legacy ``COTERIE_API_TOKEN``.

The store is a small wrapper over the shared SQLite connection. Tokens are
stored sha256-hashed; the plaintext is shown to the user exactly once at
creation time. Sessions are opaque random IDs with a TTL.
"""

from __future__ import annotations

import hashlib
import secrets
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from coterie_api.store import Store

SESSION_DAYS = 30
DEV_USER_ID = "dev-user"
SERVICE_USER_ID = "service-user"


@dataclass(frozen=True)
class User:
    id: str
    kind: str  # "github" | "dev" | "service"
    github_login: str | None
    name: str | None
    avatar_url: str | None

    @property
    def is_admin(self) -> bool:
        # In single-tenant deployments the dev/service user can see everything;
        # in production the first GitHub user becomes admin. v0.1 keeps it
        # simple: dev/service are admin.
        return self.kind in ("dev", "service")


@dataclass(frozen=True)
class TokenRecord:
    id: str
    name: str
    prefix: str
    created_at: str
    last_used_at: str | None
    revoked_at: str | None


# ---------- helpers ----------


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def _row_to_user(row: sqlite3.Row) -> User:
    return User(
        id=row["id"],
        kind=row["kind"],
        github_login=row["github_login"],
        name=row["name"],
        avatar_url=row["avatar_url"],
    )


def _row_to_token(row: sqlite3.Row) -> TokenRecord:
    return TokenRecord(
        id=row["id"],
        name=row["name"],
        prefix=row["prefix"],
        created_at=row["created_at"],
        last_used_at=row["last_used_at"],
        revoked_at=row["revoked_at"],
    )


# ---------- users ----------


def get_user(store: Store, user_id: str) -> User | None:
    with store._conn() as c:
        row = c.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return _row_to_user(row) if row else None


def ensure_dev_user(store: Store) -> User:
    existing = get_user(store, DEV_USER_ID)
    if existing:
        return existing
    with store._conn() as c:
        c.execute(
            "INSERT INTO users (id, kind, name, created_at) VALUES (?, ?, ?, ?)",
            (DEV_USER_ID, "dev", "Local Developer", _now()),
        )
    return get_user(store, DEV_USER_ID)  # type: ignore[return-value]


def ensure_service_user(store: Store) -> User:
    existing = get_user(store, SERVICE_USER_ID)
    if existing:
        return existing
    with store._conn() as c:
        c.execute(
            "INSERT INTO users (id, kind, name, created_at) VALUES (?, ?, ?, ?)",
            (SERVICE_USER_ID, "service", "Service Account", _now()),
        )
    return get_user(store, SERVICE_USER_ID)  # type: ignore[return-value]


def upsert_github_user(store: Store, *, github_id: int, login: str, name: str | None, avatar_url: str | None) -> User:
    now = _now()
    with store._conn() as c:
        existing = c.execute(
            "SELECT * FROM users WHERE github_id = ?", (github_id,)
        ).fetchone()
        if existing:
            c.execute(
                """UPDATE users SET github_login = ?, name = ?, avatar_url = ?, last_login_at = ?
                   WHERE github_id = ?""",
                (login, name, avatar_url, now, github_id),
            )
            return _row_to_user(
                c.execute("SELECT * FROM users WHERE github_id = ?", (github_id,)).fetchone()
            )

        new_id = uuid.uuid4().hex
        c.execute(
            """INSERT INTO users (id, kind, github_id, github_login, name, avatar_url,
                                  created_at, last_login_at)
               VALUES (?, 'github', ?, ?, ?, ?, ?, ?)""",
            (new_id, github_id, login, name, avatar_url, now, now),
        )
        return _row_to_user(
            c.execute("SELECT * FROM users WHERE id = ?", (new_id,)).fetchone()
        )


# ---------- sessions ----------


def create_session(store: Store, user_id: str) -> str:
    session_id = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=SESSION_DAYS)
    with store._conn() as c:
        c.execute(
            "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (session_id, user_id, now.isoformat(), expires.isoformat()),
        )
    return session_id


def session_user(store: Store, session_id: str) -> User | None:
    with store._conn() as c:
        row = c.execute(
            """SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
               WHERE s.id = ? AND s.expires_at > ?""",
            (session_id, _now()),
        ).fetchone()
        return _row_to_user(row) if row else None


def delete_session(store: Store, session_id: str) -> None:
    with store._conn() as c:
        c.execute("DELETE FROM sessions WHERE id = ?", (session_id,))


def purge_expired_sessions(store: Store) -> int:
    with store._conn() as c:
        cur = c.execute("DELETE FROM sessions WHERE expires_at < ?", (_now(),))
        return cur.rowcount


# ---------- API tokens ----------


def create_token(store: Store, user_id: str, name: str) -> tuple[TokenRecord, str]:
    """Create a personal access token. Returns (record, plaintext secret).

    The plaintext is the only time it can be retrieved — the store keeps only
    the sha256 hash + a display prefix.
    """
    secret = "ck_" + secrets.token_urlsafe(32)
    prefix = secret[:11]
    rec_id = uuid.uuid4().hex
    now = _now()
    with store._conn() as c:
        c.execute(
            """INSERT INTO tokens (id, user_id, name, prefix, hash, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (rec_id, user_id, name, prefix, _hash(secret), now),
        )
    return TokenRecord(rec_id, name, prefix, now, None, None), secret


def list_tokens(store: Store, user_id: str) -> list[TokenRecord]:
    with store._conn() as c:
        rows = c.execute(
            "SELECT * FROM tokens WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
        return [_row_to_token(r) for r in rows]


def revoke_token(store: Store, user_id: str, token_id: str) -> bool:
    with store._conn() as c:
        cur = c.execute(
            "UPDATE tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
            (_now(), token_id, user_id),
        )
        return cur.rowcount > 0


def user_for_token(store: Store, plaintext: str) -> User | None:
    h = _hash(plaintext)
    with store._conn() as c:
        row = c.execute(
            """SELECT u.*, t.id AS token_id FROM tokens t JOIN users u ON u.id = t.user_id
               WHERE t.hash = ? AND t.revoked_at IS NULL""",
            (h,),
        ).fetchone()
        if not row:
            return None
        # touch last_used_at
        c.execute(
            "UPDATE tokens SET last_used_at = ? WHERE id = ?",
            (_now(), row["token_id"]),
        )
        return _row_to_user(row)

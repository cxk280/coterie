"""Per-user budget caps.

Each user has a rolling daily USD cap (default from ``COTERIE_DEFAULT_DAILY_CAP_USD``,
fallback $5.00). ``check_budget()`` raises ``HTTPException(402)`` when the
caller has exhausted their daily allotment. After every run terminates, the
run's ``spend_usd`` is added to the owner's period total. The cleanup loop
resets period totals once per day.

Admin / service users bypass the cap entirely.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from coterie_api.store import Store
from coterie_api.users import User

DEFAULT_DAILY_CAP_USD = float(os.environ.get("COTERIE_DEFAULT_DAILY_CAP_USD", "5.0"))


def check_budget(store: Store, user: User) -> None:
    """Raise 402 Payment Required if the user has exceeded their daily cap."""
    if user.is_admin:
        return
    quota = store.get_user_quota(user.id)
    if quota is None:
        store.upsert_user_quota(user.id, DEFAULT_DAILY_CAP_USD)
        return
    if _period_stale(quota.get("period_start")):
        # Lazy reset on read — avoids a race between the cleanup loop and a
        # midnight POST.
        store.upsert_user_quota(user.id, float(quota.get("daily_cap_usd") or DEFAULT_DAILY_CAP_USD))
        return
    spent = float(quota.get("period_spent_usd") or 0.0)
    cap = float(quota.get("daily_cap_usd") or DEFAULT_DAILY_CAP_USD)
    if spent >= cap:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "daily_budget_exceeded",
                "spent_usd": round(spent, 4),
                "cap_usd": round(cap, 4),
                "resets_at": _next_midnight_utc().isoformat(),
            },
        )


def record_spend(store: Store, user_id: str | None, spend_usd: float) -> None:
    if user_id is None or spend_usd <= 0:
        return
    store.increment_user_spend(user_id, spend_usd)


def _period_stale(period_start_iso: str | None) -> bool:
    if not period_start_iso:
        return True
    try:
        ts = datetime.fromisoformat(period_start_iso)
    except ValueError:
        return True
    return ts < datetime.now(timezone.utc) - timedelta(hours=24)


def _next_midnight_utc() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(hour=23, minute=59, second=59, microsecond=0) + timedelta(seconds=1)

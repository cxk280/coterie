"""SQLite-backed persistence for runs and events.

stdlib only — no SQLAlchemy. Schema is intentionally narrow.
"""

import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator

DEFAULT_DB_PATH = Path.home() / ".coterie" / "runs.sqlite"


SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    task TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    status_reason TEXT,
    config_json TEXT NOT NULL,
    current_state_json TEXT,
    final_state_json TEXT,
    spend_usd REAL NOT NULL DEFAULT 0,
    duration_s REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    run_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    kind TEXT NOT NULL,
    data_json TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    PRIMARY KEY (run_id, seq),
    FOREIGN KEY (run_id) REFERENCES runs (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_run_seq ON events (run_id, seq);
"""


def _migrate(conn: sqlite3.Connection) -> None:
    """Idempotent column adds for older DBs."""
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(runs)")}
    if "current_state_json" not in cols:
        conn.execute("ALTER TABLE runs ADD COLUMN current_state_json TEXT;")


class Store:
    """Thread-safe SQLite wrapper. One Store per process."""

    def __init__(self, db_path: Path | str = DEFAULT_DB_PATH) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        with self._conn() as conn:
            conn.executescript(SCHEMA)
            _migrate(conn)

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            conn = sqlite3.connect(self.db_path, isolation_level=None)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys = ON;")
            try:
                yield conn
            finally:
                conn.close()

    # ---------- runs ----------

    def insert_run(self, run_id: str, task: str, mode: str, config: dict[str, Any]) -> None:
        now = _now()
        with self._conn() as c:
            c.execute(
                """INSERT INTO runs (id, task, mode, status, config_json, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (run_id, task, mode, "queued", json.dumps(config), now, now),
            )

    def update_run_status(
        self,
        run_id: str,
        status: str,
        *,
        status_reason: str | None = None,
        spend_usd: float | None = None,
        duration_s: float | None = None,
        final_state: dict[str, Any] | None = None,
        current_state: dict[str, Any] | None = None,
    ) -> None:
        now = _now()
        sets = ["status = ?", "updated_at = ?"]
        params: list[Any] = [status, now]
        if status_reason is not None:
            sets.append("status_reason = ?")
            params.append(status_reason)
        if spend_usd is not None:
            sets.append("spend_usd = ?")
            params.append(spend_usd)
        if duration_s is not None:
            sets.append("duration_s = ?")
            params.append(duration_s)
        if final_state is not None:
            sets.append("final_state_json = ?")
            params.append(json.dumps(final_state, default=str))
        if current_state is not None:
            sets.append("current_state_json = ?")
            params.append(json.dumps(current_state, default=str))
        params.append(run_id)
        with self._conn() as c:
            c.execute(f"UPDATE runs SET {', '.join(sets)} WHERE id = ?", params)

    def update_current_state(self, run_id: str, current_state: dict[str, Any], spend_usd: float) -> None:
        """Cheap path: only the per-chunk state snapshot + spend."""
        now = _now()
        with self._conn() as c:
            c.execute(
                "UPDATE runs SET current_state_json = ?, spend_usd = ?, updated_at = ? WHERE id = ?",
                (json.dumps(current_state, default=str), spend_usd, now, run_id),
            )

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        with self._conn() as c:
            row = c.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
            if row is None:
                return None
            return _row_to_run(row)

    def list_runs(self, limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM runs ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
            return [_row_to_run(r) for r in rows]

    def count_runs(self) -> int:
        with self._conn() as c:
            row = c.execute("SELECT COUNT(*) AS n FROM runs").fetchone()
            return int(row["n"])

    def delete_run(self, run_id: str) -> bool:
        with self._conn() as c:
            cur = c.execute("DELETE FROM runs WHERE id = ?", (run_id,))
            return cur.rowcount > 0

    def delete_runs_older_than(self, cutoff: datetime) -> int:
        with self._conn() as c:
            cur = c.execute("DELETE FROM runs WHERE created_at < ?", (cutoff.isoformat(),))
            return cur.rowcount

    # ---------- events ----------

    def append_event(self, run_id: str, kind: str, data: dict[str, Any]) -> int:
        with self._conn() as c:
            row = c.execute(
                "SELECT COALESCE(MAX(seq), -1) AS max_seq FROM events WHERE run_id = ?",
                (run_id,),
            ).fetchone()
            seq = (row["max_seq"] if row else -1) + 1
            c.execute(
                """INSERT INTO events (run_id, seq, kind, data_json, timestamp)
                   VALUES (?, ?, ?, ?, ?)""",
                (run_id, seq, kind, json.dumps(data, default=str), _now()),
            )
            return seq

    def list_events(self, run_id: str, since: int = -1) -> list[dict[str, Any]]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM events WHERE run_id = ? AND seq > ? ORDER BY seq",
                (run_id, since),
            ).fetchall()
            return [
                {
                    "seq": r["seq"],
                    "kind": r["kind"],
                    "data": json.loads(r["data_json"]),
                    "timestamp": r["timestamp"],
                }
                for r in rows
            ]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def cutoff_for(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


def _row_to_run(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "task": row["task"],
        "mode": row["mode"],
        "status": row["status"],
        "status_reason": row["status_reason"],
        "config": json.loads(row["config_json"]),
        "current_state": json.loads(row["current_state_json"]) if row["current_state_json"] else None,
        "final_state": json.loads(row["final_state_json"]) if row["final_state_json"] else None,
        "spend_usd": row["spend_usd"],
        "duration_s": row["duration_s"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }

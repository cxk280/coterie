"""Background run executor.

Bridges the FastAPI server to the Python coterie graph runner. Each new run:
1. Inserts a row in the store.
2. Schedules an asyncio task that invokes the graph in a thread (LangGraph is sync).
3. Streams events (node_start, node_end, spend_update, status_change, …) into the
   store as the graph progresses, and through an asyncio.Queue for live SSE clients.

The run-id maps to an `asyncio.Queue` so multiple SSE subscribers see the same
sequence. New subscribers receive the full history first (replayed from the store),
then live events from the queue.
"""

from __future__ import annotations

import asyncio
import time
import traceback
import uuid
from collections.abc import AsyncIterator
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any

from coterie.core.executor import IsolatedWorktreeExecutor, LocalSubprocessExecutor
from coterie.graph import build_graph

from coterie_api.models import Mode
from coterie_api.store import Store


class Runner:
    """Process-wide singleton that owns runtimes and event queues."""

    def __init__(self, store: Store) -> None:
        self.store = store
        self._executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="coterie-run")
        # run_id -> list of subscriber queues (broadcast)
        self._subscribers: dict[str, list[asyncio.Queue[dict[str, Any] | None]]] = {}
        self._lock = asyncio.Lock()

    # ---------- public API ----------

    async def create_run(self, *, task: str, mode: Mode, config: dict[str, Any]) -> str:
        run_id = uuid.uuid4().hex[:12]
        # Force the configured mode in case the client lied.
        config = {**config, "mode": mode}
        self.store.insert_run(run_id, task, mode, config)
        self._subscribers[run_id] = []

        # Kick off the run as a background task. We don't await it here.
        asyncio.create_task(self._run(run_id, task, config))
        return run_id

    async def subscribe(self, run_id: str) -> AsyncIterator[dict[str, Any]]:
        """Yield existing events first, then live events as they arrive.

        Sends a final `{"kind": "stream_end"}` sentinel and returns when the run
        reaches a terminal state.
        """
        # Replay history from the store.
        for ev in self.store.list_events(run_id):
            yield ev

        if not self._is_active(run_id):
            yield {"kind": "stream_end", "data": {}, "timestamp": _now()}
            return

        queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
        async with self._lock:
            self._subscribers.setdefault(run_id, []).append(queue)

        try:
            while True:
                ev = await queue.get()
                if ev is None:
                    break
                yield ev
        finally:
            async with self._lock:
                if run_id in self._subscribers and queue in self._subscribers[run_id]:
                    self._subscribers[run_id].remove(queue)

    # ---------- internals ----------

    def _is_active(self, run_id: str) -> bool:
        run = self.store.get_run(run_id)
        if run is None:
            return False
        return run["status"] in ("queued", "running", "awaiting_human")

    async def _emit(self, run_id: str, kind: str, data: dict[str, Any]) -> None:
        ev = {"kind": kind, "data": data, "timestamp": _now()}
        self.store.append_event(run_id, kind, data)
        for q in list(self._subscribers.get(run_id, [])):
            await q.put(ev)

    async def _close_subscribers(self, run_id: str) -> None:
        for q in self._subscribers.get(run_id, []):
            await q.put(None)
        self._subscribers.pop(run_id, None)

    async def _run(self, run_id: str, task: str, config: dict[str, Any]) -> None:
        loop = asyncio.get_running_loop()
        started = time.monotonic()
        try:
            self.store.update_run_status(run_id, "running")
            await self._emit(run_id, "status_change", {"status": "running"})

            # Picks executor identically to the CLI composition root.
            executor = (
                IsolatedWorktreeExecutor()
                if config.get("mode") in ("consensus", "tournament")
                else LocalSubprocessExecutor()
            )

            # Build LLM clients lazily — only what the mode needs.
            llms = _build_llms_for(config)

            graph = build_graph(config=config, workdir=".", executor=executor, **llms)

            initial = {
                "task": task,
                "mode": config["mode"],
                "plan": [],
                "current_step_idx": 0,
                "runs": [],
                "artifacts": {},
                "status": "planning",
                "config": config,
                "spend_usd": 0.0,
                "route_history": [],
                "judge_history": [],
                "next_agent": None,
                "mode_state": {},
            }

            # LangGraph stream gives us progress events. Run in a thread so the
            # asyncio loop can keep serving subscribers.
            final = await loop.run_in_executor(
                self._executor,
                _invoke_with_events,
                graph,
                initial,
                run_id,
                self,
                loop,
            )

            duration = time.monotonic() - started
            self.store.update_run_status(
                run_id,
                "done" if final.get("status") == "done" else "failed",
                spend_usd=final.get("spend_usd", 0.0),
                duration_s=duration,
                final_state=final,
                status_reason=None,
            )
            await self._emit(run_id, "done", {"status": final.get("status"), "duration_s": duration})

        except Exception as e:  # noqa: BLE001 — propagate to client
            self.store.update_run_status(run_id, "failed", status_reason=str(e))
            await self._emit(run_id, "error", {"message": str(e), "traceback": traceback.format_exc()})
        finally:
            await self._close_subscribers(run_id)


def _invoke_with_events(graph, initial, run_id: str, runner: Runner, loop):
    """Sync wrapper: stream the graph in the thread, emit events back through asyncio."""
    last_runs_len = 0
    last_spend = 0.0
    final = initial

    for chunk in graph.stream(initial, stream_mode="values"):
        final = chunk

        # Emit spend_update when it grows
        new_spend = chunk.get("spend_usd", 0.0)
        if new_spend > last_spend + 1e-9:
            asyncio.run_coroutine_threadsafe(
                runner._emit(run_id, "spend_update", {"spend_usd": new_spend}), loop
            )
            last_spend = new_spend

        # Emit agent_run for every new entry in `runs`.
        new_runs = chunk.get("runs", [])
        for i in range(last_runs_len, len(new_runs)):
            r = new_runs[i]
            asyncio.run_coroutine_threadsafe(
                runner._emit(
                    run_id,
                    "agent_run",
                    {
                        "agent_id": r.get("agent_id"),
                        "role": r.get("role"),
                        "exit_code": r.get("exit_code"),
                        "duration_s": r.get("duration_s"),
                        "cost_estimate_usd": r.get("cost_estimate_usd"),
                        "stdout_preview": (r.get("stdout") or "")[:400],
                    },
                ),
                loop,
            )
        last_runs_len = len(new_runs)

        # Emit status_change when it changes
        new_status = chunk.get("status")
        if new_status:
            asyncio.run_coroutine_threadsafe(
                runner._emit(run_id, "status_change", {"status": new_status}), loop
            )

    return final


def _build_llms_for(config: dict[str, Any]) -> dict[str, Any]:
    """Mirror cli.py's `_build_llms` logic, server-side."""
    from coterie_api.providers import build_llm

    mode = config.get("mode")
    return {
        "supervisor_llm": build_llm((config.get("router") or {}).get("model")) if mode == "single" else None,
        "judge_llm": build_llm(_judge_model(config))
        if mode in {"adversarial", "tournament", "debate"}
        else None,
        "consensus_llm": build_llm((config.get("consensus") or {}).get("engine", {}).get("model"))
        if mode == "consensus"
        else None,
        "moderator_llm": build_llm((config.get("debate") or {}).get("moderator", {}).get("model"))
        if mode == "debate"
        else None,
        "planner_llm": build_llm((config.get("planner") or {}).get("model"))
        if (config.get("planner") or {}).get("enabled")
        else None,
    }


def _judge_model(config: dict[str, Any]) -> str | None:
    mode = config.get("mode")
    if mode == "adversarial":
        return (config.get("adversarial") or {}).get("judge", {}).get("model")
    if mode == "tournament":
        return (config.get("tournament") or {}).get("judge", {}).get("model")
    if mode == "debate":
        return (config.get("debate") or {}).get("judge", {}).get("model")
    return None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

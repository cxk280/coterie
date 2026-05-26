"""Background run executor.

Each new run:
1. Inserts a row in the store.
2. Schedules an asyncio task that invokes the graph in a worker thread.
3. Streams events (`state`, `agent_run`, `spend_update`, `status_change`,
   `checkpoint`, `judge_decision`, `done`, `error`) into the store as the graph
   progresses.

The compiled graph + LangGraph thread config is held in-memory per run_id so
HIL `resume` can re-enter `graph.invoke(None, config=...)` after an interrupt.
State snapshots are persisted on every chunk so a process restart loses
streaming but not the latest known state.
"""

from __future__ import annotations

import asyncio
import contextlib
import os
import sqlite3
import time
import traceback
import uuid
from collections.abc import AsyncIterator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from coterie.core.executor import IsolatedWorktreeExecutor, LocalSubprocessExecutor
from coterie.graph import build_graph
from coterie.observability import current_trace_id, span_for_run
from fastapi import HTTPException

from coterie_api.models import Mode
from coterie_api.store import Store

CHECKPOINT_DB = Path(
    os.environ.get("COTERIE_CHECKPOINT_DB", Path.home() / ".coterie" / "checkpoints.sqlite")
)


def _make_checkpointer():
    """SqliteSaver for HIL persistence. Lazy import so the lib stays optional."""
    from langgraph.checkpoint.sqlite import SqliteSaver

    CHECKPOINT_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(CHECKPOINT_DB), check_same_thread=False)
    return SqliteSaver(conn)


def _env_int(name: str, default: int, *, minimum: int = 1) -> int:
    try:
        return max(minimum, int(os.environ.get(name, default)))
    except (TypeError, ValueError):
        return default


class Runner:
    def __init__(self, store: Store) -> None:
        self.store = store
        # Worker concurrency drives the orchestration layer (each thread invokes
        # one graph). The heavy, untrusted work — the agent CLIs themselves — is
        # already isolated out-of-process by the executors (LocalSubprocess /
        # IsolatedWorktree / DockerSwarm), so threads here are the right tool.
        self._concurrency = _env_int("COTERIE_WORKER_CONCURRENCY", 4)
        # Admission control: cap accepted-but-not-terminal runs so a burst can't
        # pile up unbounded behind the pool. Defaults to 2x the worker count
        # (roughly: as many running as queued) before we shed load with a 503.
        self._max_inflight = _env_int("COTERIE_MAX_INFLIGHT_RUNS", self._concurrency * 2)
        self._inflight_runs: set[str] = set()
        self._executor = ThreadPoolExecutor(
            max_workers=self._concurrency, thread_name_prefix="coterie-run"
        )
        self._subscribers: dict[str, list[asyncio.Queue[dict[str, Any] | None]]] = {}
        self._handles: dict[str, dict[str, Any]] = {}
        self._lock = asyncio.Lock()
        # Process-wide checkpointer so paused runs survive process restarts.
        self._checkpointer = _make_checkpointer()

    def _finish(self, run_id: str) -> None:
        """Terminal cleanup: drop the in-memory handle and free the in-flight
        slot so a waiting request can be admitted. Idempotent."""
        handles = self._handles
        handles.pop(run_id, None)
        self._inflight_runs.discard(run_id)

    # ---------- public API ----------

    def restore_paused_handles(self) -> int:
        """Rebuild in-memory handles for runs that were paused at an HIL gate
        before the process restarted. Returns the number restored.
        """
        restored = 0
        for run in self.store.runs_in_status("awaiting_human"):
            try:
                self._rebuild_handle(run)
                # A paused run holds a handle + checkpoint state, so it counts
                # against capacity until it's resumed to a terminal state.
                self._inflight_runs.add(run["id"])
                restored += 1
            except Exception as e:  # noqa: BLE001
                print(f"coterie-api: failed to restore run {run['id']}: {e}")
        return restored

    def _rebuild_handle(self, run: dict[str, Any]) -> None:
        run_id = run["id"]
        config = run["config"]
        executor = (
            IsolatedWorktreeExecutor()
            if config.get("mode") in ("consensus", "tournament")
            else LocalSubprocessExecutor()
        )
        llms = _build_llms_for(config)
        graph = build_graph(
            config=config,
            workdir=".",
            executor=executor,
            checkpointer=self._checkpointer,
            **llms,
        )
        self._handles[run_id] = {
            "graph": graph,
            "thread_config": {"configurable": {"thread_id": run_id}},
            "started": time.monotonic(),
            "config": config,
        }

    # ---------- public API ----------

    async def create_run(
        self,
        *,
        task: str,
        mode: Mode,
        config: dict[str, Any],
        owner_id: str | None = None,
    ) -> str:
        # Shed load before accepting work we can't make progress on. The pool's
        # internal queue is unbounded, so without this a burst would accept
        # arbitrarily many runs and starve everyone.
        if len(self._inflight_runs) >= self._max_inflight:
            raise HTTPException(
                status_code=503,
                detail=(
                    f"server at capacity ({self._max_inflight} runs in flight); "
                    "retry shortly"
                ),
                headers={"Retry-After": "5"},
            )
        run_id = uuid.uuid4().hex[:12]
        config = {**config, "mode": mode}
        self.store.insert_run(run_id, task, mode, config, owner_id=owner_id)
        self._inflight_runs.add(run_id)
        self._subscribers[run_id] = []
        asyncio.create_task(self._run(run_id, task, config))
        return run_id

    async def resume_run(self, run_id: str, *, approve: bool) -> bool:
        handle = self._handles.get(run_id)
        if handle is None:
            return False

        if not approve:
            self.store.update_run_status(
                run_id, "rejected", status_reason="user rejected at HIL checkpoint"
            )
            await self._emit(run_id, "status_change", {"status": "rejected"})
            await self._emit(run_id, "done", {"status": "rejected"})
            await self._close_subscribers(run_id)
            self._finish(run_id)
            return True

        self.store.update_run_status(run_id, "running", status_reason=None)
        await self._emit(run_id, "status_change", {"status": "running"})
        asyncio.create_task(self._resume(run_id, handle))
        return True

    async def subscribe(self, run_id: str) -> AsyncIterator[dict[str, Any]]:
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

    # Event kinds delivered to live subscribers but never persisted. The full
    # text is recoverable from ``run.runs[].stdout`` after termination, so
    # there's no history to lose; persisting every chunk would bloat the
    # event log without providing a useful artifact.
    _EPHEMERAL_KINDS = frozenset({"agent_output"})

    async def _emit(self, run_id: str, kind: str, data: dict[str, Any]) -> None:
        ev = {"kind": kind, "data": data, "timestamp": _now()}
        if kind not in self._EPHEMERAL_KINDS:
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
            with span_for_run(run_id=run_id, mode=config["mode"], task=task) as run_span:
                run_span.set_attribute("coterie.run.source", "api")
                trace_id = current_trace_id()
                if trace_id:
                    self.store.set_trace_id(run_id, trace_id)
                    await self._emit(run_id, "trace", {"trace_id": trace_id})

                self.store.update_run_status(run_id, "running")
                await self._emit(run_id, "status_change", {"status": "running"})

                executor = (
                    IsolatedWorktreeExecutor()
                    if config.get("mode") in ("consensus", "tournament")
                    else LocalSubprocessExecutor()
                )
                llms = _build_llms_for(config)
                graph = build_graph(
                    config=config,
                    workdir=".",
                    executor=executor,
                    checkpointer=self._checkpointer,
                    **llms,
                )

                initial = _initial_state(task, config)
                thread_config = {"configurable": {"thread_id": run_id}}

                # Streaming sink for subprocess stdout chunks. Registered on a
                # contextvar inside the worker thread so it doesn't pollute
                # LangGraph's checkpoint.
                def _sink(ctx, chunk, _rid=run_id, _loop=loop):
                    asyncio.run_coroutine_threadsafe(
                        self._emit(
                            _rid,
                            "agent_output",
                            {
                                "agent_id": ctx.get("agent_id"),
                                "role": ctx.get("role"),
                                "chunk": chunk,
                            },
                        ),
                        _loop,
                    )

                self._handles[run_id] = {
                    "graph": graph,
                    "thread_config": thread_config,
                    "started": started,
                    "config": config,
                }

                final = await loop.run_in_executor(
                    self._executor,
                    _drive_graph,
                    graph,
                    initial,
                    thread_config,
                    run_id,
                    self,
                    loop,
                    _sink,
                )

                await self._finalize_or_pause(run_id, final, started, graph, thread_config)

        except Exception as e:  # noqa: BLE001
            self.store.update_run_status(run_id, "failed", status_reason=str(e))
            await self._emit(run_id, "error", {"message": str(e), "traceback": traceback.format_exc()})
            await self._emit(run_id, "done", {"status": "failed"})
            await self._close_subscribers(run_id)
            self._finish(run_id)

    async def _resume(self, run_id: str, handle: dict[str, Any]) -> None:
        loop = asyncio.get_running_loop()
        graph = handle["graph"]
        thread_config = handle["thread_config"]
        started = handle["started"]
        try:
            final = await loop.run_in_executor(
                self._executor,
                _drive_graph,
                graph,
                None,
                thread_config,
                run_id,
                self,
                loop,
            )
            await self._finalize_or_pause(run_id, final, started, graph, thread_config)
        except Exception as e:  # noqa: BLE001
            self.store.update_run_status(run_id, "failed", status_reason=str(e))
            await self._emit(run_id, "error", {"message": str(e), "traceback": traceback.format_exc()})
            await self._emit(run_id, "done", {"status": "failed"})
            await self._close_subscribers(run_id)
            self._finish(run_id)

    async def _finalize_or_pause(
        self,
        run_id: str,
        final: dict[str, Any],
        started: float,
        graph: Any,
        thread_config: dict[str, Any],
    ) -> None:
        try:
            state_info = graph.get_state(thread_config)
            next_nodes = list(state_info.next or [])
        except Exception:
            next_nodes = []

        if next_nodes:
            self.store.update_run_status(
                run_id,
                "awaiting_human",
                spend_usd=final.get("spend_usd", 0.0),
                current_state=_snapshot(final),
                status_reason=f"paused before: {', '.join(next_nodes)}",
            )
            await self._emit(
                run_id,
                "checkpoint",
                {"next_nodes": next_nodes, "state": _snapshot(final)},
            )
            await self._emit(run_id, "status_change", {"status": "awaiting_human"})
            return

        duration = time.monotonic() - started
        status = "done" if final.get("status") == "done" else "failed"
        spend = float(final.get("spend_usd") or 0.0)
        self.store.update_run_status(
            run_id,
            status,
            spend_usd=spend,
            duration_s=duration,
            final_state=_snapshot(final),
            current_state=_snapshot(final),
        )

        # Attribute the spend to the run's owner for budget tracking.
        run_row = self.store.get_run(run_id)
        if run_row and (owner := run_row.get("owner_id")):
            from coterie_api.quotas import record_spend

            record_spend(self.store, owner, spend)

        await self._emit(run_id, "done", {"status": status, "duration_s": duration})
        await self._close_subscribers(run_id)
        self._finish(run_id)
        with contextlib.suppress(Exception):
            self.store.compact_events(run_id)


def _drive_graph(graph, initial, thread_config, run_id, runner: Runner, loop, output_sink=None):
    """Runs inside the worker thread. Emits events back via run_coroutine_threadsafe.

    Registers ``output_sink`` on the per-thread contextvar so agent_runner
    nodes can stream subprocess stdout chunks back to the API runner without
    plumbing through state.
    """
    from coterie.core.output_sink import reset_output_sink, set_output_sink

    last_runs_len = 0
    last_spend = 0.0
    last_judge_len = 0
    final = initial or {}

    token = set_output_sink(output_sink) if output_sink is not None else None
    try:
        for chunk in graph.stream(initial, config=thread_config, stream_mode="values"):
            final = chunk

            snap = _snapshot(chunk)
            asyncio.run_coroutine_threadsafe(
                runner._emit(run_id, "state", {"state": snap}), loop
            )
            runner.store.update_current_state(run_id, snap, chunk.get("spend_usd", 0.0))

            new_spend = chunk.get("spend_usd", 0.0)
            if new_spend > last_spend + 1e-9:
                asyncio.run_coroutine_threadsafe(
                    runner._emit(run_id, "spend_update", {"spend_usd": new_spend}), loop
                )
                last_spend = new_spend

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

            new_judges = chunk.get("judge_history", [])
            for i in range(last_judge_len, len(new_judges)):
                j = new_judges[i]
                asyncio.run_coroutine_threadsafe(
                    runner._emit(run_id, "judge_decision", j),
                    loop,
                )
            last_judge_len = len(new_judges)

            new_status = chunk.get("status")
            if new_status:
                asyncio.run_coroutine_threadsafe(
                    runner._emit(run_id, "status_change", {"status": new_status}), loop
                )
    finally:
        if token is not None:
            reset_output_sink(token)

    return final


def _snapshot(state: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "task",
        "mode",
        "plan",
        "current_step_idx",
        "runs",
        "status",
        "spend_usd",
        "route_history",
        "judge_history",
        "next_agent",
        "mode_state",
    )
    return {k: state.get(k) for k in keys if k in state}


def _initial_state(task: str, config: dict[str, Any]) -> dict[str, Any]:
    return {
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


def _build_llms_for(config: dict[str, Any]) -> dict[str, Any]:
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
    return datetime.now(UTC).isoformat()

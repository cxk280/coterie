"""Bench runner — executes every (mode, task) pair and produces a results CSV.

Workflow per task / mode pair:

1. Materialize a clean workdir from ``task.workdir_setup`` (a mapping of
   ``relative/path -> contents``). Lives under ``--out-dir/workdirs/<task>/<mode>/``.
2. Build a Coterie config from the mode's bench profile (see
   ``profiles.py``), pointed at that workdir.
3. ``graph.invoke()`` it, capturing wall-clock time and the final state.
4. Run every grader; record pass/fail + reasons.
5. Append a single row to ``--out-dir/results.csv``.

The runner deliberately uses ``ScriptedLLMClient`` + ``FakeAdapter`` when
``--mode-mock`` is on so the harness is testable without API keys; the same
codepath drives real LLMs/CLIs when invoked without the flag.
"""

from __future__ import annotations

import csv
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Iterable

from coterie.core.executor import IsolatedWorktreeExecutor, LocalSubprocessExecutor
from coterie.graph import build_graph
from coterie.observability import current_trace_id, setup_tracing, span_for_run

from coterie_bench.corpus import BenchTask
from coterie_bench.graders import grade
from coterie_bench.profiles import build_config, build_llms, mode_profiles


@dataclass
class RunResult:
    task_id: str
    mode: str
    score: float
    cost_usd: float
    duration_s: float
    status: str
    runs_count: int
    sustained_findings: int
    workdir: str
    trace_id: str | None
    reasons: str

    @classmethod
    def csv_header(cls) -> list[str]:
        return list(cls.__dataclass_fields__.keys())

    def to_row(self) -> dict[str, Any]:
        return asdict(self)


def run_bench(
    tasks: Iterable[BenchTask],
    *,
    out_dir: Path,
    modes: Iterable[str] | None = None,
    mock: bool = True,
) -> list[RunResult]:
    """Execute every (mode, task) cell. Returns + writes results."""
    setup_tracing(service_name="coterie-bench")

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    results_path = out_dir / "results.csv"
    workdirs_root = out_dir / "workdirs"

    results: list[RunResult] = []
    selected_modes = list(modes) if modes else list(mode_profiles().keys())

    with results_path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=RunResult.csv_header())
        writer.writeheader()

        for task in tasks:
            for mode in selected_modes:
                if mode not in task.expected_modes:
                    continue
                workdir = workdirs_root / task.id / mode
                _seed_workdir(workdir, task.workdir_setup)
                result = _run_one(task, mode, workdir, mock=mock)
                results.append(result)
                writer.writerow(result.to_row())
                f.flush()
    return results


def _seed_workdir(workdir: Path, contents: dict[str, str]) -> None:
    if workdir.exists():
        # Clear prior state so reruns are deterministic.
        for child in workdir.rglob("*"):
            if child.is_file():
                child.unlink()
    workdir.mkdir(parents=True, exist_ok=True)
    for rel_path, body in contents.items():
        path = workdir / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body)


def _run_one(task: BenchTask, mode: str, workdir: Path, *, mock: bool) -> RunResult:
    cfg = build_config(mode=mode, task=task)
    llms = build_llms(mode=mode, mock=mock, task=task)
    executor = (
        IsolatedWorktreeExecutor()
        if mode in ("consensus", "tournament")
        else LocalSubprocessExecutor()
    )
    graph = build_graph(config=cfg, workdir=str(workdir), executor=executor, **llms)

    initial: dict[str, Any] = {
        "task": task.prompt,
        "mode": mode,
        "plan": [],
        "current_step_idx": 0,
        "runs": [],
        "artifacts": {},
        "status": "planning",
        "config": cfg,
        "spend_usd": 0.0,
        "route_history": [],
        "judge_history": [],
        "next_agent": None,
        "mode_state": {},
    }

    started = time.monotonic()
    trace_id: str | None = None
    try:
        with span_for_run(run_id=f"bench-{task.id}-{mode}", mode=mode, task=task.prompt):
            trace_id = current_trace_id()
            final = graph.invoke(initial)
        status = final.get("status") or "unknown"
    except Exception as e:  # noqa: BLE001
        status = f"errored:{type(e).__name__}:{e}"
        final = {"status": status}
    duration = time.monotonic() - started

    score, reasons = grade(task.graders, workdir, final)
    sustained = len((final.get("mode_state") or {}).get("sustained_findings") or [])

    return RunResult(
        task_id=task.id,
        mode=mode,
        score=score,
        cost_usd=float(final.get("spend_usd") or 0.0),
        duration_s=round(duration, 3),
        status=status,
        runs_count=len(final.get("runs") or []),
        sustained_findings=sustained,
        workdir=str(workdir),
        trace_id=trace_id,
        reasons=" | ".join(reasons),
    )

"""Deterministic graders for benchmark tasks.

Each grader inspects the workdir (or the final ``CoterieState``) after a run
and returns a ``(passed, reason)`` tuple. Graders are *deterministic* so the
same run scores the same way every time — no LLM-as-judge here, that would
contaminate the eval.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Callable

from coterie_bench.corpus import GraderSpec


GraderResult = tuple[bool, str]
GraderFn = Callable[[GraderSpec, Path, dict[str, Any]], GraderResult]


GRADERS: dict[str, GraderFn] = {}


def register(name: str) -> Callable[[GraderFn], GraderFn]:
    def deco(fn: GraderFn) -> GraderFn:
        GRADERS[name] = fn
        return fn

    return deco


@register("file_contains")
def _file_contains(spec: GraderSpec, workdir: Path, state: dict[str, Any]) -> GraderResult:
    path = workdir / spec.args["path"]
    needle = spec.args["text"]
    if not path.exists():
        return False, f"missing file {spec.args['path']}"
    body = path.read_text()
    if needle in body:
        return True, f"{spec.args['path']} contains {needle!r}"
    return False, f"{spec.args['path']} does not contain {needle!r}"


@register("file_absent")
def _file_absent(spec: GraderSpec, workdir: Path, state: dict[str, Any]) -> GraderResult:
    path = workdir / spec.args["path"]
    needle = spec.args["text"]
    if not path.exists():
        return True, f"{spec.args['path']} does not exist"
    body = path.read_text()
    if needle not in body:
        return True, f"{spec.args['path']} no longer contains {needle!r}"
    return False, f"{spec.args['path']} still contains {needle!r}"


@register("regex_match")
def _regex_match(spec: GraderSpec, workdir: Path, state: dict[str, Any]) -> GraderResult:
    path = workdir / spec.args["path"]
    pattern = spec.args["pattern"]
    if not path.exists():
        return False, f"missing file {spec.args['path']}"
    if re.search(pattern, path.read_text()):
        return True, f"{spec.args['path']} matches /{pattern}/"
    return False, f"{spec.args['path']} does not match /{pattern}/"


@register("status_done")
def _status_done(spec: GraderSpec, workdir: Path, state: dict[str, Any]) -> GraderResult:
    if state.get("status") == "done":
        return True, "run reached status=done"
    return False, f"status={state.get('status')!r}"


@register("findings_severity_at_least")
def _findings_severity(spec: GraderSpec, workdir: Path, state: dict[str, Any]) -> GraderResult:
    """Pass if at least one consensus / auditor finding meets the severity floor."""
    threshold = spec.args.get("severity", "high")
    severity_rank = {"low": 0, "medium": 1, "high": 2, "critical": 3}
    floor = severity_rank.get(threshold, 2)

    ms = state.get("mode_state") or {}
    raw_findings = (
        ms.get("auditor_findings")
        or ms.get("consensus_findings")
        or []
    )
    for f in raw_findings:
        rank = severity_rank.get((f.get("severity") or "low"), 0)
        if rank >= floor:
            return True, f"found {f.get('severity')} finding: {f.get('description', '')[:60]}"
    return False, f"no finding with severity >= {threshold}"


def grade(specs: tuple[GraderSpec, ...], workdir: Path, state: dict[str, Any]) -> tuple[float, list[str]]:
    """Run every grader. Returns (score in [0,1], list of one-line reasons)."""
    if not specs:
        return 1.0, ["(no graders → trivially pass)"]

    results = [GRADERS[s.kind](s, workdir, state) for s in specs]
    passed = sum(1 for ok, _ in results if ok)
    score = passed / len(results)
    reasons = [f"{'✓' if ok else '✗'} {reason}" for ok, reason in results]
    return score, reasons

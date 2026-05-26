"""Per-mode bench profiles.

Each mode gets a canonical config used by every benchmark run, plus a recipe
for building the LLM clients it needs. The mock path (``mock=True``) uses
``ScriptedLLMClient`` + ``FakeAdapter`` so the harness is deterministic and
runs without API keys — this is what powers ``coterie-bench dry-run`` and the
unit tests. The real path uses the same provider-inference logic as the CLI.
"""

from __future__ import annotations

from typing import Any

from coterie.adapters.base import AdapterResult
from coterie.adapters.fake import FakeAdapter
from coterie.core.llm.scripted import ScriptedLLMClient

from coterie_bench.corpus import BenchTask


def mode_profiles() -> dict[str, dict[str, Any]]:
    return {
        "single": _single_profile(),
        "consensus": _consensus_profile(),
        "adversarial": _adversarial_profile(),
        "debate": _debate_profile(),
        "tournament": _tournament_profile(),
    }


# Agent ids backed by a CLI that's actually installed + authenticated here.
# aider / cursor are not, so they're dropped from real runs.
_REAL_ADAPTERS = {"claude-code": "claude-code", "codex": "codex"}


def build_config(*, mode: str, task: BenchTask, mock: bool = True) -> dict[str, Any]:
    profile = {**mode_profiles()[mode], "mode": mode}
    if mock:
        return profile  # agents already use the in-process FakeAdapter

    # Real run: keep only agents whose CLI is available, bound to the real
    # adapter, and prune the role/participant lists to the survivors.
    kept_ids: set[str] = set()
    real_agents = []
    for a in profile["agents"]:
        real = _REAL_ADAPTERS.get(a["id"])
        if real:
            real_agents.append({**a, "adapter": real})
            kept_ids.add(a["id"])
    profile["agents"] = real_agents

    for block, key in (("consensus", "participants"), ("tournament", "participants"), ("debate", "sides")):
        if block in profile:
            profile[block] = {
                **profile[block],
                key: [x for x in profile[block][key] if x in kept_ids],
            }
    return profile


def build_llms(*, mode: str, mock: bool, task: BenchTask) -> dict[str, Any]:
    if mock:
        return _mock_llms(mode, task)
    return _real_llms(mode)


# ---------- profile builders ----------


def _single_profile() -> dict[str, Any]:
    return {
        "version": 1,
        "agents": [
            {"id": "claude-code", "adapter": "fake"},
            {"id": "codex", "adapter": "fake"},
        ],
        "router": {"enabled": True, "model": "claude-haiku-4-5"},
    }


def _consensus_profile() -> dict[str, Any]:
    return {
        "version": 1,
        "agents": [
            {"id": "claude-code", "adapter": "fake"},
            {"id": "codex", "adapter": "fake"},
            {"id": "aider", "adapter": "fake"},
        ],
        "consensus": {
            "participants": ["claude-code", "codex", "aider"],
            "engine": {"model": "claude-haiku-4-5"},
            "threshold": 0.66,
        },
    }


def _adversarial_profile() -> dict[str, Any]:
    return {
        "version": 1,
        "agents": [
            {"id": "claude-code", "adapter": "fake"},
            {"id": "codex", "adapter": "fake"},
        ],
        "adversarial": {
            "implementer": "claude-code",
            "auditor": "codex",
            "judge": {"model": "claude-opus-4-7", "sustain_threshold": "medium"},
            "max_rounds": 2,
        },
        "budget": {"max_usd_per_task": 5.0},
    }


def _debate_profile() -> dict[str, Any]:
    return {
        "version": 1,
        "agents": [
            {"id": "claude-code", "adapter": "fake"},
            {"id": "codex", "adapter": "fake"},
        ],
        "debate": {
            "sides": ["claude-code", "codex"],
            "rounds": 2,
            "moderator": {"model": "claude-haiku-4-5"},
            "judge": {"model": "claude-opus-4-7"},
        },
    }


def _tournament_profile() -> dict[str, Any]:
    return {
        "version": 1,
        "agents": [
            {"id": "claude-code", "adapter": "fake"},
            {"id": "codex", "adapter": "fake"},
            {"id": "aider", "adapter": "fake"},
            {"id": "cursor", "adapter": "fake"},
        ],
        "tournament": {
            "participants": ["claude-code", "codex", "aider", "cursor"],
            "judge": {"model": "claude-opus-4-7"},
            "rounds": 1,
        },
    }


# ---------- LLM construction ----------


def _real_llms(mode: str) -> dict[str, Any]:
    from coterie.cli import _build_llm  # provider inference shared with CLI

    profiles = mode_profiles()[mode]
    return {
        "supervisor_llm": _build_llm((profiles.get("router") or {}).get("model"))
        if mode == "single"
        else None,
        "judge_llm": _build_llm(_judge_model(profiles))
        if mode in ("adversarial", "tournament", "debate")
        else None,
        "consensus_llm": _build_llm((profiles.get("consensus") or {}).get("engine", {}).get("model"))
        if mode == "consensus"
        else None,
        "moderator_llm": _build_llm((profiles.get("debate") or {}).get("moderator", {}).get("model"))
        if mode == "debate"
        else None,
        "planner_llm": None,
    }


def _judge_model(profile: dict[str, Any]) -> str | None:
    for key in ("adversarial", "tournament", "debate"):
        block = profile.get(key) or {}
        judge = block.get("judge") or {}
        if "model" in judge:
            return judge["model"]
    return None


def _mock_llms(mode: str, task: BenchTask) -> dict[str, Any]:
    """Wire ScriptedLLMClient + FakeAdapter outputs that make each mode terminate cleanly.

    The exact stdout per adapter call comes from ``task.workdir_setup``-aware
    heuristics so graders see meaningful content. We always seed the FakeAdapter
    queue here — callers are expected to call this exactly once per (task, mode).
    """
    FakeAdapter.reset_all()

    # Default: every fake-adapter agent emits an empty success result.
    for agent_id in ("claude-code", "codex", "aider", "cursor"):
        FakeAdapter.script(
            agent_id,
            [AdapterResult(_mock_stdout(task, mode, agent_id), "", 0, cost_estimate_usd=0.01)] * 16,
        )

    base_supervisor_lines = ["claude-code"] * 16
    return {
        "supervisor_llm": ScriptedLLMClient(base_supervisor_lines) if mode == "single" else None,
        "judge_llm": ScriptedLLMClient(["accept"] * 12) if mode in ("adversarial", "tournament", "debate") else None,
        "consensus_llm": ScriptedLLMClient(_consensus_engine_script(task)) if mode == "consensus" else None,
        "moderator_llm": ScriptedLLMClient(["Round summary: tied."] * 6) if mode == "debate" else None,
        "planner_llm": None,
    }


def _mock_stdout(task: BenchTask, mode: str, agent_id: str) -> str:
    """Pick a stdout that the graders will be happy with (or close to it).

    For tasks with file_contains/file_absent graders, we emit a faux diff that
    the FakeAdapter is wired to write into the workdir before returning. The
    benchmark grader walks the workdir afterwards, so this is just signal.
    """
    if mode in ("adversarial", "tournament", "single") and task.category == "refactor":
        # Pretend we wrote the result; the graders apply mutations below.
        for _rel_path, original in task.workdir_setup.items():
            # No-op: FakeAdapter doesn't have FS side effects, so refactor
            # graders that probe the workdir will reflect the seeded content.
            _ = original
        return f"Applied refactor for {task.id} (mode={mode}, agent={agent_id})."
    if task.category == "review":
        return (
            '[{"severity":"high","category":"bug","description":'
            f'"finding from {agent_id} on {task.id}",'
            '"line_ranges":["src/foo.py:1-10"]}]'
        )
    return f"OK: {task.id} ({mode}, {agent_id})"


def _consensus_engine_script(task: BenchTask) -> list[str]:
    """Output the engine emits: a confirmed-cluster list as JSON."""
    payload = (
        '[{"label":"confirmed","severity":"high","category":"bug",'
        f'"description":"shared finding for {task.id}","agreement_count":3,'
        '"agreement_ratio":1.0,"supporting_agents":["claude-code","codex","aider"]}]'
    )
    return [payload] * 4

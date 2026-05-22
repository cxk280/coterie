"""Auditor + Judge nodes for `adversarial` mode.

Pattern: Implementer writes code; Auditor critiques it with a structured findings
JSON; Judge sustains or rejects findings; if any sustained and rounds remain,
loop back to Implementer. Otherwise accept.

The Auditor is just a CLI adapter invocation with a specific prompt — that lives
in the `adversarial` mode module. This module holds:
- the auditor's prompt template (used by mode wiring)
- parsing of findings JSON
- the adversarial Judge node
"""

import json
from typing import Any

from coterie.core.llm.base import LLMClient
from coterie.core.state import CoterieState

AUDITOR_PROMPT_TEMPLATE = """You are an adversarial code auditor. The implementer below produced this work for the subtask:

# Subtask
{subtask}

# Implementer's output
{implementer_output}

Find every plausible defect: bugs, edge cases missed, perf problems, security issues,
missed requirements, unclear code, undocumented invariants. Be aggressive but precise.

Return ONLY a JSON array. No prose, no markdown. Each finding:
{{
  "category": "bug|perf|security|clarity|missed-requirement|edge-case",
  "severity": "low|medium|high|critical",
  "description": "<one sentence>",
  "line_ranges": ["path:start-end", ...]
}}

If you find no defects, return [].
"""


JUDGE_SYSTEM = """You are an impartial judge in an adversarial code review.
You see an implementation and an auditor's findings. Decide which findings are
sustained (real defects the implementer should fix) versus rejected (nitpicks,
false positives, or out of scope).

Sustain a finding when: (1) it identifies a real defect, (2) its severity meets or
exceeds the configured sustain_threshold, AND (3) it is in scope for the subtask.

Return strict JSON only — no prose, no markdown:
{
  "sustained": [<finding_indices>],
  "rejected": [<finding_indices>],
  "verdict": "accept" | "revise",
  "reason": "<2-3 sentences>"
}

Verdict "accept" means the implementation is acceptable (sustained findings, if any,
are minor enough to not require another revision pass). "revise" means the implementer
should take another pass to address the sustained findings.
"""

_SEVERITY_RANK = {"low": 1, "medium": 2, "high": 3, "critical": 4}


def parse_findings_from_output(stdout: str) -> list[dict]:
    """Strip code fences and parse the auditor CLI's stdout as a JSON array of findings."""
    cleaned = stdout.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        cleaned = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
    try:
        data = json.loads(cleaned)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def make_adversarial_judge_node(llm: LLMClient | None = None):
    def judge(state: CoterieState) -> dict[str, Any]:
        cfg = state["config"]
        adv = cfg["adversarial"]
        judge_cfg = adv.get("judge") or {}
        threshold = judge_cfg.get("sustain_threshold", "medium")
        min_rank = _SEVERITY_RANK.get(threshold, 2)
        max_rounds = adv.get("max_rounds", 3)

        mode_state = dict(state.get("mode_state") or {})
        findings: list[dict] = mode_state.get("auditor_findings", [])
        impl_output = mode_state.get("implementer_output", "")
        round_idx = mode_state.get("round_idx", 0)

        eligible_indices = [
            i
            for i, f in enumerate(findings)
            if _SEVERITY_RANK.get(f.get("severity", "low"), 1) >= min_rank
        ]

        if not eligible_indices:
            mode_state["sustained_findings"] = []
            mode_state["verdict"] = "accept"
            return {
                "mode_state": mode_state,
                "judge_history": [
                    {
                        "step": state.get("current_step_idx", 0),
                        "winner": "implementer",
                        "reason": "no findings met severity threshold",
                        "scores": {"sustained_count": 0},
                    }
                ],
                "status": "done",
            }

        if llm is None:
            # No LLM available — conservatively sustain all eligible findings,
            # but if we're out of rounds we still finish.
            sustained = [findings[i] for i in eligible_indices]
            verdict = "revise"
            reason = "no judge LLM configured; conservatively sustaining all eligible findings"
        else:
            findings_block = "\n".join(
                f"[{i}] severity={findings[i].get('severity')} "
                f"category={findings[i].get('category')}: {findings[i].get('description')}"
                for i in eligible_indices
            )
            prompt = (
                f"Subtask: {state['task']}\n\n"
                f"Implementation output:\n{impl_output[:2000]}\n\n"
                f"Eligible findings (severity >= {threshold}):\n{findings_block}\n\n"
                f"Round: {round_idx + 1} of {max_rounds}"
            )
            raw = llm.chat(JUDGE_SYSTEM, [{"role": "user", "content": prompt}])
            try:
                decision = json.loads(raw)
                sustained = [findings[i] for i in decision.get("sustained", []) if i < len(findings)]
                verdict = decision.get("verdict", "revise")
                reason = decision.get("reason", "")
            except (json.JSONDecodeError, IndexError, TypeError):
                sustained = [findings[i] for i in eligible_indices]
                verdict = "revise"
                reason = f"judge LLM output unparseable: {raw[:120]!r}"

        mode_state["sustained_findings"] = sustained
        mode_state["verdict"] = verdict
        mode_state["round_idx"] = round_idx + 1

        out_of_rounds = mode_state["round_idx"] >= max_rounds
        finished = verdict == "accept" or out_of_rounds or not sustained
        next_status = "done" if finished else "executing"

        return {
            "mode_state": mode_state,
            "judge_history": [
                {
                    "step": state.get("current_step_idx", 0),
                    "winner": "implementer" if verdict == "accept" else "auditor",
                    "reason": reason,
                    "scores": {"sustained_count": len(sustained)},
                }
            ],
            "status": next_status,
        }

    return judge


def adversarial_implementer_prompt(state: CoterieState) -> str:
    """Prompt for the implementer agent. Round 1 = the raw task; rounds 2+ include sustained findings."""
    mode_state = state.get("mode_state") or {}
    round_idx = mode_state.get("round_idx", 0)
    if round_idx == 0:
        return state["task"]
    sustained = mode_state.get("sustained_findings", [])
    critiques = "\n".join(
        f"- [{f.get('severity')}] {f.get('description')}" for f in sustained
    )
    return (
        f"{state['task']}\n\n"
        f"Previous round had sustained critiques. Please address each:\n{critiques}"
    )


def adversarial_auditor_prompt(state: CoterieState) -> str:
    mode_state = state.get("mode_state") or {}
    impl_output = mode_state.get("implementer_output", "")
    return AUDITOR_PROMPT_TEMPLATE.format(
        subtask=state["task"], implementer_output=impl_output[:4000]
    )


def make_record_implementer_output_node():
    """Side-effect node: copy the most recent implementer run.stdout into mode_state."""

    def record(state: CoterieState) -> dict[str, Any]:
        runs = state.get("runs") or []
        last_impl = next(
            (r for r in reversed(runs) if r.get("role") == "implementer"), None
        )
        mode_state = dict(state.get("mode_state") or {})
        if last_impl:
            mode_state["implementer_output"] = last_impl["stdout"]
        return {"mode_state": mode_state, "status": "auditing"}

    return record


def make_record_auditor_findings_node():
    """Side-effect node: parse the most recent auditor run.stdout into mode_state.auditor_findings."""

    def record(state: CoterieState) -> dict[str, Any]:
        runs = state.get("runs") or []
        last_auditor = next(
            (r for r in reversed(runs) if r.get("role") == "auditor"), None
        )
        mode_state = dict(state.get("mode_state") or {})
        if last_auditor:
            mode_state["auditor_findings"] = parse_findings_from_output(last_auditor["stdout"])
        return {"mode_state": mode_state, "status": "judging"}

    return record

"""Coterie's typed state.

This module lives in `core/` because every mode and node depends on it.
The state is intentionally a TypedDict (not a Pydantic model) so LangGraph's
checkpointing serializes cleanly with stdlib JSON.
"""

from operator import add
from typing import Annotated, Any, Literal, TypedDict


class AgentRun(TypedDict):
    agent_id: str
    role: str  # "agent" | "implementer" | "auditor" | "pro" | "con" | "consensus-participant" | "tournament-participant"
    prompt: str
    stdout: str
    stderr: str
    exit_code: int
    files_changed: list[str]
    duration_s: float
    cost_estimate_usd: float | None


class RouteDecision(TypedDict):
    step: int
    agent_id: str
    reason: str
    strategy: str  # "llm" | "round-robin" | "manual" | "mode-fixed"


class JudgeDecision(TypedDict):
    step: int
    winner: str
    reason: str
    scores: dict[str, int | float]


class Finding(TypedDict):
    agent_id: str
    category: str
    severity: str  # "low" | "medium" | "high" | "critical"
    description: str
    line_ranges: list[str]


class ConsensusFinding(TypedDict):
    description: str
    category: str
    severity: str
    agreement_count: int
    agreement_ratio: float
    label: str  # "confirmed" | "needs-verification" | "unverified"
    supporting_agents: list[str]


Status = Literal[
    "planning",
    "routing",
    "executing",
    "auditing",
    "judging",
    "debating",
    "consensus-scoring",
    "tournament-round",
    "awaiting_human",
    "done",
    "failed",
]

Mode = Literal["single", "consensus", "adversarial", "debate", "tournament"]


class CoterieState(TypedDict, total=False):
    """Shared graph state across all modes.

    `total=False` because different modes populate different keys. Each mode owns
    its keys inside `mode_state` and only reads what it understands.
    """

    task: str
    mode: Mode
    plan: list[str]
    current_step_idx: int
    runs: Annotated[list[AgentRun], add]
    artifacts: dict[str, str]
    status: Status
    config: dict[str, Any]
    spend_usd: float
    route_history: Annotated[list[RouteDecision], add]
    judge_history: Annotated[list[JudgeDecision], add]
    next_agent: str | None  # set by supervisor (single mode)
    mode_state: dict[str, Any]  # mode-specific scratchpad

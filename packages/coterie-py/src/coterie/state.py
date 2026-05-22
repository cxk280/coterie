from operator import add
from typing import Annotated, Any, Literal, TypedDict


class AgentRun(TypedDict):
    agent_id: str
    prompt: str
    stdout: str
    stderr: str
    exit_code: int
    files_changed: list[str]
    duration_s: float
    cost_estimate_usd: float | None


Status = Literal[
    "planning",
    "routing",
    "executing",
    "judging",
    "awaiting_human",
    "done",
    "failed",
]


class CoterieState(TypedDict):
    task: str
    plan: list[str]
    current_step_idx: int
    runs: Annotated[list[AgentRun], add]
    artifacts: dict[str, str]
    last_winner: str | None
    status: Status
    config: dict[str, Any]
    spend_usd: float

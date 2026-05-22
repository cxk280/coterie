"""Pydantic request / response models for the HTTP API.

These mirror `coterie.core.state.CoterieState` but use Pydantic so FastAPI can
serialize them and generate OpenAPI schemas.
"""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


Mode = Literal["single", "consensus", "adversarial", "debate", "tournament"]
RunStatus = Literal[
    "queued",
    "running",
    "awaiting_human",
    "done",
    "failed",
    "rejected",
]


class AgentConfig(BaseModel):
    id: str
    adapter: str
    model: str | None = None
    strengths: list[str] = Field(default_factory=list)


class CreateRunRequest(BaseModel):
    task: str
    mode: Mode
    config: dict[str, Any]


class RunSummary(BaseModel):
    id: str
    task: str
    mode: Mode
    status: RunStatus
    status_reason: str | None = None
    agents: list[str]
    spend_usd: float
    duration_s: float | None = None
    created_at: datetime
    updated_at: datetime


class AgentRun(BaseModel):
    agent_id: str
    role: str
    prompt: str
    stdout: str
    stderr: str
    exit_code: int
    duration_s: float
    cost_estimate_usd: float | None = None


class RunDetail(BaseModel):
    summary: RunSummary
    config: dict[str, Any]
    runs: list[AgentRun]
    route_history: list[dict[str, Any]]
    judge_history: list[dict[str, Any]]
    mode_state: dict[str, Any]
    final_state: dict[str, Any] | None = None


class RunEvent(BaseModel):
    """A single event emitted during run execution. Streamed via SSE."""

    kind: Literal[
        "node_start",
        "node_end",
        "agent_run",
        "spend_update",
        "status_change",
        "judge_decision",
        "checkpoint",
        "error",
        "done",
    ]
    timestamp: datetime
    data: dict[str, Any]


class AdapterEntry(BaseModel):
    name: str
    """Adapter name as registered in ADAPTER_REGISTRY."""


class ResumeRequest(BaseModel):
    decision: Literal["approve", "reject"]

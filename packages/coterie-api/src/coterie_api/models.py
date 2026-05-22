"""Pydantic request / response models."""

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


class RunListResponse(BaseModel):
    items: list[RunSummary]
    total: int
    limit: int
    offset: int


class RunDetail(BaseModel):
    summary: RunSummary
    config: dict[str, Any]
    runs: list[dict[str, Any]] = Field(default_factory=list)
    route_history: list[dict[str, Any]] = Field(default_factory=list)
    judge_history: list[dict[str, Any]] = Field(default_factory=list)
    mode_state: dict[str, Any] = Field(default_factory=dict)
    final_state: dict[str, Any] | None = None
    current_state: dict[str, Any] | None = None


class ResumeRequest(BaseModel):
    decision: Literal["approve", "reject"]

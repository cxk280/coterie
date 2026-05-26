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
    owner_id: str | None = None
    trace_id: str | None = None
    trace_url: str | None = None
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


# ---------- auth ----------


class MeResponse(BaseModel):
    id: str
    kind: Literal["github", "dev", "service"]
    login: str | None = None
    name: str | None = None
    avatar_url: str | None = None
    is_admin: bool


class CreateTokenRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class CreateTokenResponse(BaseModel):
    id: str
    name: str
    prefix: str
    token: str  # shown to the user EXACTLY once
    created_at: str


class TokenSummary(BaseModel):
    id: str
    name: str
    prefix: str
    created_at: str
    last_used_at: str | None = None
    revoked: bool


Provider = Literal["anthropic", "openai", "groq", "xai"]


class ProviderTestRequest(BaseModel):
    provider: Provider
    api_key: str = Field(min_length=1, repr=False)


class ProviderTestResponse(BaseModel):
    ok: bool
    detail: str

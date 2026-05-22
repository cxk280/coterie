"""Coterie — multi-mode LangGraph orchestration for heterogeneous coding agents."""

# Importing these packages triggers @register_adapter / @register_mode side effects.
from coterie import adapters as _adapters  # noqa: F401
from coterie import modes as _modes  # noqa: F401
from coterie.adapters.base import AdapterResult, CLIAdapter
from coterie.core.executor import AdapterExecutor, LocalSubprocessExecutor
from coterie.core.llm.base import LLMClient
from coterie.core.registry import ADAPTER_REGISTRY, MODE_REGISTRY
from coterie.core.state import (
    AgentRun,
    ConsensusFinding,
    CoterieState,
    Finding,
    JudgeDecision,
    Mode,
    RouteDecision,
    Status,
)
from coterie.graph import build_graph

__version__ = "0.1.0"

__all__ = [
    "ADAPTER_REGISTRY",
    "AdapterExecutor",
    "AdapterResult",
    "AgentRun",
    "CLIAdapter",
    "ConsensusFinding",
    "CoterieState",
    "Finding",
    "JudgeDecision",
    "LLMClient",
    "LocalSubprocessExecutor",
    "MODE_REGISTRY",
    "Mode",
    "RouteDecision",
    "Status",
    "__version__",
    "build_graph",
]

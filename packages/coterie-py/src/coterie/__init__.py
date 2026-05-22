"""Coterie — a LangGraph orchestrator for heterogeneous coding agents."""

from coterie.state import AgentRun, CoterieState
from coterie.adapters.base import AdapterResult, CLIAdapter

__version__ = "0.0.1"

__all__ = ["AgentRun", "CoterieState", "AdapterResult", "CLIAdapter", "__version__"]

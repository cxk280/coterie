"""Composition root.

This is the ONLY file where concrete LLM providers and executors are wired up.
Everything else takes an `LLMClient` / `AdapterExecutor` via constructor.

Slide 13 of the deck: `grep "import openai\\|import docker" core/` should return zero hits.
"""

import os
import sys
from typing import Optional

import click
from rich.console import Console

from coterie.config import load_config
from coterie.core.executor import AdapterExecutor, IsolatedWorktreeExecutor, LocalSubprocessExecutor
from coterie.core.llm.base import LLMClient
from coterie.graph import build_graph

console = Console()


def _infer_provider(model: str | None) -> str:
    """Best-effort provider inference from a model name."""
    if not model:
        return "anthropic"
    m = model.lower()
    if m.startswith("claude"):
        return "anthropic"
    if m.startswith(("gpt", "o1", "o3")):
        return "openai"
    if "llama" in m:
        return "groq"
    if "grok" in m:
        return "xai"
    return "anthropic"


def _build_llm(model: str | None) -> LLMClient | None:
    """Construct the right LLMClient for `model`, or None if not configured."""
    provider = os.environ.get("COTERIE_LLM_PROVIDER") or _infer_provider(model)

    # Lazy imports so users on a subset of providers don't pay the import cost.
    if provider == "anthropic":
        from coterie.core.llm.anthropic_client import AnthropicClient
        return AnthropicClient(model=model)
    if provider == "openai":
        from coterie.core.llm.openai_compat import OpenAIClient
        return OpenAIClient(model=model)
    if provider == "groq":
        from coterie.core.llm.openai_compat import GroqClient
        return GroqClient(model=model)
    if provider == "xai":
        from coterie.core.llm.openai_compat import XAIClient
        return XAIClient(model=model)
    raise ValueError(f"unknown LLM provider {provider!r}")


def _supervisor_model(cfg: dict) -> str | None:
    return (cfg.get("router") or {}).get("model")


def _judge_model(cfg: dict) -> str | None:
    mode = cfg.get("mode")
    if mode == "adversarial":
        return (cfg.get("adversarial") or {}).get("judge", {}).get("model")
    if mode == "tournament":
        return (cfg.get("tournament") or {}).get("judge", {}).get("model")
    if mode == "debate":
        return (cfg.get("debate") or {}).get("judge", {}).get("model")
    return None


def _consensus_model(cfg: dict) -> str | None:
    return (cfg.get("consensus") or {}).get("engine", {}).get("model")


def _moderator_model(cfg: dict) -> str | None:
    return (cfg.get("debate") or {}).get("moderator", {}).get("model")


def _planner_model(cfg: dict) -> str | None:
    return (cfg.get("planner") or {}).get("model")


def _planner_enabled(cfg: dict) -> bool:
    return bool((cfg.get("planner") or {}).get("enabled"))


def _build_executor(cfg: dict) -> AdapterExecutor:
    """Pick an executor based on mode + explicit config.

    Parallel modes (consensus, tournament) default to `IsolatedWorktreeExecutor`
    so sibling agents don't clobber each other's edits. Single, adversarial, and
    debate run sequentially and share the workdir by default. Override with
    `executor.kind: local | isolated` in the YAML config.
    """
    explicit = (cfg.get("executor") or {}).get("kind")
    if explicit == "local":
        return LocalSubprocessExecutor()
    if explicit == "isolated":
        return IsolatedWorktreeExecutor()
    if cfg.get("mode") in ("consensus", "tournament"):
        return IsolatedWorktreeExecutor()
    return LocalSubprocessExecutor()


def _build_llms(cfg: dict) -> dict[str, Optional[LLMClient]]:
    """Build per-role LLMs. None entries mean 'this role isn't needed for the chosen mode'."""
    return {
        "supervisor_llm": _build_llm(_supervisor_model(cfg)) if cfg.get("mode") == "single" else None,
        "judge_llm": _build_llm(_judge_model(cfg))
        if cfg.get("mode") in {"adversarial", "tournament", "debate"}
        else None,
        "consensus_llm": _build_llm(_consensus_model(cfg)) if cfg.get("mode") == "consensus" else None,
        "moderator_llm": _build_llm(_moderator_model(cfg)) if cfg.get("mode") == "debate" else None,
        "planner_llm": _build_llm(_planner_model(cfg)) if _planner_enabled(cfg) else None,
    }


@click.group()
@click.version_option()
def main() -> None:
    """Coterie — orchestrate heterogeneous coding agents via LangGraph."""


@main.command()
@click.argument("task")
@click.option("--config", "config_path", type=click.Path(exists=True), required=True)
@click.option("--workdir", default=".", show_default=True)
def run(task: str, config_path: str, workdir: str) -> None:
    """Run a task through the configured coordination mode."""
    cfg = load_config(config_path)
    mode = cfg["mode"]

    executor = _build_executor(cfg)
    llms = _build_llms(cfg)
    graph = build_graph(config=cfg, workdir=workdir, executor=executor, **llms)

    console.rule(f"[bold cyan]coterie[/] · mode=[bold]{mode}[/] · {len(cfg['agents'])} agents")
    initial: dict = {
        "task": task,
        "mode": mode,
        "plan": [],
        "current_step_idx": 0,
        "runs": [],
        "artifacts": {},
        "status": "planning",
        "config": cfg,
        "spend_usd": 0.0,
        "route_history": [],
        "judge_history": [],
        "next_agent": None,
        "mode_state": {},
    }
    final = graph.invoke(initial)

    _render_summary(mode, final)
    sys.exit(0 if final.get("status") == "done" else 1)


def _render_summary(mode: str, final: dict) -> None:
    if final.get("route_history"):
        last_route = final["route_history"][-1]
        console.print(f"[dim]routed to[/] [bold]{last_route['agent_id']}[/] — {last_route['reason']}")
    if final.get("runs"):
        last_run = final["runs"][-1]
        console.print(last_run["stdout"])
    if final.get("judge_history"):
        last_judge = final["judge_history"][-1]
        console.print(
            f"[dim]judge winner[/] [bold]{last_judge['winner']}[/] — {last_judge['reason']}"
        )
    if mode == "consensus":
        consensus = (final.get("mode_state") or {}).get("consensus_findings", [])
        confirmed = [f for f in consensus if f["label"] == "confirmed"]
        console.print(f"[bold]consensus:[/] {len(confirmed)} confirmed of {len(consensus)} clusters")
    console.print(f"[dim]total spend ≈ ${final.get('spend_usd', 0):.4f}[/]")
    console.rule(f"[bold]{final.get('status', 'unknown')}[/]")


if __name__ == "__main__":
    main()

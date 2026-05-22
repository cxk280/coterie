import sys

import click
from rich.console import Console

from coterie.config import load_config
from coterie.graph import build_graph

console = Console()


@click.group()
@click.version_option()
def main() -> None:
    """Coterie — orchestrate heterogeneous coding agents via LangGraph."""


@main.command()
@click.argument("task")
@click.option("--config", "config_path", type=click.Path(exists=True), required=True)
@click.option("--workdir", default=".", show_default=True)
def run(task: str, config_path: str, workdir: str) -> None:
    """Run a task through the configured agent graph."""
    cfg = load_config(config_path)
    first = cfg["agents"][0]
    graph = build_graph(agent_id=first["id"], adapter_kind=first["adapter"], workdir=workdir)

    console.rule(f"[bold cyan]coterie[/] · {first['id']} ({first['adapter']})")
    final = graph.invoke(
        {
            "task": task,
            "plan": [],
            "current_step_idx": 0,
            "runs": [],
            "artifacts": {},
            "last_winner": None,
            "status": "planning",
            "config": cfg,
            "spend_usd": 0.0,
        }
    )

    last_run = final["runs"][-1] if final.get("runs") else None
    if last_run:
        console.print(last_run["stdout"])
        if last_run["cost_estimate_usd"] is not None:
            console.print(f"[dim]cost ≈ ${last_run['cost_estimate_usd']:.4f}[/]")
    console.rule(f"[bold]{final['status']}[/]")
    sys.exit(0 if final["status"] == "done" else 1)


if __name__ == "__main__":
    main()

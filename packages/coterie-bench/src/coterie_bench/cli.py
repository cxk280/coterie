"""``coterie-bench`` CLI.

Three subcommands:

- ``run`` — execute the corpus and produce ``results.csv`` (+ optional Pareto
  plot). ``--mock`` (default) uses ScriptedLLMClient + FakeAdapter so the
  harness needs no API keys.
- ``summarize`` — re-aggregate an existing ``results.csv`` into a per-mode
  summary table + Pareto plot.
- ``ls`` — list the available tasks in the corpus.
"""

from __future__ import annotations

from pathlib import Path

import click
from rich.console import Console
from rich.table import Table

from coterie_bench.corpus import DEFAULT_CORPUS_DIR, load_corpus
from coterie_bench.report import (
    ModeSummary,
    summarize,
    write_pareto_plot,
    write_summary_csv,
)
from coterie_bench.runner import run_bench

console = Console()


@click.group()
@click.version_option()
def main() -> None:
    """coterie-bench — same corpus across every mode, cost / quality / latency."""


@main.command()
@click.option(
    "--corpus",
    "corpus_dir",
    type=click.Path(exists=True, file_okay=False, path_type=Path),
    default=None,
    help=f"Task corpus directory (default: {DEFAULT_CORPUS_DIR}).",
)
@click.option(
    "--out",
    "out_dir",
    type=click.Path(file_okay=False, path_type=Path),
    default=Path("bench-results"),
    show_default=True,
)
@click.option(
    "--mode",
    "modes",
    multiple=True,
    type=click.Choice(["single", "consensus", "adversarial", "debate", "tournament"]),
    help="Restrict to one or more modes (default: all five).",
)
@click.option(
    "--mock/--real",
    default=True,
    help="Use ScriptedLLMClient + FakeAdapter (no API keys) vs. real providers.",
)
@click.option(
    "--plot/--no-plot",
    default=True,
    help="Render a cost-vs-quality Pareto plot at out/pareto.png.",
)
def run(corpus_dir: Path | None, out_dir: Path, modes: tuple[str, ...], mock: bool, plot: bool) -> None:
    """Execute the corpus and write per-run CSV + per-mode summary."""
    tasks = load_corpus(corpus_dir)
    if not tasks:
        console.print(f"[red]No tasks found under {corpus_dir or DEFAULT_CORPUS_DIR}[/]")
        raise click.Abort()

    selected = list(modes) if modes else None
    out_dir = Path(out_dir)

    console.rule(
        f"[bold cyan]coterie-bench[/] · {len(tasks)} tasks × "
        f"{len(selected or ['single', 'consensus', 'adversarial', 'debate', 'tournament'])} modes "
        f"({'mock' if mock else 'real'})"
    )

    results = run_bench(tasks, out_dir=out_dir, modes=selected, mock=mock)
    console.print(f"[green]wrote[/] {out_dir / 'results.csv'} ({len(results)} rows)")

    summaries = summarize(out_dir / "results.csv")
    summary_csv = out_dir / "summary.csv"
    write_summary_csv(summaries, summary_csv)
    console.print(f"[green]wrote[/] {summary_csv}")
    _print_summary_table(summaries)

    if plot:
        plot_path = out_dir / "pareto.png"
        written = write_pareto_plot(summaries, plot_path)
        if written:
            console.print(f"[green]wrote[/] {written}")
        else:
            console.print(
                "[yellow]matplotlib not installed; skipping Pareto plot. "
                "Install with `pip install coterie-bench[plot]`.[/]"
            )


@main.command()
@click.argument("results_csv", type=click.Path(exists=True, dir_okay=False, path_type=Path))
@click.option("--plot/--no-plot", default=True)
def summarize_cmd(results_csv: Path, plot: bool) -> None:
    """Re-aggregate an existing results.csv into a per-mode summary + Pareto plot."""
    summaries = summarize(results_csv)
    out_dir = results_csv.parent
    write_summary_csv(summaries, out_dir / "summary.csv")
    console.print(f"[green]wrote[/] {out_dir / 'summary.csv'}")
    _print_summary_table(summaries)
    if plot:
        written = write_pareto_plot(summaries, out_dir / "pareto.png")
        if written:
            console.print(f"[green]wrote[/] {written}")


main.add_command(summarize_cmd, name="summarize")


@main.command(name="ls")
@click.option(
    "--corpus",
    "corpus_dir",
    type=click.Path(exists=True, file_okay=False, path_type=Path),
    default=None,
)
def list_tasks(corpus_dir: Path | None) -> None:
    """List tasks in the corpus."""
    tasks = load_corpus(corpus_dir)
    table = Table(title=f"corpus · {len(tasks)} tasks", box=None)
    table.add_column("ID")
    table.add_column("Category")
    table.add_column("Modes")
    table.add_column("Graders", justify="right")
    table.add_column("Prompt")
    for t in tasks:
        prompt = (t.prompt[:80] + "…") if len(t.prompt) > 81 else t.prompt
        table.add_row(t.id, t.category, ", ".join(t.expected_modes), str(len(t.graders)), prompt)
    console.print(table)


def _print_summary_table(summaries: list[ModeSummary]) -> None:
    table = Table(title="Per-mode summary", box=None)
    table.add_column("Mode")
    table.add_column("N", justify="right")
    table.add_column("Avg score", justify="right")
    table.add_column("Pass rate", justify="right")
    table.add_column("Avg cost", justify="right")
    table.add_column("Avg duration", justify="right")
    table.add_column("Score / $", justify="right")
    for s in summaries:
        table.add_row(
            s.mode,
            str(s.n),
            f"{s.avg_score:.3f}",
            f"{s.pass_rate * 100:.0f}%",
            f"${s.avg_cost_usd:.4f}",
            f"{s.avg_duration_s:.2f}s",
            f"{s.success_per_dollar:.1f}",
        )
    console.print(table)


if __name__ == "__main__":
    main(prog_name="coterie-bench")

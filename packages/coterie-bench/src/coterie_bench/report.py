"""Aggregate the per-run CSV into per-mode summaries + a cost/quality Pareto plot."""

from __future__ import annotations

import csv
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable


@dataclass
class ModeSummary:
    mode: str
    n: int
    avg_score: float
    pass_rate: float
    avg_cost_usd: float
    avg_duration_s: float
    success_per_dollar: float


def summarize(csv_path: Path) -> list[ModeSummary]:
    """Group rows by mode + return ``ModeSummary``s ordered by avg_score desc."""
    rows = list(_read_csv(csv_path))
    summaries: list[ModeSummary] = []
    for mode in sorted({r["mode"] for r in rows}):
        mode_rows = [r for r in rows if r["mode"] == mode]
        n = len(mode_rows)
        scores = [float(r["score"]) for r in mode_rows]
        costs = [float(r["cost_usd"]) for r in mode_rows]
        durations = [float(r["duration_s"]) for r in mode_rows]
        avg_score = sum(scores) / n
        pass_rate = sum(1 for s in scores if s >= 0.99) / n
        avg_cost = sum(costs) / n
        summaries.append(
            ModeSummary(
                mode=mode,
                n=n,
                avg_score=round(avg_score, 3),
                pass_rate=round(pass_rate, 3),
                avg_cost_usd=round(avg_cost, 4),
                avg_duration_s=round(sum(durations) / n, 3),
                success_per_dollar=round(avg_score / avg_cost, 2) if avg_cost > 0 else 0.0,
            )
        )
    summaries.sort(key=lambda s: s.avg_score, reverse=True)
    return summaries


def write_summary_csv(summaries: Iterable[ModeSummary], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        fields = list(ModeSummary.__dataclass_fields__.keys())
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for s in summaries:
            writer.writerow(asdict(s))


def write_pareto_plot(summaries: Iterable[ModeSummary], path: Path) -> Path | None:
    """Render a cost-vs-score Pareto scatter via matplotlib.

    Soft-fails if matplotlib isn't installed (``pip install coterie-bench[plot]``).
    Returns the written path or None.
    """
    try:
        import matplotlib.pyplot as plt  # type: ignore[import-not-found]
    except ImportError:
        return None

    summaries = list(summaries)
    if not summaries:
        return None

    fig, ax = plt.subplots(figsize=(8, 5), facecolor="#0a0b0d")
    ax.set_facecolor("#14161a")

    xs = [s.avg_cost_usd for s in summaries]
    ys = [s.avg_score for s in summaries]
    for s in summaries:
        ax.scatter(s.avg_cost_usd, s.avg_score, s=140, label=s.mode)
        ax.annotate(
            s.mode,
            (s.avg_cost_usd, s.avg_score),
            color="#f0f1f3",
            fontsize=9,
            xytext=(6, 6),
            textcoords="offset points",
        )

    ax.set_xlabel("Avg cost per task ($USD)", color="#9ca3af")
    ax.set_ylabel("Avg grader score", color="#9ca3af")
    ax.set_title("Coterie mode Pareto: cost vs quality", color="#f0f1f3")
    ax.tick_params(colors="#6b7280")
    for spine in ax.spines.values():
        spine.set_color("#22262c")
    ax.set_ylim(0, 1.05)
    ax.grid(True, color="#22262c", linewidth=0.5, alpha=0.6)

    path.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(path, dpi=160, facecolor=fig.get_facecolor())
    plt.close(fig)
    return path


def _read_csv(path: Path) -> Iterable[dict[str, str]]:
    with path.open() as f:
        yield from csv.DictReader(f)

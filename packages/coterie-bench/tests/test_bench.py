"""Unit tests for the bench harness — driven entirely with mocks so no API keys are needed."""

from __future__ import annotations

import csv
from pathlib import Path

from coterie_bench.corpus import DEFAULT_CORPUS_DIR, load_corpus
from coterie_bench.report import summarize, write_pareto_plot, write_summary_csv
from coterie_bench.runner import run_bench


def test_corpus_loads_bundled_tasks():
    tasks = load_corpus()
    ids = {t.id for t in tasks}
    assert "rename-foo-to-bar" in ids
    assert "find-bugs-router" in ids
    assert all(t.prompt for t in tasks)


def test_bench_run_writes_results_csv(tmp_path: Path):
    """Run every (single + adversarial) task pair end-to-end in mock mode."""
    tasks = [t for t in load_corpus() if t.id == "rename-foo-to-bar"]
    out = tmp_path / "bench-out"
    results = run_bench(tasks, out_dir=out, modes=["single", "adversarial"], mock=True)
    assert len(results) == 2

    rows = list(csv.DictReader((out / "results.csv").open()))
    assert len(rows) == 2
    modes_seen = {r["mode"] for r in rows}
    assert modes_seen == {"single", "adversarial"}
    # Each row carries score, cost, duration columns
    for r in rows:
        assert 0.0 <= float(r["score"]) <= 1.0
        assert float(r["duration_s"]) >= 0.0


def test_summarize_groups_by_mode(tmp_path: Path):
    csv_path = tmp_path / "results.csv"
    with csv_path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "task_id",
                "mode",
                "score",
                "cost_usd",
                "duration_s",
                "status",
                "runs_count",
                "sustained_findings",
                "workdir",
                "trace_id",
                "reasons",
            ]
        )
        # 3 single, 3 adversarial; adversarial costs more but scores higher
        for i in range(3):
            w.writerow([f"t{i}", "single", "0.6", "0.05", "1.0", "done", "1", "0", ".", "", "."])
            w.writerow([f"t{i}", "adversarial", "0.9", "0.20", "3.0", "done", "3", "0", ".", "", "."])

    summaries = summarize(csv_path)
    by_mode = {s.mode: s for s in summaries}
    assert by_mode["single"].n == 3
    assert by_mode["adversarial"].avg_cost_usd == 0.20
    # Sorted by avg_score desc
    assert summaries[0].mode == "adversarial"
    # score/$ rough sanity check
    assert by_mode["adversarial"].success_per_dollar > 0


def test_pareto_plot_writes_when_matplotlib_available(tmp_path: Path):
    try:
        import matplotlib  # noqa: F401
    except ImportError:
        # plot path soft-fails; that itself is the contract
        from coterie_bench.report import ModeSummary

        result = write_pareto_plot(
            [ModeSummary("single", 1, 0.5, 0.5, 0.01, 1.0, 50.0)], tmp_path / "p.png"
        )
        assert result is None
        return

    from coterie_bench.report import ModeSummary

    out = write_pareto_plot(
        [
            ModeSummary("single", 3, 0.6, 0.0, 0.05, 1.0, 12.0),
            ModeSummary("adversarial", 3, 0.9, 0.66, 0.2, 3.0, 4.5),
        ],
        tmp_path / "pareto.png",
    )
    assert out is not None
    assert out.exists()
    assert out.stat().st_size > 0

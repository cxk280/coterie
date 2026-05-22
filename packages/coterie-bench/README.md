# coterie-bench

Reproducible benchmark harness. Runs a fixed corpus of tasks through every
Coterie mode and produces per-run results + a cost-vs-quality Pareto plot.

## Quick start

```bash
pip install -e packages/coterie-bench[plot]

# Mock mode (default): ScriptedLLMClient + FakeAdapter, no API keys.
coterie-bench run --out bench-results

# Real providers — same harness, costs real money:
coterie-bench run --out bench-results --real

# Filter modes:
coterie-bench run --mode adversarial --mode tournament

# Re-aggregate an existing results.csv:
coterie-bench summarize bench-results/results.csv

# Browse the corpus:
coterie-bench ls
```

Outputs in `--out`:

| File | What |
|---|---|
| `results.csv`  | one row per (task, mode): score, cost, duration, runs, sustained findings, workdir, trace_id, grader reasons |
| `summary.csv`  | per-mode aggregates: avg score, pass rate, avg cost, avg duration, score per dollar |
| `pareto.png`   | scatter of avg cost vs avg score per mode (matplotlib, optional) |
| `workdirs/`    | the materialized workdir for each (task, mode) so you can inspect what the agents saw |

## Corpus format

`packages/coterie-bench/tasks/*.yaml`:

```yaml
id:        rename-foo-to-bar
category:  refactor          # refactor | bugfix | review | decision | tournament
prompt:    "Rename `foo` → `bar` across src/ and update tests."
expected_modes:              # optional — defaults to all five
  - single
  - adversarial
  - tournament
workdir_setup:               # relative path -> contents; materialized before each run
  src/foo.py: |
    def bar(): ...
graders:                     # zero or more deterministic checks
  - kind: file_contains
    path: src/foo.py
    text: bar
  - kind: file_absent
    path: src/foo.py
    text: "def foo"
  - kind: status_done
```

Built-in graders (`coterie_bench/graders.py`):

- `file_contains` — `{path, text}` must appear in the file.
- `file_absent`   — `{path, text}` must NOT appear (or file missing).
- `regex_match`   — `{path, pattern}` regex matches somewhere in the file.
- `status_done`   — final `CoterieState.status == "done"`.
- `findings_severity_at_least` — `{severity}` — at least one auditor/consensus
  finding meets the floor.

Add a new grader by `@register("kind_name")` in `graders.py`.

## Why mock by default

Real-provider benchmarks cost real money and are slow. Mock mode uses
`ScriptedLLMClient` + `FakeAdapter` so the harness is deterministic, runs in
seconds, and exercises every mode end-to-end. CI runs the mock path; the
"real" run is what you screenshot for the README.

## Observability

`coterie-bench` calls `coterie.observability.setup_tracing()` and wraps each
run in a `coterie.run.<mode>` span. With `LANGFUSE_*` env vars set, every
bench cell shows up as a trace and the `trace_id` is recorded in
`results.csv` for cross-reference.

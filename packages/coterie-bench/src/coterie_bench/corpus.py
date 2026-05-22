"""Benchmark task corpus.

A *task* is a YAML file with three top-level keys:

```yaml
id:        rename-foo-to-bar
prompt:    "Rename `foo` → `bar` across src/ and update tests."
category:  refactor          # refactor | bugfix | review | decision | tournament
graders:                     # zero or more deterministic checks
  - kind: file_contains
    path: src/foo.py
    text: bar
  - kind: file_absent
    path: src/foo.py
    text: foo
```

Graders are run after the orchestration finishes. Each grader returns
``True`` / ``False`` and a one-line reason; a task scores ``1.0`` if every
grader passes, otherwise the fraction that passed.

The default corpus lives under ``packages/coterie-bench/tasks/`` and ships
with mixed task categories so the same input set exercises every mode.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

DEFAULT_CORPUS_DIR = Path(__file__).resolve().parents[2] / "tasks"


@dataclass(frozen=True)
class GraderSpec:
    kind: str
    args: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class BenchTask:
    id: str
    prompt: str
    category: str
    graders: tuple[GraderSpec, ...] = ()
    workdir_setup: dict[str, str] = field(default_factory=dict)
    expected_modes: tuple[str, ...] = (
        "single",
        "consensus",
        "adversarial",
        "debate",
        "tournament",
    )

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "BenchTask":
        graders = tuple(
            GraderSpec(kind=g.pop("kind"), args=g) for g in (raw.get("graders") or [])
        )
        return cls(
            id=raw["id"],
            prompt=raw["prompt"],
            category=raw.get("category", "general"),
            graders=graders,
            workdir_setup=raw.get("workdir_setup") or {},
            expected_modes=tuple(raw.get("expected_modes") or cls.__dataclass_fields__["expected_modes"].default),
        )


def load_corpus(corpus_dir: Path | None = None) -> list[BenchTask]:
    """Load every ``*.yaml`` task under ``corpus_dir`` (default: bundled tasks)."""
    base = Path(corpus_dir) if corpus_dir else DEFAULT_CORPUS_DIR
    if not base.exists():
        return []
    tasks: list[BenchTask] = []
    for path in sorted(base.glob("*.yaml")):
        raw = yaml.safe_load(path.read_text())
        tasks.append(BenchTask.from_dict(raw))
    return tasks

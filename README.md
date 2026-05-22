# Coterie

> A LangGraph orchestrator for **heterogeneous coding agents** and dev tools.
> One graph, many CLIs — Claude Code, Codex, Cursor, Aider, pytest, ruff, git — wired together with a supervisor, optional fan-out + judge, and configurable human-in-the-loop checkpoints.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PyPI](https://img.shields.io/badge/pypi-coterie-3776AB.svg)](https://pypi.org/project/coterie/)
[![npm](https://img.shields.io/badge/npm-coterie-CB3837.svg)](https://www.npmjs.com/package/coterie)
[![Status](https://img.shields.io/badge/status-alpha-orange.svg)](#status)

---

## Why Coterie

Most multi-agent frameworks orchestrate *LLM API calls inside one process*. Coterie orchestrates *autonomous coding CLIs running as subprocesses*. Each CLI keeps its own model, prompt scaffolding, and tool harness — Coterie just decides who works on what, when to race them, and where the human gets a say.

That gives you three things at once:

- **The right tool for the right task.** Route refactors to Claude Code, tight diffs to Aider, algorithmic work to Codex — without rewriting any of them.
- **Optional parallel exploration.** Toggle fan-out on for high-stakes work: two agents race, a judge picks the winner. Off by default to save tokens.
- **Real human-in-the-loop.** YAML-driven `interrupt_before` checkpoints let you decide exactly which steps need approval — none, some, or all.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  LangGraph StateGraph (with checkpointing)                  │
│                                                              │
│   user task                                                  │
│      ↓                                                       │
│   Planner ──► Supervisor ──► [routing decision]             │
│                   ↑                                          │
│                   │     ┌─► single agent node ──┐           │
│                   │     │                        │           │
│                   │     ├─► fan-out (A ∥ B) ──► Judge ──┐   │
│                   │     │                                │   │
│                   │     └─► tool node (pytest/ruff/git)─┤   │
│                   │                                      │   │
│                   └──────────── state update ◄──────────┘   │
│                                                              │
│   HIL interrupts hook into any node via config              │
└─────────────────────────────────────────────────────────────┘
```

Every coding CLI is wrapped in a `CLIAdapter` — a subprocess wrapper that exposes a uniform interface (`buildCommand` / `parseResult`). Adding a new agent is a ~30-line file.

## Two runtimes, one project

| Runtime | Package | Install |
|---|---|---|
| Python | [`coterie`](https://pypi.org/project/coterie/) (PyPI) | `pip install coterie` |
| Node / TS | [`coterie`](https://www.npmjs.com/package/coterie) (npm) | `npm install coterie` |

Both runtimes share:

- The same YAML config (validated against [`schemas/coterie.config.schema.json`](schemas/coterie.config.schema.json))
- The same CLI UX (`coterie run "..." --config ...`)
- The same adapter interface

Pick whichever language you prefer. They're interoperable at the subprocess boundary — a Python-orchestrated team can include JS-implemented adapters and vice versa.

## Quickstart

```bash
# Python
pip install coterie
coterie run "rename `foo` to `bar` across src/ and run tests" \
  --config examples/minimal.coterie.yaml

# Or Node
npm install -g coterie
coterie run "rename `foo` to `bar` across src/ and run tests" \
  --config examples/minimal.coterie.yaml
```

A minimal config:

```yaml
# examples/minimal.coterie.yaml
version: 1
agents:
  - id: claude
    adapter: claude-code
    strengths: [planning, refactor]
```

A more ambitious config — two agents race, a judge picks the winner, git commits are gated by human approval:

```yaml
# examples/fanout_with_judge.coterie.yaml
version: 1
agents:
  - id: claude
    adapter: claude-code
    strengths: [planning, refactor]
  - id: codex
    adapter: codex
    strengths: [algorithmic, tight-diffs]
router:
  enabled: true
  strategy: llm
fanout:
  enabled: true
  pair: [claude, codex]
  judge:
    model: claude-opus-4-7
    criteria: [correctness, minimal-diff, tests-pass, clarity]
checkpoints:
  before_git_commit: true
budget:
  max_usd_per_task: 5.00
  warn_at_usd: 2.00
```

## Features

- **Heterogeneous adapters** — Claude Code, Codex, Cursor, Aider out of the box. `adapter: shell` lets you wrap any CLI.
- **Supervisor routing** — a cheap router model (Haiku by default) decides which specialist handles each subtask.
- **Toggleable fan-out + judge** — two agents race on the same task, a stronger judge picks the winner. Off by default.
- **Configurable HIL checkpoints** — `before_planner`, `before_agent_run`, `before_judge`, `before_git_commit`, `before_pytest`, and any custom node.
- **Budget guardrails** — set `max_usd_per_task` and `warn_at_usd`; choose `halt` / `warn` / `checkpoint` on exceed.
- **Deterministic tool nodes** — `pytest`, `vitest`, `ruff`, `eslint`, `git`, `shell` as first-class graph nodes.
- **Observability** — file logs by default; optional Langfuse or LangSmith integration.

## Status

**Alpha — v0.0.1.** The minimal Python and Node packages compile, expose a CLI, and run a 2-node graph (`planner → claude-code → END`). Supervisor routing, fan-out + judge, full HIL UX, tool nodes, and budget enforcement are tracked in [`docs/design.md`](docs/design.md) and land in v0.1.

## License

[MIT](LICENSE). Copyright © 2026 Chris King.

The CLIs Coterie orchestrates (Claude Code, Codex, Cursor, Aider) are invoked as subprocesses and are not bundled — install and authenticate them separately.

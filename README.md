# Coterie

> **Multi-mode** LangGraph orchestration for **heterogeneous coding agents**.
> Change `mode: single` to `mode: adversarial` and the same tool, the same
> agents, and the same task now run under a completely different coordination
> pattern. One config flag.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PyPI](https://img.shields.io/badge/pypi-coterie-3776AB.svg)](https://pypi.org/project/coterie/)
[![npm](https://img.shields.io/badge/npm-coterie-CB3837.svg)](https://www.npmjs.com/package/coterie)
[![Status](https://img.shields.io/badge/status-alpha-orange.svg)](#status)

---

## What's different about this

The 2026 multi-CLI orchestrator space is crowded. Every other tool gives you
**one** coordination pattern baked in. **Coterie gives you five, switchable per
task**:

| Mode | Shape | Best for |
|---|---|---|
| `single` | supervisor routes one specialist per subtask | refactors, generic delegation |
| `consensus` | N agents independently report; engine surfaces what they agree on | code reviews, security audits |
| `adversarial` | **Implementer + Auditor + Judge** with refinement loop | high-stakes implementation that needs stress-testing |
| `debate` | Pro + Con + Moderator across N rounds | design decisions, library/architecture choices |
| `tournament` | N participants race; judge ranks | "best of N" for critical changes |

That mode-switching capability is the headline. The honest case against the
alternatives:

- **vs [MCO](https://github.com/mco-org/mco)** — MCO does *one* mode well: consensus. Coterie does consensus as one of five and adds the adversarial / debate patterns MCO lacks. MCO is sharper at consensus alone; Coterie is the meta-orchestrator.
- **vs [bug-hunter](https://github.com/codexstar69/bug-hunter)** — bug-hunter is the adversarial pattern, locked to security/bug-finding. Coterie's adversarial mode is general-purpose, and is one of several available modes.
- **vs [Tutti](https://github.com/nutthouse/tutti) / [Tessera](https://github.com/horang-labs/tessera) / [Conflux](https://github.com/tumf/conflux)** — these are coordinated workspaces for running multiple CLIs side-by-side. Coterie is a coordination *framework*; the modes are first-class.
- **vs [RA.Aid](https://github.com/ai-christianson/RA.Aid)** — RA.Aid is one autonomous LangGraph agent. Coterie orchestrates many heterogeneous CLIs in N coordination patterns.
- **vs [Deb8flow](https://towardsdatascience.com/deb8flow-orchestrating-autonomous-ai-debates-with-langgraph-and-gpt-4o/)** — Deb8flow does debate via in-process LLM calls. Coterie's debate mode debates between subprocess-wrapped CLIs (each runs its own model, prompt scaffolding, and tool harness).

## Why LangGraph, why subprocess CLIs

Two architectural choices that don't appear together anywhere else:

1. **LangGraph as the spine** — orchestration is `StateGraph` itself, not a custom thing. You get resumability, checkpointing, branch parallelism, and `interrupt_before` HIL gates for free.
2. **Heterogeneous CLI subprocesses as the agents** — Claude Code, Codex, Cursor, Aider — each keeps its own model, prompt scaffolding, and tool harness. Coterie decides who runs what under which pattern. Adding a new CLI is one 30-line file.

## Quick start

```bash
pip install coterie
coterie run "find every bug in src/auth.py" \
  --config examples/consensus.coterie.yaml
```

Same task, different coordination:

```bash
coterie run "refactor src/auth.py to remove the legacy middleware" \
  --config examples/adversarial.coterie.yaml
```

A minimal config:

```yaml
# examples/adversarial.coterie.yaml
version: 1
mode: adversarial
agents:
  - id: implementer
    adapter: claude-code
    strengths: [implementation]
  - id: critic
    adapter: codex
    strengths: [adversarial-review, edge-cases]
adversarial:
  implementer: implementer
  auditor: critic
  judge:
    model: claude-opus-4-7
    sustain_threshold: medium
  max_rounds: 3
```

See [`examples/`](examples/) for one config per mode and [`docs/modes.md`](docs/modes.md) for when to pick each.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  cli.py  (composition root: picks LLM provider + executor)      │
│     │                                                           │
│     ▼                                                           │
│  graph.build_graph(config, executor, supervisor_llm, …)         │
│     │                                                           │
│     ▼                                                           │
│  modes/{single,consensus,adversarial,debate,tournament}.py      │
│     │     (each builds a StateGraph; @register_mode)            │
│     ▼                                                           │
│  nodes/{planner,agent_runner,supervisor,auditor,…}.py           │
│     │     (graph node factories; take LLMClient via ctor)       │
│     ▼                                                           │
│  adapters/{claude_code,codex,fake,…}.py                         │
│           (CLIAdapter subclasses; @register_adapter)            │
│                                                                 │
│  core/                                                          │
│    registry.py    — ADAPTER_REGISTRY, MODE_REGISTRY, decorators │
│    llm/base.py    — LLMClient ABC (one method: chat)            │
│    llm/anthropic_client.py, openai_compat.py, scripted.py       │
│    executor.py    — AdapterExecutor Protocol +                  │
│                     LocalSubprocessExecutor                     │
│    state.py       — CoterieState + reducers                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Two implementations behind every abstraction (`AdapterExecutor` →
`LocalSubprocessExecutor` + `IsolatedWorktreeExecutor`, `LLMClient` → five
concretes including `ScriptedLLMClient`) keep the seams testable and make
the v0.2 `DockerSwarmExecutor` a one-commit diff.

## Two runtimes

| Runtime | Package | Status |
|---|---|---|
| Python | [`coterie`](https://pypi.org/project/coterie/) on PyPI | ✅ All 5 modes |
| Node / TS | [`coterie`](https://www.npmjs.com/package/coterie) on npm | ✅ All 5 modes |

Both share the YAML schema at [`schemas/coterie.config.schema.json`](schemas/coterie.config.schema.json) and the same CLI UX (`coterie run "..." --config ...`). The adapter interface is the same on both sides — a Python-orchestrated team can include JS-implemented adapters via subprocess, and vice versa.

## Provider-agnostic LLM layer

Coterie talks to LLMs via a one-method `LLMClient` ABC. Today's concretes:

- **Anthropic** (default) — `claude-haiku-4-5`, `claude-opus-4-7`, etc.
- **OpenAI** — `gpt-4o-mini`, `o3`, etc.
- **Groq** (OpenAI-compatible) — `llama-3.3-70b-versatile`.
- **xAI** (OpenAI-compatible) — `grok-2-latest`.
- **Scripted** — replays from JSON. Use in tests; use on stage when the WiFi melts.

Each role in a mode can use a different provider:

```yaml
mode: adversarial
adversarial:
  implementer: claude    # this agent uses Claude
  auditor: codex         # this one uses Codex
  judge:
    model: gpt-4o-mini   # Coterie infers OpenAI from the model name
```

Set `COTERIE_LLM_PROVIDER=groq` to force a provider for a session.

## Status

**Alpha — v0.1.0.** All five modes implemented in both runtimes — Python (62 tests) and TypeScript (27 tests), all using `FakeAdapter` + `ScriptedLLMClient` so the suites need no API keys, no network, and no subprocesses to run. Budget enforcement, LLM planner, workdir isolation (`IsolatedWorktreeExecutor`), HIL checkpoints via `interrupt_before`, and multi-round tournament bracket all ship in v0.1.

Roadmap and known limitations: [`docs/design.md`](docs/design.md).

## Observability

Every meaningful unit of work — graph runs, LangGraph nodes, LLM calls, CLI
agent invocations — becomes an OpenTelemetry span with `coterie.*` and
`gen_ai.*` semantic attributes (mode, agent id, model, token counts, exit
code, cost). Tracing is **off by default**; flip it on by setting any of these
env vars:

```bash
# Self-hosted Langfuse (recommended)
export LANGFUSE_HOST=http://localhost:3001
export LANGFUSE_PUBLIC_KEY=pk-lf-...
export LANGFUSE_SECRET_KEY=sk-lf-...

# Or LangSmith
export LANGSMITH_API_KEY=ls-...

# Or any OTLP/HTTP collector
export OTEL_EXPORTER_OTLP_ENDPOINT=https://collector.example.com/v1/traces
```

A complete self-hosted Langfuse stack (web + worker + Postgres + ClickHouse
+ Redis + MinIO) lives at [`infra/langfuse/`](infra/langfuse/) — `docker
compose up -d` and you're collecting traces locally. The web dashboard's
run-detail page deep-links each run to its Langfuse trace.

## Tests run without API keys

Every test uses `FakeAdapter` (returns scripted `AdapterResult`s, never spawns) and `ScriptedLLMClient` (replays a queue of strings). The same `Protocol` that makes the supervisor flexible makes it testable. Hot reload, full coverage, no rate limits.

```bash
cd packages/coterie-py && pytest -v
# 36 passed in 0.55s
```

## License

[MIT](LICENSE). Copyright © 2026 Chris King.

The CLIs Coterie orchestrates (Claude Code, Codex, Cursor, Aider) are invoked as
subprocesses and are not bundled. Install and authenticate them separately.

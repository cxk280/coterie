# Coterie design notes

Living document. v0.1 ships the multi-mode core; v0.2 adds the Docker executor
and the JS package's mode parity. Decisions are recorded with reasoning so
future-me (and contributors) can revisit them.

## 1. Why LangGraph (and not CrewAI / AutoGen / OpenAI Agents SDK)

LangGraph is plumbing, not opinion. We use:

- `StateGraph` for graph topology — modes are just different `StateGraph` wirings.
- Parallel branch edges for `consensus` and `tournament` (LangGraph fans out and joins automatically).
- Conditional edges for `single` (loop until plan exhausted), `adversarial` (loop until accept or out of rounds), and `debate` (loop until rounds complete).
- Annotated-reducer channels (`runs: Annotated[..., add]`) so parallel branches can each contribute without colliding.
- `interrupt_before` (planned for v0.2 HIL UX) — graph pauses at named nodes for human approval.

CrewAI / AutoGen / OpenAI Agents SDK each ship opinionated "agent" abstractions on top of model APIs. That's the wrong layer for Coterie — our agents *are* subprocess-wrapped CLIs, not in-process LLM calls. LangGraph leaves the agent surface to us.

Slide 24 of the SOLID Agent Swarms deck: "Use frameworks for what they're good at." LangGraph is good at typed-state DAG orchestration. That's what we needed.

## 2. The composition root pattern

`cli.py` is the only file where concrete LLM providers and executors get wired up. Everything else takes `LLMClient` (ABC) and `AdapterExecutor` (Protocol) via constructor.

The grep test:

```
grep -r "import anthropic\|import openai" packages/coterie-py/src/coterie/{modes,nodes}/
```

returns zero hits. If you violate that, refactor.

## 3. State schema

`CoterieState` is a `TypedDict` (not Pydantic) so LangGraph's checkpointer serializes cleanly with stdlib JSON. Mode-specific data goes in `mode_state: dict[str, Any]` — each mode owns its keys.

Reducers:

- `runs: Annotated[list[AgentRun], add]` — parallel branches each append.
- `spend_usd: Annotated[float, add]` — parallel branches each contribute their delta.
- `route_history`, `judge_history` — `add`-annotated, sequence of decisions.
- Everything else uses LangGraph's default `LastValue` channel.

## 4. Adversarial mode invariants

The Implementer/Auditor/Judge loop is the Coterie-distinctive primitive. Key invariants:

- **Auditor output is structured JSON**, not free text. Findings have `category`, `severity`, `description`, `line_ranges`. The Judge can only score what it can parse.
- **Severity threshold gates the Judge**, not the Auditor. The Auditor reports everything; the Judge filters. Lowering `sustain_threshold` makes review stricter without making the Auditor lazier.
- **Round increments after the Judge**, not after the Implementer. Round N = "after N judge decisions."
- **Out-of-rounds always terminates**, even if findings remain sustained. The user sees the final implementation + the final auditor's report and can decide what to do.

## 5. Consensus engine: clustering + labels

Clusters are produced by an LLM. The engine prompt instructs strict clustering: only merge findings that identify the same defect. Labels:

- `confirmed` — multiple supporters AND `agreement_ratio >= confirm_threshold`.
- `needs-verification` — multiple supporters, below threshold.
- `unverified` — single supporter, always.

(A single supporter is never `confirmed` regardless of threshold. This caught a real bug in tests — the prior logic treated 1/2 supporters at `threshold=0.5` as `confirmed`, which is nonsensical.)

## 6. v0.2 roadmap

- **DockerSwarmExecutor** — concrete second implementation of `AdapterExecutor`. Each fan-out branch in `consensus` / `tournament` gets its own container with the workdir bind-mounted; solves the worktree-collision problem in the current v0.1 minimal `LocalSubprocessExecutor`. Slide 18–19 of the deck.
- **Human-in-the-loop interrupts** — wire `interrupt_before` to YAML `checkpoints:` per-node toggles. Tier 1 is `rich.prompt`-driven inline confirmations; tier 2 is a `textual` TUI.
- **JS mode parity** — port all five modes to `packages/coterie-js/`. Schema and YAML stay shared; runtimes choose which LangGraph implementation to use.
- **Multi-round tournament** — bracket elimination. The architecture already supports this; only the bracket judge wiring needs updating.
- **Budget enforcement** — wire `budget.max_usd_per_task` and `on_exceed: halt|warn|checkpoint` through the graph. v0.1 tracks `spend_usd` but doesn't gate on it yet.
- **Observability** — Langfuse first (MIT, self-hostable); LangSmith as a config option. File-backed JSONL by default. See slide 25's gotcha list.

## 7. Sandboxing posture (parking)

The deck flags the Docker-socket-mount-is-root-equivalent risk (slide 25). Coterie inherits this risk if/when we ship `DockerSwarmExecutor`. Options:

- `sandbox: none` — current. Trust the prompt.
- `sandbox: workdir` — strip credential env vars before spawning.
- `sandbox: container` — Docker / Podman with read-only root and bind-mounted workdir. Network egress controlled by config.
- `sandbox: vm` — out of scope for v1.

The CLIs we orchestrate (Claude Code, Codex) already implement permission systems. Coterie's sandbox is belt-and-suspenders.

## 8. Known v0.1 limitations

1. **Fan-out worktree collisions** — `consensus` and `tournament` participants share the workdir. v0.2's `DockerSwarmExecutor` fixes this.
2. **Trivial planner** — `plan == [task]`. Real LLM-driven planning is v0.2.
3. **JS package is single-mode only** — all five modes only ship in Python at v0.1. JS catches up in v0.1.x.
4. **No budget enforcement** — tracking only.
5. **No HIL checkpoints** — schema accepts them; wiring is v0.2.
6. **Single-round tournament** — multi-round elimination is v0.1.x.

These are all on the v0.2 roadmap with the architecture already shaped to receive them.

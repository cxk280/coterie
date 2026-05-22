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

Use frameworks for what they're good at. LangGraph is good at typed-state DAG orchestration. That's what we needed.

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

- **DockerSwarmExecutor** — concrete third implementation of `AdapterExecutor` (after `LocalSubprocessExecutor` and `IsolatedWorktreeExecutor`). Each fan-out branch gets its own container with the workdir bind-mounted; solves the production-isolation gap (`IsolatedWorktreeExecutor` already solves the local collision problem).
- **HIL TUI** — v0.1 ships inline `rich.prompt` confirmations. v0.2 adds a full-screen `textual` (Python) / `ink` (Node) TUI showing live state.
- **Observability** — Langfuse first (MIT, self-hostable); LangSmith as a config option. File-backed JSONL by default.
- **True parallel multi-round tournament** — current implementation eliminates losers across rounds but each re-entry runs participants sequentially due to LangGraph state delivery semantics. v0.2 will use `Send()` to keep rounds fully parallel.
- **LLM-driven planner depth** — v0.1's planner generates flat subtask lists. v0.2 will support nested decomposition (tasks with sub-subtasks) and dependency graphs.

## 7. Sandboxing posture (parking)

Docker-socket bind-mount is root-equivalent — Coterie inherits this risk if/when we ship `DockerSwarmExecutor`. Options:

- `sandbox: none` — current. Trust the prompt.
- `sandbox: workdir` — strip credential env vars before spawning.
- `sandbox: container` — Docker / Podman with read-only root and bind-mounted workdir. Network egress controlled by config.
- `sandbox: vm` — out of scope for v1.

The CLIs we orchestrate (Claude Code, Codex) already implement permission systems. Coterie's sandbox is belt-and-suspenders.

## 8. Known v0.1 limitations

All six gaps from the original v0.1 design have been filled:

1. ~~Fan-out worktree collisions~~ — `IsolatedWorktreeExecutor` now provides per-call git worktrees for `consensus` and `tournament`.
2. ~~Trivial planner~~ — `make_llm_planner_node` decomposes tasks via an LLM when `planner.enabled: true`.
3. ~~JS package is single-mode only~~ — all five modes ship in TypeScript with 27 tests.
4. ~~No budget enforcement~~ — `agent_runner` checks `warn_at_usd` / `max_usd_per_task` with halt/warn/checkpoint policies.
5. ~~No HIL checkpoints~~ — `compile_with_interrupts` reads `config.checkpoints` and wires LangGraph's `interrupt_before` + an in-memory checkpointer. CLI handles the resume/reject loop.
6. ~~Single-round tournament~~ — `tournament.rounds: N` enables bracket elimination via state-driven loops.

Remaining work all lives in v0.2 (see section 6): production-grade Docker isolation, full TUI, observability backends, true parallel multi-round.

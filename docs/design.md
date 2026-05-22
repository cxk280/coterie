# Coterie design doc

Living document. v0.0.1 ships the minimal slice (planner → agent → END). Everything below is the roadmap to v0.1 and beyond. Decisions are recorded with reasoning so future-me (and contributors) can revisit them.

---

## 1. State schema (full)

The v0.0.1 schema in [`state.py`](../packages/coterie-py/src/coterie/state.py) / [`state.ts`](../packages/coterie-js/src/state.ts) is intentionally thin. The full target schema:

| Field | Type | Reducer | Purpose |
|---|---|---|---|
| `task` | `str` | replace | Original user prompt. Immutable after entry. |
| `plan` | `list[str]` | replace | Planner's decomposition into subtasks. |
| `current_step_idx` | `int` | replace | Cursor into `plan`. |
| `runs` | `list[AgentRun]` | append | Every CLI invocation, in order. Source of truth for cost & history. |
| `artifacts` | `dict[path, sha\|diff]` | merge | Files touched. Lets the judge diff candidates. |
| `last_winner` | `str \| None` | replace | Set by Judge on each fan-out cycle. |
| `status` | `Status` | replace | Coarse machine state for the HIL UI. |
| `config` | `dict` | replace | Loaded YAML config + runtime overrides. |
| `spend_usd` | `float` | replace | Cumulative cost; checked against `budget`. |
| `route_history` | `list[RouteDecision]` | append | Supervisor's choices, with reasons. Surfaces "why did it pick X?" |
| `pending_interrupt` | `Interrupt \| None` | replace | Current HIL prompt + the node it gates. |
| `tool_outputs` | `list[ToolRun]` | append | pytest/ruff/git results separate from agent runs. |
| `messages` | `list[Message]` | append | Optional: model-to-model chat if we add a planner↔reviewer dialog. |

**Invariants:**
- `sum(run.cost_estimate_usd for run in runs) == spend_usd` (validated at every checkpoint write).
- After fan-out: `runs[-2:].agent_id == config.fanout.pair`; `last_winner ∈ {runs[-2].agent_id, runs[-1].agent_id}`.

**Serializability:** state must JSON-encode for LangGraph's checkpointer. No live file handles, no compiled regexes — store paths and patterns as strings.

---

## 2. Supervisor / router

Single LLM call per routing decision. Cheap model (Haiku) for cost, stronger model only as escape hatch.

**Prompt template (sketch):**

```
You route coding subtasks to specialist CLI agents.

Task: {task}
Current subtask: {plan[current_step_idx]}
Subtask context (last 2 runs): {runs[-2:]}

Available agents:
{for a in agents: a.id — adapter={a.adapter} strengths={a.strengths}}

Choose ONE agent. Return strict JSON:
{"agent_id": "...", "reason": "<one sentence>"}
```

**Strategies (from schema):**
- `llm` — default, the prompt above.
- `round-robin` — deterministic; useful for testing and for users who don't want a routing model in the loop.
- `manual` — pause and ask the human (implicitly a HIL checkpoint on every step).

**Why a separate router model instead of letting agents self-elect:** auditability. Every routing decision is one structured JSON record with a reason, retrievable from `route_history` and the observability stream.

---

## 3. Fan-out + Judge

### 3.1 Fan-out execution

LangGraph supports parallel branches: `add_conditional_edges` returning a list of node names causes them to run concurrently. The join node (Judge) sees the union of state updates after both branches complete.

**Concurrency caveat:** the two agents must work on isolated worktrees so they don't clobber each other's edits. Use `git worktree add` per branch; commit candidate diffs separately; Judge picks one; loser's worktree is discarded with `git worktree remove`.

### 3.2 Judge prompt + rubric

```
You are an impartial judge comparing two attempts at the same coding task.

Task: {task}
Subtask: {plan[current_step_idx]}

Agent A ({a.agent_id}):
  diff: {a.diff}
  stdout (last 800 chars): {a.stdout[-800:]}
  tests passed: {a.tests_passed} / {a.tests_total}
  duration: {a.duration_s}s
  cost: ${a.cost_estimate_usd}

Agent B ({b.agent_id}):
  ... same shape ...

Criteria (in priority order): {config.fanout.judge.criteria}

Return strict JSON:
{
  "winner": "a" | "b" | "tie",
  "reason": "<2-3 sentences>",
  "scores": {"correctness": 1-10, "minimal-diff": 1-10, "tests-pass": 1-10, "clarity": 1-10}
}
```

**Tie handling:** if `tie`, default to the cheaper agent (predictable cost). User can override via config flag `fanout.tie_breaker: cost | speed | first`.

**Open question:** should Judge be allowed to merge artifacts from both candidates? For v0.1 → no, pick a winner outright. Merging is a fine-grained problem for v0.2.

---

## 4. Human-in-the-loop UX

### 4.1 Mechanism

LangGraph's `interrupt_before=[node_names]` pauses execution and persists state via the checkpointer. Resume with `graph.invoke(None, config={"configurable": {"thread_id": ...}})`. We map YAML toggles to that list at compile time:

```yaml
checkpoints:
  before_planner: false
  before_agent_run: true     # confirm every CLI invocation
  before_judge: false
  before_git_commit: true    # always confirm commits
  before_pytest: false
```

### 4.2 Interactive surface

Two tiers:

**Tier 1 (v0.1) — inline prompts.** When a checkpoint fires, print a structured summary and read `y/n/edit` on stdin. Use `rich.prompt.Confirm` (Python) and `prompts` (Node) for a consistent look.

**Tier 2 (v0.2) — TUI.** Full-screen view of: current plan, active node, last run output, candidate diffs side-by-side. Python: [`textual`](https://textual.textualize.io/). Node: [`ink`](https://github.com/vadimdemedes/ink). Same view structure across both.

### 4.3 What the user can do at a checkpoint

- `approve` — continue
- `reject` — abort the task (graph terminates with `status: failed`)
- `edit prompt` — modify the upcoming agent's prompt and continue
- `swap agent` — change which agent runs the next step
- `skip` — mark the step done without running it (advanced; logged loudly)

`edit prompt` and `swap agent` are the high-leverage controls — they're what turn a passive HIL gate into a real collaboration tool.

---

## 5. Budget & cost guardrails

**Tracked cost sources:**
- Per-agent `cost_estimate_usd` returned by the adapter. Claude Code's `--output-format json` includes `total_cost_usd`. Codex returns nothing structured — fall back to model rate-card × tokens estimated from prompt + output length.
- Supervisor + Judge LLM calls — known model + known token counts, so compute exactly.

**Enforcement points (cheapest to most aggressive):**
1. `warn_at_usd` — log a warning line; continue.
2. `on_exceed: warn` — same, but on the cap.
3. `on_exceed: checkpoint` *(default)* — convert the cap breach into a HIL interrupt before the next agent run. User decides whether to raise the budget or halt.
4. `on_exceed: halt` — set `status: failed` and stop.

**Per-task vs. per-session budgets:** v0.1 ships per-task. Per-session (rolling) requires persistent state across `coterie run` invocations — defer.

---

## 6. Observability

### 6.1 Decision: file → Langfuse first, LangSmith optional

| Aspect | Langfuse | LangSmith |
|---|---|---|
| License | OSS (MIT), self-hostable | Closed-source SaaS |
| LangGraph integration | Via OpenTelemetry / callbacks | First-party |
| Cost | Free self-hosted | Free tier, paid beyond |
| Multi-runtime (Py + JS) | Yes | Yes |
| Vendor neutrality | High | Low (LangChain-controlled) |

**Decision:** Langfuse is the recommended backend because it's MIT and self-hostable — matches Coterie's license stance. LangSmith is supported as a config option for teams already on it. `provider: file` is the zero-config default — JSONL events to `.coterie/logs/`.

### 6.2 Event schema (file backend)

One JSONL file per task. Events:

```json
{"ts": "...", "kind": "task_start",   "task": "..."}
{"ts": "...", "kind": "route",        "agent_id": "...", "reason": "..."}
{"ts": "...", "kind": "agent_start",  "agent_id": "...", "prompt": "..."}
{"ts": "...", "kind": "agent_end",    "agent_id": "...", "exit_code": 0, "cost_usd": 0.01}
{"ts": "...", "kind": "checkpoint",   "node": "before_git_commit", "decision": "approve"}
{"ts": "...", "kind": "judge",        "winner": "claude", "scores": {...}}
{"ts": "...", "kind": "task_end",     "status": "done", "total_cost_usd": 0.13}
```

Stable schema — third-party tools can grep / jq it.

---

## 7. Sandboxing

The threat model: an agent gets a malicious instruction (prompt injection from a file it reads) and runs `rm -rf` or exfiltrates secrets.

**Tiers (config: `sandbox.level`):**
- `none` *(default)* — agents run in the current process's environment. Fine for trusted prompts and personal workstations.
- `workdir` — chroot-ish: the adapter is invoked with `cwd=workdir` and the process inherits a stripped env (no `AWS_*`, `GITHUB_TOKEN`, etc.). Easy win, doesn't prevent network access.
- `container` — spawn the CLI inside a per-task Docker/Podman container with the workdir bind-mounted read-write and the rest of the FS read-only. Network egress controlled per config.
- `vm` — out of scope for v1; document for the future (firecracker / Lima).

**Open question:** the supplied CLIs (Claude Code etc.) already implement their own permission systems. Coterie's sandbox is a *belt* on top of their *suspenders*. v0.1 ships `none` and `workdir`; container support is v0.2.

---

## 8. Adapter contract (for third parties)

A new adapter is a class that implements:

```python
# Python
class MyAdapter(CLIAdapter):
    def build_command(self, prompt: str, workdir: str, *, extra: dict) -> list[str]: ...
    def parse_result(self, stdout: str, stderr: str, exit_code: int) -> AdapterResult: ...
```

```ts
// TypeScript
export class MyAdapter extends CLIAdapter {
  buildCommand(prompt: string, workdir: string, extra: Record<string, unknown>): string[]
  parseResult(stdout: string, stderr: string, exitCode: number): AdapterResult
}
```

Must return `AdapterResult` with stable fields. Cost estimate is optional but encouraged. Files-changed list is best-effort (fall back to `git status --porcelain` if the CLI doesn't surface it).

---

## 9. Tool nodes

`pytest`, `ruff`, `git`, `eslint`, `vitest`, `shell` — deterministic subprocesses that read/write state without calling an LLM. Implemented in `tools/` mirroring `adapters/`.

**Routing:** the supervisor can choose to run a tool node instead of an agent. Example: after an agent run, the supervisor sees the diff and routes to `pytest` to validate. Pytest fails → supervisor routes back to the agent with the test output in context.

**Why separate from adapters:** different lifecycle (no cost, fixed args, deterministic output), and the supervisor's prompt should distinguish "delegate to an LLM" from "run a verification step."

---

## 10. Versioning & stability

- v0.0.x — minimal slice; APIs may change between patches.
- v0.1.0 — feature complete: supervisor, fan-out + judge, HIL, tool nodes, budget, file observability.
- v0.2.0 — TUI, container sandbox, Langfuse/LangSmith integration.
- v1.0 — API freeze.

Both packages stay version-locked. A Python `coterie==0.x` and a Node `coterie@0.x` ship the same feature set, validated by a shared integration test that runs identical YAML configs through both runtimes.

---

## 11. Open questions / parking lot

- **Multi-step planning model.** v0.1 uses a trivial planner (`plan = [task]`). A real planner that decomposes work is its own design problem; defer to v0.2 and look at what Aider / Cursor's planner do.
- **Cross-runtime adapter sharing.** Could a Python adapter expose itself to the Node runtime via a tiny RPC? Probably overkill — subprocess interop already works.
- **Web dashboard.** Tutti / Tessera both ship dashboards. Worth one? Maybe v0.3, after the CLI is solid.
- **N-way fan-out (N>2).** Schema allows future extension; v0.1 ships pair-only.
- **Replay & determinism.** Given a JSONL event log, can we replay a run with stubbed agents to reproduce the trace? Useful for tests; punt to v0.2.

# Architecture

One npm package: `packages/coterie-js` (published as `coterie`). What each part
of `src/` does, and how a turn flows through it. For the product-level story
(modes, the deliberate-then-finalize split), see the README.

## Module map

| Path | What it is |
|---|---|
| `cli.ts` | Entry point (`coterie` bin). Subcommands `chat` (default), `run`, `doctor`. |
| `index.ts` | Library entry: re-exports the public API for programmatic use. |
| `graph.ts` | Mode dispatcher: looks up the mode in the registry and builds its graph. |
| `config.ts` | Loads + schema-validates a `coterie.yaml` (used by `run`; chat builds its own defaults). |
| `chat/` | The conversational product: REPL loop (`repl.ts`), live trace rendering (`trace.ts`, `render.ts`), conversation memory (`transcript.ts`), per-mode default configs (`configs.ts`), agent preflight/doctor (`preflight.ts`, `doctor.ts`), and the finalizer (`finalizer.ts`) — the sole step that edits files. |
| `modes/` | One file per coordination strategy (single, adversarial, debate, tournament, consensus). Each wires nodes into a LangGraph `StateGraph` and registers itself by name. |
| `nodes/` | The graph nodes the modes share: `agentRunner.ts` (runs an agent CLI), plus each mode's coordination logic (router, auditor/judge, moderator, bracket judge, consensus engine, planner). |
| `adapters/` | One class per agent CLI (Claude Code, Codex, Cursor, plus a test fake): builds the argv, parses output, streams progress. `base.ts` owns the shared run plumbing. |
| `core/` | Shared machinery: graph state + helpers (`state.ts`, `annotation.ts`), executors incl. the isolated-worktree sandbox (`executor.ts`), subprocess capture (`spawn.ts`), registries, JSON/timeout utilities, config cross-checks (`validate.ts`), and `llm/` — the coordination-LLM clients (judge/router/engine seats) that also run on subscription CLIs. |

## How a chat turn flows

1. `cli.ts` → `chat/repl.ts`: build the lineup from installed+signed-in agents
   (`chat/preflight.ts`), pick the coordination CLI (`core/llm/build.ts`).
2. Each prompt becomes a task (`chat/transcript.ts` prepends bounded history) and
   runs through the active mode's graph (`graph.ts` → `modes/*`): agent seats are
   `nodes/agentRunner.ts` instances executing **read-only** in throwaway worktrees
   (`core/executor.ts`); judge/moderator/engine seats call `core/llm/*`.
3. Progress streams live over the process-wide bus (`core/progress.ts` →
   `chat/trace.ts`).
4. The deliberation digest (`chat/render.ts`) goes to the finalizer
   (`chat/finalizer.ts`), the only agent that runs in the real workdir — it
   applies the edits and writes the reply (or, in plan mode, just a plan).

`coterie run` is the non-interactive variant: same graphs, but config comes from
a YAML file and there's no finalizer phase — the mode's own executor policy
decides what lands in the workdir.

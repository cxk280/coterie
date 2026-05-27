# Modes: when to use each

Coterie's pitch is **multi-mode**: the coordination pattern is a config flag, not
a product. Five modes ship today. Pick by task shape, not by familiarity.

> **In `coterie chat`,** each mode below is the *deliberation* phase — it runs in
> throwaway worktrees and never mutates your repo. A final *finalizer* agent then
> runs in your workdir, uses the deliberation as advice, applies the edits, and
> writes the reply. So edits land in every mode; the mode just shapes the scrutiny
> the request gets first. (The one-shot `coterie run` skips the finalizer and
> returns the raw mode output.)

## Quick decision matrix

| Task shape | Mode | Why |
|---|---|---|
| "Implement / refactor X" — one specialist enough | `single` | Cheapest. One CLI invocation per subtask, routed by a cheap supervisor. |
| "Find every issue in this code" — survey of opinions | `consensus` | N agents independently report; engine surfaces what agents agree on. MCO-style. |
| "Implement X — and then stress-test it" — code + review loop | `adversarial` | Implementer writes; Auditor attacks; Judge sustains real defects. Iterative refinement. |
| "Which approach should we use?" — design decision | `debate` | Pro/Con/Moderator/Judge. Best for architecture choices, library selection, build-vs-buy. |
| "I want the best of N for this critical change" | `tournament` | N participants race; judge ranks. Use when correctness > cost. |

## Cost ordering (cheapest to most expensive)

`single` < `adversarial` (1 round) < `debate` < `consensus` ≈ `tournament` < `adversarial` (3 rounds)

- `single` is one CLI invocation per subtask.
- `adversarial` is at least 2 CLI invocations + 1 judge LLM call per round; multi-round can run 6+ CLI invocations.
- `debate` is `2 × rounds` CLI invocations + `rounds` moderator LLM calls + 1 judge LLM call.
- `consensus` is N CLI invocations + 1 engine LLM call.
- `tournament` is N CLI invocations + 1 judge LLM call.

On the default subscription setup these invocations are `$0 metered` — they ride your
Claude/ChatGPT/Cursor logins, not a pay-as-you-go API key. If you instead wire a metered
API provider (on the roadmap), `budget.max_usd_per_task` caps spend per task.

## `single` — supervisor routes

```
START → planner → supervisor → agent → supervisor → ... → END
```

Supervisor picks one agent per subtask using `router.strategy: llm` (an LLM looks
at agent strengths and chooses) or `round-robin` (deterministic). On multi-step
plans, the supervisor advances through `plan[]` calling one agent per step.

## `consensus` — N agents agree

```
START → planner → [agent_1 || agent_2 || ... || agent_N] → engine → END
```

Every participant gets the same prompt: "list defects you find." Each returns a
JSON array. The engine LLM clusters semantically equivalent findings across
agents and labels each cluster:

- `confirmed` — supporters ≥ `confirm_threshold` × N (and more than one supporter)
- `needs-verification` — 2+ supporters but below threshold
- `unverified` — single supporter (always, regardless of threshold)

Best for: code review, security audits, generic "what's wrong with this?"

## `adversarial` — Implementer + Auditor + Judge

```
START → planner → implementer → auditor → judge --[revise & rounds left]--> implementer
                                              \
                                               --[accept or out of rounds]--> END
```

The defining mode. Implementer writes code; Auditor critiques with a structured
findings JSON (category, severity, line ranges); Judge sustains findings above
`sustain_threshold` and decides accept vs revise. On revise + rounds remaining,
the loop runs again — the Implementer's next prompt includes the sustained
critiques so it knows what to fix.

Best for: high-stakes implementation where stress-testing matters. Think of it as
red-team / blue-team for code.

## `debate` — Pro + Con + Moderator + Judge

```
START → planner → pro → con → moderator → [loop N rounds] → judge → END
```

Two agents argue opposing positions on a single question. Moderator summarizes
each round. Judge picks the winner.

Best for: design and architecture decisions where the inputs are arguments, not
code. "Should we use Postgres or SQLite?" "Should this be a microservice?"
"Should we adopt Server Components?"

## `tournament` — N-way bracket

```
START → planner → [participant_1 || ... || participant_N] → bracket_judge → END
```

All participants attempt the same task in parallel. Judge ranks them on
configured criteria (`correctness`, `minimal-diff`, `tests-pass`, `clarity`) and
picks a winner.

v0.1 is single-round N-way. Multi-round elimination bracket (8 → 4 → 2 → 1) is
v0.1.x.

Best for: high-stakes one-shot tasks where you'd otherwise pick the best of
multiple agent runs manually.

---

## Future modes (parking lot)

- `iterative-refinement` — single agent, but loops with self-critique each round.
- `delegate-and-verify` — one strong agent plans, multiple weaker agents execute, plan agent verifies.
- `committee` — N specialists vote on each subtask; plurality wins.

Adding a mode is a new file in `packages/coterie-js/src/modes/` that calls `registerMode("<name>", build)`, plus an import in `src/modes/index.ts`. The graph dispatcher picks it up from the registry.

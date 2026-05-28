# Coterie

[![CI](https://dl.circleci.com/status-badge/img/gh/cxk280/coterie/tree/main.svg?style=svg)](https://dl.circleci.com/status-badge/redirect/gh/cxk280/coterie/tree/main)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> A conversational multi-agent coding CLI. You chat like you're talking to one
> coding assistant — but **every prompt runs through a coordination strategy**
> (debate, adversarial review, tournament, consensus, or single) over the real
> coding-agent CLIs you already have. The agents **deliberate read-only** — they
> review, critique, and compete but never touch your files — then a single
> **finalizer** agent applies the edits and writes the reply, so each response is
> the product of a reliability-raising round, not one model's first guess. Prefer
> to look before you leap? **`/plan`** mode shows you what they'd do and changes
> nothing on disk.

```
▲ coterie chat
  mode=adversarial · workdir=. · agents: claude-code, codex, cursor · $0 metered
  modes: single, adversarial, debate, tournament, consensus
  Each turn: agents deliberate (read-only), then one finalizer applies edits + replies. /mode to change modes. /help for commands.

coterie(adversarial)› add a retry decorator to http.py and cover it with tests
  · implementer (claude-code)
      Added a @retry decorator with exponential backoff; wrote 3 tests.
  · auditor (codex)
      • [medium] edge-case: no jitter — thundering-herd risk on retries
  · judge → implementer: backoff correct; add jitter then accept
  · finalizer (claude-code) — edited http.py, test_http.py

  Added @retry to http.py (exponential backoff + jitter) and covered it with
  three tests in test_http.py. All pass.
```

It edits your repo when you ask and answers when you ask — and it runs **entirely
on your existing subscriptions** (Claude Max / ChatGPT / Cursor Pro), so a full
turn is **$0 metered**: no API keys, no pay-as-you-go.

---

## How Coterie is different

Most coding tools hand you **one** assistant. Coterie is a thin layer **on top of
the coding-agent CLIs you already run** — it puts several of them on every prompt
and gives you back a single answer.

- **It orchestrates agents; it doesn't replace them.** Claude Code, Codex, and
  Cursor keep their own models, prompts, and tools. Coterie just decides who does
  what under which strategy — so you get *cross-model* scrutiny (different vendors
  checking each other's work), not one model's opinion repeated.
- **Every reply is the result of a round, not a first guess.** An implementer
  writes, an auditor attacks, a judge decides — or agents debate, compete, or
  reach consensus. The disagreement is the feature: it catches the mistake a lone
  agent would have shipped.
- **It's a finished terminal app, not a framework.** Agent frameworks (CrewAI,
  AutoGen, or rolling your own on LangGraph) are libraries you write code against
  and point at metered model APIs. Coterie is just `coterie chat` — install it and
  it drives the agent CLIs already on your machine. No glue code, no orchestration
  to build.
- **$0 metered, by design.** It rides the subscriptions you already pay for
  (Claude Max / ChatGPT / Cursor Pro), not pay-as-you-go tokens — so a full
  multi-agent round costs nothing on top, and a session can't run up an API bill.
- **Nothing to configure, nothing to lock into.** It finds each CLI on your
  `PATH` and lets it use its own saved login — whatever already works in your
  shell works here. No API keys, no config file of paths or credentials. Add or
  drop an agent any time; more arrive as simple adapters.

In short: if one agent is a single engineer, Coterie is a small review team that
already lives in your terminal — built from the tools you've already got.

---

## Requirements

- **Node.js ≥ 20** and **git**.
- **At least two** of the agent CLIs below, installed and signed in — Coterie
  coordinates multiple agents, so it needs two to deliberate, but *any* two will
  do and it'll use all you have (more agents can be added over time):

| Agent | Install | Sign in |
|---|---|---|
| **Claude Code** | `npm install -g @anthropic-ai/claude-code` | run `claude`, sign in to Claude (Max/Pro) |
| **Codex** | `npm install -g @openai/codex` | run `codex`, sign in with your ChatGPT account |
| **Cursor** | `curl https://cursor.com/install -fsS \| bash` | `cursor-agent login` |

Run **`coterie doctor`** any time to see which are installed and signed in:

```
$ coterie doctor
Coterie coordinates multiple agents, so it needs at least 2 of these installed and signed in (any combination — and it'll use more if you have them):

  ✓ claude        — ready
  ✓ codex         — ready
  ✗ cursor-agent  — not installed
      Install: curl https://cursor.com/install -fsS | bash

2 of 3 ready — good to go.
```

**Coterie needs no config of its own for any of this.** It finds each CLI on your
`PATH` and lets it read its own credentials, so it authenticates exactly as your
shell does — whatever works in your terminal works here. No `ANTHROPIC_API_KEY` /
`OPENAI_API_KEY` needed; if one is set, the agents still use your subscription
(Coterie strips it from the agent's environment).

## Install

Install from npm — this puts the `coterie` command on your PATH:

```bash
npm install -g coterie
```

Verify:

```bash
coterie --help     # should list `chat`, `run`, and `doctor`
coterie doctor     # checks you have at least two agent CLIs ready
```

<details>
<summary>Or install from source</summary>

```bash
git clone https://github.com/cxk280/coterie
cd coterie/packages/coterie-js
npm install
npm run build      # compile TypeScript → dist/
npm link           # puts `coterie` on your PATH globally
```
</details>

## Use it

```bash
cd ~/your-project          # the repo the agents read/edit (the "workdir")
coterie chat               # adversarial by default; runs in the current directory
```

Then just talk to it. Each turn runs a full multi-agent round behind the scenes;
the answer (and any file edits) is the result.

By default you see the **agent exchanges** stream live — each agent's actual
contribution, the judge's verdict, what the finalizer changed — so the round is
legible, not a black box. `/hide` (or `--quiet`) collapses it to just the reply.

**In-session commands:** `/mode <name>` (switch strategy per prompt) ·
`/plan [on|off]` (plan mode — deliberate but change no files) ·
`/show` `/hide` (the live agent exchanges) · `/clear` (forget the conversation) ·
`/help` · `/exit`

**Flags:** `coterie chat --mode debate --workdir ~/other-repo --quiet --plan`

### Plan mode — look before you leap

Sometimes you want to see what the agents would do *before* anything is written to
disk. Toggle **`/plan`** (or start with `--plan`): the agents still run the full
deliberation, but the finalizer writes you a **plan** — the steps and file changes
it *would* make — instead of editing. Nothing on disk changes while plan mode is
on; the prompt shows `coterie(adversarial · plan)›` so you always know. Toggle
`/plan` off (or `/plan off`) when you're ready to let it implement.

## What happens behind the scenes

Every turn has two phases:

1. **Deliberation** — the chosen mode runs the real agent CLIs **read-only** in
   throwaway git worktrees, so they never touch your files: they propose, critique,
   compete, or review, but make no edits. The mode shapes *how* they deliberate.
2. **Finalize** — one agent (the judge seat) runs in your actual workdir, reads
   the deliberation as advice, **applies the edits/actions**, and writes the
   plain-language reply. It's the **only** step that changes your files and the
   only source of the answer — so file edits land in *every* mode, and you never
   get raw findings JSON back.

The split is enforced two ways: the deliberating agents are invoked in their CLI's
read-only/plan mode (Claude Code `plan`, Codex `read-only` sandbox), and they run
in a throwaway worktree that's discarded regardless — so even an agent without a
read-only flag (Cursor) can't change your repo during deliberation.

In **plan mode** (`/plan`), the finalizer is held to the same read-only bargain:
it reads the deliberation and writes you a plan, but makes no edits — so a plan-mode
turn changes nothing on disk at all.

## The five modes (the deliberation phase)

| Mode | What the agents do | Best for |
|---|---|---|
| `single` | a router picks one agent to attempt it | quick edits, simple asks |
| `adversarial` | implementer + auditor + judge, with a refinement loop | reliable code changes (default) |
| `debate` | two agents argue; a moderator + judge decide | decisions, tradeoffs |
| `tournament` | N agents compete; a bracket judge ranks | best-of-N for critical work |
| `consensus` | agents review independently; an engine merges agreement | reviews, audits |

Pick the mode by how much scrutiny the request deserves: `single` is quickest,
`adversarial` adds an auditor/judge loop, and `debate` / `tournament` / `consensus`
gather more perspectives before the finalizer acts. More detail:
[docs/modes.md](docs/modes.md).

Coterie builds each session's lineup from whichever agents are installed and
signed in, and **assigns roles automatically** — for a two-seat mode like
`adversarial`, the first available agent implements and the second audits; the
many-agent modes use everyone. (Choosing roles by hand is on the roadmap.)

## Why it's built this way

1. **Deliberate, then act** — splitting each turn into an advisory deliberation
   (isolated, never mutates your repo) and a single finalizer that applies the
   edits keeps the multi-agent debate honest while giving you exactly one coherent
   change set and one human-readable reply, in every mode.
2. **LangGraph as the spine** — each mode is a `StateGraph`, so you get
   resumability, branch parallelism, and clean per-node streaming for the live trace.
3. **Heterogeneous CLI subprocesses as the agents** — Claude Code, Codex, Cursor;
   each keeps its own model, prompt scaffolding, and tool harness. Coterie decides
   who runs what under which coordination pattern. Adding a new CLI is one small adapter.
4. **Subscription-only, by design** — coordination (routing / judging / merging)
   runs on a coding agent's CLI, preferring Claude (`claude -p`) but **falling
   back to Codex or Cursor** so it works without Claude installed. There is
   intentionally **no pay-as-you-go API backend**, so a session can never run up a
   metered bill. A pluggable API provider could be added later — deliberately not
   wired in today.

> **Grok is deferred:** unlike Claude / Codex / Cursor it has no
> subscription-backed headless coding CLI (only the pay-as-you-go xAI API), so it
> can't join the $0-metered lineup yet.

## Roadmap

- **Manual role assignment per strategy.** Today Coterie auto-assigns roles from
  your available agents (e.g. who implements vs. audits in `adversarial`). A
  config will let you pin a specific installed agent to a specific role in each
  mode — e.g. "Codex implements, Claude audits" — instead of taking the default
  order.
- **Pay-as-you-go API support.** Coterie is subscription-only today, by design,
  so a session can never run up a metered bill. A pluggable API provider
  (Anthropic / OpenAI-compatible / xAI) is planned for keyless or headless
  environments where the subscription CLIs aren't available — opt-in, so the
  default stays $0-metered.
- **More agents.** The agent set is registry-driven; new coding-agent CLIs (incl.
  Grok, once it ships a subscription-backed headless CLI) slot in as small
  adapters and join `coterie doctor` and the lineup automatically.

## One-shot (non-conversational)

```bash
coterie run "find every bug in src/auth.ts" --config examples/consensus.coterie.yaml
```

Runs a single task through one mode from a YAML config (see [examples/](examples/))
and prints the result.

## Develop

```bash
cd packages/coterie-js
npm run build       # tsc → dist/
npm test            # fast suite — offline + deterministic; this is the CI gate
npm run test:e2e    # real-agent end-to-end — drives the actual `coterie chat`
```

Three test layers:

- **Unit** — pure logic + preflight, fully offline (`spawnSync`/`fs` mocked, plus
  `FakeAdapter` + `ScriptedLLMClient`). Deterministic.
- **Black-box** (`tests/cli.blackbox.test.ts`) — spawns the built `coterie` with a
  sandboxed `PATH`/`HOME` to assert real exit codes and the missing-CLI
  remediation, without touching any network or real agent.
- **End-to-end** (`tests/e2e/`, run via `npm run test:e2e`) — drives the real
  `coterie chat` against Claude Code + Codex **on your subscriptions**, asserting
  that file edits actually land and replies are prose. It spends subscription
  calls and is nondeterministic, so it's excluded from `npm test` and the CI gate
  and **self-skips** unless both CLIs are installed and signed in. CI can't run it
  (it can't hold your logins) — run it locally before a release.

## License

[MIT](LICENSE). Copyright © 2026 Chris King.

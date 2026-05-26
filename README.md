# Coterie

[![CI](https://dl.circleci.com/status-badge/img/gh/cxk280/coterie/tree/main.svg?style=svg)](https://dl.circleci.com/status-badge/redirect/gh/cxk280/coterie/tree/main)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> A conversational multi-agent coding CLI. You chat like you're talking to one
> coding assistant — but **every prompt runs through a coordination strategy**
> (debate, adversarial review, tournament, consensus, or single) over the real
> coding-agent CLIs you already have, so each reply is the product of a
> reliability-raising round, not one model's first guess.

```
▲ coterie chat
  mode=adversarial · workdir=. · coordination=subscription (claude -p)

coterie(adversarial)› add a retry decorator to http.py and cover it with tests
  · implementer (claude-code)
  · auditor (codex)
  · judge → claude-code: tests pass, edge cases covered

  Added @retry to http.py with exponential backoff + tests in test_http.py.
```

It edits your repo when you ask and answers when you ask — and it runs **entirely
on your existing subscriptions** (Claude Max / ChatGPT / Cursor Pro), so a full
turn is **$0 metered**: no API keys, no pay-as-you-go.

---

## Requirements

- **Node.js ≥ 20** and **git**.
- At least the two default agent CLIs, installed and signed in to their
  subscriptions (Coterie runs a startup check and tells you if any are missing):

| Agent | Install | Sign in |
|---|---|---|
| **Claude Code** | `npm install -g @anthropic-ai/claude-code` | run `claude`, sign in to Claude (Max/Pro) |
| **Codex** | `npm install -g @openai/codex` | run `codex`, sign in with your ChatGPT account |
| **Cursor** *(optional)* | `curl https://cursor.com/install -fsS \| bash` | `cursor-agent login` |

No `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` needed — and if one is set, the agents
still use your subscription (Coterie strips it from the agent's environment).

## Install

Coterie isn't on npm yet — install from source and link the `coterie` command
onto your PATH:

```bash
git clone https://github.com/cxk280/coterie
cd coterie/packages/coterie-js
npm install
npm run build      # compile TypeScript → dist/
npm link           # puts `coterie` on your PATH globally
```

Verify:

```bash
coterie --help     # should list `chat` and `run`
```

## Use it

```bash
cd ~/your-project          # the repo the agents read/edit (the "workdir")
coterie chat               # adversarial by default; runs in the current directory
```

Then just talk to it. Each turn runs a full multi-agent round behind the scenes;
the answer (and any file edits) is the result.

**In-session commands:** `/mode <name>` (switch strategy per prompt) ·
`/show` `/hide` (the live round trace) · `/clear` (forget the conversation) ·
`/help` · `/exit`

**Flags:** `coterie chat --mode debate --workdir ~/other-repo --quiet`

## The five modes

| Mode | What happens | Best for |
|---|---|---|
| `single` | a router picks one agent | quick edits, simple asks |
| `adversarial` | implementer + auditor + judge, with a refinement loop | reliable code changes (default) |
| `debate` | two agents argue; a moderator + judge decide | decisions, tradeoffs |
| `tournament` | N agents compete; a bracket judge ranks | best-of-N for critical work |
| `consensus` | agents answer independently; an engine merges agreement | reviews, audits |

Coding edits land cleanest in `single` / `adversarial` (one implementer, gated by
the auditor/judge). `debate` / `tournament` / `consensus` produce a synthesized
**answer** rather than competing edits — use them for decisions and
high-confidence responses. More detail: [docs/modes.md](docs/modes.md).

## Why it's built this way

1. **LangGraph as the spine** — each mode is a `StateGraph`, so you get
   resumability, branch parallelism, and clean per-node streaming for the live trace.
2. **Heterogeneous CLI subprocesses as the agents** — Claude Code, Codex, Cursor;
   each keeps its own model, prompt scaffolding, and tool harness. Coterie decides
   who runs what under which coordination pattern. Adding a new CLI is one small adapter.
3. **Subscription-only, by design** — coordination runs on your Claude
   subscription via `claude -p`; there is intentionally **no pay-as-you-go API
   backend** so a session can never run up a metered bill. A pluggable provider
   could be added later for keyless environments — it's deliberately not wired in today.

> **Grok is deferred:** unlike Claude / Codex / Cursor it has no
> subscription-backed headless coding CLI (only the pay-as-you-go xAI API), so it
> can't join the $0-metered lineup yet.

## One-shot (non-conversational)

```bash
coterie run "find every bug in src/auth.ts" --config examples/consensus.coterie.yaml
```

Runs a single task through one mode from a YAML config (see [examples/](examples/))
and prints the result.

## Develop

```bash
cd packages/coterie-js
npm test            # vitest — fully offline (FakeAdapter + ScriptedLLMClient, no CLIs/network)
npm run build       # tsc → dist/
```

## License

[MIT](LICENSE). Copyright © 2026 Chris King.

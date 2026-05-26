# coterie

A conversational meta-agent for your terminal. You chat like you're talking to a
single coding assistant, but **every turn runs through a multi-agent coordination
round** (debate, adversarial review, tournament, consensus, or single) behind the
scenes — raising the reliability and quality of each response.

```bash
coterie chat                       # in any repo — each prompt runs a multi-agent round
```

```
▲ coterie chat
  mode=adversarial · workdir=. · coordination=subscription (claude -p)

coterie(adversarial)› add a retry decorator to http.py and cover it with tests
  · implementer (claude-code)
  · auditor (codex)
  · judge → claude-code: tests pass, edge cases covered

  Added @retry to http.py with exponential backoff + tests in test_http.py.
```

## Setup (one-time)

Not on npm yet — install from source and link the `coterie` command onto your PATH:

```bash
git clone https://github.com/cxk280/coterie
cd coterie/packages/coterie-js
npm install
npm run build      # compile TypeScript → dist/
npm link           # puts `coterie` on your PATH globally
```

Sign in to the agent CLIs — they run on your **subscriptions**, no API keys:

```bash
claude    # sign in to Claude Max, then exit
codex     # sign in with your ChatGPT account
# cursor-agent (optional) — for the Cursor agent
```

`coterie chat` runs a startup preflight and tells you exactly what to install or
sign into if anything's missing. *(Once published, this whole section becomes
`npm install -g coterie`.)*

Then, in any repo you want it to work in:

```bash
cd ~/my-project
coterie chat        # runs entirely on your subscriptions — $0 metered
```

## How it works

Each prompt becomes a one-turn coordination round over the **real coding-agent
CLIs you already have** — Claude Code and Codex (Cursor optional). The mode
decides how they cooperate; the synthesized result (and any file edits) is the
reply. Switch strategies per prompt with `/mode <name>`.

Each turn has two phases: the agents **deliberate** in throwaway worktrees (they
never touch your files), then one **finalizer** agent runs in your workdir,
applies the edits, and writes the plain-prose reply. So file edits land in *every*
mode, and you never get raw findings JSON back. The mode shapes the deliberation:

| Mode | What the agents do | Best for |
|---|---|---|
| `single` | a router picks one agent to attempt it | quick edits, simple asks |
| `adversarial` | implementer + auditor + judge, with refinement | reliable code changes |
| `debate` | two agents argue, a moderator + judge decide | decisions, tradeoffs |
| `tournament` | N agents compete, a bracket judge ranks | best-of-N for critical work |
| `consensus` | agents review independently, an engine merges agreement | reviews, audits |

## Runs on your subscriptions ($0 metered)

Everything runs on your existing logins — the agents on **Claude Max**, **ChatGPT**
(Codex), and **Cursor Pro**, and the behind-the-scenes coordination (routing /
judging / moderating) on your **Claude subscription** via `claude -p`. So a full
turn is **$0 metered** — no setup, no flags. On startup `coterie chat` checks each
required CLI is installed and signed in, and tells you exactly what to do if not.

> **No pay-as-you-go API backend (yet).** Coordination is subscription-only by
> design, so a session can never run up a surprise metered bill. A pluggable API
> provider (Anthropic / OpenAI-compatible) may be added later for environments
> without the subscription CLIs — it's intentionally not wired in today.

> **Grok is deferred** for the same reason: unlike Claude / Codex / Cursor it has
> no subscription-backed headless coding CLI (only the pay-as-you-go xAI API), so
> it can't join the $0-metered lineup yet.

## Commands

`/mode <name>` · `/show` `/hide` (live agent exchanges) · `/clear` · `/help` · `/exit`

The agent exchanges stream live by default — each agent's contribution, the
judge's verdict, what the finalizer changed. `/hide` (or `--quiet`) shows only the
reply.

```bash
coterie chat --mode debate --workdir ~/proj   # start in a mode, against a repo
coterie chat --quiet                            # hide the agent exchanges
```

## One-shot (non-conversational)

```bash
coterie run "find every bug in src/auth.ts" --config examples/consensus.coterie.yaml
```

## Test

```bash
npm test            # fast, offline, deterministic — the CI gate
npm run test:e2e    # real-agent end-to-end (spends subscription calls; needs claude + codex signed in)
```

See the [top-level README](../../README.md) for architecture, the five modes in
depth, and the full breakdown of the three test layers.

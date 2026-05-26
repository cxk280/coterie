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
export COTERIE_COORDINATION_PROVIDER=claude-cli   # coordination on your Claude sub too → $0 metered
coterie chat
```

## How it works

Each prompt becomes a one-turn coordination round over the **real coding-agent
CLIs you already have** — Claude Code and Codex (Cursor optional). The mode
decides how they cooperate; the synthesized result (and any file edits) is the
reply. Switch strategies per prompt with `/mode <name>`.

| Mode | What happens | Best for |
|---|---|---|
| `single` | a router picks one agent | quick edits, simple asks |
| `adversarial` | implementer + auditor + judge, with refinement | reliable code changes |
| `debate` | two agents argue, a moderator + judge decide | decisions, tradeoffs |
| `tournament` | N agents compete, a bracket judge ranks | best-of-N for critical work |
| `consensus` | agents answer independently, an engine merges agreement | reviews, audits |

Coding edits land cleanest in `single`/`adversarial` (one implementer, gated by
the auditor/judge). `debate`/`tournament`/`consensus` produce a synthesized
*answer* rather than competing edits — use them for decisions and high-confidence
responses.

## Runs on your subscriptions ($0 metered)

The agent CLIs run on your existing logins — **Claude Max**, **ChatGPT** (Codex),
and **Cursor Pro** — not pay-per-token API keys. Set
`COTERIE_COORDINATION_PROVIDER=claude-cli` and the behind-the-scenes coordination
(routing/judging) also runs on your Claude subscription, so a full turn is $0
metered. On startup `coterie chat` checks each required CLI is installed and
signed in, and tells you exactly what to do if not.

> **Grok is deferred.** Unlike Claude, Codex, and Cursor, Grok has no
> subscription-backed headless coding CLI — the only path is the pay-as-you-go
> xAI API, which breaks the zero-metered-cost model. It'll be added if/when a
> subscription CLI exists.

## Commands

`/mode <name>` · `/show` `/hide` (live trace) · `/clear` · `/help` · `/exit`

```bash
coterie chat --mode debate --workdir ~/proj   # start in a mode, against a repo
coterie chat --quiet                            # hide the round trace
```

## One-shot (non-conversational)

```bash
coterie run "find every bug in src/auth.ts" --config examples/consensus.coterie.yaml
```

See the [top-level README](../../README.md) for architecture, the five modes in
depth, and the Python sibling package.

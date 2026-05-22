# SOLID Self-Review Checklist

Contributor checklist. When you add a new adapter, mode, or LLM provider, this is the review gate.

---

## 1. S — Single Responsibility

> Can I describe each class with one sentence — without using "and"?

- **`CLIAdapter`** — wraps one coding CLI as a callable subprocess. ✓
- **`LLMClient`** — sends one chat message and returns a response string. ✓
- **`AgentRegistry`** — maps names to adapter classes. ✓
- **`AdapterExecutor`** — runs an adapter; nothing else. ✓
- **Mode builders** — wire a specific LangGraph topology; nothing else. ✓

If you can't describe your new class in one sentence without "and," split it.

## 2. O — Open / Closed

> What's the friction cost of adding a new variant — a tool, a provider, an agent?

- **Add an adapter**: new file in `adapters/` + `@register_adapter` decorator. **No registry edit.** ✓
- **Add a mode**: new file in `modes/` + `@register_mode("name")` decorator. **No dispatcher edit.** ✓
- **Add an LLM provider**: new subclass of `LLMClient` (or `_OpenAICompatibleClient`). **No edit to any node.** Only `cli.py` (the composition root) gains a case in `_build_llm`. ✓

If adding a variant edits more than two files, you've violated O.

## 3. L — Liskov Substitution

> Do my consumer types name a concrete class, or an ABC/Protocol?

- Graph nodes consume `AdapterExecutor` (Protocol) — they never know if they're
  running locally, in Docker, or on Kubernetes. ✓
- Graph nodes consume `LLMClient` (ABC) — they never know if they're using
  Anthropic, OpenAI, Groq, or a Scripted fake. ✓
- The Anthropic test boundary: `grep -r "import anthropic" packages/coterie-py/src/coterie/{modes,nodes}/` returns zero hits. ✓

If a node imports a concrete adapter / provider, you've violated L.

## 4. I — Interface Segregation

> Are there abstract methods my consumers never call?

- `LLMClient.chat()` is one method. ✓
- `CLIAdapter` declares two abstract methods (`build_command`, `parse_result`)
  + provides one concrete (`run`). Subclasses can override `run` if they need to
  (e.g., `FakeAdapter` short-circuits subprocess spawning). ✓

If you find yourself adding optional methods that "maybe a subclass needs," they
belong in a sibling ABC.

## 5. D — Dependency Inversion

> Where do concrete deps get wired?

- **`cli.py` is the only composition root.** ✓
- LLM provider selection: `_build_llm()` in `cli.py`. Reads `COTERIE_LLM_PROVIDER`
  env var or infers from model name.
- Executor selection: `LocalSubprocessExecutor()` in `cli.run()`. The v0.2
  `DockerSwarmExecutor` will be picked here with a `--executor swarm` flag.
- Adapter selection: `ADAPTER_REGISTRY.require(name)` in `nodes/agent_runner.py`,
  driven by config — but the *registry itself* is populated by import-time
  registration, not by `cli.py` editing it.

If concrete deps get wired in graph code, modes, nodes, or adapters, you've
violated D. Push the wiring up to `cli.py`.

---

## Quick failure smell test

If you're about to commit and any of these are true, stop:

- [ ] You added a name-based `if/elif` chain somewhere.
- [ ] You imported `anthropic` or `openai` from outside `core/llm/` or `cli.py`.
- [ ] You edited `adapters/__init__.py` or `modes/__init__.py` to add a name.
- [ ] You added a method to an ABC that "most subclasses won't need."
- [ ] You wired a concrete dependency anywhere except `cli.py`.

All five are signals to refactor before merging.

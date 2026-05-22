# Writing a new adapter

An adapter wraps one coding CLI as a Coterie agent. Implementing one is ~30 lines.

## Contract

You implement two methods:

- `build_command(prompt, workdir, *, extra) -> list[str]` — translate a Coterie subtask into the CLI's argv.
- `parse_result(stdout, stderr, exit_code) -> AdapterResult` — extract structured fields from the CLI's output.

The base class handles spawning, timing, timeouts, and a git-changed-files helper. You declare the adapter's `name` as a class attribute and slap `@register_adapter` on it — the registry picks it up at import time, no other edits required.

## Example: Aider

```python
# packages/coterie-py/src/coterie/adapters/aider.py
from typing import ClassVar

from coterie.adapters.base import AdapterResult, CLIAdapter
from coterie.core.registry import register_adapter


@register_adapter
class AiderAdapter(CLIAdapter):
    name: ClassVar[str] = "aider"

    def build_command(self, prompt, workdir, *, extra):
        return ["aider", "--message", prompt, "--yes", "--no-stream"]

    def parse_result(self, stdout, stderr, exit_code):
        return AdapterResult(
            stdout=stdout,
            stderr=stderr,
            exit_code=exit_code,
            files_changed=self.git_changed_files("."),
        )
```

Then add `aider` to the import list in `adapters/__init__.py`:

```python
from coterie.adapters import aider, claude_code, codex, fake  # noqa: F401
```

That's it. Configs referencing `adapter: aider` now resolve to your new class.

## Cost reporting

If the CLI surfaces structured token usage or cost, parse it into `cost_estimate_usd`. See `claude_code.py` for an example — `--output-format json` returns `total_cost_usd`. If the CLI doesn't expose it, leave `cost_estimate_usd=None` and rely on the supervisor / judge to estimate via model rate-card.

## Files-changed

If the CLI doesn't tell you what it touched, the base class exposes `self.git_changed_files(workdir)` which runs `git status --porcelain` and returns the changed paths.

## Schema

Add the adapter name to the `enum` in `schemas/coterie.config.schema.json` under `properties.agents.items.properties.adapter`. This is the only schema edit; everything else is config.

## Tests

You don't need to test subprocess behavior — that's the base class's job. But it's worth a unit test that asserts your `build_command()` outputs the right argv and that `parse_result()` handles the CLI's success and error outputs. See `tests/test_smoke.py` for the Claude Code adapter's tests as a template.

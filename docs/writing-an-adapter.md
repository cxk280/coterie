# Writing a new adapter

An adapter is a thin subprocess wrapper around a coding CLI. Implementing one is ~30 lines.

## Contract

You implement two methods:

- `buildCommand(prompt, workdir, extra) -> argv` — translate a Coterie subtask into the CLI's argv.
- `parseResult(stdout, stderr, exitCode) -> AdapterResult` — extract structured fields from the CLI's output.

The base class handles spawning, timeout, timing, and the registry lookup.

## Python example

```python
# packages/coterie-py/src/coterie/adapters/aider.py
from coterie.adapters.base import AdapterResult, CLIAdapter


class AiderAdapter(CLIAdapter):
    def build_command(self, prompt, workdir, *, extra):
        return ["aider", "--message", prompt, "--yes", "--no-stream"]

    def parse_result(self, stdout, stderr, exit_code):
        return AdapterResult(
            stdout=stdout,
            stderr=stderr,
            exit_code=exit_code,
            files_changed=self.git_changed_files(workdir="."),
        )
```

Then register it in `adapters/__init__.py`:

```python
from coterie.adapters.aider import AiderAdapter
REGISTRY["aider"] = AiderAdapter
```

## TypeScript example

```ts
// packages/coterie-js/src/adapters/aider.ts
import { CLIAdapter, type AdapterResult } from "./base.js";

export class AiderAdapter extends CLIAdapter {
  buildCommand(prompt: string): string[] {
    return ["aider", "--message", prompt, "--yes", "--no-stream"];
  }

  parseResult(stdout: string, stderr: string, exit_code: number): AdapterResult {
    return {
      stdout,
      stderr,
      exit_code,
      files_changed: [],
      duration_s: 0,
      cost_estimate_usd: null,
    };
  }
}
```

## Cost reporting

If your CLI surfaces token usage or cost in its output, parse it into `cost_estimate_usd`. Otherwise leave it `null` — Coterie will fall back to model rate-card estimation using the prompt and output text length.

## Files-changed

If the CLI doesn't tell you which files it touched, use `git status --porcelain` as a fallback. The base class exposes `git_changed_files(workdir)` for this.

import { CLIAdapter, type AdapterResult } from "./base.js";
import { registerAdapter } from "../core/registry.js";

/**
 * Cursor's headless agent CLI (`cursor-agent`), run on a Cursor Pro subscription.
 * NB: `cursor-agent` is a separate install from the `cursor` editor launcher; the
 * chat preflight checks for it. Flags verified against cursor-agent's print mode:
 * `-p` non-interactive, `--output-format text`, `--force` to apply edits without
 * a confirmation prompt.
 */
export class CursorAdapter extends CLIAdapter {
  static readonly adapterName = "cursor";

  buildCommand(prompt: string, _workdir: string, _extra: Record<string, unknown> = {}): string[] {
    const cmd = ["cursor-agent", "-p", prompt, "--output-format", "text", "--force"];
    if (this.model) cmd.push("--model", this.model);
    return cmd;
  }

  parseResult(stdout: string, stderr: string, exitCode: number): AdapterResult {
    return {
      stdout,
      stderr,
      exit_code: exitCode,
      files_changed: [],
      duration_s: 0,
      cost_estimate_usd: null,
    };
  }
}

registerAdapter(CursorAdapter);

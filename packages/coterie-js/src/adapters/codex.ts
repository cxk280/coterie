import { CLIAdapter, type AdapterResult } from "./base.js";
import { registerAdapter } from "../core/registry.js";

export class CodexAdapter extends CLIAdapter {
  static readonly adapterName = "codex";

  buildCommand(prompt: string, _workdir: string, extra: Record<string, unknown> = {}): string[] {
    // workspace-write sandboxes edits to the cwd; --skip-git-repo-check lets exec
    // run in a plain (non-git) workdir. Autonomous but contained.
    const sandbox = (extra.sandbox as string) ?? "workspace-write";
    const cmd = ["codex", "exec", "--skip-git-repo-check", "-s", sandbox];
    if (this.model) cmd.push("--model", this.model);
    cmd.push(prompt);
    return cmd;
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

registerAdapter(CodexAdapter);

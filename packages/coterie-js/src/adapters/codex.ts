import { CLIAdapter, type AdapterResult } from "./base.js";
import { registerAdapter } from "../core/registry.js";

export class CodexAdapter extends CLIAdapter {
  static readonly adapterName = "codex";

  buildCommand(prompt: string): string[] {
    const cmd = ["codex", "exec", prompt];
    if (this.model) cmd.push("--model", this.model);
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

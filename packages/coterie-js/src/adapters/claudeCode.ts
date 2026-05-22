import { CLIAdapter, type AdapterResult } from "./base.js";

export class ClaudeCodeAdapter extends CLIAdapter {
  buildCommand(prompt: string, _workdir: string, _extra: Record<string, unknown>): string[] {
    const cmd = ["claude", "-p", prompt, "--output-format", "json"];
    if (this.model) cmd.push("--model", this.model);
    return cmd;
  }

  parseResult(stdout: string, stderr: string, exitCode: number): AdapterResult {
    try {
      const payload = JSON.parse(stdout) as { result?: string; total_cost_usd?: number };
      return {
        stdout: payload.result ?? stdout,
        stderr,
        exit_code: exitCode,
        files_changed: [],
        duration_s: 0,
        cost_estimate_usd: payload.total_cost_usd ?? null,
      };
    } catch {
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
}

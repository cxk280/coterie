import { CLIAdapter, type AdapterResult } from "./base.js";
import { registerAdapter } from "../core/registry.js";

export class ClaudeCodeAdapter extends CLIAdapter {
  static readonly adapterName = "claude-code";
  // Run on the user's Claude subscription (OAuth session), not a pay-per-token
  // API key — coordination LLMs use ANTHROPIC_API_KEY in-process, but the agent
  // CLI should bill against the subscription.
  static readonly stripEnv = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"];

  buildCommand(prompt: string, _workdir: string, extra: Record<string, unknown> = {}): string[] {
    // acceptEdits lets the agent apply file edits headlessly while still gating
    // riskier tools — safe against an isolated workdir.
    const permissionMode = (extra.permissionMode as string) ?? "acceptEdits";
    const cmd = ["claude", "-p", prompt, "--output-format", "json", "--permission-mode", permissionMode];
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

registerAdapter(ClaudeCodeAdapter);

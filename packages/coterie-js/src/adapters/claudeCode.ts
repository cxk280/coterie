import { CLIAdapter, type AdapterResult } from "./base.js";
import { parseJsonLoose, parseNdjson } from "../core/json.js";
import { toolHint } from "./stream.js";
import { registerAdapter } from "../core/registry.js";

export class ClaudeCodeAdapter extends CLIAdapter {
  static readonly adapterName = "claude-code";
  // Run on the user's Claude subscription (OAuth session), not a pay-per-token
  // API key — coordination LLMs use ANTHROPIC_API_KEY in-process, but the agent
  // CLI should bill against the subscription.
  static readonly stripEnv = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"];

  buildCommand(prompt: string, _workdir: string, extra: Record<string, unknown> = {}): string[] {
    // Deliberating agents run read-only ('plan' mode: analyse + propose, never
    // edit) — only the finalizer mutates files, with 'acceptEdits' to apply them
    // headlessly while still gating riskier tools. stream-json (which needs
    // --verbose) emits one NDJSON event per step so we can show live progress.
    const permissionMode = extra.readOnly ? "plan" : "acceptEdits";
    const cmd = ["claude", "-p", prompt, "--output-format", "stream-json", "--verbose", "--permission-mode", permissionMode];
    if (this.model) cmd.push("--model", this.model);
    return cmd;
  }

  /** Emit a note for each tool the agent invokes; skip thinking/text/bookkeeping
   *  (the final answer is rendered when the run completes). */
  override streamEvent(line: string): string | null {
    const ev = parseJsonLoose(line);
    if (ev?.type !== "assistant") return null;
    for (const c of ev.message?.content ?? []) {
      if (c?.type === "tool_use") return `→ ${c.name}${toolHint(c.input)}`;
    }
    return null;
  }

  parseResult(stdout: string, stderr: string, exitCode: number): AdapterResult {
    // stdout is an NDJSON stream; the final `result` event carries the answer + cost.
    const events = parseNdjson(stdout);
    const result = events.find((e) => e?.type === "result");
    if (result) {
      const files = events
        .flatMap((e) => (e?.type === "assistant" ? (e.message?.content ?? []) : []))
        .filter((c: any) => c?.type === "tool_use" && /^(Edit|Write|NotebookEdit)$/.test(c.name))
        .map((c: any) => c.input?.file_path)
        .filter(Boolean);
      return {
        stdout: result.result ?? stdout,
        stderr,
        exit_code: exitCode,
        files_changed: [...new Set(files)] as string[],
        duration_s: 0,
        cost_estimate_usd: result.total_cost_usd ?? null,
      };
    }
    // Fallback: not the expected stream (older CLI / plain JSON / prose).
    const loose = parseJsonLoose(stdout);
    return {
      stdout: loose?.result ?? stdout,
      stderr,
      exit_code: exitCode,
      files_changed: [],
      duration_s: 0,
      cost_estimate_usd: loose?.total_cost_usd ?? null,
    };
  }
}

registerAdapter(ClaudeCodeAdapter);

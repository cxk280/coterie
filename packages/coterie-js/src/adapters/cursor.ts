import { CLIAdapter, type AdapterResult } from "./base.js";
import { parseJsonLoose, parseNdjson } from "../core/json.js";
import { toolHint } from "./stream.js";
import { registerAdapter } from "../core/registry.js";

/**
 * Cursor's headless agent CLI (`cursor-agent`), run on a Cursor Pro subscription.
 * NB: `cursor-agent` is a separate install from the `cursor` editor launcher; the
 * chat preflight checks for it. Flags verified against cursor-agent's print mode:
 * `-p` non-interactive, `--output-format stream-json` (NDJSON events for live
 * progress), `--force` to apply edits without a confirmation/trust prompt.
 *
 * NB: cursor-agent has no read-only/plan flag, so unlike claude/codex it can't be
 * told to deliberate without editing. Coterie's no-edit guarantee for cursor is
 * therefore structural: the deliberation (and plan-mode) executor runs it in a
 * throwaway git worktree and discards the result — `extra.readOnly` is a no-op here.
 */
export class CursorAdapter extends CLIAdapter {
  static readonly adapterName = "cursor";

  buildCommand(prompt: string, _workdir: string, _extra: Record<string, unknown> = {}): string[] {
    const cmd = ["cursor-agent", "-p", prompt, "--output-format", "stream-json", "--force"];
    if (this.model) cmd.push("--model", this.model);
    return cmd;
  }

  /** Surface tool calls as live activity; skip thinking deltas + the final text. */
  override streamEvent(line: string): string | null {
    const ev = parseJsonLoose(line);
    if (ev?.type !== "assistant") return null;
    for (const c of ev.message?.content ?? []) {
      if (c?.type === "tool_call" || c?.type === "tool_use") {
        return `→ ${c.name ?? "tool"}${toolHint(c.input ?? c.args)}`;
      }
    }
    return null;
  }

  parseResult(stdout: string, stderr: string, exitCode: number): AdapterResult {
    // stdout is an NDJSON stream; the `result` event carries the final answer.
    const events = parseNdjson(stdout);
    const result = events.find((e) => e?.type === "result");
    return {
      stdout: result?.result ?? stdout,
      stderr,
      exit_code: exitCode,
      files_changed: [],
      duration_s: 0,
      cost_estimate_usd: null,
    };
  }
}

registerAdapter(CursorAdapter);

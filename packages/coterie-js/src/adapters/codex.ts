import { CLIAdapter, type AdapterResult } from "./base.js";
import { parseJsonLoose, parseNdjson } from "../core/json.js";
import { registerAdapter } from "../core/registry.js";

export class CodexAdapter extends CLIAdapter {
  static readonly adapterName = "codex";

  buildCommand(prompt: string, _workdir: string, extra: Record<string, unknown> = {}): string[] {
    // workspace-write sandboxes edits to the cwd; --skip-git-repo-check lets exec
    // run in a plain (non-git) workdir; --json streams JSONL events for live progress.
    const sandbox = (extra.sandbox as string) ?? "workspace-write";
    const cmd = ["codex", "exec", "--skip-git-repo-check", "--json", "-s", sandbox];
    if (this.model) cmd.push("--model", this.model);
    cmd.push(prompt);
    return cmd;
  }

  /** Each non-message item (a command, a file change, reasoning) is live activity;
   *  the final agent_message is the answer, surfaced on completion. */
  override streamEvent(line: string): string | null {
    const ev = parseJsonLoose(line);
    if (ev?.type !== "item.completed") return null;
    const it = ev.item ?? {};
    if (it.type === "agent_message" || it.type === "reasoning") return null;
    if (it.command) return `→ $ ${String(it.command).replace(/\s+/g, " ").slice(0, 80)}`;
    if (it.type === "file_change" || it.type === "patch") {
      const f = it.path ?? (Array.isArray(it.changes) ? it.changes.map((c: any) => c.path).join(", ") : "");
      return `→ edit ${String(f).slice(0, 80)}`.trimEnd();
    }
    return `→ ${String(it.type).replace(/_/g, " ")}`;
  }

  parseResult(stdout: string, stderr: string, exit_code: number): AdapterResult {
    // stdout is JSONL; the answer is the last `agent_message` item.
    const events = parseNdjson(stdout);
    const messages = events
      .filter((e) => e?.type === "item.completed" && e.item?.type === "agent_message")
      .map((e) => e.item.text as string)
      .filter(Boolean);
    return {
      stdout: messages.length ? messages[messages.length - 1]! : stdout,
      stderr,
      exit_code,
      files_changed: [],
      duration_s: 0,
      cost_estimate_usd: null,
    };
  }
}

registerAdapter(CodexAdapter);

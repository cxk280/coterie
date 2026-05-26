/**
 * Coordination LLM backed by the Claude Code CLI (`claude -p`) instead of the
 * Anthropic API — so coordination runs on the user's Claude subscription ($0
 * metered), matching the agent CLIs.
 *
 * It's a *coordination* backend (judge/router/engine/moderator), so it runs a
 * single-shot, tool-less text completion: `--system-prompt` replaces the agent
 * persona, `--disallowedTools` keeps it from touching the filesystem, and
 * ANTHROPIC_API_KEY is stripped from the subprocess so the CLI uses the OAuth
 * session. NB: never pass `--bare` — it forces ANTHROPIC_API_KEY and defeats the
 * subscription.
 */

import { spawnSync } from "node:child_process";

import type { LLMClient, LLMMessage } from "./base.js";

const TOOLS_OFF = [
  "Bash",
  "Edit",
  "Write",
  "Read",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "NotebookEdit",
  "Task",
  "TodoWrite",
].join(" ");

export class ClaudeCliClient implements LLMClient {
  static readonly DEFAULT_MODEL = "claude-haiku-4-5";

  constructor(
    public readonly model: string = ClaudeCliClient.DEFAULT_MODEL,
    public readonly timeoutMs: number = 120_000,
  ) {}

  async chat(system: string, messages: LLMMessage[]): Promise<string> {
    // Coordination calls are single-shot; fold the turns into one prompt.
    const prompt = messages
      .map((m) => (m.role === "user" ? m.content : `[${m.role}]\n${m.content}`))
      .join("\n\n");

    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;

    const proc = spawnSync(
      "claude",
      [
        "-p",
        prompt,
        "--system-prompt",
        system,
        "--disallowedTools",
        TOOLS_OFF,
        "--output-format",
        "json",
        "--model",
        this.model,
      ],
      { encoding: "utf8", timeout: this.timeoutMs, env, maxBuffer: 32 * 1024 * 1024 },
    );

    if (proc.error) throw new Error(`claude CLI failed: ${proc.error.message}`);
    const out = (proc.stdout ?? "").trim();

    let payload: { result?: string; is_error?: boolean } | undefined;
    try {
      payload = JSON.parse(out);
    } catch {
      return out; // not JSON — return raw text
    }
    if (payload?.is_error) {
      throw new Error(`claude CLI returned an error: ${payload.result ?? out}`);
    }
    return payload?.result ?? out;
  }
}

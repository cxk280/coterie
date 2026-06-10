/**
 * Coordination LLM backed by the Claude Code CLI (`claude -p`) — coordination
 * runs on the user's Claude subscription ($0 metered), matching the agent CLIs.
 *
 * It's a *coordination* backend (judge/router/engine/moderator), so it runs a
 * single-shot, tool-less text completion: `--system-prompt` replaces the agent
 * persona, `--disallowedTools` keeps it from touching the filesystem, and
 * ANTHROPIC_API_KEY is stripped from the subprocess so the CLI uses the OAuth
 * session. NB: never pass `--bare` — it forces ANTHROPIC_API_KEY and defeats the
 * subscription.
 */

import { parseJsonLoose } from "../json.js";
import { spawnCapture } from "../spawn.js";
import { type LLMClient, type LLMMessage, foldPrompt } from "./base.js";

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

  async chat(system: string, messages: LLMMessage[], signal?: AbortSignal): Promise<string> {
    const prompt = foldPrompt(messages); // system goes via --system-prompt

    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;

    const r = await spawnCapture(
      "claude",
      ["-p", prompt, "--system-prompt", system, "--disallowedTools", TOOLS_OFF, "--output-format", "json", "--model", this.model],
      { env, timeoutMs: this.timeoutMs, signal },
    );
    if (r.timedOut) throw new Error(`claude coordination call timed out after ${Math.round(this.timeoutMs / 1000)}s`);

    const out = r.stdout.trim();
    const payload = parseJsonLoose(out) as { result?: string; is_error?: boolean } | undefined;
    if (payload?.is_error) throw new Error(`claude CLI returned an error: ${payload.result ?? out}`);
    if (payload && typeof payload.result === "string") return payload.result;
    if (r.code !== 0 && !out) throw new Error(`claude CLI exited ${r.code}: ${r.stderr.trim().slice(0, 200)}`);
    return out;
  }
}

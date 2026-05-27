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

import { spawn } from "node:child_process";

import { abortError } from "../../adapters/base.js";
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

  async chat(system: string, messages: LLMMessage[], signal?: AbortSignal): Promise<string> {
    // Coordination calls are single-shot; fold the turns into one prompt.
    const prompt = messages
      .map((m) => (m.role === "user" ? m.content : `[${m.role}]\n${m.content}`))
      .join("\n\n");

    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;

    // Async spawn (not spawnSync) so the coordination call doesn't block the
    // event loop — keeps the chat trace streaming and SIGINT responsive.
    const out = (
      await this.spawn(
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
        env,
        signal,
      )
    ).trim();

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

  private spawn(args: string[], env: NodeJS.ProcessEnv, signal?: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(abortError());
      // stdin = /dev/null (immediate EOF) so `claude -p` never blocks on input.
      const child = spawn("claude", args, { env, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (d) => (stdout += d.toString()));
      child.stderr?.on("data", (d) => (stderr += d.toString()));

      const kill = () => {
        child.kill("SIGTERM");
        setTimeout(() => !child.killed && child.kill("SIGKILL"), 2_000).unref();
      };
      const timer = setTimeout(kill, this.timeoutMs);
      timer.unref();
      const onAbort = () => {
        kill();
        cleanup();
        reject(abortError());
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      };

      child.on("error", (err) => {
        cleanup();
        reject(new Error(`claude CLI failed: ${err.message}`));
      });
      child.on("close", (code) => {
        cleanup();
        if (code !== 0 && !stdout.trim()) {
          reject(new Error(`claude CLI exited ${code}: ${stderr.trim().slice(0, 200)}`));
        } else {
          resolve(stdout);
        }
      });
    });
  }
}

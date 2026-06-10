/**
 * Coordination LLM backed by `cursor-agent` — the fallback when neither Claude
 * nor Codex is the coordinator. Runs in a throwaway tmp dir (the coordination
 * prompt is self-contained reasoning) and parses the final result from the
 * stream-json output.
 */

import { tmpdir } from "node:os";

import { parseNdjson } from "../json.js";
import { spawnCapture } from "../spawn.js";
import { type LLMClient, type LLMMessage, foldPrompt } from "./base.js";

export class CursorCliClient implements LLMClient {
  constructor(public readonly timeoutMs: number = 120_000) {}

  async chat(system: string, messages: LLMMessage[], signal?: AbortSignal): Promise<string> {
    const prompt = foldPrompt(messages, system); // cursor-agent has no system-prompt flag
    const r = await spawnCapture(
      "cursor-agent",
      ["-p", prompt, "--output-format", "stream-json", "--force"],
      { cwd: tmpdir(), timeoutMs: this.timeoutMs, signal },
    );
    if (r.timedOut) throw new Error(`cursor coordination call timed out after ${Math.round(this.timeoutMs / 1000)}s`);

    const result = parseNdjson(r.stdout).find((e) => e?.type === "result");
    const text = (result?.result ?? r.stdout).trim();
    if (text) return text;
    throw new Error(`cursor coordination produced no output${r.stderr ? `: ${r.stderr.trim().slice(0, 200)}` : ""}`);
  }
}

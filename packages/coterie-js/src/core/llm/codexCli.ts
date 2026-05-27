/**
 * Coordination LLM backed by `codex exec` — the fallback when Claude isn't on the
 * machine, so a codex+cursor session can still coordinate (judge/route/merge).
 * Runs read-only in a throwaway tmp dir (the coordination prompt is self-contained
 * reasoning, no repo access needed) and parses the final agent message.
 */

import { tmpdir } from "node:os";

import { parseNdjson } from "../json.js";
import { spawnCapture } from "../spawn.js";
import type { LLMClient, LLMMessage } from "./base.js";

export class CodexCliClient implements LLMClient {
  constructor(public readonly timeoutMs: number = 120_000) {}

  async chat(system: string, messages: LLMMessage[], signal?: AbortSignal): Promise<string> {
    // codex has no separate system-prompt flag — prepend it to the prompt.
    const prompt = [system, ...messages.map((m) => (m.role === "user" ? m.content : `[${m.role}]\n${m.content}`))].join("\n\n");
    const r = await spawnCapture(
      "codex",
      ["exec", "--skip-git-repo-check", "--json", "-s", "read-only", prompt],
      { cwd: tmpdir(), timeoutMs: this.timeoutMs, signal },
    );
    if (r.timedOut) throw new Error(`codex coordination call timed out after ${Math.round(this.timeoutMs / 1000)}s`);

    const messagesOut = parseNdjson(r.stdout)
      .filter((e) => e?.type === "item.completed" && e.item?.type === "agent_message")
      .map((e) => e.item.text as string)
      .filter(Boolean);
    if (messagesOut.length) return messagesOut[messagesOut.length - 1]!;
    throw new Error(`codex coordination produced no output${r.stderr ? `: ${r.stderr.trim().slice(0, 200)}` : ""}`);
  }
}

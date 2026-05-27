/** Coordination LLM construction — subscription-only, with fallback.
 *
 * Coordination (judge / router / consensus engine / moderator) runs on a coding
 * agent's CLI so it stays $0-metered (no pay-as-you-go API). Claude is preferred
 * (it supports tool-disabling + reports cost), but coterie must work without
 * Claude on the machine — so it falls back to codex, then cursor. There is
 * intentionally no metered API backend.
 */

import type { LLMClient } from "./base.js";
import { ClaudeCliClient } from "./claudeCli.js";
import { CodexCliClient } from "./codexCli.js";
import { CursorCliClient } from "./cursorCli.js";

export type CoordinationCli = "claude" | "codex" | "cursor-agent";

/** Choose the coordination CLI from the agents available this session, preferring
 *  claude-code → codex → cursor. `agentIds` are config agent ids (claude-code,
 *  codex, cursor). */
export function coordinationCliFor(agentIds: string[]): CoordinationCli {
  if (agentIds.includes("claude-code")) return "claude";
  if (agentIds.includes("codex")) return "codex";
  if (agentIds.includes("cursor")) return "cursor-agent";
  return "claude";
}

export async function buildLLM(model?: string, cli: CoordinationCli = "claude"): Promise<LLMClient> {
  switch (cli) {
    case "codex":
      return new CodexCliClient();
    case "cursor-agent":
      return new CursorCliClient();
    default:
      return new ClaudeCliClient(model);
  }
}

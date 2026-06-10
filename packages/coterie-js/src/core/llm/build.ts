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

/** Build the coordination LLM for each seat the mode actually uses (null for the
 *  rest). Both entry points (`coterie run`, the chat REPL) share this map so the
 *  seat→LLM wiring can't drift between them. */
export async function buildRoleLlms(
  mode: string,
  cfg: Record<string, any>,
  cli: CoordinationCli,
): Promise<Record<string, LLMClient | null>> {
  return {
    supervisor_llm: mode === "single" ? await buildLLM(cfg.router?.model, cli) : null,
    judge_llm: ["adversarial", "tournament", "debate"].includes(mode) ? await buildLLM(cfg[mode]?.judge?.model, cli) : null,
    consensus_llm: mode === "consensus" ? await buildLLM(cfg.consensus?.engine?.model, cli) : null,
    moderator_llm: mode === "debate" ? await buildLLM(cfg.debate?.moderator?.model, cli) : null,
    planner_llm: cfg.planner?.enabled ? await buildLLM(cfg.planner?.model, cli) : null,
  };
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

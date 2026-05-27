/** Default in-memory configs per mode for `coterie chat`. The agent lineup is
 *  built from whichever agent CLIs are actually available (see
 *  `availableAgents()`); roles within each strategy are assigned automatically
 *  from that lineup in preference order. (Manual per-strategy role assignment is
 *  on the roadmap — see the README.) */

import type { Mode } from "../core/state.js";

export interface AgentCfg {
  id: string;
  adapter: string;
}

/** Every agent Coterie can coordinate, in preference order. Roles that need a
 *  specific seat (implementer/auditor, debate sides) and the finalizer take the
 *  earliest available agents in this order. */
export const KNOWN_AGENTS: AgentCfg[] = [
  { id: "claude-code", adapter: "claude-code" },
  { id: "codex", adapter: "codex" },
  { id: "cursor", adapter: "cursor" },
];

/** Baseline lineup when a caller doesn't pass one (keeps non-interactive
 *  defaults and unit tests stable). The chat REPL passes the live lineup. */
const BASE_AGENTS: AgentCfg[] = KNOWN_AGENTS.slice(0, 2);

export function defaultConfig(mode: Mode, agents: AgentCfg[] = BASE_AGENTS): Record<string, any> {
  const ids = agents.map((a) => a.id);
  const pair = agents.slice(0, 2);

  switch (mode) {
    case "single":
      return { version: 1, mode, agents, router: { enabled: true, model: "claude-haiku-4-5" } };
    case "adversarial":
      return {
        version: 1,
        mode,
        agents: pair,
        adversarial: {
          implementer: ids[0],
          auditor: ids[1],
          judge: { model: "claude-opus-4-7", sustain_threshold: "medium" },
          max_rounds: 2,
        },
      };
    case "consensus":
      return {
        version: 1,
        mode,
        agents,
        // Consensus is structurally single-pass (each agent reviews once → engine
        // merges); max_rounds is recorded explicitly so the cap is visible.
        consensus: { participants: ids, engine: { model: "claude-haiku-4-5" }, threshold: 0.66, max_rounds: 1 },
      };
    case "debate":
      return {
        version: 1,
        mode,
        agents: pair,
        debate: {
          sides: [ids[0], ids[1]],
          rounds: 2,
          moderator: { model: "claude-haiku-4-5" },
          judge: { model: "claude-opus-4-7" },
        },
      };
    case "tournament":
      return {
        version: 1,
        mode,
        agents,
        tournament: { participants: ids, judge: { model: "claude-opus-4-7" }, rounds: 1 },
      };
  }
}

/** Map an adapter name to the CLI binary the preflight must verify. */
export const ADAPTER_CLI: Record<string, string> = {
  "claude-code": "claude",
  codex: "codex",
  cursor: "cursor-agent",
};

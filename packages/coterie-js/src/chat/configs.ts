/** Default in-memory configs per mode for `coterie chat`, wired to the
 *  subscription-backed agent CLIs (Claude Code + Codex). Mirrors the web
 *  run-configs. Cursor is opt-in (separate install) so it's not a default. */

import type { Mode } from "../core/state.js";

const AGENTS = [
  { id: "claude-code", adapter: "claude-code" },
  { id: "codex", adapter: "codex" },
];

export function defaultConfig(mode: Mode): Record<string, any> {
  switch (mode) {
    case "single":
      return { version: 1, mode, agents: AGENTS, router: { enabled: true, model: "claude-haiku-4-5" } };
    case "adversarial":
      return {
        version: 1,
        mode,
        agents: AGENTS,
        adversarial: {
          implementer: "claude-code",
          auditor: "codex",
          judge: { model: "claude-opus-4-7", sustain_threshold: "medium" },
          max_rounds: 2,
        },
      };
    case "consensus":
      return {
        version: 1,
        mode,
        agents: AGENTS,
        consensus: { participants: ["claude-code", "codex"], engine: { model: "claude-haiku-4-5" }, threshold: 0.66 },
      };
    case "debate":
      return {
        version: 1,
        mode,
        agents: AGENTS,
        debate: {
          sides: ["claude-code", "codex"],
          rounds: 2,
          moderator: { model: "claude-haiku-4-5" },
          judge: { model: "claude-opus-4-7" },
        },
      };
    case "tournament":
      return {
        version: 1,
        mode,
        agents: AGENTS,
        tournament: { participants: ["claude-code", "codex"], judge: { model: "claude-opus-4-7" }, rounds: 1 },
      };
  }
}

/** Map an adapter name to the CLI binary the preflight must verify. */
export const ADAPTER_CLI: Record<string, string> = {
  "claude-code": "claude",
  codex: "codex",
  cursor: "cursor-agent",
};

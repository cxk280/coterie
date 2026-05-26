import type { Mode } from "./modes";

/**
 * Default Coterie configs per mode, wired to the two locally-installed agent
 * CLIs (Claude Code + Codex). These are what the dashboard RunForm posts so a
 * real run coordinates the real CLIs. Mirrors the bench real-mode profiles.
 */
export function defaultConfig(mode: Mode): Record<string, unknown> {
  const agents = [
    { id: "claude-code", adapter: "claude-code" },
    { id: "codex", adapter: "codex" },
  ];
  switch (mode) {
    case "single":
      return { version: 1, agents, router: { enabled: true, model: "claude-haiku-4-5" } };
    case "adversarial":
      return {
        version: 1,
        agents,
        adversarial: {
          implementer: "claude-code",
          auditor: "codex",
          judge: { model: "claude-opus-4-7", sustain_threshold: "medium" },
          max_rounds: 2,
        },
        budget: { max_usd_per_task: 5.0 },
      };
    case "consensus":
      return {
        version: 1,
        agents,
        consensus: {
          participants: ["claude-code", "codex"],
          engine: { model: "claude-haiku-4-5" },
          threshold: 0.66,
        },
      };
    case "debate":
      return {
        version: 1,
        agents,
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
        agents,
        tournament: {
          participants: ["claude-code", "codex"],
          judge: { model: "claude-opus-4-7" },
          rounds: 1,
        },
      };
  }
}

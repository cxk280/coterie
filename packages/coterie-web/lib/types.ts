/**
 * Mirrors `src/coterie/core/state.py` CoterieState. When we wire to a real
 * backend, this will be replaced by generated types from the Python schema.
 */

import type { Mode } from "./modes";

export interface AgentRun {
  agent_id: string;
  role: string;
  prompt: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  files_changed: string[];
  duration_s: number;
  cost_estimate_usd: number | null;
}

export interface RouteDecision {
  step: number;
  agent_id: string;
  reason: string;
  strategy: string;
}

export interface JudgeDecision {
  step: number;
  winner: string;
  reason: string;
  scores: Record<string, number>;
}

export interface Finding {
  agent_id?: string;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  line_ranges: string[];
}

export type Status =
  | "planning"
  | "routing"
  | "executing"
  | "auditing"
  | "judging"
  | "debating"
  | "consensus-scoring"
  | "tournament_round"
  | "awaiting_human"
  | "rejected"
  | "done"
  | "failed";

export interface AgentConfig {
  id: string;
  adapter: "claude-code" | "codex" | "cursor" | "aider" | "shell" | "fake";
  model?: string;
  strengths?: string[];
}

export interface RunSummary {
  id: string;
  task: string;
  mode: Mode;
  agents: string[];
  duration_s: number | null;
  cost_usd: number;
  status: "done" | "failed" | "rejected" | "running";
  status_reason?: string;
  when: string;
}

export interface CoterieState {
  task: string;
  mode: Mode;
  plan: string[];
  current_step_idx: number;
  runs: AgentRun[];
  status: Status;
  config: {
    agents: AgentConfig[];
    [key: string]: unknown;
  };
  spend_usd: number;
  route_history: RouteDecision[];
  judge_history: JudgeDecision[];
  mode_state: Record<string, unknown>;
}

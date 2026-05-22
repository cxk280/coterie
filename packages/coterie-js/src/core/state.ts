/** Coterie's typed state. Mirrors Python's `CoterieState`. */

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
  agent_id: string;
  category: string;
  severity: string;
  description: string;
  line_ranges: string[];
}

export interface ConsensusFinding {
  description: string;
  category: string;
  severity: string;
  agreement_count: number;
  agreement_ratio: number;
  label: "confirmed" | "needs-verification" | "unverified";
  supporting_agents: string[];
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

export type Mode =
  | "single"
  | "consensus"
  | "adversarial"
  | "debate"
  | "tournament";

export interface CoterieState {
  task: string;
  mode: Mode;
  plan: string[];
  current_step_idx: number;
  runs: AgentRun[];
  artifacts: Record<string, string>;
  status: Status;
  config: Record<string, any>;
  spend_usd: number;
  route_history: RouteDecision[];
  judge_history: JudgeDecision[];
  next_agent: string | null;
  mode_state: Record<string, any>;
}

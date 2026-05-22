export interface AgentRun {
  agent_id: string;
  prompt: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  files_changed: string[];
  duration_s: number;
  cost_estimate_usd: number | null;
}

export type Status =
  | "planning"
  | "routing"
  | "executing"
  | "judging"
  | "awaiting_human"
  | "done"
  | "failed";

export interface CoterieState {
  task: string;
  plan: string[];
  current_step_idx: number;
  runs: AgentRun[];
  artifacts: Record<string, string>;
  last_winner: string | null;
  status: Status;
  config: Record<string, unknown>;
  spend_usd: number;
}

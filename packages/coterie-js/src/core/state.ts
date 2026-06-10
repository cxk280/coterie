/** Coterie's typed graph state: the records every node reads/writes (runs,
 *  verdicts, findings) plus shared helpers for building them. The LangGraph
 *  channel/reducer wiring for this shape lives in core/annotation.ts. */

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

/** Every coordination mode, in the order user-facing surfaces list them. */
export const MODES: Mode[] = ["single", "adversarial", "debate", "tournament", "consensus"];

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

/** A fresh graph state for one task — every entry point (a chat turn,
 *  `coterie run`, tests) starts a deliberation from this. */
export function initialState(task: string, config: Record<string, any>): CoterieState {
  return {
    task,
    mode: config.mode,
    plan: [],
    current_step_idx: 0,
    runs: [],
    artifacts: {},
    status: "planning",
    config,
    spend_usd: 0,
    route_history: [],
    judge_history: [],
    next_agent: null,
    mode_state: {},
  };
}

/** The most recent run with the given role — e.g. the latest "implementer"
 *  attempt in a multi-round adversarial loop. */
export function lastRunByRole(runs: AgentRun[] | undefined, role: string): AgentRun | undefined {
  const list = runs ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i]!.role === role) return list[i];
  }
  return undefined;
}

/** The state-update record for one completed agent subprocess. Shared by the
 *  agent-runner node and the finalizer so the run shape can't drift. */
export function makeRun(
  agent_id: string,
  role: string,
  prompt: string,
  result: { stdout: string; stderr: string; exit_code: number; files_changed: string[]; duration_s: number; cost_estimate_usd: number | null },
): AgentRun {
  return {
    agent_id,
    role,
    prompt,
    stdout: result.stdout,
    stderr: result.stderr,
    exit_code: result.exit_code,
    files_changed: result.files_changed,
    duration_s: result.duration_s,
    cost_estimate_usd: result.cost_estimate_usd,
  };
}

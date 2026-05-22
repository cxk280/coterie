/**
 * Minimal LangGraph wiring. v0.0.1 is a 2-node graph: planner -> agent -> END.
 *
 * The full supervisor/fan-out/judge graph lives in design.md and lands in v0.1.
 */
import { END, START, StateGraph } from "@langchain/langgraph";

import { REGISTRY } from "./adapters/index.js";
import type { AgentRun, CoterieState } from "./state.js";

interface GraphOptions {
  agentId: string;
  adapterKind: keyof typeof REGISTRY | string;
  workdir?: string;
}

const stateChannels = {
  task: { value: (_: string, b: string) => b },
  plan: { value: (_: string[], b: string[]) => b, default: () => [] as string[] },
  current_step_idx: { value: (_: number, b: number) => b, default: () => 0 },
  runs: {
    value: (a: AgentRun[], b: AgentRun[]) => [...a, ...b],
    default: () => [] as AgentRun[],
  },
  artifacts: {
    value: (_: Record<string, string>, b: Record<string, string>) => b,
    default: () => ({}) as Record<string, string>,
  },
  last_winner: {
    value: (_: string | null, b: string | null) => b,
    default: () => null as string | null,
  },
  status: { value: (_: string, b: string) => b, default: () => "planning" as const },
  config: {
    value: (_: Record<string, unknown>, b: Record<string, unknown>) => b,
    default: () => ({}) as Record<string, unknown>,
  },
  spend_usd: { value: (_: number, b: number) => b, default: () => 0 },
};

export function buildGraph(opts: GraphOptions) {
  const adapterCls = REGISTRY[opts.adapterKind];
  if (!adapterCls) throw new Error(`Unknown adapter: ${opts.adapterKind}`);
  const adapter = new adapterCls(opts.agentId);
  const workdir = opts.workdir ?? ".";

  const planner = (_state: CoterieState): Partial<CoterieState> => ({
    plan: [_state.task],
    current_step_idx: 0,
    status: "executing",
  });

  const agentNode = (state: CoterieState): Partial<CoterieState> => {
    const step = state.plan[state.current_step_idx] ?? state.task;
    const r = adapter.run(step, workdir);
    const run: AgentRun = {
      agent_id: opts.agentId,
      prompt: step,
      stdout: r.stdout,
      stderr: r.stderr,
      exit_code: r.exit_code,
      files_changed: r.files_changed,
      duration_s: r.duration_s,
      cost_estimate_usd: r.cost_estimate_usd,
    };
    return {
      runs: [run],
      spend_usd: (state.spend_usd ?? 0) + (r.cost_estimate_usd ?? 0),
      status: r.exit_code === 0 ? "done" : "failed",
    };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = new StateGraph({ channels: stateChannels } as any)
    .addNode("planner", planner as any)
    .addNode("agent", agentNode as any)
    .addEdge(START, "planner")
    .addEdge("planner", "agent")
    .addEdge("agent", END);

  return g.compile();
}

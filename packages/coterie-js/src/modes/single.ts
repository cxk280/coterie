/** Mode "single": plan → a supervisor routes each subtask to one agent → repeat.
 *  Registered into MODE_REGISTRY at import; built per turn by graph.ts. */

import { END, START, StateGraph } from "@langchain/langgraph";

import { CoterieStateAnnotation } from "../core/annotation.js";
import { compileGraph } from "../core/compile.js";
import { registerMode } from "../core/registry.js";
import type { ModeBuildOpts } from "../core/types.js";
import { makeAgentRunner } from "../nodes/agentRunner.js";
import { makeLLMPlannerNode, makePlannerNode } from "../nodes/planner.js";
import { makeStepAdvanceNode, makeSupervisorNode } from "../nodes/supervisor.js";

function plannerNode(config: any, plannerLlm: any) {
  const p = config.planner ?? {};
  if (p.enabled && plannerLlm) return makeLLMPlannerNode(plannerLlm, { maxSubtasks: p.max_subtasks ?? 5 });
  return makePlannerNode();
}

export function build(opts: ModeBuildOpts) {
  const { workdir, executor, config, supervisor_llm, planner_llm } = opts;
  const g = new StateGraph(CoterieStateAnnotation)
    .addNode("planner", plannerNode(config, planner_llm))
    .addNode("supervisor", makeSupervisorNode(supervisor_llm ?? null))
    .addNode(
      "agent",
      makeAgentRunner({
        role: "agent",
        workdir,
        executor,
        agent_id_fn: (s) => s.next_agent ?? "",
      }),
    )
    .addNode("advance", makeStepAdvanceNode())
    .addEdge(START, "planner")
    .addEdge("planner", "supervisor")
    .addConditionalEdges(
      "supervisor",
      (state: any) => {
        if (state.status === "done" || state.status === "failed" || state.status === "awaiting_human") return END;
        const idx = state.current_step_idx ?? 0;
        const plan = state.plan ?? [];
        if (idx >= plan.length) return END;
        return "agent";
      },
      { [END]: END, agent: "agent" },
    )
    .addEdge("agent", "advance")
    .addEdge("advance", "supervisor");

  return compileGraph(g, config);
}

registerMode("single", build);

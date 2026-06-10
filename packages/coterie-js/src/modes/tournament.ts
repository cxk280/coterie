/** Mode "tournament": N agents attempt the task in parallel; a bracket judge
 *  (nodes/bracket.ts) ranks and eliminates per round until one winner remains.
 *  Registered into MODE_REGISTRY at import; built per turn by graph.ts. */

import { END, START, StateGraph } from "@langchain/langgraph";

import type { AdapterExecutor } from "../core/executor.js";
import { CoterieStateAnnotation } from "../core/annotation.js";
import { compileGraph } from "../core/compile.js";
import { registerMode } from "../core/registry.js";
import type { CoterieState } from "../core/state.js";
import type { ModeBuildOpts } from "../core/types.js";
import { makeAgentRunner } from "../nodes/agentRunner.js";
import { makeBracketJudgeNode } from "../nodes/bracket.js";
import { makePlannerNode } from "../nodes/planner.js";

function makeEliminatedAwareParticipant(agent_id: string, workdir: string, executor: AdapterExecutor) {
  const inner = makeAgentRunner({ role: "tournament-participant", workdir, executor, agent_id });
  return async (state: CoterieState) => {
    const eliminated = (state.mode_state?.eliminated_participants ?? []) as string[];
    if (eliminated.includes(agent_id)) return {};
    return inner(state);
  };
}

export function build(opts: ModeBuildOpts) {
  const { workdir, executor, config, judge_llm } = opts;
  const tournament = config.tournament ?? {};
  const participants = (tournament.participants ?? (config.agents as any[]).map((a) => a.id)) as string[];
  const multiRound = (tournament.rounds ?? 1) > 1;

  let g: any = new StateGraph(CoterieStateAnnotation)
    .addNode("planner", makePlannerNode())
    .addNode("bracket_judge", makeBracketJudgeNode(judge_llm ?? null));

  for (const pid of participants) {
    g = g.addNode(`tparticipant_${pid}`, makeEliminatedAwareParticipant(pid, workdir, executor));
  }

  g = g.addEdge(START, "planner");
  for (const pid of participants) {
    g = g.addEdge("planner", `tparticipant_${pid}`).addEdge(`tparticipant_${pid}`, "bracket_judge");
  }

  if (multiRound) {
    const targets: Record<string, string> = { [END]: END };
    for (const pid of participants) targets[`tparticipant_${pid}`] = `tparticipant_${pid}`;
    g = g.addConditionalEdges(
      "bracket_judge",
      (state: any) => {
        if (state.status === "done") return END;
        return participants.map((p) => `tparticipant_${p}`);
      },
      targets,
    );
  } else {
    g = g.addEdge("bracket_judge", END);
  }

  return compileGraph(g, config);
}

registerMode("tournament", build);

import { END, START, StateGraph } from "@langchain/langgraph";

import { CoterieStateAnnotation } from "../core/annotation.js";
import { compileWithInterrupts } from "../core/compile.js";
import { registerMode } from "../core/registry.js";
import type { ModeBuildOpts } from "../core/types.js";
import { makeAgentRunner } from "../nodes/agentRunner.js";
import { makeConsensusEngineNode } from "../nodes/consensusEngine.js";
import { makePlannerNode } from "../nodes/planner.js";

const PARTICIPANT_PROMPT = (task: string) => `Review the following work item and report every defect you can find.

# Task
${task}

Report defects only — do NOT propose fixes. Return ONLY a JSON array. No prose, no markdown.
Each finding:
{
  "category": "bug|perf|security|clarity|missed-requirement|edge-case",
  "severity": "low|medium|high|critical",
  "description": "<one sentence>",
  "line_ranges": ["path:start-end", ...]
}

If you find no defects, return [].`;

export function build(opts: ModeBuildOpts) {
  const { workdir, executor, config, consensus_llm } = opts;
  const consCfg = config.consensus ?? {};
  const participants: string[] = consCfg.participants ?? (config.agents as any[]).map((a) => a.id);

  let g: any = new StateGraph(CoterieStateAnnotation)
    .addNode("planner", makePlannerNode())
    .addNode("engine", makeConsensusEngineNode(consensus_llm ?? null));

  for (const pid of participants) {
    g = g.addNode(
      `participant_${pid}`,
      makeAgentRunner({
        role: "consensus-participant",
        workdir,
        executor,
        agent_id: pid,
        prompt_fn: (s) => PARTICIPANT_PROMPT(s.task),
      }),
    );
  }

  g = g.addEdge(START, "planner");
  for (const pid of participants) {
    g = g.addEdge("planner", `participant_${pid}`).addEdge(`participant_${pid}`, "engine");
  }
  g = g.addEdge("engine", END);

  return compileWithInterrupts(g, config);
}

registerMode("consensus", build);

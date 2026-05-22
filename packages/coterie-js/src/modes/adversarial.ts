import { END, START, StateGraph } from "@langchain/langgraph";

import { CoterieStateAnnotation } from "../core/annotation.js";
import { compileWithInterrupts } from "../core/compile.js";
import { registerMode } from "../core/registry.js";
import type { ModeBuildOpts } from "../core/types.js";
import { makeAgentRunner } from "../nodes/agentRunner.js";
import {
  adversarialAuditorPrompt,
  adversarialImplementerPrompt,
  makeAdversarialJudgeNode,
  makeRecordAuditorFindingsNode,
  makeRecordImplementerOutputNode,
} from "../nodes/auditor.js";
import { makePlannerNode } from "../nodes/planner.js";

export function build(opts: ModeBuildOpts) {
  const { workdir, executor, config, judge_llm } = opts;
  const adv = config.adversarial ?? {};
  const implementerId = adv.implementer as string;
  const auditorId = adv.auditor as string;

  const g = new StateGraph(CoterieStateAnnotation)
    .addNode("planner", makePlannerNode())
    .addNode(
      "implementer",
      makeAgentRunner({
        role: "implementer",
        workdir,
        executor,
        agent_id: implementerId,
        prompt_fn: adversarialImplementerPrompt,
      }),
    )
    .addNode("record_impl", makeRecordImplementerOutputNode())
    .addNode(
      "auditor",
      makeAgentRunner({
        role: "auditor",
        workdir,
        executor,
        agent_id: auditorId,
        prompt_fn: adversarialAuditorPrompt,
      }),
    )
    .addNode("record_findings", makeRecordAuditorFindingsNode())
    .addNode("judge", makeAdversarialJudgeNode(judge_llm ?? null))
    .addEdge(START, "planner")
    .addEdge("planner", "implementer")
    .addEdge("implementer", "record_impl")
    .addEdge("record_impl", "auditor")
    .addEdge("auditor", "record_findings")
    .addEdge("record_findings", "judge")
    .addConditionalEdges(
      "judge",
      (state: any) => (state.status === "done" ? END : "implementer"),
      { [END]: END, implementer: "implementer" },
    );

  return compileWithInterrupts(g, config);
}

registerMode("adversarial", build);

import { END, START, StateGraph } from "@langchain/langgraph";

import { CoterieStateAnnotation } from "../core/annotation.js";
import { compileGraph } from "../core/compile.js";
import { registerMode } from "../core/registry.js";
import type { CoterieState } from "../core/state.js";
import type { ModeBuildOpts } from "../core/types.js";
import { makeAgentRunner } from "../nodes/agentRunner.js";
import { makeDebateJudgeNode, makeModeratorNode } from "../nodes/moderator.js";
import { makePlannerNode } from "../nodes/planner.js";

function priorSummaries(state: CoterieState): string {
  const summaries = (state.mode_state?.round_summaries ?? []) as any[];
  if (summaries.length === 0) return "(none — this is round 1)";
  return summaries.map((s, i) => `Round ${i + 1}: ${s.round_summary ?? ""}`).join("\n");
}

function proPrompt(state: CoterieState): string {
  const total = state.config.debate?.rounds ?? 2;
  const round = (state.mode_state?.rounds_completed ?? 0) + 1;
  return `You are arguing the PRO position in a structured debate.

# Question
${state.task}

# Round
${round} of ${total}

# Previous round summaries
${priorSummaries(state)}

Make your strongest argument FOR. Cite concrete evidence and address the strongest
counterargument from the prior round (if any). Be concise: 4-8 sentences.`;
}

function conPrompt(state: CoterieState): string {
  const total = state.config.debate?.rounds ?? 2;
  const round = (state.mode_state?.rounds_completed ?? 0) + 1;
  const runs = state.runs ?? [];
  const lastPro = [...runs].reverse().find((r) => r.role === "pro");
  const proArgument = lastPro ? lastPro.stdout.slice(0, 1500) : "(missing)";
  return `You are arguing the CON position in a structured debate.

# Question
${state.task}

# Round
${round} of ${total}

# Previous round summaries
${priorSummaries(state)}

# Pro's argument this round
${proArgument}

Make your strongest argument AGAINST. Cite concrete evidence and rebut Pro's argument
this round and previous rounds. Be concise: 4-8 sentences.`;
}

export function build(opts: ModeBuildOpts) {
  const { workdir, executor, config, moderator_llm, judge_llm } = opts;
  const deb = config.debate ?? {};
  const [proId, conId] = deb.sides as [string, string];

  const g = new StateGraph(CoterieStateAnnotation)
    .addNode("planner", makePlannerNode())
    .addNode("pro", makeAgentRunner({ role: "pro", workdir, executor, agent_id: proId, prompt_fn: proPrompt }))
    .addNode("con", makeAgentRunner({ role: "con", workdir, executor, agent_id: conId, prompt_fn: conPrompt }))
    .addNode("moderator", makeModeratorNode(moderator_llm ?? null))
    .addNode("judge", makeDebateJudgeNode(judge_llm ?? null))
    .addEdge(START, "planner")
    .addEdge("planner", "pro")
    .addEdge("pro", "con")
    .addEdge("con", "moderator")
    .addConditionalEdges(
      "moderator",
      (state: any) => {
        const done = (state.mode_state?.rounds_completed ?? 0) >= (state.config.debate?.rounds ?? 2);
        return done ? "judge" : "pro";
      },
      { pro: "pro", judge: "judge" },
    )
    .addEdge("judge", END);

  return compileGraph(g, config);
}

registerMode("debate", build);

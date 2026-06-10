/** The planner node every mode starts with: pass-through (the task is the plan)
 *  by default, or LLM decomposition into subtasks when `planner.enabled` is set. */

import type { LLMClient } from "../core/llm/base.js";
import type { CoterieState } from "../core/state.js";

export function makePlannerNode() {
  return async (state: CoterieState) => ({
    plan: [state.task],
    current_step_idx: 0,
    status: "executing" as const,
    mode_state: state.mode_state ?? {},
  });
}

const PLANNER_SYSTEM = `You decompose a coding task into a sequence of focused subtasks.
Keep subtasks atomic, in execution order, and roughly 1-2 sentences each.
Aim for 1-5 subtasks total — return exactly one when the task is already atomic.

Return strict JSON only — no prose, no markdown:
{"subtasks": ["<subtask 1>", "<subtask 2>", ...]}`;

export function makeLLMPlannerNode(llm: LLMClient, opts: { maxSubtasks?: number } = {}) {
  const maxSubtasks = opts.maxSubtasks ?? 5;
  return async (state: CoterieState) => {
    const raw = await llm.chat(PLANNER_SYSTEM, [{ role: "user", content: state.task }]);
    let subtasks: string[];
    try {
      const payload = JSON.parse(raw) as { subtasks: string[] };
      if (!Array.isArray(payload.subtasks) || !payload.subtasks.every((s) => typeof s === "string")) {
        throw new Error("invalid subtasks");
      }
      subtasks = payload.subtasks.slice(0, maxSubtasks);
      if (subtasks.length === 0) subtasks = [state.task];
    } catch {
      subtasks = [state.task];
    }
    return {
      plan: subtasks,
      current_step_idx: 0,
      status: "executing" as const,
      mode_state: state.mode_state ?? {},
    };
  };
}

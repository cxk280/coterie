/**
 * LangGraph state annotation. The reducer-bearing channels here mirror the
 * `Annotated[..., add]` Python TypedDict fields.
 */

import { Annotation } from "@langchain/langgraph";

import type {
  AgentRun,
  CoterieState,
  JudgeDecision,
  Mode,
  RouteDecision,
  Status,
} from "./state.js";

export const CoterieStateAnnotation = Annotation.Root({
  task: Annotation<string>({ default: () => "", reducer: (_a, b) => b }),
  mode: Annotation<Mode>({ default: () => "single", reducer: (_a, b) => b }),
  plan: Annotation<string[]>({ default: () => [], reducer: (_a, b) => b }),
  current_step_idx: Annotation<number>({ default: () => 0, reducer: (_a, b) => b }),
  runs: Annotation<AgentRun[]>({
    default: () => [],
    reducer: (a, b) => [...a, ...b],
  }),
  artifacts: Annotation<Record<string, string>>({
    default: () => ({}),
    reducer: (_a, b) => b,
  }),
  status: Annotation<Status>({ default: () => "planning", reducer: (_a, b) => b }),
  config: Annotation<Record<string, any>>({
    default: () => ({}),
    reducer: (_a, b) => b,
  }),
  spend_usd: Annotation<number>({
    default: () => 0,
    reducer: (a, b) => a + b,
  }),
  route_history: Annotation<RouteDecision[]>({
    default: () => [],
    reducer: (a, b) => [...a, ...b],
  }),
  judge_history: Annotation<JudgeDecision[]>({
    default: () => [],
    reducer: (a, b) => [...a, ...b],
  }),
  next_agent: Annotation<string | null>({
    default: () => null,
    reducer: (_a, b) => b,
  }),
  mode_state: Annotation<Record<string, any>>({
    default: () => ({}),
    reducer: (_a, b) => b,
  }),
});

export type CoterieStateValues = typeof CoterieStateAnnotation.State;

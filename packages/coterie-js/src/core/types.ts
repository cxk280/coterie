/** Cross-module types that can't live in their natural homes without circular imports. */

import type { AdapterExecutor } from "./executor.js";
import type { LLMClient } from "./llm/base.js";

export interface ModeBuildOpts {
  workdir: string;
  executor: AdapterExecutor;
  config: Record<string, any>;
  supervisor_llm?: LLMClient | null;
  judge_llm?: LLMClient | null;
  consensus_llm?: LLMClient | null;
  moderator_llm?: LLMClient | null;
  planner_llm?: LLMClient | null;
}

export type ModeBuilder = (opts: ModeBuildOpts) => any; // CompiledStateGraph

/** Public API. */

import "./adapters/index.js"; // trigger adapter registration on import
import "./modes/index.js"; // trigger mode registration on import

export { CLIAdapter, type AdapterResult } from "./adapters/base.js";
export { ClaudeCodeAdapter } from "./adapters/claudeCode.js";
export { CodexAdapter } from "./adapters/codex.js";
export { FakeAdapter, FakeAdapterError } from "./adapters/fake.js";
export {
  ADAPTER_REGISTRY,
  MODE_REGISTRY,
  Registry,
  registerAdapter,
  registerMode,
} from "./core/registry.js";
export type {
  AgentRun,
  ConsensusFinding,
  CoterieState,
  Finding,
  JudgeDecision,
  Mode,
  RouteDecision,
  Status,
} from "./core/state.js";
export type { LLMClient, LLMMessage } from "./core/llm/base.js";
export { buildLLM } from "./core/llm/build.js";
export { ClaudeCliClient } from "./core/llm/claudeCli.js";
export { ScriptedLLMClient, ScriptedLLMError } from "./core/llm/scripted.js";
export {
  type AdapterExecutor,
  IsolatedWorktreeExecutor,
  LocalSubprocessExecutor,
} from "./core/executor.js";
export { buildGraph } from "./graph.js";
export { loadConfig } from "./config.js";

export const VERSION = "0.1.0";

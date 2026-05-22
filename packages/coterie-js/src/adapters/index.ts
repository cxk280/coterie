import { CLIAdapter } from "./base.js";
import { ClaudeCodeAdapter } from "./claudeCode.js";

export const REGISTRY: Record<string, new (id: string, opts?: { model?: string }) => CLIAdapter> = {
  "claude-code": ClaudeCodeAdapter,
};

export { CLIAdapter, ClaudeCodeAdapter };
export type { AdapterResult } from "./base.js";

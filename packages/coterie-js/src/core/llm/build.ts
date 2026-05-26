/** Coordination LLM construction — subscription-only. */

import type { LLMClient } from "./base.js";
import { ClaudeCliClient } from "./claudeCli.js";

/**
 * Build the coordination LLM for a model id.
 *
 * Coordination (judge / router / consensus engine / moderator) runs entirely on
 * the user's Claude subscription via the `claude -p` CLI — there is
 * intentionally **no pay-as-you-go API backend**, so a session never incurs
 * metered costs. A pluggable API provider may be added in the future.
 */
export async function buildLLM(model?: string): Promise<LLMClient> {
  return new ClaudeCliClient(model);
}

/** Composition root for coordination LLMs — shared by `coterie run` + `coterie chat`. */

import type { LLMClient } from "./base.js";

export function inferProvider(model?: string): string {
  if (!model) return "anthropic";
  const m = model.toLowerCase();
  if (m.startsWith("claude")) return "anthropic";
  if (m.startsWith("gpt") || m.startsWith("o1") || m.startsWith("o3")) return "openai";
  if (m.includes("llama")) return "groq";
  if (m.includes("grok")) return "xai";
  return "anthropic";
}

/**
 * Build the coordination LLM for a model id.
 *
 * `COTERIE_COORDINATION_PROVIDER=claude-cli` routes every coordination call
 * through the Claude subscription (the `claude -p` CLI, $0 metered); otherwise
 * the provider is inferred from the model name (or `COTERIE_LLM_PROVIDER`) and
 * uses the pay-as-you-go API.
 */
export async function buildLLM(model?: string): Promise<LLMClient | null> {
  if (process.env.COTERIE_COORDINATION_PROVIDER === "claude-cli") {
    const { ClaudeCliClient } = await import("./claudeCli.js");
    return new ClaudeCliClient(model);
  }

  const provider = process.env.COTERIE_LLM_PROVIDER ?? inferProvider(model);
  if (provider === "anthropic") {
    const { AnthropicClient } = await import("./anthropicClient.js");
    return new AnthropicClient(model);
  }
  if (provider === "openai") {
    const { OpenAIClient } = await import("./openaiCompat.js");
    return new OpenAIClient(model);
  }
  if (provider === "groq") {
    const { GroqClient } = await import("./openaiCompat.js");
    return new GroqClient(model);
  }
  if (provider === "xai") {
    const { XAIClient } = await import("./openaiCompat.js");
    return new XAIClient(model);
  }
  throw new Error(`unknown LLM provider ${provider}`);
}

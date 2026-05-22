import type { LLMClient, LLMMessage } from "./base.js";

export class AnthropicClient implements LLMClient {
  static readonly DEFAULT_MODEL = "claude-haiku-4-5-20251001";

  private client: any;

  constructor(
    public readonly model: string = AnthropicClient.DEFAULT_MODEL,
    public readonly maxTokens: number = 1200,
  ) {}

  private async ensureClient(): Promise<any> {
    if (this.client) return this.client;
    let Anthropic: any;
    try {
      ({ default: Anthropic } = await import("@anthropic-ai/sdk"));
    } catch (e) {
      throw new Error(
        "AnthropicClient requires `@anthropic-ai/sdk`. Install with `npm install @anthropic-ai/sdk`.",
      );
    }
    this.client = new Anthropic();
    return this.client;
  }

  async chat(system: string, messages: LLMMessage[]): Promise<string> {
    const client = await this.ensureClient();
    const resp = await client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system,
      messages,
    });
    const first = resp.content?.[0];
    return first?.text ?? String(first ?? "");
  }
}

/** OpenAI-API-compatible providers (OpenAI, Groq, xAI). Lazy-loads `openai` SDK. */

import type { LLMClient, LLMMessage } from "./base.js";

abstract class OpenAICompatibleClient implements LLMClient {
  static BASE_URL: string | undefined = undefined;
  static API_KEY_ENV = "";
  static DEFAULT_MODEL = "";

  protected client: any;

  constructor(
    public readonly model: string,
    public readonly maxTokens: number = 1200,
  ) {}

  protected async ensureClient(): Promise<any> {
    if (this.client) return this.client;
    let OpenAI: any;
    try {
      // @ts-ignore - `openai` is an optional dependency, not installed by default.
      ({ default: OpenAI } = await import("openai"));
    } catch {
      throw new Error("OpenAI-compatible clients require `openai`. `npm install openai`.");
    }
    const ctor = this.constructor as typeof OpenAICompatibleClient;
    const apiKey = process.env[ctor.API_KEY_ENV];
    if (!apiKey) {
      throw new Error(
        `${this.constructor.name} requires env var ${ctor.API_KEY_ENV} to be set`,
      );
    }
    this.client = new OpenAI({ apiKey, baseURL: ctor.BASE_URL });
    return this.client;
  }

  async chat(system: string, messages: LLMMessage[]): Promise<string> {
    const client = await this.ensureClient();
    const full = [{ role: "system", content: system }, ...messages];
    const resp = await client.chat.completions.create({
      model: this.model,
      messages: full,
      max_tokens: this.maxTokens,
    });
    return resp.choices?.[0]?.message?.content ?? "";
  }
}

export class OpenAIClient extends OpenAICompatibleClient {
  static API_KEY_ENV = "OPENAI_API_KEY";
  static DEFAULT_MODEL = "gpt-4o-mini";
  constructor(model: string = OpenAIClient.DEFAULT_MODEL, maxTokens?: number) {
    super(model, maxTokens);
  }
}

export class GroqClient extends OpenAICompatibleClient {
  static BASE_URL = "https://api.groq.com/openai/v1";
  static API_KEY_ENV = "GROQ_API_KEY";
  static DEFAULT_MODEL = "llama-3.3-70b-versatile";
  constructor(model: string = GroqClient.DEFAULT_MODEL, maxTokens?: number) {
    super(model, maxTokens);
  }
}

export class XAIClient extends OpenAICompatibleClient {
  static BASE_URL = "https://api.x.ai/v1";
  static API_KEY_ENV = "XAI_API_KEY";
  static DEFAULT_MODEL = "grok-2-latest";
  constructor(model: string = XAIClient.DEFAULT_MODEL, maxTokens?: number) {
    super(model, maxTokens);
  }
}

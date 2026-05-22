/** LLMClient contract. One method (`chat`). */

export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LLMClient {
  chat(system: string, messages: LLMMessage[]): Promise<string>;
}

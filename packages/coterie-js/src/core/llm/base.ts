/** LLMClient contract for the coordination seats (judge / router / engine /
 *  moderator). One method (`chat`); concrete clients shell out to an agent CLI. */

export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LLMClient {
  chat(system: string, messages: LLMMessage[]): Promise<string>;
}

/** Fold a multi-turn chat into one prompt — coordination calls are single-shot.
 *  Pass `system` for CLIs with no separate system-prompt flag (codex / cursor). */
export function foldPrompt(messages: LLMMessage[], system?: string): string {
  const turns = messages.map((m) => (m.role === "user" ? m.content : `[${m.role}]\n${m.content}`));
  return (system ? [system, ...turns] : turns).join("\n\n");
}

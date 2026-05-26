/** Conversation memory. Agents are stateless subprocess calls, so prior turns
 *  are threaded into each new turn's task as context. */

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

export class Transcript {
  private turns: Turn[] = [];

  add(role: Turn["role"], content: string): void {
    this.turns.push({ role, content });
  }

  clear(): void {
    this.turns = [];
  }

  get length(): number {
    return this.turns.length;
  }

  /** Build the task for a new prompt, prepending the conversation so far. */
  taskFor(prompt: string): string {
    if (this.turns.length === 0) return prompt;
    const history = this.turns
      .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
      .join("\n\n");
    return `Conversation so far:\n${history}\n\n---\nUser's new request: ${prompt}`;
  }
}

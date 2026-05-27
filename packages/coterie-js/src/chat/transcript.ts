/** Conversation memory. Agents are stateless subprocess calls, so prior turns
 *  are threaded into each new turn's task as context. */

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

/** Cap on how much prior conversation rides into each turn's task. Prompts are
 *  passed as a subprocess argv element, so an unbounded transcript would inflate
 *  every turn's cost and eventually exceed the OS argv limit (ARG_MAX → E2BIG).
 *  We keep the most recent turns within this character budget. */
const MAX_HISTORY_CHARS = 12_000;

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

  /** Build the task for a new prompt, prepending the (bounded) conversation. */
  taskFor(prompt: string): string {
    if (this.turns.length === 0) return prompt;
    const lines: string[] = [];
    let used = 0;
    // Walk newest→oldest, keeping turns until the budget is spent.
    for (let i = this.turns.length - 1; i >= 0; i--) {
      const t = this.turns[i]!;
      const line = `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`;
      if (used + line.length > MAX_HISTORY_CHARS) {
        lines.unshift("…(earlier conversation trimmed)…");
        break;
      }
      lines.unshift(line);
      used += line.length;
    }
    return `Conversation so far:\n${lines.join("\n\n")}\n\n---\nUser's new request: ${prompt}`;
  }
}

/** Test / demo double. Replays a queue of pre-recorded responses. */

import { readFileSync } from "node:fs";

import type { LLMClient, LLMMessage } from "./base.js";

export class ScriptedLLMError extends Error {}

export class ScriptedLLMClient implements LLMClient {
  private responses: string[];
  readonly calls: { system: string; messages: LLMMessage[] }[] = [];

  constructor(responses: Iterable<string>) {
    this.responses = [...responses];
  }

  static fromFixture(path: string): ScriptedLLMClient {
    const data = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(data) || !data.every((x) => typeof x === "string")) {
      throw new Error(`fixture at ${path} must be a JSON array of strings`);
    }
    return new ScriptedLLMClient(data);
  }

  queue(response: string): void {
    this.responses.push(response);
  }

  async chat(system: string, messages: LLMMessage[]): Promise<string> {
    this.calls.push({ system, messages });
    if (this.responses.length === 0) {
      throw new ScriptedLLMError(
        `ScriptedLLMClient exhausted after ${this.calls.length} call(s); last system: ${system.slice(0, 100)}`,
      );
    }
    return this.responses.shift()!;
  }
}

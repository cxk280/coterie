/** In-process FakeAdapter for tests / offline demos. */

import { CLIAdapter, type AdapterResult } from "./base.js";
import { registerAdapter } from "../core/registry.js";

export class FakeAdapterError extends Error {}

export class FakeAdapter extends CLIAdapter {
  static readonly adapterName = "fake";

  private static scripts = new Map<string, AdapterResult[]>();
  private static invocationsByAgent = new Map<string, Array<{ prompt: string; workdir: string }>>();

  static script(agent_id: string, results: AdapterResult[]): void {
    FakeAdapter.scripts.set(agent_id, [...results]);
    if (!FakeAdapter.invocationsByAgent.has(agent_id)) {
      FakeAdapter.invocationsByAgent.set(agent_id, []);
    }
  }

  static invocationsFor(agent_id: string): Array<{ prompt: string; workdir: string }> {
    return FakeAdapter.invocationsByAgent.get(agent_id) ?? [];
  }

  static resetAll(): void {
    FakeAdapter.scripts.clear();
    FakeAdapter.invocationsByAgent.clear();
  }

  buildCommand(): string[] {
    return ["true"];
  }

  parseResult(stdout: string, stderr: string, exit_code: number): AdapterResult {
    return { stdout, stderr, exit_code, files_changed: [], duration_s: 0, cost_estimate_usd: null };
  }

  override async run(prompt: string, workdir: string): Promise<AdapterResult> {
    const invocations = FakeAdapter.invocationsByAgent.get(this.agent_id) ?? [];
    invocations.push({ prompt, workdir });
    FakeAdapter.invocationsByAgent.set(this.agent_id, invocations);

    const queue = FakeAdapter.scripts.get(this.agent_id);
    if (!queue || queue.length === 0) {
      throw new FakeAdapterError(
        `FakeAdapter(${this.agent_id}) has no scripted results; prior invocations: ${invocations.length}`,
      );
    }
    return queue.shift()!;
  }
}

registerAdapter(FakeAdapter);

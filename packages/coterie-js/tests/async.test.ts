import { describe, expect, it } from "vitest";

import { FakeAdapter } from "../src/adapters/fake.js";
import { CLIAdapter, type AdapterResult } from "../src/adapters/base.js";
import { LocalSubprocessExecutor } from "../src/core/executor.js";
import { ScriptedLLMClient } from "../src/core/llm/scripted.js";
import { progress, type AgentDoneEvent, type AgentStartEvent } from "../src/core/progress.js";
import { buildGraph } from "../src/graph.js";
import "../src/modes/index.js";
import { autoResetFakes, initialState } from "./helpers.js";

/** A real-subprocess adapter that sleeps, so we can exercise timeout/abort. */
class SleepAdapter extends CLIAdapter {
  static readonly adapterName = "sleep-test";
  buildCommand(): string[] {
    return ["node", "-e", "setTimeout(() => process.exit(0), 5000)"];
  }
  parseResult(stdout: string, stderr: string, exit_code: number): AdapterResult {
    return { stdout, stderr, exit_code, files_changed: [], duration_s: 0, cost_estimate_usd: null };
  }
}

/** Writes a 4 MiB line with NO newline (to stress the streaming line buffer),
 *  then a newline and a short whole line. Exits only AFTER the write flushes (via
 *  the write callback) — a bare process.exit(0) would truncate the piped output. */
class FloodAdapter extends CLIAdapter {
  static readonly adapterName = "flood-test";
  buildCommand(): string[] {
    return ["node", "-e", 'process.stdout.write("x".repeat(4*1024*1024)+"\\nSHORT\\n", () => process.exit(0))'];
  }
  parseResult(stdout: string, stderr: string, exit_code: number): AdapterResult {
    return { stdout, stderr, exit_code, files_changed: [], duration_s: 0, cost_estimate_usd: null };
  }
  streamEvent(line: string): string | null {
    return line === "SHORT" ? "→ short" : null;
  }
}

describe("async adapter execution + cancellation", () => {
  it("bounds the streaming line buffer and resyncs at the next newline", async () => {
    const notes: string[] = [];
    const r = await new FloodAdapter("x").run("p", ".", { onStream: (t) => notes.push(t) });
    expect(r.exit_code).toBe(0);
    // The over-cap unterminated line is dropped, but streaming recovers and the
    // following whole line still produces its note.
    expect(notes).toEqual(["→ short"]);
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(new SleepAdapter("x").run("p", ".", { signal: ac.signal })).rejects.toThrow(/abort/i);
  });

  it("aborting mid-flight kills the child and rejects fast (well under the 5s sleep)", async () => {
    const ac = new AbortController();
    const t0 = Date.now();
    const p = new SleepAdapter("x").run("p", ".", { signal: ac.signal });
    setTimeout(() => ac.abort(), 100);
    await expect(p).rejects.toThrow(/abort/i);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("kills the child and rejects with a timeout error on timeout", async () => {
    await expect(new SleepAdapter("x").run("p", ".", { timeoutMs: 150 })).rejects.toThrow(/timed out/i);
  });
});

describe("progress bus", () => {
  autoResetFakes();

  it("emits start + done for each agent that runs in a round", async () => {
    const finding = JSON.stringify([{ category: "bug", severity: "low", description: "x", line_ranges: [] }]);
    FakeAdapter.script("a", [{ stdout: finding, stderr: "", exit_code: 0, files_changed: [], duration_s: 0, cost_estimate_usd: null }]);
    FakeAdapter.script("b", [{ stdout: "[]", stderr: "", exit_code: 0, files_changed: [], duration_s: 0, cost_estimate_usd: null }]);

    const starts: AgentStartEvent[] = [];
    const dones: AgentDoneEvent[] = [];
    const onStart = (e: AgentStartEvent) => starts.push(e);
    const onDone = (e: AgentDoneEvent) => dones.push(e);
    progress.on("start", onStart);
    progress.on("done", onDone);

    try {
      const engineResp = JSON.stringify([{ description: "x", category: "bug", severity: "low", supporting_agents: ["a"], member_indices: [0] }]);
      const cfg = { version: 1, mode: "consensus", agents: [{ id: "a", adapter: "fake" }, { id: "b", adapter: "fake" }] };
      const graph = buildGraph({ workdir: ".", executor: new LocalSubprocessExecutor(), config: cfg, consensus_llm: new ScriptedLLMClient([engineResp]) });
      await graph.invoke(initialState("review", cfg));
    } finally {
      progress.off("start", onStart);
      progress.off("done", onDone);
    }

    expect(starts.map((s) => s.agent_id).sort()).toEqual(["a", "b"]);
    expect(dones.map((d) => d.run.agent_id).sort()).toEqual(["a", "b"]);
  });
});

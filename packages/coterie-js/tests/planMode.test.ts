import { afterEach, describe, expect, it } from "vitest";

import { CLIAdapter, type AdapterResult } from "../src/adapters/base.js";
import { FakeAdapter } from "../src/adapters/fake.js";
import "../src/adapters/index.js";
import { buildFinalizerPrompt, buildPlanPrompt, runFinalizer } from "../src/chat/finalizer.js";
import { LocalSubprocessExecutor } from "../src/core/executor.js";

/** Captures the `extra` an executor forwards into the adapter, without spawning. */
class RecordingAdapter extends CLIAdapter {
  static readonly adapterName = "recording";
  lastExtra: Record<string, unknown> | undefined;

  buildCommand(): string[] {
    return ["true"];
  }
  parseResult(stdout: string, stderr: string, exit_code: number): AdapterResult {
    return { stdout, stderr, exit_code, files_changed: [], duration_s: 0, cost_estimate_usd: null };
  }
  override async run(_prompt: string, _workdir: string, opts: { extra?: Record<string, unknown> } = {}): Promise<AdapterResult> {
    this.lastExtra = opts.extra;
    return { stdout: "", stderr: "", exit_code: 0, files_changed: [], duration_s: 0, cost_estimate_usd: null };
  }
}

const okRun: AdapterResult = { stdout: "", stderr: "", exit_code: 0, files_changed: [], duration_s: 0, cost_estimate_usd: null };

describe("executor read-only forwarding", () => {
  it("forwards readOnly:true to the adapter when constructed read-only", async () => {
    const a = new RecordingAdapter("r");
    await new LocalSubprocessExecutor({ readOnly: true }).execute(a, "p", ".");
    expect(a.lastExtra).toEqual({ readOnly: true });
  });

  it("defaults to readOnly:false (the finalizer is the sole mutator)", async () => {
    const a = new RecordingAdapter("r");
    await new LocalSubprocessExecutor().execute(a, "p", ".");
    expect(a.lastExtra).toEqual({ readOnly: false });
  });
});

describe("finalizer prompts", () => {
  it("the normal prompt asks the finalizer to apply edits", () => {
    expect(buildFinalizerPrompt("t", "d")).toContain("make any file edits");
  });

  it("the plan prompt forbids any edits", () => {
    const p = buildPlanPrompt("t", "d");
    expect(p).toContain("PLAN MODE");
    expect(p).toMatch(/do NOT edit any files/i);
  });
});

describe("runFinalizer prompt selection", () => {
  afterEach(() => FakeAdapter.resetAll());

  it("uses the plan prompt in plan mode", async () => {
    FakeAdapter.resetAll();
    FakeAdapter.script("finalizer", [{ ...okRun, stdout: "here's the plan" }]);
    const { answer } = await runFinalizer({ task: "do x", digest: "d", workdir: ".", adapter: "fake", planMode: true });
    expect(answer).toBe("here's the plan");
    expect(FakeAdapter.invocationsFor("finalizer")[0]!.prompt).toContain("PLAN MODE");
  });

  it("uses the edit prompt by default", async () => {
    FakeAdapter.resetAll();
    FakeAdapter.script("finalizer", [{ ...okRun, stdout: "did it" }]);
    await runFinalizer({ task: "do x", digest: "d", workdir: ".", adapter: "fake" });
    expect(FakeAdapter.invocationsFor("finalizer")[0]!.prompt).toContain("make any file edits");
  });
});

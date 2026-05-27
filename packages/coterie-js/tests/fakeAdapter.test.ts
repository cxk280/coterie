import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeAdapter, FakeAdapterError } from "../src/adapters/fake.js";

describe("FakeAdapter", () => {
  beforeEach(() => FakeAdapter.resetAll());
  afterEach(() => FakeAdapter.resetAll());

  it("scripts and replays", async () => {
    FakeAdapter.script("a", [{ stdout: "hi", stderr: "", exit_code: 0, files_changed: [], duration_s: 0, cost_estimate_usd: 0.001 }]);
    const r = await new FakeAdapter("a").run("x", ".");
    expect(r.stdout).toBe("hi");
    expect(r.cost_estimate_usd).toBe(0.001);
  });

  it("independent queues per agent_id", async () => {
    FakeAdapter.script("a", [{ stdout: "A", stderr: "", exit_code: 0, files_changed: [], duration_s: 0, cost_estimate_usd: null }]);
    FakeAdapter.script("b", [{ stdout: "B", stderr: "", exit_code: 0, files_changed: [], duration_s: 0, cost_estimate_usd: null }]);
    expect((await new FakeAdapter("a").run("x", ".")).stdout).toBe("A");
    expect((await new FakeAdapter("b").run("x", ".")).stdout).toBe("B");
  });

  it("exhaustion rejects", async () => {
    FakeAdapter.script("a", [{ stdout: "once", stderr: "", exit_code: 0, files_changed: [], duration_s: 0, cost_estimate_usd: null }]);
    const adapter = new FakeAdapter("a");
    await adapter.run("x", ".");
    await expect(adapter.run("x", ".")).rejects.toThrow(FakeAdapterError);
  });

  it("records invocations", async () => {
    FakeAdapter.script("a", [{ stdout: "", stderr: "", exit_code: 0, files_changed: [], duration_s: 0, cost_estimate_usd: null }]);
    await new FakeAdapter("a").run("the-prompt", "/tmp");
    expect(FakeAdapter.invocationsFor("a")).toEqual([{ prompt: "the-prompt", workdir: "/tmp" }]);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeAdapter, FakeAdapterError } from "../src/adapters/fake.js";

describe("FakeAdapter", () => {
  beforeEach(() => FakeAdapter.resetAll());
  afterEach(() => FakeAdapter.resetAll());

  it("scripts and replays", () => {
    FakeAdapter.script("a", [{ stdout: "hi", stderr: "", exit_code: 0, files_changed: [], duration_s: 0, cost_estimate_usd: 0.001 }]);
    const r = new FakeAdapter("a").run("x", ".");
    expect(r.stdout).toBe("hi");
    expect(r.cost_estimate_usd).toBe(0.001);
  });

  it("independent queues per agent_id", () => {
    FakeAdapter.script("a", [{ stdout: "A", stderr: "", exit_code: 0, files_changed: [], duration_s: 0, cost_estimate_usd: null }]);
    FakeAdapter.script("b", [{ stdout: "B", stderr: "", exit_code: 0, files_changed: [], duration_s: 0, cost_estimate_usd: null }]);
    expect(new FakeAdapter("a").run("x", ".").stdout).toBe("A");
    expect(new FakeAdapter("b").run("x", ".").stdout).toBe("B");
  });

  it("exhaustion throws", () => {
    FakeAdapter.script("a", [{ stdout: "once", stderr: "", exit_code: 0, files_changed: [], duration_s: 0, cost_estimate_usd: null }]);
    const adapter = new FakeAdapter("a");
    adapter.run("x", ".");
    expect(() => adapter.run("x", ".")).toThrow(FakeAdapterError);
  });

  it("records invocations", () => {
    FakeAdapter.script("a", [{ stdout: "", stderr: "", exit_code: 0, files_changed: [], duration_s: 0, cost_estimate_usd: null }]);
    new FakeAdapter("a").run("the-prompt", "/tmp");
    expect(FakeAdapter.invocationsFor("a")).toEqual([{ prompt: "the-prompt", workdir: "/tmp" }]);
  });
});

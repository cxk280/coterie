import { describe, expect, it } from "vitest";

import { FakeAdapter } from "../src/adapters/fake.js";
import { LocalSubprocessExecutor } from "../src/core/executor.js";
import { ScriptedLLMClient } from "../src/core/llm/scripted.js";
import { buildGraph } from "../src/graph.js";
import "../src/modes/index.js";
import { autoResetFakes, initialState } from "./helpers.js";

const r = (stdout: string, cost: number | null = null) => ({
  stdout,
  stderr: "",
  exit_code: 0,
  files_changed: [],
  duration_s: 0,
  cost_estimate_usd: cost,
});

const cfg = (max = 3) => ({
  version: 1,
  mode: "adversarial",
  agents: [{ id: "impl", adapter: "fake" }, { id: "auditor", adapter: "fake" }],
  adversarial: { implementer: "impl", auditor: "auditor", max_rounds: max },
});

describe("adversarial mode", () => {
  autoResetFakes();

  it("accept on round 1 when no findings", async () => {
    FakeAdapter.script("impl", [r("def foo(): return 42")]);
    FakeAdapter.script("auditor", [r("[]")]);
    const graph = buildGraph({ workdir: ".", executor: new LocalSubprocessExecutor(), config: cfg(), judge_llm: new ScriptedLLMClient([]) });
    const final: any = await graph.invoke(initialState("write foo", cfg()));
    expect(final.status).toBe("done");
    expect(final.judge_history.at(-1).winner).toBe("implementer");
    expect(final.mode_state.verdict).toBe("accept");
  });

  it("revise then accept on round 2", async () => {
    FakeAdapter.script("impl", [r("def foo(): pass"), r("def foo(): return 42")]);
    FakeAdapter.script("auditor", [r(JSON.stringify([{ category: "missed-requirement", severity: "high", description: "function doesn't return", line_ranges: ["foo.py:1"] }])), r("[]")]);
    const judgeResp = JSON.stringify({ sustained: [0], rejected: [], verdict: "revise", reason: "no return value" });
    const c = cfg();
    const graph = buildGraph({ workdir: ".", executor: new LocalSubprocessExecutor(), config: c, judge_llm: new ScriptedLLMClient([judgeResp]) });
    const final: any = await graph.invoke(initialState("write foo", c));
    expect(final.status).toBe("done");
    expect(final.judge_history).toHaveLength(2);
    expect(final.judge_history[0].winner).toBe("auditor");
    expect(final.judge_history[1].winner).toBe("implementer");
    const impls = FakeAdapter.invocationsFor("impl");
    expect(impls).toHaveLength(2);
    expect(impls[1].prompt).toContain("function doesn't return");
  });
});

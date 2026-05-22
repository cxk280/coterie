import { describe, expect, it } from "vitest";

import { FakeAdapter } from "../src/adapters/fake.js";
import { LocalSubprocessExecutor } from "../src/core/executor.js";
import { ScriptedLLMClient } from "../src/core/llm/scripted.js";
import { buildGraph } from "../src/graph.js";
import "../src/modes/index.js";
import { autoResetFakes, initialState } from "./helpers.js";

describe("consensus mode", () => {
  autoResetFakes();

  it("two agents agree → confirmed", async () => {
    const findingA = [{ category: "bug", severity: "high", description: "missing null check", line_ranges: ["x.py:5-6"] }];
    const findingB = [{ category: "bug", severity: "high", description: "null check missing", line_ranges: ["x.py:5-7"] }];
    FakeAdapter.script("a", [{ stdout: JSON.stringify(findingA), stderr: "", exit_code: 0, files_changed: [], duration_s: 0, cost_estimate_usd: null }]);
    FakeAdapter.script("b", [{ stdout: JSON.stringify(findingB), stderr: "", exit_code: 0, files_changed: [], duration_s: 0, cost_estimate_usd: null }]);

    const engineResp = JSON.stringify([{ description: "missing null check", category: "bug", severity: "high", supporting_agents: ["a", "b"], member_indices: [0, 1] }]);
    const cfg = { version: 1, mode: "consensus", agents: [{ id: "a", adapter: "fake" }, { id: "b", adapter: "fake" }] };
    const graph = buildGraph({ workdir: ".", executor: new LocalSubprocessExecutor(), config: cfg, consensus_llm: new ScriptedLLMClient([engineResp]) });
    const final: any = await graph.invoke(initialState("review", cfg));
    const consensus = final.mode_state.consensus_findings;
    expect(consensus).toHaveLength(1);
    expect(consensus[0].label).toBe("confirmed");
    expect(consensus[0].agreement_count).toBe(2);
  });

  it("single supporter → unverified", async () => {
    const finding = JSON.stringify([{ category: "bug", severity: "low", description: "x", line_ranges: [] }]);
    FakeAdapter.script("a", [{ stdout: finding, stderr: "", exit_code: 0, files_changed: [], duration_s: 0, cost_estimate_usd: null }]);
    FakeAdapter.script("b", [{ stdout: "[]", stderr: "", exit_code: 0, files_changed: [], duration_s: 0, cost_estimate_usd: null }]);
    const engineResp = JSON.stringify([{ description: "x", category: "bug", severity: "low", supporting_agents: ["a"], member_indices: [0] }]);
    const cfg = { version: 1, mode: "consensus", agents: [{ id: "a", adapter: "fake" }, { id: "b", adapter: "fake" }] };
    const graph = buildGraph({ workdir: ".", executor: new LocalSubprocessExecutor(), config: cfg, consensus_llm: new ScriptedLLMClient([engineResp]) });
    const final: any = await graph.invoke(initialState("review", cfg));
    expect(final.mode_state.consensus_findings[0].label).toBe("unverified");
  });
});

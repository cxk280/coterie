import { describe, expect, it } from "vitest";

import { FakeAdapter } from "../src/adapters/fake.js";
import { LocalSubprocessExecutor } from "../src/core/executor.js";
import { ScriptedLLMClient } from "../src/core/llm/scripted.js";
import { buildGraph } from "../src/graph.js";
import "../src/modes/index.js";
import { autoResetFakes, initialState } from "./helpers.js";

describe("single mode", () => {
  autoResetFakes();

  it("round-robin without LLM", async () => {
    FakeAdapter.script("a", [{ stdout: "out", stderr: "", exit_code: 0, files_changed: [], duration_s: 0, cost_estimate_usd: 0.01 }]);
    const cfg = { version: 1, mode: "single", agents: [{ id: "a", adapter: "fake" }], router: { enabled: false } };
    const graph = buildGraph({ workdir: ".", executor: new LocalSubprocessExecutor(), config: cfg });
    const final: any = await graph.invoke(initialState("hello", cfg));
    expect(final.status).toBe("done");
    expect(final.runs).toHaveLength(1);
    expect(final.runs[0].stdout).toBe("out");
    expect(final.spend_usd).toBe(0.01);
  });

  it("LLM router picks named agent", async () => {
    FakeAdapter.script("b", [{ stdout: "b-out", stderr: "", exit_code: 0, files_changed: [], duration_s: 0, cost_estimate_usd: null }]);
    const cfg = {
      version: 1,
      mode: "single",
      agents: [
        { id: "a", adapter: "fake" },
        { id: "b", adapter: "fake" },
      ],
    };
    const routerLlm = new ScriptedLLMClient([JSON.stringify({ agent_id: "b", reason: "test" })]);
    const graph = buildGraph({ workdir: ".", executor: new LocalSubprocessExecutor(), config: cfg, supervisor_llm: routerLlm });
    const final: any = await graph.invoke(initialState("x", cfg));
    expect(final.runs[0].agent_id).toBe("b");
  });
});

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

describe("tournament mode", () => {
  autoResetFakes();

  it("three way single round", async () => {
    FakeAdapter.script("a", [r("A", 0.05)]);
    FakeAdapter.script("b", [r("B", 0.10)]);
    FakeAdapter.script("c", [r("C", 0.02)]);
    const cfg = {
      version: 1,
      mode: "tournament",
      agents: [{ id: "a", adapter: "fake" }, { id: "b", adapter: "fake" }, { id: "c", adapter: "fake" }],
      tournament: { participants: ["a", "b", "c"] },
    };
    const judgeResp = JSON.stringify({
      ranking: [
        { agent_id: "b", score: 90, reason: "best" },
        { agent_id: "a", score: 80, reason: "ok" },
        { agent_id: "c", score: 60, reason: "weak" },
      ],
      winner: "b",
      summary: "b wins",
    });
    const graph = buildGraph({ workdir: ".", executor: new LocalSubprocessExecutor(), config: cfg, judge_llm: new ScriptedLLMClient([judgeResp]) });
    const final: any = await graph.invoke(initialState("solve", cfg));
    expect(final.status).toBe("done");
    expect(final.judge_history.at(-1).winner).toBe("b");
    expect(final.mode_state.winner).toBe("b");
  });
});

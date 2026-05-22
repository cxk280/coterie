import { describe, expect, it } from "vitest";

import { FakeAdapter } from "../src/adapters/fake.js";
import { LocalSubprocessExecutor } from "../src/core/executor.js";
import { ScriptedLLMClient } from "../src/core/llm/scripted.js";
import { buildGraph } from "../src/graph.js";
import "../src/modes/index.js";
import { autoResetFakes, initialState } from "./helpers.js";

const r = (stdout: string) => ({ stdout, stderr: "", exit_code: 0, files_changed: [], duration_s: 0, cost_estimate_usd: null });

describe("debate mode", () => {
  autoResetFakes();

  it("single round debate", async () => {
    FakeAdapter.script("pro-agent", [r("Postgres scales better.")]);
    FakeAdapter.script("con-agent", [r("SQLite is simpler.")]);
    const cfg = {
      version: 1,
      mode: "debate",
      agents: [{ id: "pro-agent", adapter: "fake" }, { id: "con-agent", adapter: "fake" }],
      debate: { sides: ["pro-agent", "con-agent"], rounds: 1 },
    };
    const modResp = JSON.stringify({ round_summary: "Pro: scaling. Con: simplicity.", unresolved: "", fact_check_needed: [] });
    const judgeResp = JSON.stringify({ winner: "pro", reason: "scale", scores: { pro: 8, con: 6 } });
    const graph = buildGraph({
      workdir: ".",
      executor: new LocalSubprocessExecutor(),
      config: cfg,
      moderator_llm: new ScriptedLLMClient([modResp]),
      judge_llm: new ScriptedLLMClient([judgeResp]),
    });
    const final: any = await graph.invoke(initialState("Postgres or SQLite?", cfg));
    expect(final.status).toBe("done");
    expect(final.judge_history.at(-1).winner).toBe("pro-agent");
    expect(final.mode_state.rounds_completed).toBe(1);
  });
});

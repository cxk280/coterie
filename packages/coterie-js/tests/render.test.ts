import { describe, expect, it } from "vitest";

import type { AgentRun, CoterieState } from "../src/core/state.js";
import { buildFinalizerPrompt } from "../src/chat/finalizer.js";
import { digestRound, renderContribution } from "../src/chat/render.js";

function run(partial: Partial<AgentRun>): AgentRun {
  return {
    agent_id: "a",
    role: "consensus-participant",
    prompt: "",
    stdout: "",
    stderr: "",
    exit_code: 0,
    files_changed: [],
    duration_s: 0,
    cost_estimate_usd: null,
    ...partial,
  };
}

describe("renderContribution", () => {
  it("renders a findings array as bullets, not raw JSON", () => {
    const out = renderContribution(
      run({
        stdout: JSON.stringify([
          { category: "missed-requirement", severity: "high", description: "No file was added." },
        ]),
      }),
    );
    expect(out).toBe("• [high] missed-requirement: No file was added.");
    expect(out).not.toContain("{");
    expect(out).not.toContain("[\"");
  });

  it("treats an empty findings array as 'no defects reported'", () => {
    expect(renderContribution(run({ stdout: "[]" }))).toBe("no defects reported");
  });

  it("strips code fences around findings JSON", () => {
    const out = renderContribution(
      run({ stdout: '```json\n[{"severity":"low","category":"clarity","description":"rename x"}]\n```' }),
    );
    expect(out).toBe("• [low] clarity: rename x");
  });

  it("passes prose through unchanged", () => {
    expect(renderContribution(run({ stdout: "I added a story to story.md." }))).toBe(
      "I added a story to story.md.",
    );
  });

  it("caps very long prose", () => {
    const out = renderContribution(run({ stdout: "x".repeat(5000) }), 100);
    expect(out.length).toBeLessThan(110);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("digestRound", () => {
  const base: CoterieState = {
    task: "add a file",
    mode: "consensus",
    plan: [],
    current_step_idx: 0,
    runs: [],
    artifacts: {},
    status: "done",
    config: {},
    spend_usd: 0,
    route_history: [],
    judge_history: [],
    next_agent: null,
    mode_state: {},
  };

  it("summarises runs, verdicts and consensus findings as readable text", () => {
    const digest = digestRound({
      ...base,
      runs: [
        run({ agent_id: "claude-code", stdout: '[{"severity":"high","category":"bug","description":"off-by-one"}]' }),
      ],
      judge_history: [{ step: 0, winner: "implementer", reason: "looks good", scores: {} }],
      mode_state: {
        consensus_findings: [
          { description: "off-by-one", category: "bug", severity: "high", agreement_count: 2, agreement_ratio: 1, label: "confirmed", supporting_agents: ["claude-code", "codex"] },
        ],
      },
    });
    expect(digest).toContain("### consensus-participant — claude-code");
    expect(digest).toContain("• [high] bug: off-by-one");
    expect(digest).toContain("### verdicts");
    expect(digest).toContain("implementer: looks good");
    expect(digest).toContain("[confirmed]");
  });

  it("never returns an empty string", () => {
    expect(digestRound(base)).toBeTruthy();
  });
});

describe("buildFinalizerPrompt", () => {
  it("includes the task, the digest, and a no-JSON instruction", () => {
    const p = buildFinalizerPrompt("add a story file", "### single — claude-code\nhere is a draft");
    expect(p).toContain("add a story file");
    expect(p).toContain("here is a draft");
    expect(p).toMatch(/do NOT output JSON/i);
    expect(p).toMatch(/plain prose/i);
  });
});

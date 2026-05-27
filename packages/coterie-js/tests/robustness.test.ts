import { describe, expect, it } from "vitest";

import { runFailed } from "../src/chat/render.js";
import type { AgentRun } from "../src/core/state.js";
import { parseJsonLoose } from "../src/core/json.js";
import { findingsAreParseable, parseFindings } from "../src/nodes/auditor.js";

function run(p: Partial<AgentRun>): AgentRun {
  return { agent_id: "a", role: "auditor", prompt: "", stdout: "", stderr: "", exit_code: 0, files_changed: [], duration_s: 0, cost_estimate_usd: null, ...p };
}

describe("parseJsonLoose", () => {
  it("parses plain JSON", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
  });
  it("parses a ```json fenced block", () => {
    expect(parseJsonLoose('```json\n[1,2,3]\n```')).toEqual([1, 2, 3]);
  });
  it("recovers JSON wrapped in prose", () => {
    expect(parseJsonLoose('Sure! Here it is: {"ok":true} — hope that helps')).toEqual({ ok: true });
  });
  it("returns undefined when there's no JSON", () => {
    expect(parseJsonLoose("no json here")).toBeUndefined();
  });
});

describe("parseFindings / findingsAreParseable", () => {
  it("reads a prose-wrapped findings array (not as empty)", () => {
    const out = 'Here are the issues:\n[{"severity":"high","category":"bug","description":"x"}]';
    expect(parseFindings(out)).toHaveLength(1);
    expect(findingsAreParseable(out)).toBe(true);
  });
  it("distinguishes a genuine [] from unparseable prose", () => {
    expect(findingsAreParseable("[]")).toBe(true);
    expect(parseFindings("[]")).toEqual([]);
    expect(findingsAreParseable("the code looks fine to me")).toBe(false);
    expect(parseFindings("the code looks fine to me")).toEqual([]);
  });
});

describe("runFailed refinement", () => {
  it("flags a non-zero exit", () => {
    expect(runFailed(run({ exit_code: 1 }))).toBe(true);
  });
  it("flags exit-0 with empty stdout and an error on stderr", () => {
    expect(runFailed(run({ stdout: "", stderr: "Error: rate limit reached" }))).toBe(true);
  });
  it("does NOT flag exit-0 with empty stdout and a benign stderr warning", () => {
    expect(runFailed(run({ stdout: "", stderr: "warning: deprecated flag, ignoring" }))).toBe(false);
  });
  it("does NOT flag a normal run with stdout", () => {
    expect(runFailed(run({ stdout: "done", stderr: "note: something" }))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { Transcript } from "../src/chat/transcript.js";
import { validateRuntimeConfig } from "../src/core/validate.js";

const AGENTS = [
  { id: "a", adapter: "fake" },
  { id: "b", adapter: "fake" },
];

describe("validateRuntimeConfig", () => {
  it("rejects an empty agents list", () => {
    expect(() => validateRuntimeConfig({ mode: "single", agents: [] })).toThrow(/at least one agent/);
  });

  it("rejects an adversarial config whose roles aren't in agents", () => {
    expect(() =>
      validateRuntimeConfig({ mode: "adversarial", agents: AGENTS, adversarial: { implementer: "a", auditor: "ghost" } }),
    ).toThrow(/auditor.*ghost/);
  });

  it("rejects debate sides that aren't exactly two ids", () => {
    expect(() =>
      validateRuntimeConfig({ mode: "debate", agents: AGENTS, debate: { sides: ["a"] } }),
    ).toThrow(/exactly two/);
  });

  it("rejects fewer than two participants", () => {
    expect(() =>
      validateRuntimeConfig({ mode: "consensus", agents: AGENTS, consensus: { participants: ["a"] } }),
    ).toThrow(/at least two/);
  });

  it("accepts a well-formed config (participants default to all agents)", () => {
    expect(() => validateRuntimeConfig({ mode: "tournament", agents: AGENTS })).not.toThrow();
    expect(() => validateRuntimeConfig({ mode: "adversarial", agents: AGENTS, adversarial: { implementer: "a", auditor: "b" } })).not.toThrow();
  });
});

describe("Transcript history cap", () => {
  it("bounds the prepended history so argv can't grow without limit", () => {
    const t = new Transcript();
    for (let i = 0; i < 50; i++) t.add("user", "x".repeat(2000));
    const task = t.taskFor("the new prompt");
    expect(task).toContain("the new prompt");
    expect(task).toContain("earlier conversation trimmed");
    expect(task.length).toBeLessThan(20_000); // 12k budget + framing, not 100k+
  });

  it("passes a short conversation through untrimmed", () => {
    const t = new Transcript();
    t.add("user", "hello");
    t.add("assistant", "hi");
    const task = t.taskFor("next");
    expect(task).not.toContain("trimmed");
    expect(task).toContain("hello");
  });
});

import { describe, expect, it, vi } from "vitest";

const { spawnSync } = vi.hoisted(() => ({ spawnSync: vi.fn() }));
vi.mock("node:child_process", () => ({ spawnSync }));

import { defaultConfig } from "../src/chat/configs.js";
import { preflight } from "../src/chat/preflight.js";
import { Transcript } from "../src/chat/transcript.js";

describe("Transcript", () => {
  it("returns the bare prompt on the first turn", () => {
    expect(new Transcript().taskFor("hello")).toBe("hello");
  });

  it("threads prior turns into the task", () => {
    const t = new Transcript();
    t.add("user", "add a function foo");
    t.add("assistant", "done, added foo()");
    const task = t.taskFor("now add tests");
    expect(task).toContain("Conversation so far:");
    expect(task).toContain("add a function foo");
    expect(task).toContain("User's new request: now add tests");
  });

  it("clear() forgets history", () => {
    const t = new Transcript();
    t.add("user", "x");
    t.clear();
    expect(t.taskFor("y")).toBe("y");
  });
});

describe("preflight", () => {
  it("flags agent CLIs that are not installed", () => {
    spawnSync.mockReturnValue({ status: 1, error: new Error("ENOENT") }); // nothing installed
    const problems = preflight(defaultConfig("adversarial")); // claude-code + codex
    const clis = problems.map((p) => p.cli).sort();
    expect(clis).toEqual(["claude", "codex"]);
    expect(problems[0].reason).toBe("not installed");
    expect(problems[0].fix).toMatch(/install/i);
  });
});

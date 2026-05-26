import { beforeEach, describe, expect, it, vi } from "vitest";

const { spawnSync } = vi.hoisted(() => ({ spawnSync: vi.fn() }));
const { existsSync } = vi.hoisted(() => ({ existsSync: vi.fn(() => true) }));
vi.mock("node:child_process", () => ({ spawnSync }));
vi.mock("node:fs", () => ({ existsSync }));

import { defaultConfig } from "../src/chat/configs.js";
import { formatProblems, preflight } from "../src/chat/preflight.js";
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
  beforeEach(() => {
    spawnSync.mockReset();
    existsSync.mockReset();
    existsSync.mockReturnValue(true); // installed CLIs look authed unless overridden
  });

  /** Mock `<cli> --version` to succeed only for the listed CLIs. */
  function present(...clis: string[]): void {
    spawnSync.mockImplementation((cmd: string) =>
      clis.includes(cmd) ? { status: 0 } : { status: 1, error: new Error("ENOENT") },
    );
  }

  it("flags both when neither is installed", () => {
    present(); // none
    const problems = preflight(defaultConfig("adversarial")); // claude-code + codex
    expect(problems.map((p) => p.cli).sort()).toEqual(["claude", "codex"]);
    expect(problems.every((p) => p.reason === "not installed")).toBe(true);
  });

  it("flags only claude when codex is present but claude is missing", () => {
    present("codex");
    const problems = preflight(defaultConfig("adversarial"));
    expect(problems).toHaveLength(1);
    expect(problems[0].cli).toBe("claude");
    expect(problems[0].reason).toBe("not installed");
    expect(problems[0].fix).toContain("@anthropic-ai/claude-code");
  });

  it("flags only codex when claude is present but codex is missing", () => {
    present("claude");
    const problems = preflight(defaultConfig("adversarial"));
    expect(problems).toHaveLength(1);
    expect(problems[0].cli).toBe("codex");
    expect(problems[0].fix).toContain("@openai/codex");
  });

  it("flags an installed-but-unauthenticated CLI as not signed in", () => {
    present("claude", "codex");
    existsSync.mockReturnValue(false); // no credential files anywhere
    const problems = preflight(defaultConfig("adversarial"));
    expect(problems.map((p) => p.reason)).toEqual(["not signed in", "not signed in"]);
  });

  it("returns no problems when both are installed and authenticated", () => {
    present("claude", "codex");
    expect(preflight(defaultConfig("adversarial"))).toEqual([]);
  });

  it("formats a remediation line per problem", () => {
    present("codex");
    const text = formatProblems(preflight(defaultConfig("adversarial")));
    expect(text).toContain("✗ claude — not installed");
    expect(text).toContain("npm install -g @anthropic-ai/claude-code");
    expect(text).toMatch(/no API keys needed/i);
  });
});

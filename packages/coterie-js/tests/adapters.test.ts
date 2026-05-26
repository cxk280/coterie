import { describe, expect, it } from "vitest";

import { ClaudeCodeAdapter } from "../src/adapters/claudeCode.js";
import { CodexAdapter } from "../src/adapters/codex.js";
import { CursorAdapter } from "../src/adapters/cursor.js";
import "../src/adapters/index.js";
import { ADAPTER_REGISTRY } from "../src/core/registry.js";

describe("agent adapter commands", () => {
  it("claude-code runs headless with acceptEdits and on the subscription", () => {
    const a = new ClaudeCodeAdapter("claude-code", { model: "claude-opus-4-7" });
    const cmd = a.buildCommand("do it", ".", {});
    expect(cmd.slice(0, 2)).toEqual(["claude", "-p"]);
    expect(cmd).toContain("--permission-mode");
    expect(cmd[cmd.indexOf("--permission-mode") + 1]).toBe("acceptEdits");
    expect(cmd).toContain("--model");
    // Subscription auth: the API key is stripped from the subprocess env.
    expect(ClaudeCodeAdapter.stripEnv).toContain("ANTHROPIC_API_KEY");
  });

  it("codex exec runs autonomously but sandboxed, prompt last", () => {
    const cmd = new CodexAdapter("codex").buildCommand("fix bug", ".", {});
    expect(cmd.slice(0, 2)).toEqual(["codex", "exec"]);
    expect(cmd).toContain("--skip-git-repo-check");
    expect(cmd[cmd.indexOf("-s") + 1]).toBe("workspace-write");
    expect(cmd.at(-1)).toBe("fix bug");
  });

  it("cursor uses the cursor-agent CLI with --force", () => {
    const cmd = new CursorAdapter("cursor").buildCommand("refactor", ".", {});
    expect(cmd.slice(0, 2)).toEqual(["cursor-agent", "-p"]);
    expect(cmd).toContain("--force");
  });

  it("all three real adapters are registered", () => {
    for (const name of ["claude-code", "codex", "cursor"]) {
      expect(ADAPTER_REGISTRY.has(name)).toBe(true);
    }
  });
});

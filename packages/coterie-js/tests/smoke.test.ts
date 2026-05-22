import { describe, expect, it } from "vitest";

import { ClaudeCodeAdapter } from "../src/adapters/claudeCode.js";
import { VERSION } from "../src/index.js";

describe("coterie smoke", () => {
  it("exports a version", () => {
    expect(VERSION).toBe("0.0.1");
  });

  it("claude adapter builds expected argv", () => {
    const a = new ClaudeCodeAdapter("claude");
    const cmd = a.buildCommand("hello", ".", {});
    expect(cmd.slice(0, 2)).toEqual(["claude", "-p"]);
    expect(cmd).toContain("hello");
    expect(cmd).toContain("--output-format");
  });

  it("claude adapter parses json payload", () => {
    const a = new ClaudeCodeAdapter("claude");
    const r = a.parseResult('{"result":"ok","total_cost_usd":0.0012}', "", 0);
    expect(r.stdout).toBe("ok");
    expect(r.cost_estimate_usd).toBe(0.0012);
  });

  it("claude adapter falls back on non-json", () => {
    const a = new ClaudeCodeAdapter("claude");
    const r = a.parseResult("plain", "warn", 1);
    expect(r.stdout).toBe("plain");
    expect(r.stderr).toBe("warn");
    expect(r.exit_code).toBe(1);
  });
});

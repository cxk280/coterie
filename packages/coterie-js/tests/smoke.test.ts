import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ADAPTER_REGISTRY, MODE_REGISTRY, ClaudeCodeAdapter, VERSION } from "../src/index.js";

describe("coterie smoke", () => {
  it("exports the package.json version", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(VERSION).toBe(pkg.version);
  });

  it("registers built-in adapters", () => {
    const names = ADAPTER_REGISTRY.names();
    expect(names).toEqual(expect.arrayContaining(["claude-code", "codex", "fake"]));
  });

  it("registers all 5 modes", () => {
    const names = MODE_REGISTRY.names().sort();
    expect(names).toEqual(["adversarial", "consensus", "debate", "single", "tournament"]);
  });

  it("ClaudeCodeAdapter builds expected argv", () => {
    const a = new ClaudeCodeAdapter("claude");
    const cmd = a.buildCommand("hello", ".", {});
    expect(cmd.slice(0, 2)).toEqual(["claude", "-p"]);
    expect(cmd).toContain("hello");
    expect(cmd).toContain("--output-format");
  });

  it("ClaudeCodeAdapter parses json payload", () => {
    const a = new ClaudeCodeAdapter("claude");
    const r = a.parseResult('{"result":"ok","total_cost_usd":0.0012}', "", 0);
    expect(r.stdout).toBe("ok");
    expect(r.cost_estimate_usd).toBe(0.0012);
  });

  it("ClaudeCodeAdapter falls back on non-json", () => {
    const a = new ClaudeCodeAdapter("claude");
    const r = a.parseResult("plain", "warn", 1);
    expect(r.stdout).toBe("plain");
    expect(r.stderr).toBe("warn");
    expect(r.exit_code).toBe(1);
  });
});

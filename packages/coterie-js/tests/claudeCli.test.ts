import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { spawnSync } = vi.hoisted(() => ({ spawnSync: vi.fn() }));
vi.mock("node:child_process", () => ({ spawnSync }));

import { ClaudeCliClient } from "../src/core/llm/claudeCli.js";
import { buildLLM } from "../src/core/llm/build.js";

describe("ClaudeCliClient", () => {
  beforeEach(() => spawnSync.mockReset());

  it("shells `claude -p`, parses .result, and strips the API key from the env", async () => {
    spawnSync.mockReturnValue({ stdout: JSON.stringify({ result: "accept", is_error: false }), status: 0 });
    process.env.ANTHROPIC_API_KEY = "sk-should-be-stripped";

    const client = new ClaudeCliClient("claude-opus-4-7");
    const out = await client.chat("You are a judge.", [{ role: "user", content: "verdict?" }]);

    expect(out).toBe("accept");
    const [cmd, args, opts] = spawnSync.mock.calls[0];
    expect(cmd).toBe("claude");
    expect(args).toContain("--system-prompt");
    expect(args).toContain("--disallowedTools");
    expect(args[args.indexOf("--model") + 1]).toBe("claude-opus-4-7");
    // Subscription auth: the key must NOT reach the subprocess.
    expect(opts.env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("surfaces is_error envelopes as thrown errors", async () => {
    spawnSync.mockReturnValue({ stdout: JSON.stringify({ result: "boom", is_error: true }), status: 1 });
    await expect(new ClaudeCliClient().chat("s", [{ role: "user", content: "x" }])).rejects.toThrow(/error/i);
  });
});

describe("buildLLM coordination routing", () => {
  afterEach(() => {
    delete process.env.COTERIE_COORDINATION_PROVIDER;
  });

  it("routes coordination through the CLI client when COTERIE_COORDINATION_PROVIDER=claude-cli", async () => {
    process.env.COTERIE_COORDINATION_PROVIDER = "claude-cli";
    const client = await buildLLM("claude-opus-4-7");
    expect(client).toBeInstanceOf(ClaudeCliClient);
  });

  it("defaults to the API-backed client", async () => {
    const client = await buildLLM("claude-haiku-4-5");
    expect(client).not.toBeInstanceOf(ClaudeCliClient);
  });
});

import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn }));

import { ClaudeCliClient } from "../src/core/llm/claudeCli.js";
import { buildLLM } from "../src/core/llm/build.js";

/** A fake ChildProcess that emits `stdout` then `close(code)` on the next tick,
 *  matching how `claudeCli` consumes async `spawn`. */
function fakeChild(stdout: string, code = 0) {
  const child: any = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = () => { child.killed = true; };
  queueMicrotask(() => {
    if (stdout) child.stdout.emit("data", Buffer.from(stdout));
    child.emit("close", code);
  });
  return child;
}

describe("ClaudeCliClient", () => {
  beforeEach(() => spawn.mockReset());

  it("shells `claude -p`, parses .result, and strips the API key from the env", async () => {
    spawn.mockImplementation(() => fakeChild(JSON.stringify({ result: "accept", is_error: false }), 0));
    process.env.ANTHROPIC_API_KEY = "sk-should-be-stripped";

    const client = new ClaudeCliClient("claude-opus-4-7");
    const out = await client.chat("You are a judge.", [{ role: "user", content: "verdict?" }]);

    expect(out).toBe("accept");
    const [cmd, args, opts] = spawn.mock.calls[0];
    expect(cmd).toBe("claude");
    expect(args).toContain("--system-prompt");
    expect(args).toContain("--disallowedTools");
    expect(args[args.indexOf("--model") + 1]).toBe("claude-opus-4-7");
    // Subscription auth: the key must NOT reach the subprocess.
    expect(opts.env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("surfaces is_error envelopes as thrown errors", async () => {
    spawn.mockImplementation(() => fakeChild(JSON.stringify({ result: "boom", is_error: true }), 1));
    await expect(new ClaudeCliClient().chat("s", [{ role: "user", content: "x" }])).rejects.toThrow(/error/i);
  });

  it("rejects when aborted", async () => {
    spawn.mockImplementation(() => fakeChild("", 0));
    const ac = new AbortController();
    ac.abort();
    await expect(
      new ClaudeCliClient().chat("s", [{ role: "user", content: "x" }], ac.signal),
    ).rejects.toThrow(/abort/i);
  });
});

describe("buildLLM coordination", () => {
  it("always builds the subscription CLI client — no pay-as-you-go API backend", async () => {
    expect(await buildLLM("claude-opus-4-7")).toBeInstanceOf(ClaudeCliClient);
    expect(await buildLLM(undefined)).toBeInstanceOf(ClaudeCliClient);
  });
});

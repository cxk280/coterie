import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn }));

import { buildLLM, coordinationCliFor } from "../src/core/llm/build.js";
import { ClaudeCliClient } from "../src/core/llm/claudeCli.js";
import { CodexCliClient } from "../src/core/llm/codexCli.js";
import { CursorCliClient } from "../src/core/llm/cursorCli.js";

function fakeChild(stdout: string, code = 0) {
  const child: any = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = () => (child.killed = true);
  queueMicrotask(() => {
    if (stdout) child.stdout.emit("data", Buffer.from(stdout));
    child.emit("close", code);
  });
  return child;
}

describe("coordinationCliFor — prefers claude, falls back", () => {
  it("picks claude when claude-code is present", () => {
    expect(coordinationCliFor(["claude-code", "codex"])).toBe("claude");
  });
  it("falls back to codex when claude is absent", () => {
    expect(coordinationCliFor(["codex", "cursor"])).toBe("codex");
  });
  it("falls back to cursor when only cursor is present", () => {
    expect(coordinationCliFor(["cursor"])).toBe("cursor-agent");
  });
});

describe("buildLLM selects the right client", () => {
  it("builds the requested coordination client", async () => {
    expect(await buildLLM(undefined, "claude")).toBeInstanceOf(ClaudeCliClient);
    expect(await buildLLM(undefined, "codex")).toBeInstanceOf(CodexCliClient);
    expect(await buildLLM(undefined, "cursor-agent")).toBeInstanceOf(CursorCliClient);
  });
});

describe("codex coordination client", () => {
  beforeEach(() => spawn.mockReset());
  it("shells `codex exec` read-only and parses the final agent_message", async () => {
    spawn.mockImplementation(() =>
      fakeChild(
        ['{"type":"item.completed","item":{"type":"reasoning"}}', '{"type":"item.completed","item":{"type":"agent_message","text":"accept"}}', '{"type":"turn.completed"}'].join("\n"),
        0,
      ),
    );
    const out = await new CodexCliClient().chat("you are a judge", [{ role: "user", content: "verdict?" }]);
    expect(out).toBe("accept");
    const [cmd, args] = spawn.mock.calls[0];
    expect(cmd).toBe("codex");
    expect(args).toContain("read-only");
  });
});

describe("cursor coordination client", () => {
  beforeEach(() => spawn.mockReset());
  it("shells `cursor-agent` and parses the result event", async () => {
    spawn.mockImplementation(() =>
      fakeChild(['{"type":"system","subtype":"init"}', '{"type":"result","subtype":"success","result":"con"}'].join("\n"), 0),
    );
    const out = await new CursorCliClient().chat("judge", [{ role: "user", content: "?" }]);
    expect(out).toBe("con");
    expect(spawn.mock.calls[0][0]).toBe("cursor-agent");
  });
});

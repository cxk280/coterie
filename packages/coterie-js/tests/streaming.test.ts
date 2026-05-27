import { describe, expect, it } from "vitest";

import { ClaudeCodeAdapter } from "../src/adapters/claudeCode.js";
import { CodexAdapter } from "../src/adapters/codex.js";
import { CursorAdapter } from "../src/adapters/cursor.js";

const claude = new ClaudeCodeAdapter("claude-code");
const codex = new CodexAdapter("codex");
const cursor = new CursorAdapter("cursor");

describe("claude-code streaming", () => {
  it("emits a note for a tool_use, ignores thinking/text", () => {
    expect(
      claude.streamEvent('{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"src/foo.ts"}}]}}'),
    ).toBe("→ Read foo.ts");
    expect(claude.streamEvent('{"type":"assistant","message":{"content":[{"type":"text","text":"the answer"}]}}')).toBeNull();
    expect(claude.streamEvent('{"type":"system","subtype":"init"}')).toBeNull();
    expect(claude.streamEvent("not json")).toBeNull();
  });

  it("parses the final result + cost + edited files from the NDJSON stream", () => {
    const stream = [
      '{"type":"system","subtype":"init"}',
      '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit","input":{"file_path":"calc.py"}}]}}',
      '{"type":"assistant","message":{"content":[{"type":"text","text":"done"}]}}',
      '{"type":"result","subtype":"success","result":"Added it.","total_cost_usd":0.12}',
    ].join("\n");
    const r = claude.parseResult(stream, "", 0);
    expect(r.stdout).toBe("Added it.");
    expect(r.cost_estimate_usd).toBe(0.12);
    expect(r.files_changed).toEqual(["calc.py"]);
  });
});

describe("codex streaming", () => {
  it("emits a note for a command, ignores the final agent_message", () => {
    expect(codex.streamEvent('{"type":"item.completed","item":{"type":"command_execution","command":"npm test"}}')).toBe("→ $ npm test");
    expect(codex.streamEvent('{"type":"item.completed","item":{"type":"agent_message","text":"hi"}}')).toBeNull();
    expect(codex.streamEvent('{"type":"turn.completed","usage":{}}')).toBeNull();
  });

  it("parses the final agent_message from the JSONL stream", () => {
    const stream = [
      '{"type":"thread.started"}',
      '{"type":"item.completed","item":{"type":"command_execution","command":"ls"}}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"the result"}}',
      '{"type":"turn.completed","usage":{}}',
    ].join("\n");
    expect(codex.parseResult(stream, "", 0).stdout).toBe("the result");
  });
});

describe("cursor streaming", () => {
  it("emits a note for a tool_call, ignores text/thinking", () => {
    expect(cursor.streamEvent('{"type":"assistant","message":{"content":[{"type":"tool_call","name":"read_file","input":{"path":"a.ts"}}]}}')).toBe("→ read_file a.ts");
    expect(cursor.streamEvent('{"type":"thinking","subtype":"delta","text":"hmm"}')).toBeNull();
    expect(cursor.streamEvent('{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]}}')).toBeNull();
  });

  it("parses the final result from the NDJSON stream", () => {
    const stream = [
      '{"type":"system","subtype":"init"}',
      '{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]}}',
      '{"type":"result","subtype":"success","result":"the answer"}',
    ].join("\n");
    expect(cursor.parseResult(stream, "", 0).stdout).toBe("the answer");
  });
});

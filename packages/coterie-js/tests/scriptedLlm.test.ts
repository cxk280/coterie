import { describe, expect, it } from "vitest";

import { ScriptedLLMClient, ScriptedLLMError } from "../src/core/llm/scripted.js";

describe("ScriptedLLMClient", () => {
  it("replays in order", async () => {
    const c = new ScriptedLLMClient(["a", "b", "c"]);
    expect(await c.chat("sys", [])).toBe("a");
    expect(await c.chat("sys", [])).toBe("b");
    expect(await c.chat("sys", [])).toBe("c");
  });

  it("exhaustion throws", async () => {
    const c = new ScriptedLLMClient(["only"]);
    await c.chat("sys", []);
    await expect(c.chat("sys", [])).rejects.toThrow(ScriptedLLMError);
  });

  it("records calls", async () => {
    const c = new ScriptedLLMClient(["x"]);
    await c.chat("sys-prompt", [{ role: "user", content: "msg" }]);
    expect(c.calls).toEqual([{ system: "sys-prompt", messages: [{ role: "user", content: "msg" }] }]);
  });

  it("queue appends", async () => {
    const c = new ScriptedLLMClient([]);
    c.queue("late");
    expect(await c.chat("sys", [])).toBe("late");
  });
});

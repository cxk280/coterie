import { describe, expect, it } from "vitest";

import { ADAPTER_REGISTRY, MODE_REGISTRY, Registry } from "../src/core/registry.js";
import "../src/adapters/index.js";
import "../src/modes/index.js";

describe("registry", () => {
  it("built-in adapters registered", () => {
    expect(ADAPTER_REGISTRY.names()).toEqual(expect.arrayContaining(["claude-code", "codex", "fake"]));
  });

  it("built-in modes registered", () => {
    expect(MODE_REGISTRY.names().sort()).toEqual(["adversarial", "consensus", "debate", "single", "tournament"]);
  });

  it("duplicate register throws", () => {
    const r = new Registry("adapter");
    r.register("x", "first");
    expect(() => r.register("x", "second")).toThrow();
  });

  it("require unknown throws", () => {
    const r = new Registry("mode");
    expect(() => r.require("nope")).toThrow();
  });

  it("empty name rejected", () => {
    const r = new Registry("x");
    expect(() => r.register("", "v")).toThrow();
  });
});

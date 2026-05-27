import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function writeConfig(yaml: string): string {
  const dir = mkdtempSync(join(tmpdir(), "coterie-cfg-"));
  dirs.push(dir);
  const path = join(dir, "coterie.yaml");
  writeFileSync(path, yaml);
  return path;
}

describe("loadConfig validates against the bundled schema", () => {
  it("accepts a valid config", () => {
    const cfg = loadConfig(
      writeConfig("mode: single\nagents:\n  - id: claude-code\n    adapter: claude-code\n"),
    );
    expect(cfg.mode).toBe("single");
    expect(cfg.agents[0].adapter).toBe("claude-code");
  });

  // If the schema couldn't be found, loadConfig silently skips validation and this
  // would NOT throw — so this is also the regression guard that the schema ships
  // and resolves (../schemas from both src/ and dist/).
  it("rejects a schema violation, proving the schema resolves", () => {
    expect(() =>
      loadConfig(writeConfig("mode: not-a-real-mode\nagents:\n  - id: x\n    adapter: claude-code\n")),
    ).toThrow(/Invalid config/);
  });

  it("rejects an agent missing its adapter", () => {
    expect(() => loadConfig(writeConfig("mode: single\nagents:\n  - id: x\n"))).toThrow(
      /Invalid config/,
    );
  });

  it("gives a friendly error (not raw ENOENT) for a missing config file", () => {
    expect(() => loadConfig("/tmp/coterie-does-not-exist-12345.yaml")).toThrow(
      /Config file not found: \/tmp\/coterie-does-not-exist-12345\.yaml/,
    );
  });

  it("reports malformed YAML clearly instead of a raw library error", () => {
    expect(() => loadConfig(writeConfig("mode: single\n  bad: : :\n"))).toThrow(/Invalid YAML/);
  });

  it("rejects an empty config file", () => {
    expect(() => loadConfig(writeConfig(""))).toThrow(/empty/i);
  });

  it("rejects a top-level non-mapping (e.g. a bare list)", () => {
    expect(() => loadConfig(writeConfig("- a\n- b\n"))).toThrow(/Invalid config/);
  });
});

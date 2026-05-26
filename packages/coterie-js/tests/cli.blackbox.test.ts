/** Black-box tests: spawn the actually-built `coterie` binary as a subprocess and
 *  assert on its real stdout/stderr/exit code. PATH is doctored to a sandbox bin
 *  so we control which agent CLIs appear "installed", and HOME is doctored so the
 *  credential probe is deterministic regardless of the host/CI machine.
 *
 *  Preflight failures exit before the REPL opens, so these need no stdin. */

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const cli = join(pkgRoot, "dist", "cli.js");

function runCli(args: string[], env: NodeJS.ProcessEnv): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", env, timeout: 30_000 });
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

/** A hermetic env where only the named CLIs are installed (stub on PATH) and
 *  signed in (matching credential file under a throwaway HOME). */
function sandboxEnv(present: string[]): NodeJS.ProcessEnv {
  const bin = mkdtempSync(join(tmpdir(), "coterie-bin-"));
  const home = mkdtempSync(join(tmpdir(), "coterie-home-"));
  cleanups.push(() => {
    rmSync(bin, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });
  for (const name of present) {
    const stub = join(bin, name);
    writeFileSync(stub, `#!/bin/sh\necho "${name} 1.0.0"\nexit 0\n`);
    chmodSync(stub, 0o755);
    // Drop the credential file each CLI's auth probe looks for, so a "present"
    // agent also reads as signed in. Extend this when adding a new agent.
    if (name === "claude") writeFileSync(join(home, ".claude.json"), "{}");
    if (name === "codex") {
      mkdirSync(join(home, ".codex"), { recursive: true });
      writeFileSync(join(home, ".codex", "auth.json"), "{}");
    }
    if (name === "cursor-agent") mkdirSync(join(home, ".cursor"), { recursive: true });
  }
  return { PATH: bin, HOME: home };
}

/** All subsets of `items` (the powerset), for an exhaustive presence matrix. */
function powerset<T>(items: T[]): T[][] {
  return items.reduce<T[][]>((acc, item) => [...acc, ...acc.map((s) => [...s, item])], [[]]);
}

describe("coterie CLI (black-box)", () => {
  beforeAll(() => {
    // CI builds before `npm test`, so dist/ usually exists; build only if not,
    // so the suite is self-sufficient when run standalone.
    if (!existsSync(cli)) {
      const build = spawnSync("npm", ["run", "build"], { cwd: pkgRoot, encoding: "utf8" });
      if (!existsSync(cli)) {
        throw new Error(`build did not produce ${cli}\n${build.stdout}\n${build.stderr}`);
      }
    }
  }, 120_000);

  it("--version prints the version", () => {
    const r = runCli(["--version"], { PATH: process.env.PATH });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("0.1.0");
  });

  it("--help lists the chat and run commands", () => {
    const r = runCli(["--help"], { PATH: process.env.PATH });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/\bchat\b/);
    expect(r.stdout).toMatch(/\brun\b/);
  });

  it("chat with an unknown mode exits 2", () => {
    const r = runCli(["chat", "--mode", "bogus"], { PATH: process.env.PATH });
    expect(r.status).toBe(2);
    expect(r.stderr + r.stdout).toMatch(/unknown mode/i);
  });

  it("chat exits 1 with remediation when codex is present but claude is missing", () => {
    const r = runCli(["chat"], sandboxEnv(["codex"]));
    const out = r.stderr + r.stdout;
    expect(r.status).toBe(1);
    expect(out).toMatch(/claude[^\n]*not installed/);
    expect(out).toContain("@anthropic-ai/claude-code");
    expect(out).not.toMatch(/codex[^\n]*not installed/);
  });

  it("chat exits 1 with remediation when claude is present but codex is missing", () => {
    const r = runCli(["chat"], sandboxEnv(["claude"]));
    const out = r.stderr + r.stdout;
    expect(r.status).toBe(1);
    expect(out).toMatch(/codex[^\n]*not installed/);
    expect(out).toContain("@openai/codex");
    expect(out).not.toMatch(/claude[^\n]*not installed/);
  });

  it("chat exits 1 and flags both when neither claude nor codex is installed", () => {
    const r = runCli(["chat"], sandboxEnv([]));
    const out = r.stderr + r.stdout;
    expect(r.status).toBe(1);
    expect(out).toMatch(/claude[^\n]*not installed/);
    expect(out).toMatch(/codex[^\n]*not installed/);
  });
});

describe("coterie doctor — every agent presence combination", () => {
  // The three agents Coterie ships with. `doctor` requires at least two of these
  // (any pair), so the expected exit is 0 once ≥2 are present, else 1. Add a new
  // agent here (and to sandboxEnv's credential fixtures) when one is added.
  const AGENTS = ["claude", "codex", "cursor-agent"] as const;

  for (const present of powerset([...AGENTS])) {
    const absent = AGENTS.filter((a) => !present.includes(a));
    const expectedExit = present.length >= 2 ? 0 : 1;
    const label =
      present.length === 0 ? "none present" : present.join("+") + " present";

    it(`${label} → exit ${expectedExit}`, () => {
      const r = runCli(["doctor"], sandboxEnv(present));
      const out = r.stderr + r.stdout;

      expect(r.status).toBe(expectedExit);
      for (const a of present) expect(out).toMatch(new RegExp(`✓ ${a}\\b`));
      for (const a of absent) expect(out).toMatch(new RegExp(`✗ ${a}\\b`));
      expect(out).toContain(`${present.length} of ${AGENTS.length} ready`);
      expect(out).toContain(expectedExit === 0 ? "good to go" : "needs at least 2");
    });
  }
});

/** Black-box tests: spawn the actually-built `coterie` binary as a subprocess and
 *  assert on its real stdout/stderr/exit code. PATH is doctored to a sandbox bin
 *  so we control which agent CLIs appear "installed", and HOME is doctored so the
 *  credential probe is deterministic regardless of the host/CI machine.
 *
 *  Preflight failures exit before the REPL opens, so these need no stdin. */

import { execSync, spawnSync, type SpawnSyncReturns } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const cli = join(pkgRoot, "dist", "cli.js");

// `git` must resolve for chat's worktree-readiness check, but the sandbox PATH is
// otherwise restricted to the stub agents. Include just git's own directory.
const GIT_BIN_DIR = (() => {
  try {
    return dirname(execSync("command -v git", { encoding: "utf8", shell: "/bin/sh" }).trim());
  } catch {
    return "/usr/bin";
  }
})();

function runCli(args: string[], env: NodeJS.ProcessEnv, input = ""): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", env, input, timeout: 30_000 });
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

/** A hermetic env where only the named CLIs are installed (stub on PATH) and
 *  signed in (matching credential file under a throwaway HOME). Pass `signedOut`
 *  to make a present agent report installed-but-not-signed-in (no credential
 *  fixture; cursor-agent's `status` stub answers isAuthenticated:false). */
function sandboxEnv(present: string[], signedOut: string[] = []): NodeJS.ProcessEnv {
  const bin = mkdtempSync(join(tmpdir(), "coterie-bin-"));
  const home = mkdtempSync(join(tmpdir(), "coterie-home-"));
  cleanups.push(() => {
    rmSync(bin, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });
  for (const name of present) {
    const out = signedOut.includes(name);
    const stub = join(bin, name);
    // cursor-agent's auth is probed via `cursor-agent status --format json`, so
    // its stub answers that; the others just report a version. Each CLI also
    // gets the credential fixture its auth probe looks for. Extend when adding
    // a new agent.
    if (name === "cursor-agent") {
      writeFileSync(
        stub,
        `#!/bin/sh\nif [ "$1" = "status" ]; then echo '{"isAuthenticated":${out ? "false" : "true"}}'; exit 0; fi\necho "${name} 1.0.0"\nexit 0\n`,
      );
    } else {
      writeFileSync(stub, `#!/bin/sh\necho "${name} 1.0.0"\nexit 0\n`);
    }
    chmodSync(stub, 0o755);
    if (out) continue; // installed but signed out → withhold the credential fixture
    if (name === "claude") writeFileSync(join(home, ".claude.json"), "{}");
    if (name === "codex") {
      mkdirSync(join(home, ".codex"), { recursive: true });
      writeFileSync(join(home, ".codex", "auth.json"), "{}");
    }
  }
  return { PATH: `${bin}:${GIT_BIN_DIR}`, HOME: home };
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

  it("--version prints the package.json version (not a stale hardcoded one)", () => {
    const r = runCli(["--version"], { PATH: process.env.PATH });
    expect(r.status).toBe(0);
    const pkgVersion = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")).version;
    expect(r.stdout.trim()).toBe(pkgVersion);
  });

  it("--help lists the chat and run commands", () => {
    const r = runCli(["--help"], { PATH: process.env.PATH });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/\bchat\b/);
    expect(r.stdout).toMatch(/\brun\b/);
  });

  it("bare `coterie` prints help and exits 0 (not an error)", () => {
    const r = runCli([], { PATH: process.env.PATH });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/\bchat\b/);
    expect(r.stdout).toMatch(/\bdoctor\b/);
  });

  it("an unknown command points the user at --help", () => {
    const r = runCli(["frobnicate"], { PATH: process.env.PATH });
    expect(r.status).toBe(1);
    const out = r.stderr + r.stdout;
    expect(out).toMatch(/unknown command/i);
    expect(out).toMatch(/coterie --help/);
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

  it("a bare 'exit' in the REPL quits without dispatching a (paid) round", () => {
    const r = runCli(["chat"], sandboxEnv(["claude", "codex"]), "exit\n");
    const out = r.stdout + r.stderr;
    expect(r.status).toBe(0);
    expect(out).toContain("bye.");
    expect(out).not.toMatch(/deliberation/i); // never reached the coordination round
  });

  it("names an installed-but-signed-out agent instead of silently dropping it", () => {
    // claude + codex ready (2 → REPL opens); cursor-agent installed but signed out.
    const r = runCli(
      ["chat"],
      sandboxEnv(["claude", "codex", "cursor-agent"], ["cursor-agent"]),
      "/exit\n",
    );
    const out = r.stdout + r.stderr;
    expect(r.status).toBe(0);
    expect(out).toMatch(/cursor-agent is installed but not signed in/);
    expect(out).toMatch(/cursor-agent login/); // tells them how to fix it
    // and it isn't in the active lineup
    expect(out).not.toMatch(/agents:[^\n]*cursor/);
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

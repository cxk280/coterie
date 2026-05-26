/** Real-agent end-to-end smoke for `coterie chat`.
 *
 *  UNLIKE the rest of the suite, this drives the actual built CLI against the
 *  real agent CLIs (Claude Code + Codex) on your subscriptions — so it spends
 *  real (notional) subscription calls and is inherently nondeterministic. It is
 *  therefore excluded from `npm test` and the CI PR gate; run it deliberately:
 *
 *      npm run test:e2e
 *
 *  on a machine where `claude` and `codex` are installed and signed in. The suite
 *  self-skips (it does not fail) if they aren't, since CI can't hold your logins.
 *
 *  How it drives the REPL: a failed turn is caught and the loop continues, and
 *  `/exit` is only read after the prior turn fully resolves, so we feed the whole
 *  script — prompt(s) then `/exit` — to stdin and assert on the real side effects
 *  (files actually written to the scratch workdir) and the prose reply. */

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { defaultConfig } from "../../src/chat/configs.js";
import { formatProblems, preflight } from "../../src/chat/preflight.js";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..", "..");
const cli = join(pkgRoot, "dist", "cli.js");

// Decide up front whether the real agents are usable; gate the whole suite on it.
const problems = preflight(defaultConfig("adversarial"));
const agentsReady = problems.length === 0;

// A JSON findings array leaking into user-facing output — the bug this product
// must never reproduce.
const RAW_JSON_FINDINGS = /\[\s*{\s*"(category|severity|description)"/;

const scratches: string[] = [];
afterEach(() => {
  while (scratches.length) rmSync(scratches.pop()!, { recursive: true, force: true });
});

/** A throwaway git repo to act as the chat workdir (isolated worktrees need a
 *  repo with at least one commit; without it the finalizer still works). */
function scratchRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "coterie-e2e-"));
  scratches.push(dir);
  writeFileSync(join(dir, "README.md"), "# scratch\n");
  const git = (...args: string[]) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("add", "-A");
  git("-c", "user.email=e2e@coterie.dev", "-c", "user.name=coterie-e2e", "commit", "-qm", "init");
  return dir;
}

/** Feed the REPL a script of input lines (then `/exit`) and capture the run. */
function chat(workdir: string, lines: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [cli, "chat", "--workdir", workdir, "--quiet"], {
    input: [...lines, "/exit", ""].join("\n"),
    encoding: "utf8",
    timeout: 600_000,
    env: process.env,
  });
}

describe.skipIf(!agentsReady)("coterie chat — real agents (spends subscription calls)", () => {
  beforeAll(() => {
    if (!existsSync(cli)) {
      const build = spawnSync("npm", ["run", "build"], { cwd: pkgRoot, encoding: "utf8" });
      if (!existsSync(cli)) throw new Error(`build did not produce ${cli}\n${build.stdout}\n${build.stderr}`);
    }
    console.warn("\n[e2e] running real multi-agent rounds — this spends subscription calls.\n");
  }, 120_000);

  it("adversarial: the finalizer applies a file edit and replies in prose", () => {
    const dir = scratchRepo();
    const r = chat(dir, ["Create a file named hello.txt whose entire contents are exactly: hello world"]);

    expect(r.status).toBe(0);
    const file = join(dir, "hello.txt");
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf8").toLowerCase()).toContain("hello world");
    expect(r.stdout).not.toMatch(RAW_JSON_FINDINGS);
  });

  it("consensus: the finalizer still applies edits (original-bug regression)", () => {
    const dir = scratchRepo();
    const r = chat(dir, [
      "/mode consensus",
      "Add a markdown file named story.md containing a short story (a few sentences).",
    ]);

    expect(r.status).toBe(0);
    expect(existsSync(join(dir, "story.md"))).toBe(true);
    expect(r.stdout).not.toMatch(RAW_JSON_FINDINGS);
  });

  it("answers a question in prose without touching the workdir", () => {
    const dir = scratchRepo();
    const r = chat(dir, ["In one word, what is two plus two?"]);

    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/\b(4|four)\b/i);
    expect(r.stdout).not.toMatch(RAW_JSON_FINDINGS);
    const status = spawnSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" });
    expect(status.stdout.trim()).toBe("");
  });
});

// When the agents aren't signed in, surface *why* the suite did nothing so a
// deliberate `npm run test:e2e` isn't a silent no-op.
describe.skipIf(agentsReady)("coterie chat — real agents", () => {
  it.skip(`skipped: agent CLIs not ready\n${agentsReady ? "" : formatProblems(problems)}`, () => {});
});

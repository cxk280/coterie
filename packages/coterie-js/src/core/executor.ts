/**
 * AdapterExecutor seam. Mirrors Python `core/executor.py`.
 *
 * Two concretes:
 * - `LocalSubprocessExecutor` — delegates to `adapter.run()`. Default.
 * - `IsolatedWorktreeExecutor` — each call runs in an ephemeral git worktree.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AdapterResult, CLIAdapter } from "../adapters/base.js";

export interface ExecuteOpts {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Whether `workdir` is a git repo with ≥1 commit — the precondition for isolated
 *  worktree deliberation. Lets callers warn upfront instead of failing mid-turn. */
export function gitRepoReady(workdir: string): { ok: boolean; reason?: string } {
  const inside = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: workdir, encoding: "utf8" });
  if (inside.status !== 0) return { ok: false, reason: "not a git repository" };
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: workdir, encoding: "utf8" });
  if (head.status !== 0) return { ok: false, reason: "the git repository has no commits yet" };
  return { ok: true };
}

export interface AdapterExecutor {
  execute(
    adapter: CLIAdapter,
    prompt: string,
    workdir: string,
    opts?: ExecuteOpts,
  ): Promise<AdapterResult>;
}

export class LocalSubprocessExecutor implements AdapterExecutor {
  execute(
    adapter: CLIAdapter,
    prompt: string,
    workdir: string,
    opts: ExecuteOpts = {},
  ): Promise<AdapterResult> {
    return adapter.run(prompt, workdir, opts);
  }
}

export class IsolatedWorktreeExecutor implements AdapterExecutor {
  async execute(
    adapter: CLIAdapter,
    prompt: string,
    workdir: string,
    opts: ExecuteOpts = {},
  ): Promise<AdapterResult> {
    const isolated = this.makeIsolated(workdir);
    try {
      return await adapter.run(prompt, isolated, opts);
    } finally {
      this.cleanup(isolated, workdir);
    }
  }

  private makeIsolated(base: string): string {
    const d = mkdtempSync(join(tmpdir(), "coterie-wt-"));
    if (!existsSync(join(base, ".git"))) {
      rmSync(d, { recursive: true, force: true });
      throw new Error(
        `coterie runs deliberation in an isolated git worktree, but ${base} is not a git repository. ` +
          "Run `git init && git add -A && git commit -m init` there first.",
      );
    }
    const proc = spawnSync("git", ["worktree", "add", "--detach", d], { cwd: base, encoding: "utf8" });
    if (proc.status !== 0) {
      // Never silently run the agent against an empty temp dir with none of the
      // user's code — fail loudly instead.
      rmSync(d, { recursive: true, force: true });
      throw new Error(
        `could not create an isolated worktree in ${base}: ${(proc.stderr || "").trim().slice(0, 200)} ` +
          "(a git repo needs at least one commit).",
      );
    }
    return d;
  }

  private cleanup(isolated: string, base: string): void {
    spawnSync("git", ["worktree", "remove", "--force", isolated], {
      cwd: base,
      encoding: "utf8",
    });
    try {
      rmSync(isolated, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
}

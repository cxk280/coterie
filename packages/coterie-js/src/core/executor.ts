/**
 * AdapterExecutor seam: where (and how safely) an agent subprocess runs.
 *
 * Two concretes:
 * - `LocalSubprocessExecutor` — delegates to `adapter.run()` in the workdir. Default.
 * - `IsolatedWorktreeExecutor` — each call runs in an ephemeral git worktree, so
 *   deliberating agents can never touch the user's files.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AdapterResult, CLIAdapter } from "../adapters/base.js";

export interface ExecuteOpts {
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Called with a short progress note for each streamed event from the agent. */
  onStream?: (text: string) => void;
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

/** `readOnly` makes an executor run its adapter in a no-edit mode (the adapter
 *  translates it to its CLI's read-only/plan flag). Coterie uses it for the
 *  deliberation phase — those agents only analyse/critique; the finalizer is the
 *  sole agent allowed to mutate the workdir. */
export interface ExecutorOpts {
  readOnly?: boolean;
}

export class LocalSubprocessExecutor implements AdapterExecutor {
  constructor(private readonly options: ExecutorOpts = {}) {}

  execute(
    adapter: CLIAdapter,
    prompt: string,
    workdir: string,
    opts: ExecuteOpts = {},
  ): Promise<AdapterResult> {
    return adapter.run(prompt, workdir, { ...opts, extra: { readOnly: this.options.readOnly ?? false } });
  }
}

export class IsolatedWorktreeExecutor implements AdapterExecutor {
  constructor(private readonly options: ExecutorOpts = {}) {}

  async execute(
    adapter: CLIAdapter,
    prompt: string,
    workdir: string,
    opts: ExecuteOpts = {},
  ): Promise<AdapterResult> {
    const isolated = this.makeIsolated(workdir);
    try {
      return await adapter.run(prompt, isolated, { ...opts, extra: { readOnly: this.options.readOnly ?? false } });
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
    const removed = spawnSync("git", ["worktree", "remove", "--force", isolated], {
      cwd: base,
      encoding: "utf8",
    });
    try {
      rmSync(isolated, { recursive: true, force: true });
    } catch {
      // best-effort
    }
    // If `git worktree remove` failed, the .git/worktrees entry would linger and
    // accumulate over a session — prune the now-deleted dir's stale registration.
    if (removed.status !== 0) {
      spawnSync("git", ["worktree", "prune"], { cwd: base, encoding: "utf8" });
    }
  }
}

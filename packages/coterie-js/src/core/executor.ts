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
    if (existsSync(join(base, ".git"))) {
      const proc = spawnSync("git", ["worktree", "add", "--detach", d], {
        cwd: base,
        encoding: "utf8",
      });
      if (proc.status === 0) return d;
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

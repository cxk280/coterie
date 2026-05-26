/** CLIAdapter contract. Mirrors Python's `adapters/base.py`. */

import { spawnSync } from "node:child_process";

export interface AdapterResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  files_changed: string[];
  duration_s: number;
  cost_estimate_usd: number | null;
}

export interface CLIAdapterCtor {
  adapterName: string;
  new (agent_id: string, opts?: { model?: string }): CLIAdapter;
}

export abstract class CLIAdapter {
  static readonly adapterName: string;

  /**
   * Env vars stripped from the agent subprocess. Lets an adapter force its CLI
   * onto its own auth (e.g. a subscription session) instead of an API key that
   * Coterie's coordination LLMs need in-process.
   */
  static readonly stripEnv: readonly string[] = [];

  constructor(
    public readonly agent_id: string,
    public readonly opts: { model?: string } = {},
  ) {}

  get model(): string | undefined {
    return this.opts.model;
  }

  private subprocessEnv(): NodeJS.ProcessEnv | undefined {
    const strip = (this.constructor as typeof CLIAdapter).stripEnv;
    if (!strip.length) return undefined; // inherit process.env
    const env = { ...process.env };
    for (const key of strip) delete env[key];
    return env;
  }

  abstract buildCommand(
    prompt: string,
    workdir: string,
    extra: Record<string, unknown>,
  ): string[];

  abstract parseResult(
    stdout: string,
    stderr: string,
    exitCode: number,
  ): AdapterResult;

  run(
    prompt: string,
    workdir: string,
    opts: { timeoutMs?: number; extra?: Record<string, unknown> } = {},
  ): AdapterResult {
    const argv = this.buildCommand(prompt, workdir, opts.extra ?? {});
    const [cmd, ...args] = argv;
    if (!cmd) throw new Error(`Adapter ${this.agent_id} produced an empty command`);
    const t0 = Date.now();
    const proc = spawnSync(cmd, args, {
      cwd: workdir,
      encoding: "utf8",
      timeout: opts.timeoutMs ?? 600_000,
      env: this.subprocessEnv(),
      maxBuffer: 32 * 1024 * 1024,
    });
    const result = this.parseResult(
      proc.stdout ?? "",
      proc.stderr ?? "",
      proc.status ?? 1,
    );
    result.duration_s = (Date.now() - t0) / 1000;
    return result;
  }

  protected gitChangedFiles(workdir: string): string[] {
    const proc = spawnSync("git", ["status", "--porcelain"], {
      cwd: workdir,
      encoding: "utf8",
    });
    if (proc.status !== 0) return [];
    return (proc.stdout ?? "")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => l.slice(3));
  }
}

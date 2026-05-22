import { spawnSync } from "node:child_process";

export interface AdapterResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  files_changed: string[];
  duration_s: number;
  cost_estimate_usd: number | null;
}

export interface RunOptions {
  timeoutMs?: number;
  extra?: Record<string, unknown>;
}

export abstract class CLIAdapter {
  readonly agent_id: string;
  readonly model: string | undefined;

  constructor(agent_id: string, opts: { model?: string } = {}) {
    this.agent_id = agent_id;
    this.model = opts.model;
  }

  abstract buildCommand(prompt: string, workdir: string, extra: Record<string, unknown>): string[];

  abstract parseResult(stdout: string, stderr: string, exitCode: number): AdapterResult;

  run(prompt: string, workdir: string, opts: RunOptions = {}): AdapterResult {
    const argv = this.buildCommand(prompt, workdir, opts.extra ?? {});
    const [cmd, ...args] = argv;
    if (!cmd) throw new Error(`Adapter ${this.agent_id} produced an empty command`);
    const t0 = Date.now();
    const proc = spawnSync(cmd, args, {
      cwd: workdir,
      encoding: "utf8",
      timeout: opts.timeoutMs ?? 600_000,
    });
    const result = this.parseResult(proc.stdout ?? "", proc.stderr ?? "", proc.status ?? 1);
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

/** CLIAdapter contract: how Coterie drives one agent CLI (claude / codex /
 *  cursor / fake) as a subprocess. Concrete adapters supply the argv and parse
 *  the output; `run()` here owns the shared spawn/timeout/abort/streaming
 *  plumbing (via core/spawn). Executors (core/executor.ts) call `run()`. */

import { spawnSync } from "node:child_process";

import { spawnCapture } from "../core/spawn.js";

export { abortError } from "../core/spawn.js";

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

  /** Turn one line of the CLI's streaming (NDJSON) output into a short, human
   *  -readable progress note (e.g. "→ Read foo.ts", "→ $ npm test"), or null to
   *  ignore it. Adapters that run in a streaming format override this; the
   *  default (no streaming) yields nothing. */
  streamEvent(_line: string): string | null {
    return null;
  }

  /** Run the agent CLI asynchronously. Async (vs the old `spawnSync`) is what
   *  keeps Node's event loop free during a turn — so the chat trace can stream
   *  live, SIGINT is handled, and fan-out agents run concurrently. Honors a
   *  timeout and an optional AbortSignal (both kill the child). */
  async run(
    prompt: string,
    workdir: string,
    opts: {
      timeoutMs?: number;
      extra?: Record<string, unknown>;
      signal?: AbortSignal;
      onStream?: (text: string) => void;
    } = {},
  ): Promise<AdapterResult> {
    const argv = this.buildCommand(prompt, workdir, opts.extra ?? {});
    const [cmd, ...args] = argv;
    if (!cmd) throw new Error(`Adapter ${this.agent_id} produced an empty command`);
    const t0 = Date.now();
    const timeoutMs = opts.timeoutMs ?? 600_000;
    const r = await spawnCapture(cmd, args, {
      cwd: workdir,
      env: this.subprocessEnv(),
      timeoutMs,
      signal: opts.signal,
      onLine: opts.onStream
        ? (line) => {
            try {
              const note = this.streamEvent(line);
              if (note) opts.onStream!(note);
            } catch {
              // a malformed line must never break the run
            }
          }
        : undefined,
    });
    if (r.timedOut) throw new Error(`timed out after ${Math.round(timeoutMs / 1000)}s`);
    const result = this.parseResult(r.stdout, r.stderr, r.code);
    result.duration_s = (Date.now() - t0) / 1000;
    // Report which files the agent actually touched (so the trace can show
    // "edited X, Y") unless the adapter already computed it.
    if (!result.files_changed?.length) result.files_changed = this.gitChangedFiles(workdir);
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

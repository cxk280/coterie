/** CLIAdapter contract. Mirrors Python's `adapters/base.py`. */

import { spawn, spawnSync } from "node:child_process";

import { sleepAwareTimeout } from "../core/timeout.js";

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

/** A DOMException-style abort error so callers can detect cancellation via
 *  `err.name === "AbortError"` (matches what `fetch`/AbortSignal users expect). */
export function abortError(): Error {
  const e = new Error("The operation was aborted");
  e.name = "AbortError";
  return e;
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
    const { stdout, stderr, code } = await this.spawnCollect(cmd, args, workdir, opts);
    const result = this.parseResult(stdout, stderr, code);
    result.duration_s = (Date.now() - t0) / 1000;
    // Report which files the agent actually touched (so the trace can show
    // "edited X, Y") unless the adapter already computed it.
    if (!result.files_changed?.length) result.files_changed = this.gitChangedFiles(workdir);
    return result;
  }

  private spawnCollect(
    cmd: string,
    args: string[],
    workdir: string,
    opts: { timeoutMs?: number; signal?: AbortSignal; onStream?: (text: string) => void },
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
      if (opts.signal?.aborted) return reject(abortError());

      // stdin = /dev/null so the child gets an immediate EOF. Headless agent CLIs
      // (notably `codex exec`) otherwise block forever waiting on stdin — async
      // spawn leaves the stdin pipe open, unlike the old spawnSync which closed it.
      const child = spawn(cmd, args, {
        cwd: workdir,
        env: this.subprocessEnv(),
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      const cap = 32 * 1024 * 1024;
      // Buffer stdout into whole lines so each NDJSON event can be turned into a
      // live progress note as it streams (without blocking — the loop is free).
      let lineBuf = "";
      child.stdout?.on("data", (d) => {
        const s = d.toString();
        if (stdout.length < cap) stdout += s;
        if (!opts.onStream) return;
        lineBuf += s;
        let nl: number;
        while ((nl = lineBuf.indexOf("\n")) >= 0) {
          const line = lineBuf.slice(0, nl);
          lineBuf = lineBuf.slice(nl + 1);
          try {
            const note = this.streamEvent(line);
            if (note) opts.onStream(note);
          } catch {
            // a malformed line must never break the run
          }
        }
      });
      child.stderr?.on("data", (d) => {
        if (stderr.length < cap) stderr += d.toString();
      });

      // Graceful kill: SIGTERM, then SIGKILL if it doesn't exit in time.
      const hardKill = () => {
        if (!child.killed) child.kill("SIGKILL");
      };
      const kill = () => {
        child.kill("SIGTERM");
        setTimeout(hardKill, 2_000).unref();
      };

      const timeoutMs = opts.timeoutMs ?? 600_000;
      let timedOut = false;
      // Sleep-aware: a wall-clock timer would kill a merely-suspended child the
      // instant the machine wakes. This only counts active time.
      const clearTimer = sleepAwareTimeout(timeoutMs, () => {
        timedOut = true;
        kill();
      });

      const onAbort = () => {
        kill();
        cleanup();
        reject(abortError());
      };
      opts.signal?.addEventListener("abort", onAbort, { once: true });

      const cleanup = () => {
        clearTimer();
        opts.signal?.removeEventListener("abort", onAbort);
      };

      child.on("error", (err) => {
        cleanup();
        reject(err);
      });
      child.on("close", (code) => {
        cleanup();
        if (timedOut) reject(new Error(`timed out after ${Math.round(timeoutMs / 1000)}s`));
        else resolve({ stdout, stderr, code: code ?? 1 });
      });
    });
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

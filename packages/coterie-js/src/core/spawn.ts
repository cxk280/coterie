/** The one async-subprocess runner: every CLI Coterie shells out to — agent
 *  adapters (adapters/base.ts) and coordination LLM clients (core/llm/*) — goes
 *  through here. stdin = /dev/null (immediate EOF so a CLI that reads stdin
 *  doesn't hang), a sleep-aware timeout, AbortSignal support, and optional
 *  line-by-line streaming of stdout for live progress notes. */

import { spawn } from "node:child_process";

import { sleepAwareTimeout } from "./timeout.js";

/** A DOMException-style abort error so callers can detect cancellation via
 *  `err.name === "AbortError"` (matches what `fetch`/AbortSignal users expect). */
export function abortError(): Error {
  const e = new Error("The operation was aborted");
  e.name = "AbortError";
  return e;
}

export interface SpawnResult {
  stdout: string;
  stderr: string;
  code: number;
  timedOut: boolean;
}

export interface SpawnOpts {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Called with each complete stdout line as it streams (NDJSON progress). */
  onLine?: (line: string) => void;
}

export function spawnCapture(cmd: string, args: string[], opts: SpawnOpts = {}): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(abortError());

    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const cap = 32 * 1024 * 1024;
    // Buffer stdout into whole lines for `onLine`, bounded: a producer that emits
    // a multi-megabyte single line (or never a newline) must not grow the buffer
    // without limit — the authoritative `stdout` is capped, and progress notes are
    // best-effort, so an over-cap partial line is dropped and streaming resyncs at
    // the next newline.
    const lineCap = 1024 * 1024;
    let lineBuf = "";
    let lineOverflow = false;
    child.stdout?.on("data", (d) => {
      const s = d.toString();
      if (stdout.length < cap) stdout += s;
      if (!opts.onLine) return;
      lineBuf += s;
      let nl: number;
      while ((nl = lineBuf.indexOf("\n")) >= 0) {
        const line = lineBuf.slice(0, nl);
        lineBuf = lineBuf.slice(nl + 1);
        if (lineOverflow) {
          // This newline closes the dropped line; resume on the next one.
          lineOverflow = false;
          continue;
        }
        opts.onLine(line);
      }
      if (lineBuf.length > lineCap) {
        lineBuf = "";
        lineOverflow = true;
      }
    });
    child.stderr?.on("data", (d) => {
      if (stderr.length < cap) stderr += d.toString();
    });

    let timedOut = false;
    const kill = () => {
      child.kill("SIGTERM");
      setTimeout(() => !child.killed && child.kill("SIGKILL"), 2_000).unref();
    };
    const clearTimer = sleepAwareTimeout(opts.timeoutMs ?? 120_000, () => {
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
      resolve({ stdout, stderr, code: code ?? 1, timedOut });
    });
  });
}

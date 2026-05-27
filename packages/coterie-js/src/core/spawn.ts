/** Shared async subprocess capture for the coordination LLM clients (claude /
 *  codex / cursor run headlessly as a single-shot text completion). Mirrors the
 *  agent path in adapters/base.ts: stdin = /dev/null (immediate EOF so a CLI that
 *  reads stdin doesn't hang), a sleep-aware timeout, and AbortSignal support. */

import { spawn } from "node:child_process";

import { sleepAwareTimeout } from "./timeout.js";

/** DOMException-style abort error (`err.name === "AbortError"`). */
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

export function spawnCapture(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(abortError());

    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const cap = 32 * 1024 * 1024;
    child.stdout?.on("data", (d) => {
      if (stdout.length < cap) stdout += d.toString();
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

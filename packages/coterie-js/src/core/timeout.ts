/** A timeout that doesn't count system-sleep against the deadline.
 *
 *  A plain `setTimeout(kill, ms)` is wall-clock: if the machine sleeps mid-call
 *  and the deadline passes while suspended, the timer fires the instant the
 *  machine wakes — killing a child process (e.g. `claude -p`) that was merely
 *  suspended, not hung (the symptom: "claude CLI exited 143"). Instead we tick
 *  periodically and, when we see a gap far larger than the tick (i.e. the process
 *  was suspended), push the deadline forward by the slept duration. Only *active*
 *  time counts toward the timeout.
 *
 *  Returns a function that cancels the timer. */
export function sleepAwareTimeout(ms: number, onTimeout: () => void): () => void {
  const tick = Math.min(5_000, Math.max(250, ms));
  let deadline = Date.now() + ms;
  let last = Date.now();
  const id = setInterval(() => {
    const now = Date.now();
    const gap = now - last;
    last = now;
    // A gap much larger than the tick interval means we were suspended (sleep,
    // a long GC pause, a debugger break) — don't count it against the deadline.
    if (gap > tick * 2) deadline += gap - tick;
    if (now >= deadline) {
      clearInterval(id);
      onTimeout();
    }
  }, tick);
  if (typeof id.unref === "function") id.unref();
  return () => clearInterval(id);
}

import { afterEach, describe, expect, it, vi } from "vitest";

import { sleepAwareTimeout } from "../src/core/timeout.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("sleepAwareTimeout", () => {
  it("fires after the deadline of active time elapses", () => {
    vi.useFakeTimers();
    const base = Date.now();
    let t = base;
    vi.spyOn(Date, "now").mockImplementation(() => t);

    let fired = false;
    sleepAwareTimeout(10_000, () => (fired = true));

    t = base + 5_000;
    vi.advanceTimersByTime(5_000);
    expect(fired).toBe(false);

    t = base + 10_000;
    vi.advanceTimersByTime(5_000);
    expect(fired).toBe(true);
  });

  it("does NOT fire when the deadline is only crossed by a suspend gap (sleep)", () => {
    vi.useFakeTimers();
    const base = Date.now();
    let t = base;
    vi.spyOn(Date, "now").mockImplementation(() => t);

    let fired = false;
    sleepAwareTimeout(10_000, () => (fired = true));

    // Machine sleeps ~1h between ticks: the gap is huge, so the deadline is
    // pushed forward instead of firing on a merely-suspended process.
    t = base + 3_600_000;
    vi.advanceTimersByTime(5_000);
    expect(fired).toBe(false);
  });
});

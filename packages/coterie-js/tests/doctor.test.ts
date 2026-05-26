import { beforeEach, describe, expect, it, vi } from "vitest";

const { spawnSync } = vi.hoisted(() => ({ spawnSync: vi.fn() }));
const { existsSync } = vi.hoisted(() => ({ existsSync: vi.fn(() => true) }));
vi.mock("node:child_process", () => ({ spawnSync }));
vi.mock("node:fs", () => ({ existsSync }));

import { formatDoctor, runDoctor } from "../src/chat/doctor.js";

const CLIS = ["claude", "codex", "cursor-agent"];

describe("runDoctor — needs at least two agents", () => {
  beforeEach(() => {
    spawnSync.mockReset();
    existsSync.mockReset();
    existsSync.mockReturnValue(true); // installed CLIs read as signed in
  });

  function installed(...clis: string[]): void {
    spawnSync.mockImplementation((cmd: string) =>
      clis.includes(cmd) ? { status: 0 } : { status: 1, error: new Error("ENOENT") },
    );
  }

  it("not ok with zero agents", () => {
    installed();
    const r = runDoctor(CLIS);
    expect(r.ready).toBe(0);
    expect(r.ok).toBe(false);
  });

  it("not ok with exactly one agent", () => {
    installed("codex");
    const r = runDoctor(CLIS);
    expect(r.ready).toBe(1);
    expect(r.ok).toBe(false);
  });

  it.each([
    ["claude", "codex"],
    ["claude", "cursor-agent"],
    ["codex", "cursor-agent"],
  ])("ok with any two agents: %s + %s", (a, b) => {
    installed(a, b);
    const r = runDoctor(CLIS);
    expect(r.ready).toBe(2);
    expect(r.ok).toBe(true);
  });

  it("ok with all three", () => {
    installed("claude", "codex", "cursor-agent");
    const r = runDoctor(CLIS);
    expect(r.ready).toBe(3);
    expect(r.ok).toBe(true);
  });

  it("installed-but-unauthenticated agents do not count toward the two", () => {
    installed("claude", "codex", "cursor-agent"); // all installed…
    existsSync.mockReturnValue(false); // …but no credentials found anywhere
    const r = runDoctor(CLIS);
    expect(r.ready).toBe(0);
    expect(r.ok).toBe(false);
    expect(r.statuses.every((s) => s.reason === "not signed in")).toBe(true);
  });
});

describe("formatDoctor", () => {
  it("renders the verdict, per-agent marks, and the best-effort caveat", () => {
    const ok = formatDoctor({
      statuses: [
        { cli: "claude", ok: true, reason: "ready" },
        { cli: "codex", ok: true, reason: "ready" },
        { cli: "cursor-agent", ok: false, reason: "not installed", fix: "Install: ..." },
      ],
      ready: 2,
      ok: true,
    });
    expect(ok).toMatch(/at least 2/);
    expect(ok).toContain("✓ claude");
    expect(ok).toContain("✗ cursor-agent");
    expect(ok).toContain("2 of 3 ready");
    expect(ok).toContain("good to go");
    expect(ok).toMatch(/false alarm/i);

    const notOk = formatDoctor({
      statuses: [{ cli: "claude", ok: true, reason: "ready" }],
      ready: 1,
      ok: false,
    });
    expect(notOk).toContain("needs at least 2");
  });
});

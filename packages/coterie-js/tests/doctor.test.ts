import { beforeEach, describe, expect, it, vi } from "vitest";

const { spawnSync } = vi.hoisted(() => ({ spawnSync: vi.fn() }));
const { existsSync } = vi.hoisted(() => ({ existsSync: vi.fn(() => true) }));
vi.mock("node:child_process", () => ({ spawnSync }));
vi.mock("node:fs", () => ({ existsSync }));

import { formatDoctor, runDoctor } from "../src/chat/doctor.js";

const CLIS = ["claude", "codex", "cursor-agent"];

// cursor's auth is probed via `cursor-agent status --format json`, not a file.
let cursorAuthed = true;

describe("runDoctor — needs at least two agents", () => {
  beforeEach(() => {
    spawnSync.mockReset();
    existsSync.mockReset();
    existsSync.mockReturnValue(true); // claude/codex read as signed in (file check)
    cursorAuthed = true;
  });

  function installed(...clis: string[]): void {
    spawnSync.mockImplementation((cmd: string, args?: string[]) => {
      if (!clis.includes(cmd)) return { status: 1, error: new Error("ENOENT") };
      if (cmd === "cursor-agent" && args?.[0] === "status")
        return { status: 0, stdout: JSON.stringify({ isAuthenticated: cursorAuthed }) };
      return { status: 0 };
    });
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
    existsSync.mockReturnValue(false); // …but claude/codex have no creds…
    cursorAuthed = false; // …and cursor reports not signed in
    const r = runDoctor(CLIS);
    expect(r.ready).toBe(0);
    expect(r.ok).toBe(false);
    expect(r.statuses.every((s) => s.reason === "not signed in")).toBe(true);
  });
});

describe("formatDoctor", () => {
  it("renders the verdict and per-agent marks", () => {
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

    const notOk = formatDoctor({
      statuses: [{ cli: "claude", ok: true, reason: "ready" }],
      ready: 1,
      ok: false,
    });
    expect(notOk).toContain("needs at least 2");
  });

  it("shows the credential caveat only when an agent is 'not signed in', not when merely 'not installed'", () => {
    const notInstalled = formatDoctor({
      statuses: [
        { cli: "claude", ok: true, reason: "ready" },
        { cli: "codex", ok: true, reason: "ready" },
        { cli: "cursor-agent", ok: false, reason: "not installed", fix: "Install: ..." },
      ],
      ready: 2,
      ok: true,
    });
    expect(notInstalled).not.toMatch(/sign-in is detected/i);

    const signedOut = formatDoctor({
      statuses: [
        { cli: "claude", ok: true, reason: "ready" },
        { cli: "codex", ok: true, reason: "ready" },
        { cli: "cursor-agent", ok: false, reason: "not signed in", fix: "Log in: ..." },
      ],
      ready: 2,
      ok: true,
    });
    expect(signedOut).toMatch(/sign-in is detected/i);
    expect(signedOut).not.toMatch(/false alarm/i); // de-idiomed for non-native readers
  });
});

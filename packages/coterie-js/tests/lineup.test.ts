import { beforeEach, describe, expect, it, vi } from "vitest";

const { spawnSync } = vi.hoisted(() => ({ spawnSync: vi.fn() }));
const { existsSync } = vi.hoisted(() => ({ existsSync: vi.fn(() => true) }));
vi.mock("node:child_process", () => ({ spawnSync }));
vi.mock("node:fs", () => ({ existsSync }));

import { type AgentCfg, defaultConfig } from "../src/chat/configs.js";
import { agentStatuses, availableAgents } from "../src/chat/preflight.js";

const THREE: AgentCfg[] = [
  { id: "claude-code", adapter: "claude-code" },
  { id: "codex", adapter: "codex" },
  { id: "cursor", adapter: "cursor" },
];

describe("defaultConfig — roles auto-assigned from the lineup", () => {
  it("adversarial uses the first two agents as implementer + auditor", () => {
    const cfg = defaultConfig("adversarial", THREE);
    expect(cfg.adversarial.implementer).toBe("claude-code");
    expect(cfg.adversarial.auditor).toBe("codex");
    expect(cfg.agents.map((a: AgentCfg) => a.id)).toEqual(["claude-code", "codex"]);
  });

  it("debate uses the first two agents as the two sides", () => {
    const cfg = defaultConfig("debate", THREE);
    expect(cfg.debate.sides).toEqual(["claude-code", "codex"]);
  });

  it("consensus and tournament use every agent in the lineup", () => {
    expect(defaultConfig("consensus", THREE).consensus.participants).toEqual([
      "claude-code",
      "codex",
      "cursor",
    ]);
    expect(defaultConfig("tournament", THREE).tournament.participants).toEqual([
      "claude-code",
      "codex",
      "cursor",
    ]);
  });

  it("respects lineup order (e.g. a Codex+Cursor pair)", () => {
    const cfg = defaultConfig("adversarial", [THREE[1]!, THREE[2]!]);
    expect(cfg.adversarial.implementer).toBe("codex");
    expect(cfg.adversarial.auditor).toBe("cursor");
  });

  it("falls back to a stable two-agent baseline when no lineup is given", () => {
    expect(defaultConfig("adversarial").agents.map((a: AgentCfg) => a.id)).toEqual([
      "claude-code",
      "codex",
    ]);
  });
});

let cursorAuthed = true; // cursor auth is probed via `cursor-agent status`

describe("availableAgents — only installed + signed-in agents, in preference order", () => {
  beforeEach(() => {
    spawnSync.mockReset();
    existsSync.mockReset();
    existsSync.mockReturnValue(true);
    cursorAuthed = true;
  });

  function present(...clis: string[]): void {
    spawnSync.mockImplementation((cmd: string, args?: string[]) => {
      if (!clis.includes(cmd)) return { status: 1, error: new Error("ENOENT") };
      if (cmd === "cursor-agent" && args?.[0] === "status")
        return { status: 0, stdout: JSON.stringify({ isAuthenticated: cursorAuthed }) };
      return { status: 0 };
    });
  }

  it("drops a missing agent and keeps the rest in KNOWN order", () => {
    present("claude", "cursor-agent"); // codex missing
    expect(availableAgents().map((a) => a.id)).toEqual(["claude-code", "cursor"]);
  });

  it("returns all three when all are ready", () => {
    present("claude", "codex", "cursor-agent");
    expect(availableAgents().map((a) => a.id)).toEqual(["claude-code", "codex", "cursor"]);
  });

  it("excludes installed-but-unauthenticated agents", () => {
    present("claude", "codex", "cursor-agent");
    existsSync.mockReturnValue(false); // claude/codex have no creds…
    cursorAuthed = false; // …and cursor reports not signed in
    expect(availableAgents()).toEqual([]);
  });
});

describe("agentStatuses — distinguishes ready / not signed in / not installed", () => {
  beforeEach(() => {
    spawnSync.mockReset();
    existsSync.mockReset();
    existsSync.mockReturnValue(true);
    cursorAuthed = true;
  });

  function present(...clis: string[]): void {
    spawnSync.mockImplementation((cmd: string, args?: string[]) => {
      if (!clis.includes(cmd)) return { status: 1, error: new Error("ENOENT") };
      if (cmd === "cursor-agent" && args?.[0] === "status")
        return { status: 0, stdout: JSON.stringify({ isAuthenticated: cursorAuthed }) };
      return { status: 0 };
    });
  }

  it("reports an installed-but-signed-out agent as 'not signed in' (so chat can name it)", () => {
    present("claude", "codex", "cursor-agent");
    cursorAuthed = false; // installed, but signed out
    const byCli = Object.fromEntries(agentStatuses().map((s) => [s.status.cli, s.status.reason]));
    expect(byCli["claude"]).toBe("ready");
    expect(byCli["codex"]).toBe("ready");
    expect(byCli["cursor-agent"]).toBe("not signed in");
  });

  it("reports an absent agent as 'not installed', not 'not signed in'", () => {
    present("claude", "codex"); // cursor-agent missing entirely
    const cursor = agentStatuses().find((s) => s.status.cli === "cursor-agent");
    expect(cursor?.status.reason).toBe("not installed");
  });
});

/** Startup preflight: verify the agent CLIs a session needs are installed and
 *  (best-effort) authenticated, with a specific remediation message per tool. */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { ADAPTER_CLI } from "./configs.js";

export interface PreflightProblem {
  agent: string;
  cli: string;
  reason: string;
  fix: string;
}

const REMEDIATION: Record<string, { install: string; login: string }> = {
  claude: {
    install: "npm install -g @anthropic-ai/claude-code",
    login: "run `claude` once and sign in to your Claude (Max/Pro) account",
  },
  codex: {
    install: "npm install -g @openai/codex",
    login: "run `codex` once and sign in with your ChatGPT account",
  },
  "cursor-agent": {
    install: "curl https://cursor.com/install -fsS | bash",
    login: "run `cursor-agent login` and sign in to Cursor",
  },
};

function isInstalled(cli: string): boolean {
  const probe = spawnSync(cli, ["--version"], { encoding: "utf8", timeout: 15_000 });
  return !probe.error && (probe.status ?? 1) === 0;
}

/** Best-effort auth check (no network spend): look for the CLI's local creds at
 *  the locations it actually uses, honoring the env overrides each tool supports
 *  and resolving HOME from the environment — so it matches your shell, not a
 *  hardcoded path. This is a heuristic for a friendly message; the agent CLI is
 *  the real source of truth at run time (it reads its own creds, incl. Keychain),
 *  so a false "not signed in" here never stops a CLI that works in your shell. */
function looksAuthed(cli: string): boolean {
  const home = process.env.HOME || homedir();
  if (cli === "claude") {
    const dir = process.env.CLAUDE_CONFIG_DIR || join(home, ".claude");
    return existsSync(join(home, ".claude.json")) || existsSync(join(dir, ".credentials.json"));
  }
  if (cli === "codex") {
    const dir = process.env.CODEX_HOME || join(home, ".codex");
    return existsSync(join(dir, "auth.json"));
  }
  if (cli === "cursor-agent") {
    const cfg = process.env.XDG_CONFIG_HOME || join(home, ".config");
    return existsSync(join(home, ".cursor")) || existsSync(join(cfg, "cursor-agent"));
  }
  return true;
}

export interface AgentStatus {
  cli: string;
  ok: boolean;
  reason: "ready" | "not installed" | "not signed in";
  fix?: string;
}

/** Every agent CLI Coterie knows how to drive, derived from the adapter→CLI map
 *  so registering a new adapter (with an ADAPTER_CLI entry) extends this list —
 *  and `coterie doctor` — automatically. */
export const ALL_AGENT_CLIS: string[] = [...new Set(Object.values(ADAPTER_CLI))];

/** Installed + (best-effort) signed-in status for one agent CLI. */
export function checkAgent(cli: string): AgentStatus {
  const rem = REMEDIATION[cli] ?? { install: `install ${cli}`, login: `authenticate ${cli}` };
  if (!isInstalled(cli)) return { cli, ok: false, reason: "not installed", fix: `Install: ${rem.install}` };
  if (!looksAuthed(cli)) return { cli, ok: false, reason: "not signed in", fix: `Log in: ${rem.login}` };
  return { cli, ok: true, reason: "ready" };
}

/** Check every agent CLI referenced by the config. Returns problems (empty = OK). */
export function preflight(config: Record<string, any>): PreflightProblem[] {
  const agents: Array<{ adapter?: string }> = config.agents ?? [];
  const clis = new Set<string>();
  for (const a of agents) {
    const cli = a.adapter && ADAPTER_CLI[a.adapter];
    if (cli) clis.add(cli);
  }

  const problems: PreflightProblem[] = [];
  for (const cli of clis) {
    const status = checkAgent(cli);
    if (!status.ok) problems.push({ agent: cli, cli, reason: status.reason, fix: status.fix ?? "" });
  }
  return problems;
}

export function formatProblems(problems: PreflightProblem[]): string {
  const lines = ["Coterie chat needs these agent CLIs installed and signed in:", ""];
  for (const p of problems) lines.push(`  ✗ ${p.cli} — ${p.reason}\n      ${p.fix}`);
  lines.push("", "Each runs on its own subscription (Claude Max / ChatGPT / Cursor Pro) — no API keys needed.");
  return lines.join("\n");
}

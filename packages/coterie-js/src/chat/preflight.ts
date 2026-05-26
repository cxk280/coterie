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

/** Best-effort auth check (no network spend): look for the CLI's local creds. */
function looksAuthed(cli: string): boolean {
  const home = homedir();
  if (cli === "claude") return existsSync(join(home, ".claude.json")) || existsSync(join(home, ".claude", ".credentials.json"));
  if (cli === "codex") return existsSync(join(home, ".codex", "auth.json"));
  if (cli === "cursor-agent") return existsSync(join(home, ".cursor"));
  return true;
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
    const rem = REMEDIATION[cli] ?? { install: `install ${cli}`, login: `authenticate ${cli}` };
    if (!isInstalled(cli)) {
      problems.push({ agent: cli, cli, reason: "not installed", fix: `Install: ${rem.install}` });
    } else if (!looksAuthed(cli)) {
      problems.push({ agent: cli, cli, reason: "not signed in", fix: `Log in: ${rem.login}` });
    }
  }
  return problems;
}

export function formatProblems(problems: PreflightProblem[]): string {
  const lines = ["Coterie chat needs these agent CLIs installed and signed in:", ""];
  for (const p of problems) lines.push(`  ✗ ${p.cli} — ${p.reason}\n      ${p.fix}`);
  lines.push("", "Each runs on its own subscription (Claude Max / ChatGPT / Cursor Pro) — no API keys needed.");
  return lines.join("\n");
}

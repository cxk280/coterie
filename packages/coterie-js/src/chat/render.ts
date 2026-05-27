/** Human-readable rendering of a coordination round. Agents emit JSON (findings,
 *  verdicts) and prose; this module turns that into something a person reads.
 *  Nothing here ever surfaces raw JSON to the user. */

import type { AgentRun, CoterieState } from "../core/state.js";

/** If `stdout` is a JSON findings array (possibly fenced), return it (maybe
 *  empty); otherwise null. Distinguishes "structured findings" from prose, which
 *  `parseFindings` in the auditor can't (it returns `[]` for both). */
function asFindingsArray(stdout: string): any[] | null {
  let s = stdout.trim();
  if (s.startsWith("```")) {
    const lines = s.split("\n");
    const last = lines[lines.length - 1];
    s = (last && last.startsWith("```") ? lines.slice(1, -1) : lines.slice(1)).join("\n").trim();
  }
  if (!s.startsWith("[")) return null;
  try {
    const data = JSON.parse(s);
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function capLines(text: string, maxChars: number): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars).trimEnd() + " …";
}

/** Did this agent run fail? A non-zero exit, or no output at all with something
 *  on stderr (e.g. an auth error or crash the CLI reported but didn't exit on). */
export function runFailed(run: AgentRun): boolean {
  return run.exit_code !== 0 || (!run.stdout.trim() && !!run.stderr.trim());
}

/** A one-line, human-readable description of a failed run. */
export function renderFailure(run: AgentRun): string {
  const exit = run.exit_code !== 0 ? ` (exit ${run.exit_code})` : "";
  const detail = (run.stderr || run.stdout || "").trim().split("\n")[0] ?? "";
  return `failed${exit}${detail ? `: ${detail.slice(0, 200)}` : ""}`;
}

/** Render one agent's contribution as readable lines (no raw JSON). */
export function renderContribution(run: AgentRun, maxChars = 1200): string {
  const findings = asFindingsArray(run.stdout);
  if (findings !== null) {
    if (findings.length === 0) return "no defects reported";
    return findings
      .filter((f) => f && typeof f === "object" && typeof f.description === "string")
      .map((f) => `• [${f.severity ?? "?"}] ${f.category ?? "finding"}: ${f.description}`)
      .join("\n");
  }
  const text = (run.stdout ?? "").trim();
  return text ? capLines(text, maxChars) : "(no output)";
}

/** A compact, readable digest of the deliberation, handed to the finalizer agent
 *  as advice. Built generically from runs + verdicts + mode-specific summaries. */
export function digestRound(final: CoterieState): string {
  const runs = final.runs ?? [];
  const parts: string[] = [];

  for (const run of runs) {
    parts.push(`### ${run.role} — ${run.agent_id}\n${renderContribution(run, 1500)}`);
  }

  const verdicts = (final.judge_history ?? [])
    .map((j) => `- ${j.winner}${j.reason ? `: ${j.reason}` : ""}`)
    .filter(Boolean);
  if (verdicts.length) parts.push(`### verdicts\n${verdicts.join("\n")}`);

  const consensus = (final.mode_state?.consensus_findings ?? []) as any[];
  if (consensus.length) {
    const lines = consensus.map(
      (c) =>
        `- [${c.label}] [${c.severity}] ${c.description} (${c.agreement_count}/${
          c.supporting_agents?.length ?? c.agreement_count
        } agree)`,
    );
    parts.push(`### consensus findings\n${lines.join("\n")}`);
  }

  return parts.join("\n\n") || "(the deliberation produced no output)";
}

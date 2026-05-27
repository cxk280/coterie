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

/** Did this agent run fail? A non-zero exit always counts. An exit-0 run with no
 *  stdout but error-looking stderr (auth/rate-limit/crash the CLI reported but
 *  didn't exit on) counts too — but a benign warning on stderr with no stdout
 *  (e.g. a deprecation notice from an agent that only edited files) does not. */
const STDERR_ERROR_RE = /error|fail|denied|unauthor|not logged in|rate.?limit|expired|invalid|quota|ENOENT|timed? ?out/i;
export function runFailed(run: AgentRun): boolean {
  if (run.exit_code !== 0) return true;
  if (!run.stdout.trim() && run.stderr.trim()) return STDERR_ERROR_RE.test(run.stderr);
  return false;
}

/** A one-line, human-readable description of a failed run. */
export function renderFailure(run: AgentRun): string {
  const exit = run.exit_code !== 0 ? ` (exit ${run.exit_code})` : "";
  const detail = (run.stderr || run.stdout || "").trim().split("\n")[0] ?? "";
  return `failed${exit}${detail ? `: ${detail.slice(0, 200)}` : ""}`;
}

const RATE_LIMIT_RE = /rate.?limit|quota|usage limit|too many requests|\b429\b|resets? (?:at|in)|try again (?:later|in)|exhausted/i;
const AUTH_RE = /not logged in|unauthor|authentication|please (?:sign|log) ?in|login required|subscription|expired|invalid (?:api )?key|\b401\b|\b403\b/i;

export interface FailureClass {
  kind: "rate-limit" | "auth" | null;
  /** A short note to bubble up — includes any "resets at…/try again in…" hint. */
  detail: string;
}

/** Classify *why* a run failed so the session can adapt: drop a rate-limited or
 *  signed-out agent when others remain, or bubble up when/whether it'll recover. */
export function classifyFailure(run: AgentRun): FailureClass {
  if (!runFailed(run)) return { kind: null, detail: "" };
  const text = `${run.stderr}\n${run.stdout}`.trim();
  const firstLine = text.split("\n").find((l) => l.trim())?.trim().slice(0, 200) ?? "";
  // Surface a recovery hint if the CLI gave one.
  const when = text.match(/(?:resets?|try again|retry)[^.\n]*?(?:at|in)\s+[^.\n]{1,40}/i)?.[0];
  const detail = when ? `${firstLine}${firstLine.includes(when) ? "" : ` — ${when}`}` : firstLine;
  if (RATE_LIMIT_RE.test(text)) return { kind: "rate-limit", detail };
  if (AUTH_RE.test(text)) return { kind: "auth", detail };
  return { kind: null, detail };
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
    const lines = consensus.map((c) => {
      // Denominator is the participant total, not the supporter count (which
      // would always read "N/N"). Fall back to deriving it from the ratio.
      const total =
        c.participant_count ??
        (c.agreement_ratio ? Math.round(c.agreement_count / c.agreement_ratio) : c.agreement_count);
      return `- [${c.label}] [${c.severity}] ${c.description} (${c.agreement_count}/${total} agree)`;
    });
    parts.push(`### consensus findings\n${lines.join("\n")}`);
  }

  // Cap the assembled digest so a many-run round can't hand the finalizer an
  // unbounded prompt (compounds the argv limit). Per-contribution caps above
  // bound each piece; this bounds the whole.
  const digest = parts.join("\n\n") || "(the deliberation produced no output)";
  const MAX_DIGEST = 12_000;
  return digest.length > MAX_DIGEST
    ? digest.slice(0, MAX_DIGEST) + "\n\n…(deliberation digest truncated)…"
    : digest;
}

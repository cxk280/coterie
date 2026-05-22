/** Static mock data for all coterie-web screens until the backend lands in Phase B. */

import type { Finding, RunSummary } from "./types";

// ---------- Recent runs (left rail + history) ----------
export const RECENT_RUNS: RunSummary[] = [
  {
    id: "run_01",
    task: "Refactor src/auth.ts to remove the legacy session middleware",
    mode: "adversarial",
    agents: ["claude-code", "codex"],
    duration_s: 134,
    cost_usd: 2.84,
    status: "done",
    when: "2m ago",
  },
  {
    id: "run_02",
    task: "Find every bug in pkg/router/",
    mode: "consensus",
    agents: ["claude-code", "codex", "aider", "cursor"],
    duration_s: 62,
    cost_usd: 1.12,
    status: "done",
    status_reason: "3 confirmed · 2 needs-verify · 4 unverified",
    when: "12m ago",
  },
  {
    id: "run_03",
    task: "Postgres or SQLite for the orders db on our 50k MAU app?",
    mode: "debate",
    agents: ["claude-code", "codex"],
    duration_s: 58,
    cost_usd: 0.87,
    status: "done",
    status_reason: "Judge: pro (claude) — 8/6",
    when: "1h ago",
  },
  {
    id: "run_04",
    task: "Implement /api/v2/checkout — high-stakes; want best of 4",
    mode: "tournament",
    agents: ["claude-code", "codex", "aider", "cursor"],
    duration_s: 221,
    cost_usd: 4.62,
    status: "done",
    status_reason: "Winner: claude-code",
    when: "2h ago",
  },
  {
    id: "run_05",
    task: "Rename `foo` → `bar` across src/api/ and update tests",
    mode: "single",
    agents: ["claude-code", "codex"],
    duration_s: 42,
    cost_usd: 0.32,
    status: "done",
    when: "5h ago",
  },
  {
    id: "run_06",
    task: "Migrate to Prisma 6 with breaking schema changes",
    mode: "adversarial",
    agents: ["claude-code", "codex"],
    duration_s: 494,
    cost_usd: 5.0,
    status: "failed",
    status_reason: "budget exceeded after round 2",
    when: "yesterday",
  },
  {
    id: "run_07",
    task: "Audit pkg/payment for PCI compliance",
    mode: "consensus",
    agents: ["claude-code", "codex", "aider"],
    duration_s: null,
    cost_usd: 0.18,
    status: "rejected",
    status_reason: "User rejected at before_git_commit checkpoint",
    when: "yesterday",
  },
];

// ---------- Adversarial live ----------
export const MOCK_LIVE_ADVERSARIAL = {
  task: "Refactor src/auth.ts to remove the legacy session middleware",
  status: "auditing" as const,
  spend_usd: 1.84,
  budget_usd: 5.0,
  round_idx: 2,
  max_rounds: 3,
  implementer: {
    agent_id: "claude-code",
    duration_s: 8.2,
    cost_usd: 0.48,
    status: "done" as const,
    output: [
      { line: 1, text: "// Round 2 — addressing sustained critique:", kind: "comment" },
      { line: 2, text: "//   [high] auth() silently catches non-Error throws", kind: "comment" },
      { line: 3, text: "", kind: "blank" },
      { line: 4, text: "import { z } from 'zod';", kind: "import" },
      { line: 5, text: "import { SessionError, isSessionError } from './errors';", kind: "import" },
      { line: 6, text: "", kind: "blank" },
      { line: 7, text: "export async function auth(req: Request) {", kind: "code" },
      { line: 8, text: "  const token = req.headers.get('authorization');", kind: "code" },
      { line: 9, text: "  if (!token) throw new SessionError('missing-token');", kind: "code" },
      { line: 10, text: "  try {", kind: "code" },
      { line: 11, text: "    return await verifySession(token);", kind: "code" },
      { line: 12, text: "  } catch (err: unknown) {", kind: "code" },
      { line: 13, text: "    if (isSessionError(err)) throw err;", kind: "code" },
      { line: 14, text: "    throw new SessionError('unknown', { cause: err });", kind: "code" },
      { line: 15, text: "  }", kind: "code" },
      { line: 16, text: "}", kind: "code" },
    ],
  },
  auditor: {
    agent_id: "codex",
    streaming: true,
    findings_so_far: 4,
    findings: [
      { severity: "critical", category: "security", description: "verifySession() result is returned without checking exp claim — expired tokens pass.", line_ranges: ["src/auth.ts:11"] },
      { severity: "high", category: "bug", description: "isSessionError() type predicate is correct but the import path uses ./errors, which doesn't export it (only re-exports SessionError).", line_ranges: ["src/auth.ts:5"] },
      { severity: "medium", category: "perf", description: "verifySession is awaited inside try; consider promise.catch shape to drop the extra microtask in hot path.", line_ranges: ["src/auth.ts:11-14"] },
      { severity: "low", category: "clarity", description: "SessionError('unknown', { cause: err }) — 'unknown' as a code value is vague; prefer 'verify-failed' or similar.", line_ranges: ["src/auth.ts:14"] },
    ] as Finding[],
  },
  pipeline: [
    { id: "planner", label: "planner", status: "done" as const },
    { id: "implementer-r1", label: "implementer", status: "done" as const, sub: "r1" },
    { id: "auditor-r1", label: "auditor", status: "done" as const, sub: "r1" },
    { id: "judge-r1", label: "judge", status: "done" as const, sub: "r1 · revise" },
    { id: "implementer-r2", label: "implementer", status: "done" as const, sub: "r2" },
    { id: "auditor-r2", label: "auditor", status: "active" as const, sub: "r2" },
    { id: "judge-r2", label: "judge", status: "pending" as const, sub: "r2" },
  ],
  round_verdicts: [
    { round: 1, verdict: "revise" as const, reason: "Sustained: silent error-swallow in try/catch. Reject minor: line length nitpick.", scores_summary: "sustained 1 · rejected 1" },
    { round: 2, verdict: "pending" as const, reason: null, scores_summary: "awaiting judge" },
  ],
  checkpoints: { before_judge: true, before_git_commit: true, before_implementer: false, before_pytest: false },
};

// ---------- Single live ----------
export const MOCK_LIVE_SINGLE = {
  task: "Rename `foo` → `bar` across src/api/ and update tests",
  status: "executing" as const,
  spend_usd: 0.32,
  budget_usd: 5.0,
  step_idx: 1,
  steps: ["Find every `foo` usage and rename to `bar` in src/api/", "Update tests in src/api/__tests__ for renamed identifiers", "Update the public API export comment + bump JSDoc examples"],
  step_status: ["done", "active", "pending"] as const,
  pipeline: [
    { id: "planner", label: "planner", status: "done" as const, sub: "3 subtasks" },
    { id: "supervisor-s1", label: "supervisor", status: "done" as const, sub: "→ claude" },
    { id: "agent-s1", label: "claude-code", status: "done" as const, sub: "step 1 · $0.18" },
    { id: "supervisor-s2", label: "supervisor", status: "done" as const, sub: "→ codex" },
    { id: "agent-s2", label: "codex", status: "active" as const, sub: "step 2 · streaming" },
    { id: "supervisor-s3", label: "supervisor", status: "pending" as const },
    { id: "agent-s3", label: "?", status: "pending" as const, sub: "step 3" },
  ],
  route_history: [
    { step: 1, agent: "claude-code", reason: "Best for the initial refactor planning + multi-file edits.", current: false },
    { step: 2, agent: "codex", reason: "Test updates benefit from tight diff style and quick iteration.", current: true },
  ],
  agent_output: [
    { line: 1, text: "🔍 scanning src/api/__tests__/ for `foo`", color: "tertiary" },
    { line: 2, text: "  - found 14 matches across 6 files", color: "secondary" },
    { line: 3, text: "" },
    { line: 4, text: "✎ src/api/__tests__/users.test.ts (4)", color: "success" },
    { line: 5, text: "  describe('foo()', → 'bar()')", color: "primary" },
    { line: 6, text: "  expect(foo()).toEqual(…) → expect(bar()).toEqual(…)  (× 3)", color: "primary" },
    { line: 7, text: "" },
    { line: 8, text: "✎ src/api/__tests__/orders.test.ts (3)", color: "success" },
    { line: 9, text: "  it('foo handles…', → it('bar handles…')", color: "primary" },
    { line: 10, text: "  …", color: "tertiary" },
    { line: 11, text: "" },
    { line: 12, text: "✎ src/api/__tests__/checkout.test.ts (5)", color: "success" },
    { line: 13, text: "  …", color: "tertiary" },
    { line: 14, text: "" },
    { line: 15, text: "▍", color: "mode" },
  ],
};

// ---------- Consensus live ----------
export const MOCK_LIVE_CONSENSUS = {
  task: "Find every bug in pkg/router/",
  status: "consensus-scoring" as const,
  spend_usd: 1.12,
  budget_usd: 5.0,
  participants: [
    { id: "claude-code", findings: 6, cost_usd: 0.31 },
    { id: "codex", findings: 4, cost_usd: 0.22 },
    { id: "aider", findings: 5, cost_usd: 0.18 },
    { id: "cursor", findings: 3, cost_usd: 0.24 },
  ],
  clusters: [
    { label: "confirmed", severity: "critical", category: "security", description: "Path traversal in /api/v1/files allows reading parent dirs via `..`", agreement: "4 / 4 (100%)", agents: ["claude", "codex", "aider", "cursor"] },
    { label: "confirmed", severity: "high", category: "bug", description: "Race condition in router.handle() — concurrent requests may swap user context", agreement: "3 / 4 (75%)", agents: ["claude", "codex", "aider"] },
    { label: "confirmed", severity: "high", category: "bug", description: "Missing error handling for parseQuery() — throws on malformed input", agreement: "3 / 4 (75%)", agents: ["claude", "aider", "cursor"] },
    { label: "needs-verification", severity: "medium", category: "perf", description: "router.matchRoute O(n) per request, could be O(log n) with a trie", agreement: "2 / 4 (50%)", agents: ["claude", "cursor"] },
    { label: "needs-verification", severity: "medium", category: "clarity", description: "Inconsistent param naming: `req.params.id` vs `req.params.userId`", agreement: "2 / 4 (50%)", agents: ["codex", "aider"] },
    { label: "unverified", severity: "low", category: "clarity", description: "Magic number 30000 (ms timeout) — extract to TIMEOUT constant", agreement: "1 / 4 (25%)", agents: ["claude"] },
    { label: "unverified", severity: "low", category: "clarity", description: "router.ts:42 has TODO comment from 2024", agreement: "1 / 4 (25%)", agents: ["aider"] },
  ] as Array<{
    label: "confirmed" | "needs-verification" | "unverified";
    severity: Finding["severity"];
    category: string;
    description: string;
    agreement: string;
    agents: string[];
  }>,
};

// ---------- Debate live ----------
export const MOCK_LIVE_DEBATE = {
  task: "Postgres or SQLite for the orders db on our 50k MAU app?",
  status: "debating" as const,
  spend_usd: 0.87,
  budget_usd: 5.0,
  rounds_total: 3,
  rounds_completed: 1,
  active_speaker: "con" as const,
  pro_agent: "claude-code",
  con_agent: "codex",
  exchanges: [
    {
      round: 1,
      title: "scaling vs simplicity",
      summary: "Pro argued for PG's ecosystem maturity. Con argued for SQLite's operational ease. Unresolved: whether 50k MAU is large enough to justify PG complexity.",
      pro: { agent: "claude-code", time: "12:18:04 · 3.2s · $0.12", text: "Postgres at 50k MAU is not premature — concurrent writes from background workers and analytics queries will saturate SQLite's single-writer model within a year. PG also gives us mature replication when (not if) we need read scale." },
      con: { agent: "codex", time: "12:18:07 · 2.8s · $0.09", text: "SQLite handles 50k MAU comfortably for OLTP — see Tailscale's writeup. The operational cost (no PG to babysit) compounds. If we later need replication, Litestream or Turso solve it without abandoning SQLite." },
      moderator: "Round 1 unresolved: whether \"50k MAU\" implies workload concurrency that exceeds SQLite's single-writer limit. Both cite real-world examples; Pro's hinges on background-worker concurrency Con didn't address.",
    },
    {
      round: 2,
      title: "operational complexity",
      summary: null,
      pro: { agent: "claude-code", time: "12:18:11 · 2.6s · $0.13", text: "Granted SQLite is cheaper to operate today. But our team already runs Postgres for billing — adding orders on the same cluster is zero marginal ops cost. Splitting storage engines adds long-term cognitive load." },
      con: { agent: "codex", time: "streaming…", text: "Fair — same-cluster billing is a strong reason. But the billing cluster is a managed RDS instance burning $400/mo. Adding orders means another schema in that database, increasing blast radius if we ever need to migrate either…▍", streaming: true },
      moderator: null,
    },
  ],
};

// ---------- Tournament live ----------
export const MOCK_LIVE_TOURNAMENT = {
  task: "Implement /api/v2/checkout — high-stakes; want best of 4 + final review",
  status: "judging" as const,
  spend_usd: 3.42,
  budget_usd: 5.0,
  round_idx: 2,
  total_rounds: 2,
  r1: [
    { agent: "claude-code", score: 78, cost_usd: 0.42, status: "advanced" as const },
    { agent: "codex",       score: 92, cost_usd: 0.38, status: "advanced" as const },
    { agent: "aider",       score: 61, cost_usd: 0.31, status: "eliminated" as const },
    { agent: "cursor",      score: 54, cost_usd: 0.28, status: "eliminated" as const },
  ],
  r2: [
    { agent: "claude-code", cost_usd: 0.71, status: "active" as const },
    { agent: "codex",       cost_usd: 0.64, status: "active" as const },
  ],
  criteria_progress: [
    { name: "correctness", status: "done" as const, result: "claude > codex" },
    { name: "minimal-diff", status: "done" as const, result: "claude > codex" },
    { name: "tests-pass", status: "active" as const, result: "scoring…" },
    { name: "clarity", status: "pending" as const },
  ],
  eliminated_reasons: [
    { agent: "aider", reason: "Implementation worked but added 4 deps not in package.json — judge marked correctness 6/10" },
    { agent: "cursor", reason: "Forgot to handle the idempotency-key header — failed tests-pass criterion" },
  ],
};

// ---------- Run history stats ----------
export const RUN_STATS = {
  runs_this_week: 12,
  avg_cost_usd: 1.84,
  success_rate: 0.83,
  total_spend_usd: 22.1,
  avg_duration_s: 47,
};

// ---------- Run detail (mocked from run_01) ----------
export const MOCK_RUN_DETAIL = {
  id: "run_01",
  task: "Refactor src/auth.ts to remove the legacy session middleware",
  mode: "adversarial" as const,
  status: "done" as const,
  total_duration_s: 134,
  total_spend_usd: 1.84,
  budget_usd: 5.0,
  events: [
    { num: 1, role: "planner",     agent: "(trivial)",   summary: "plan = [task]",                                                              duration: "0.02s", cost: "$0.00" },
    { num: 2, role: "implementer", agent: "claude-code", summary: "Round 1: rewrote auth() with try/catch — silently swallows non-Error throws", duration: "8.4s",  cost: "$0.42" },
    { num: 3, role: "auditor",     agent: "codex",       summary: "Reported 5 findings — 1 high (silent error-swallow), 2 medium, 2 low",        duration: "6.1s",  cost: "$0.31" },
    { num: 4, role: "judge",       agent: "claude-opus", summary: "↻ revise — sustained 1 of 5: silent error-swallow in try/catch",              duration: "2.8s",  cost: "$0.18" },
    { num: 5, role: "implementer", agent: "claude-code", summary: "Round 2: addressed sustained critique, added isSessionError check",            duration: "7.9s",  cost: "$0.48" },
    { num: 6, role: "auditor",     agent: "codex",       summary: "Reported 0 findings — implementation passes review",                          duration: "5.5s",  cost: "$0.29" },
    { num: 7, role: "judge",       agent: "claude-opus", summary: "✓ accept — no findings met severity threshold",                                duration: "1.2s",  cost: "$0.16" },
  ],
  outcome: {
    title: "Run accepted in 2 rounds",
    description: "Implementation committed to refactor/auth-cleanup branch. 3 files changed (+84 / -47). Diff at github.com/cxk280/coterie/pull/42",
  },
  cost_breakdown: [
    { label: "claude-code (impl × 2)", value: 0.9 },
    { label: "codex (auditor × 2)", value: 0.6 },
    { label: "judge (opus × 3)", value: 0.34 },
  ],
  final_state: [
    ["status", "done", "success"],
    ["rounds_used", "2 / 3"],
    ["findings.total", "5"],
    ["findings.sustained", "1"],
    ["verdict", "accept"],
    ["files_changed", "3"],
    ["net_lines", "+84 / -47"],
    ["runs.length", "7"],
  ] as Array<[string, string, ("success" | "warning" | "error")?]>,
};

// ---------- Agent registry ----------
export interface AdapterEntry {
  name: string;
  status: "installed" | "outdated" | "not-installed";
  version?: string;
  defaultModel: string;
  lastUsed: string;
  runs30d: number;
  notes: string;
}

export const ADAPTERS: AdapterEntry[] = [
  { name: "claude-code", status: "installed", version: "v2.4.1", defaultModel: "claude-haiku-4-5", lastUsed: "2m ago", runs30d: 34, notes: "Built-in. Strengths: planning, refactor, multi-file edits." },
  { name: "codex", status: "installed", version: "v0.18.0", defaultModel: "gpt-4o-mini", lastUsed: "12m ago", runs30d: 22, notes: "Built-in. Strengths: algorithmic, tight diffs, edge cases." },
  { name: "aider", status: "installed", version: "v0.62.3", defaultModel: "claude-sonnet-4-6", lastUsed: "yesterday", runs30d: 14, notes: "Built-in. Strengths: surgical edits, precise instructions." },
  { name: "cursor", status: "outdated", version: "v0.41.2 → v0.43", defaultModel: "auto", lastUsed: "yesterday", runs30d: 8, notes: "Built-in. CLI mode (cursor-agent). Update for streaming output." },
  { name: "opencode", status: "not-installed", version: "", defaultModel: "—", lastUsed: "—", runs30d: 0, notes: "Built-in adapter. Install opencode CLI to enable." },
  { name: "shell", status: "installed", version: "—", defaultModel: "—", lastUsed: "5d ago", runs30d: 3, notes: "Wrap any CLI via command template. Use when no built-in fits." },
  { name: "fake", status: "installed", version: "—", defaultModel: "—", lastUsed: "tests only", runs30d: 0, notes: "In-process. Replays scripted AdapterResults. Used by tests and offline demos." },
];

// ---------- Settings (providers) ----------
export interface ProviderEntry {
  name: string;
  envKey: string;
  configured: boolean;
  models: string[];
  isDefault?: boolean;
}

export const PROVIDERS: ProviderEntry[] = [
  { name: "Anthropic", envKey: "ANTHROPIC_API_KEY", configured: true, models: ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-7"], isDefault: true },
  { name: "OpenAI", envKey: "OPENAI_API_KEY", configured: true, models: ["gpt-4o-mini", "gpt-5", "o3"] },
  { name: "Groq", envKey: "GROQ_API_KEY", configured: false, models: ["llama-3.3-70b-versatile", "mixtral-8x7b"] },
  { name: "xAI", envKey: "XAI_API_KEY", configured: false, models: ["grok-2-latest", "grok-3"] },
];

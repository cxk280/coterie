/**
 * Thin HTTP client for the coterie-api server.
 *
 * Set NEXT_PUBLIC_COTERIE_API_URL to override the base URL (defaults to
 * http://127.0.0.1:8000 in dev). When the API is unreachable, the calling
 * page should fall back to mock-data (see USE_MOCK).
 */

const BASE = process.env.NEXT_PUBLIC_COTERIE_API_URL ?? "http://127.0.0.1:8000";

export interface ApiRunSummary {
  id: string;
  task: string;
  mode: "single" | "consensus" | "adversarial" | "debate" | "tournament";
  status: "queued" | "running" | "awaiting_human" | "done" | "failed" | "rejected";
  status_reason: string | null;
  agents: string[];
  spend_usd: number;
  duration_s: number | null;
  created_at: string;
  updated_at: string;
}

export interface ApiAgentRun {
  agent_id: string;
  role: string;
  prompt: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_s: number;
  cost_estimate_usd: number | null;
}

export interface ApiRunDetail {
  summary: ApiRunSummary;
  config: Record<string, unknown>;
  runs: ApiAgentRun[];
  route_history: Array<Record<string, unknown>>;
  judge_history: Array<Record<string, unknown>>;
  mode_state: Record<string, unknown>;
  final_state: Record<string, unknown> | null;
}

export interface ApiAdapter {
  name: string;
}

export interface CreateRunBody {
  task: string;
  mode: ApiRunSummary["mode"];
  config: Record<string, unknown>;
}

export interface ApiEvent {
  kind: string;
  data: Record<string, unknown>;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: () => get<{ status: string }>("/api/health"),
  modes: () => get<string[]>("/api/modes"),
  agents: () => get<ApiAdapter[]>("/api/agents"),
  listRuns: () => get<ApiRunSummary[]>("/api/runs"),
  getRun: (id: string) => get<ApiRunDetail>(`/api/runs/${id}`),
  createRun: (body: CreateRunBody) => post<ApiRunSummary>("/api/runs", body),
  /** EventSource URL for SSE subscription. */
  eventsUrl: (id: string) => `${BASE}/api/runs/${id}/events`,
};

/**
 * Best-effort health check. Returns false if the API is unreachable so server
 * components can decide whether to render mock data instead.
 */
export async function apiReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/health`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

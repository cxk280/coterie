/**
 * Thin HTTP client for coterie-api.
 *
 * Set NEXT_PUBLIC_COTERIE_API_URL to override the base URL (defaults to
 * http://127.0.0.1:8000). COTERIE_API_TOKEN (server-side) or
 * NEXT_PUBLIC_COTERIE_API_TOKEN (browser-readable, for dev only) sets the
 * bearer token. Localhost requests can also bypass auth — see auth.py.
 */

const BASE = process.env.NEXT_PUBLIC_COTERIE_API_URL ?? "http://127.0.0.1:8000";

function token(): string | undefined {
  // Prefer the server-only var when called from a server component.
  return process.env.COTERIE_API_TOKEN ?? process.env.NEXT_PUBLIC_COTERIE_API_TOKEN;
}

function authHeaders(): HeadersInit {
  const t = token();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export interface ApiRunSummary {
  id: string;
  task: string;
  mode: "single" | "consensus" | "adversarial" | "debate" | "tournament";
  status: "queued" | "running" | "awaiting_human" | "done" | "failed" | "rejected";
  status_reason: string | null;
  agents: string[];
  spend_usd: number;
  duration_s: number | null;
  owner_id: string | null;
  trace_id: string | null;
  trace_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiRunListResponse {
  items: ApiRunSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiAgentRun {
  agent_id: string;
  role: string;
  prompt?: string;
  stdout?: string;
  stderr?: string;
  exit_code?: number;
  duration_s?: number;
  cost_estimate_usd?: number | null;
}

export interface ApiRunDetail {
  summary: ApiRunSummary;
  config: Record<string, unknown>;
  runs: ApiAgentRun[];
  route_history: Array<Record<string, unknown>>;
  judge_history: Array<Record<string, unknown>>;
  mode_state: Record<string, unknown>;
  final_state: Record<string, unknown> | null;
  current_state: Record<string, unknown> | null;
}

export interface ApiAdapter {
  name: string;
}

export interface CreateRunBody {
  task: string;
  mode: ApiRunSummary["mode"];
  config: Record<string, unknown>;
}

export type ResumeDecision = "approve" | "reject";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: () => get<{ status: string }>("/api/health"),
  modes: () => get<string[]>("/api/modes"),
  agents: () => get<ApiAdapter[]>("/api/agents"),
  listRuns: (opts: { limit?: number; offset?: number; mode?: string; status?: string } = {}) => {
    const p = new URLSearchParams();
    p.set("limit", String(opts.limit ?? 20));
    p.set("offset", String(opts.offset ?? 0));
    if (opts.mode) p.set("mode", opts.mode);
    if (opts.status) p.set("status", opts.status);
    return get<ApiRunListResponse>(`/api/runs?${p.toString()}`);
  },
  compactRun: (id: string) => post<{ id: string; events_removed: number }>(`/api/runs/${id}/compact`, {}),
  getRun: (id: string) => get<ApiRunDetail>(`/api/runs/${id}`),
  createRun: (body: CreateRunBody) => post<ApiRunSummary>("/api/runs", body),
  deleteRun: (id: string) => del<{ status: string; id: string }>(`/api/runs/${id}`),
  resumeRun: (id: string, decision: ResumeDecision) =>
    post<{ status: string; id: string }>(`/api/runs/${id}/resume`, { decision }),
  authToken: () => get<{ token: string }>("/api/auth/token"),
  rotateToken: () => post<{ token: string }>("/api/auth/rotate", {}),
  logout: () => post<{ status: string }>("/api/auth/logout", {}),
  me: () =>
    get<{
      id: string;
      kind: "github" | "dev" | "service";
      login: string | null;
      name: string | null;
      avatar_url: string | null;
      is_admin: boolean;
    }>("/api/auth/me"),
  listTokens: () =>
    get<
      Array<{
        id: string;
        name: string;
        prefix: string;
        created_at: string;
        last_used_at: string | null;
        revoked: boolean;
      }>
    >("/api/auth/tokens"),
  createToken: (name: string) =>
    post<{ id: string; name: string; prefix: string; token: string; created_at: string }>(
      "/api/auth/tokens",
      { name },
    ),
  revokeToken: (id: string) => del<{ status: string; id: string }>(`/api/auth/tokens/${id}`),
  /** EventSource URL. Token must be in the query string for SSE since EventSource can't set headers. */
  eventsUrl: (id: string) => {
    const t = token();
    const qs = t ? `?token=${encodeURIComponent(t)}` : "";
    return `${BASE}/api/runs/${id}/events${qs}`;
  },
};

export async function apiReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/health`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

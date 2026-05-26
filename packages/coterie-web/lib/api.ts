/**
 * Thin HTTP client for coterie-api.
 *
 * Set NEXT_PUBLIC_COTERIE_API_URL to override the base URL (defaults to
 * http://127.0.0.1:8000). COTERIE_API_TOKEN (server-side) or
 * NEXT_PUBLIC_COTERIE_API_TOKEN (browser-readable, for dev only) sets the
 * bearer token. Localhost requests can also bypass auth — see auth.py.
 */

import type { components } from "./api-types";

const BASE = process.env.NEXT_PUBLIC_COTERIE_API_URL ?? "http://127.0.0.1:8000";

/** Server response/request models, generated from the FastAPI OpenAPI schema
 *  (`npm run gen:api`). Do not hand-edit these to track the server — regenerate. */
type Schemas = components["schemas"];

function token(): string | undefined {
  // Prefer the server-only var when called from a server component.
  return process.env.COTERIE_API_TOKEN ?? process.env.NEXT_PUBLIC_COTERIE_API_TOKEN;
}

function authHeaders(): HeadersInit {
  const t = token();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// Generated server models (single source of truth: the API's OpenAPI schema).
export type ApiRunSummary = Schemas["RunSummary"];
export type ApiRunListResponse = Schemas["RunListResponse"];
export type ApiRunDetail = Schemas["RunDetail"];
export type MeResponse = Schemas["MeResponse"];
export type TokenSummary = Schemas["TokenSummary"];
export type CreateTokenResponse = Schemas["CreateTokenResponse"];
export type CreateRunBody = Schemas["CreateRunRequest"];
export type ResumeDecision = Schemas["ResumeRequest"]["decision"];
export type ProviderTestRequest = Schemas["ProviderTestRequest"];
export type ProviderTestResponse = Schemas["ProviderTestResponse"];
export type Provider = ProviderTestRequest["provider"];

// Client-side convenience shapes for endpoints the server returns as untyped
// objects (`list[dict]`), so they have no generated schema.
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

export interface ApiAdapter {
  name: string;
}

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
  me: () => get<MeResponse>("/api/auth/me"),
  listTokens: () => get<TokenSummary[]>("/api/auth/tokens"),
  createToken: (name: string) =>
    post<CreateTokenResponse>("/api/auth/tokens", { name }),
  revokeToken: (id: string) => del<{ status: string; id: string }>(`/api/auth/tokens/${id}`),
  testProvider: (body: ProviderTestRequest) =>
    post<ProviderTestResponse>("/api/auth/providers/test", body),
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

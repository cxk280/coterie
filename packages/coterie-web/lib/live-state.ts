/** Build live coterie state from an SSE event stream. */

"use client";

import { useEffect, useReducer, useRef } from "react";

import { api, type ApiRunDetail } from "./api";

export interface LiveState {
  task: string;
  mode: "single" | "consensus" | "adversarial" | "debate" | "tournament";
  status: string;
  spend_usd: number;
  runs: Array<Record<string, unknown>>;
  judge_history: Array<Record<string, unknown>>;
  route_history: Array<Record<string, unknown>>;
  mode_state: Record<string, unknown>;
  plan: string[];
  current_step_idx: number;
  /** When non-null, the runner is paused at an HIL checkpoint. */
  paused_at: string[] | null;
  /**
   * Live subprocess stdout chunks keyed by agent_id. The value is the running
   * concatenation as the agent streams output. Cleared when the run completes.
   */
  agent_output: Record<string, string>;
  /** agent_id of whichever agent emitted the most recent chunk, for header focus. */
  last_active_agent: string | null;
}

export interface LiveEvent {
  seq: number;
  kind: string;
  data: Record<string, unknown>;
  timestamp: string;
}

type Action =
  | { type: "event"; ev: LiveEvent }
  | { type: "snapshot"; state: Partial<LiveState> };

interface Store {
  state: LiveState;
  events: LiveEvent[];
}

function reducer(s: Store, a: Action): Store {
  if (a.type === "snapshot") {
    return { ...s, state: { ...s.state, ...a.state } };
  }
  const ev = a.ev;
  const events = [...s.events, ev];
  let state = s.state;
  switch (ev.kind) {
    case "state": {
      const snap = (ev.data.state as Partial<LiveState>) ?? {};
      // `paused_at` is reset on every state event — it's only set by checkpoint.
      state = { ...state, ...snap, paused_at: state.paused_at };
      break;
    }
    case "status_change": {
      const status = String(ev.data.status ?? state.status);
      state = { ...state, status, paused_at: status === "awaiting_human" ? state.paused_at : null };
      break;
    }
    case "spend_update": {
      const spend = Number(ev.data.spend_usd ?? state.spend_usd);
      state = { ...state, spend_usd: spend };
      break;
    }
    case "checkpoint": {
      const next = (ev.data.next_nodes as string[]) ?? [];
      state = { ...state, paused_at: next };
      const snap = (ev.data.state as Partial<LiveState>) ?? {};
      state = { ...state, ...snap, paused_at: next };
      break;
    }
    case "agent_output": {
      const agentId = typeof ev.data.agent_id === "string" ? ev.data.agent_id : "_";
      const chunk = typeof ev.data.chunk === "string" ? ev.data.chunk : "";
      if (!chunk) break;
      const prev = state.agent_output[agentId] ?? "";
      state = {
        ...state,
        agent_output: { ...state.agent_output, [agentId]: prev + chunk },
        last_active_agent: agentId,
      };
      break;
    }
    case "done": {
      const status = String(ev.data.status ?? "done");
      state = { ...state, status, paused_at: null };
      break;
    }
    default:
      break;
  }
  return { state, events };
}

function emptyState(seed?: ApiRunDetail): LiveState {
  if (!seed) {
    return {
      task: "",
      mode: "adversarial",
      status: "planning",
      spend_usd: 0,
      runs: [],
      judge_history: [],
      route_history: [],
      mode_state: {},
      plan: [],
      current_step_idx: 0,
      paused_at: null,
      agent_output: {},
      last_active_agent: null,
    };
  }
  const s = (seed.current_state ?? seed.final_state ?? {}) as Partial<LiveState>;
  return {
    task: seed.summary.task,
    mode: seed.summary.mode,
    status: s.status ?? seed.summary.status,
    spend_usd: typeof s.spend_usd === "number" ? s.spend_usd : seed.summary.spend_usd,
    runs: (s.runs as LiveState["runs"]) ?? seed.runs,
    judge_history: (s.judge_history as LiveState["judge_history"]) ?? seed.judge_history,
    route_history: (s.route_history as LiveState["route_history"]) ?? seed.route_history,
    mode_state: (s.mode_state as LiveState["mode_state"]) ?? seed.mode_state,
    plan: (s.plan as string[]) ?? [],
    current_step_idx: (s.current_step_idx as number) ?? 0,
    paused_at: seed.summary.status === "awaiting_human" ? [] : null,
    agent_output: {},
    last_active_agent: null,
  };
}

export function useLiveRunState(runId: string, seed: ApiRunDetail) {
  const [store, dispatch] = useReducer(reducer, { state: emptyState(seed), events: [] });
  const seqRef = useRef(0);

  useEffect(() => {
    const url = api.eventsUrl(runId);
    const es = new EventSource(url);

    const handler = (kind: string) => (ev: MessageEvent) => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(ev.data);
      } catch {
        data = { raw: ev.data };
      }
      dispatch({
        type: "event",
        ev: { seq: seqRef.current++, kind, data, timestamp: new Date().toISOString() },
      });
    };

    const kinds = [
      "state",
      "status_change",
      "spend_update",
      "agent_run",
      "agent_output",
      "judge_decision",
      "checkpoint",
      "done",
      "error",
      "stream_end",
    ];
    for (const k of kinds) {
      es.addEventListener(k, handler(k));
    }

    es.onerror = () => {
      es.close();
    };

    return () => es.close();
  }, [runId]);

  return store;
}

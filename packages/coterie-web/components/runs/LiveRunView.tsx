"use client";

import { useEffect, useRef, useState } from "react";

import { api, type ApiEvent, type ApiRunDetail } from "@/lib/api";

interface LiveRunViewProps {
  runId: string;
  initial: ApiRunDetail;
}

interface LiveEvent {
  seq: number;
  kind: string;
  data: Record<string, unknown>;
  timestamp: string;
}

/**
 * Subscribes to /api/runs/:id/events. Renders a chronological stream of events
 * + the current state derived from them. v0.1: just an event log; mode-specific
 * live views consume this state via context in v0.2.
 */
export function LiveRunView({ runId, initial }: LiveRunViewProps) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [status, setStatus] = useState(initial.summary.status);
  const [spend, setSpend] = useState(initial.summary.spend_usd);
  const seqRef = useRef(0);

  useEffect(() => {
    const url = api.eventsUrl(runId);
    const es = new EventSource(url);

    const handler = (ev: MessageEvent, kind: string) => {
      const data = JSON.parse(ev.data) as Record<string, unknown>;
      const e: LiveEvent = {
        seq: seqRef.current++,
        kind,
        data,
        timestamp: new Date().toISOString(),
      };
      setEvents((prev) => [...prev, e]);
      if (kind === "status_change" && typeof data.status === "string") {
        setStatus(data.status as ApiRunDetail["summary"]["status"]);
      }
      if (kind === "spend_update" && typeof data.spend_usd === "number") {
        setSpend(data.spend_usd);
      }
    };

    const kinds = ["status_change", "spend_update", "agent_run", "judge_decision", "checkpoint", "done", "error"];
    for (const k of kinds) {
      es.addEventListener(k, (ev) => handler(ev as MessageEvent, k));
    }

    es.onerror = () => {
      // Server closed or connection dropped — close cleanly.
      es.close();
    };

    return () => es.close();
  }, [runId]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Header strip */}
      <main className="flex flex-1 flex-col overflow-y-auto px-12 py-8" style={{ background: "var(--color-bg-canvas)" }}>
        <div className="flex items-center gap-3 pb-6">
          <h1 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
            Live event stream
          </h1>
          <div className="flex-1" />
          <span
            className="rounded-md px-2.5 py-1 font-mono text-xs"
            style={{ background: "var(--color-bg-raised)", color: "var(--color-text-primary)" }}
          >
            status: {status}
          </span>
          <span
            className="rounded-md px-2.5 py-1 font-mono text-xs"
            style={{ background: "var(--color-bg-raised)", color: "var(--color-text-primary)" }}
          >
            spend: ${spend.toFixed(4)}
          </span>
        </div>

        <ol className="flex flex-col gap-2 font-mono text-xs">
          {events.length === 0 && (
            <li style={{ color: "var(--color-text-tertiary)" }}>waiting for first event…</li>
          )}
          {events.map((e) => (
            <li
              key={e.seq}
              className="rounded-md border px-3 py-2"
              style={{
                background: "var(--color-bg-surface)",
                borderColor: "var(--color-border-subtle)",
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="rounded px-1.5 py-0.5 font-bold tracking-wider"
                  style={{ background: kindBg(e.kind), color: "var(--color-bg-canvas)" }}
                >
                  {e.kind}
                </span>
                <span style={{ color: "var(--color-text-tertiary)" }}>
                  {new Date(e.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <pre
                className="mt-1.5 whitespace-pre-wrap break-all"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {JSON.stringify(e.data, null, 2)}
              </pre>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}

function kindBg(kind: string): string {
  switch (kind) {
    case "agent_run":
      return "var(--color-mode-adversarial)";
    case "spend_update":
      return "var(--color-status-info)";
    case "status_change":
      return "var(--color-status-warning)";
    case "judge_decision":
      return "var(--color-mode-tournament)";
    case "done":
      return "var(--color-status-success)";
    case "error":
      return "var(--color-status-error)";
    default:
      return "var(--color-bg-active)";
  }
}

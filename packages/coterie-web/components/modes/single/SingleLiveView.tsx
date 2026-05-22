"use client";

import type { LiveBodyProps } from "@/lib/live-types";

export function SingleLiveView({ state }: LiveBodyProps) {
  const runs = state.runs as Array<Record<string, any>>;
  const lastRun = runs[runs.length - 1];

  return (
    <div className="flex flex-1 overflow-hidden">
      <main className="flex flex-1 flex-col overflow-y-auto" style={{ background: "var(--color-bg-canvas)" }}>
        <header
          className="flex items-center gap-2.5 border-b px-5 py-3.5"
          style={{
            background: "var(--color-bg-surface)",
            borderColor: "var(--color-border-subtle)",
          }}
        >
          <span
            className="size-2 rounded-full"
            style={{
              background:
                state.status === "done"
                  ? "var(--color-status-success)"
                  : "var(--color-status-warning)",
            }}
          />
          <h3
            className="text-[13px] font-semibold tracking-wider"
            style={{ color: "var(--color-text-primary)" }}
          >
            STEP {state.current_step_idx + 1}
          </h3>
          <span className="font-mono text-xs" style={{ color: "var(--color-text-secondary)" }}>
            · {lastRun?.agent_id ?? "—"}
          </span>
          <div className="flex-1" />
          <span className="font-mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            {state.status} · {runs.length} runs · ${state.spend_usd.toFixed(4)}
          </span>
        </header>

        <pre
          className="flex-1 overflow-y-auto px-5 py-4 font-mono text-xs"
          style={{ color: "var(--color-text-primary)" }}
        >
          {(lastRun?.stdout as string) ?? (lastRun?.stdout_preview as string) ?? "(waiting for first output…)"}
        </pre>
      </main>

      <aside
        className="flex w-[420px] flex-col gap-5 overflow-y-auto px-5 py-5"
        style={{ background: "var(--color-bg-surface)" }}
      >
        <SectionLabel>ROUTE HISTORY</SectionLabel>
        {(state.route_history as any[]).map((r, i) => (
          <div
            key={i}
            className="flex flex-col gap-1.5 rounded-md px-3 py-2.5"
            style={{ background: "var(--color-bg-raised)" }}
          >
            <div className="flex items-center gap-2">
              <span
                className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold"
                style={{
                  background: "var(--color-bg-canvas)",
                  color: "var(--color-text-secondary)",
                }}
              >
                S{(r.step ?? i) + 1}
              </span>
              <span className="font-mono text-xs" style={{ color: "var(--color-text-primary)" }}>
                → {r.agent_id}
              </span>
            </div>
            {r.reason && (
              <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                {r.reason as string}
              </p>
            )}
          </div>
        ))}

        <SectionLabel>PLAN</SectionLabel>
        {(state.plan as string[]).map((step: string, i: number) => (
          <div key={i} className="flex items-baseline gap-2 py-1">
            <span
              className="font-mono text-xs"
              style={{
                color:
                  i < state.current_step_idx
                    ? "var(--color-status-success)"
                    : i === state.current_step_idx
                    ? "var(--color-status-warning)"
                    : "var(--color-text-disabled)",
              }}
            >
              {i < state.current_step_idx ? "✓" : i === state.current_step_idx ? "●" : "○"}
            </span>
            <span
              className="text-xs"
              style={{
                color: i > state.current_step_idx ? "var(--color-text-disabled)" : "var(--color-text-primary)",
              }}
            >
              {i + 1}. {step}
            </span>
          </div>
        ))}
      </aside>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="text-[11px] font-semibold tracking-wider"
      style={{ color: "var(--color-text-tertiary)" }}
    >
      {children}
    </h3>
  );
}

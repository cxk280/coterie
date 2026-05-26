"use client";

import type { LiveBodyProps } from "@/lib/live-types";

const LABEL_STYLES = {
  confirmed: { bg: "var(--color-status-success)", fg: "var(--color-bg-canvas)" },
  "needs-verification": { bg: "var(--color-status-warning)", fg: "var(--color-bg-canvas)" },
  unverified: { bg: "var(--color-bg-surface)", fg: "var(--color-text-secondary)" },
} as const;

const SEVERITY_VAR: Record<string, string> = {
  low: "--color-severity-low",
  medium: "--color-severity-medium",
  high: "--color-severity-high",
  critical: "--color-severity-critical",
};

export function ConsensusLiveView({ state }: LiveBodyProps) {
  const ms = state.mode_state as Record<string, any>;
  const clusters = (ms.consensus_findings as any[]) ?? [];
  const participants = (state.runs as any[]).filter((r) => r.role === "consensus-participant");

  return (
    <main className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-8 sm:px-8 lg:px-12" style={{ background: "var(--color-bg-canvas)" }}>
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
          Clusters
        </h2>
        <div className="flex-1" />
        <span className="font-mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
          {participants.length} participants · {clusters.length} clusters
        </span>
      </div>

      {clusters.length === 0 ? (
        <div
          className="rounded-md border border-dashed px-4 py-8 text-center text-xs"
          style={{
            borderColor: "var(--color-border-subtle)",
            color: "var(--color-text-tertiary)",
          }}
        >
          {state.status === "consensus-scoring" ? "engine clustering findings…" : "waiting for participants to complete…"}
        </div>
      ) : (
        <div className="overflow-x-auto">
        <ul className="flex min-w-[680px] flex-col gap-2">
          {clusters.map((c, i) => (
            <li
              key={i}
              className="grid items-center gap-3 rounded-md border px-4 py-3"
              style={{
                background: "var(--color-bg-surface)",
                borderColor: "var(--color-border-subtle)",
                gridTemplateColumns: "140px 60px 100px 1fr 110px 220px",
              }}
            >
              <span
                className="inline-flex w-fit items-center rounded px-2 py-1 font-mono text-[10px] font-bold tracking-wider"
                style={{
                  background: LABEL_STYLES[c.label as keyof typeof LABEL_STYLES]?.bg ?? "var(--color-bg-canvas)",
                  color: LABEL_STYLES[c.label as keyof typeof LABEL_STYLES]?.fg ?? "var(--color-text-secondary)",
                }}
              >
                {String(c.label).toUpperCase()}
              </span>
              <span
                className="inline-flex w-fit items-center rounded px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider"
                style={{ background: `var(${SEVERITY_VAR[c.severity] ?? "--color-severity-low"})`, color: "var(--color-bg-canvas)" }}
              >
                {String(c.severity).toUpperCase()}
              </span>
              <span className="font-mono text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                {c.category}
              </span>
              <span className="line-clamp-1 text-xs" style={{ color: "var(--color-text-primary)" }}>
                {c.description}
              </span>
              <span className="font-mono text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                {c.agreement_count} / {participants.length} ({Math.round((c.agreement_ratio ?? 0) * 100)}%)
              </span>
              <span className="flex flex-wrap gap-1">
                {(c.supporting_agents as string[] | undefined)?.map((a) => (
                  <span
                    key={a}
                    className="rounded px-1.5 py-0.5 font-mono text-[9px]"
                    style={{ background: "var(--color-bg-canvas)", color: "var(--color-text-secondary)" }}
                  >
                    {a}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
        </div>
      )}
    </main>
  );
}

"use client";

import type { LiveBodyProps } from "@/lib/live-types";

export function DebateLiveView({ state }: LiveBodyProps) {
  const runs = state.runs as Array<Record<string, any>>;
  const ms = state.mode_state as Record<string, any>;
  const summaries = (ms.round_summaries as any[]) ?? [];
  const proRuns = runs.filter((r) => r.role === "pro");
  const conRuns = runs.filter((r) => r.role === "con");

  return (
    <main className="flex flex-1 flex-col gap-6 overflow-y-auto px-12 py-8" style={{ background: "var(--color-bg-canvas)" }}>
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
          Debate
        </h2>
        <div className="flex-1" />
        <span className="font-mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
          rounds {summaries.length} · {state.status}
        </span>
      </div>

      {Array.from({ length: Math.max(proRuns.length, conRuns.length) }).map((_, i) => (
        <section key={i} className="flex flex-col gap-3">
          <h3 className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>
            Round {i + 1}
          </h3>
          {proRuns[i] && (
            <Bubble side="pro" agent={proRuns[i].agent_id as string} text={(proRuns[i].stdout as string) ?? (proRuns[i].stdout_preview as string) ?? ""} />
          )}
          {conRuns[i] && (
            <Bubble side="con" agent={conRuns[i].agent_id as string} text={(conRuns[i].stdout as string) ?? (conRuns[i].stdout_preview as string) ?? ""} />
          )}
          {summaries[i] && (
            <div
              className="rounded-md border border-dashed px-4 py-2.5 text-xs"
              style={{ borderColor: "var(--color-border-subtle)", color: "var(--color-text-secondary)" }}
            >
              <span className="font-mono text-[10px] font-bold" style={{ color: "var(--color-text-tertiary)" }}>
                ⚖ MODERATOR
              </span>
              <p className="mt-1">{summaries[i].round_summary as string}</p>
            </div>
          )}
        </section>
      ))}
    </main>
  );
}

function Bubble({ side, agent, text }: { side: "pro" | "con"; agent: string; text: string }) {
  const isPro = side === "pro";
  return (
    <div className={`flex items-start gap-3 ${isPro ? "" : "flex-row-reverse"}`}>
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold"
        style={{
          background: isPro ? "var(--color-status-success)" : "var(--color-status-error)",
          color: "var(--color-bg-canvas)",
        }}
      >
        {side.toUpperCase()}
      </div>
      <div
        className="flex max-w-[700px] flex-1 flex-col gap-1.5 rounded-xl px-4 py-3"
        style={{ background: isPro ? "var(--color-bg-surface)" : "var(--color-bg-raised)" }}
      >
        <div className="flex items-center gap-2 text-[11px]">
          <span
            className="font-mono font-bold"
            style={{ color: isPro ? "var(--color-status-success)" : "var(--color-status-error)" }}
          >
            {side.toUpperCase()}
          </span>
          <span style={{ color: "var(--color-text-tertiary)" }}>·</span>
          <span className="font-mono" style={{ color: "var(--color-text-secondary)" }}>
            {agent}
          </span>
        </div>
        <p className="whitespace-pre-wrap text-xs" style={{ color: "var(--color-text-primary)" }}>
          {text || "(streaming…)"}
        </p>
      </div>
    </div>
  );
}

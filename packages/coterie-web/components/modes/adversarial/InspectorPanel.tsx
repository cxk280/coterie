interface RoundVerdict {
  round: number;
  verdict: "revise" | "accept" | "pending";
  reason: string | null;
  scores_summary: string;
}

interface InspectorPanelProps {
  verdicts: RoundVerdict[];
  state: Array<[string, string, ("primary" | "warning" | "error")?]>;
  checkpoints: Record<string, boolean>;
}

export function InspectorPanel({ verdicts, state, checkpoints }: InspectorPanelProps) {
  return (
    <aside
      className="flex w-[420px] flex-col gap-6 px-5 py-5"
      style={{ background: "var(--color-bg-surface)" }}
    >
      <section className="flex flex-col gap-2">
        <SectionLabel>ROUND VERDICTS</SectionLabel>
        {verdicts.map((v) => (
          <article
            key={v.round}
            className="flex flex-col gap-2 rounded-md px-3 py-2.5"
            style={{
              background: "var(--color-bg-raised)",
              border: v.verdict === "pending" ? "1px solid var(--color-mode-adversarial)" : "none",
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold"
                style={{
                  background: "var(--color-bg-canvas)",
                  color: "var(--color-text-secondary)",
                }}
              >
                R{v.round}
              </span>
              <span
                className="text-xs font-semibold"
                style={{
                  color:
                    v.verdict === "accept"
                      ? "var(--color-status-success)"
                      : v.verdict === "revise"
                      ? "var(--color-status-warning)"
                      : "var(--color-text-tertiary)",
                }}
              >
                {v.verdict === "accept" ? "✓ accept" : v.verdict === "revise" ? "↻ revise" : "… pending"}
              </span>
              <div className="flex-1" />
              <span
                className="font-mono text-[11px]"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                {v.scores_summary}
              </span>
            </div>
            {v.reason && (
              <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                {v.reason}
              </p>
            )}
          </article>
        ))}
      </section>

      <section className="flex flex-col gap-1">
        <SectionLabel>STATE</SectionLabel>
        {state.map(([k, val, tone]) => (
          <div key={k} className="flex items-center gap-2 py-1.5">
            <span className="font-mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
              {k}
            </span>
            <div className="flex-1" />
            <span
              className="font-mono text-[11px]"
              style={{
                color:
                  tone === "warning"
                    ? "var(--color-status-warning)"
                    : tone === "error"
                    ? "var(--color-status-error)"
                    : "var(--color-text-primary)",
              }}
            >
              {val}
            </span>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <SectionLabel>CHECKPOINTS</SectionLabel>
        {Object.entries(checkpoints).map(([name, enabled]) => (
          <div key={name} className="flex items-center gap-3 py-1">
            <button
              type="button"
              aria-pressed={enabled}
              className="flex h-4 w-7 items-center rounded-full px-0.5 transition"
              style={{
                background: enabled
                  ? "var(--color-mode-adversarial)"
                  : "var(--color-bg-canvas)",
                justifyContent: enabled ? "flex-end" : "flex-start",
              }}
            >
              <span className="size-3 rounded-full bg-white" />
            </button>
            <span
              className="font-mono text-xs"
              style={{
                color: enabled ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
              }}
            >
              {name}
            </span>
          </div>
        ))}
      </section>
    </aside>
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

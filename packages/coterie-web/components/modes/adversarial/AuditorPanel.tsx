import type { Finding } from "@/lib/types";

interface AuditorPanelProps {
  agentId: string;
  streaming: boolean;
  findingsSoFar: number;
  findings: Finding[];
  round: number;
}

const SEVERITY_VAR: Record<Finding["severity"], string> = {
  low: "--color-severity-low",
  medium: "--color-severity-medium",
  high: "--color-severity-high",
  critical: "--color-severity-critical",
};

export function AuditorPanel({ agentId, streaming, findingsSoFar, findings, round }: AuditorPanelProps) {
  return (
    <section
      className="flex w-[540px] flex-col border-r"
      style={{ borderColor: "var(--color-border-subtle)" }}
    >
      <header
        className="flex items-center gap-2.5 border-b px-5 py-3.5"
        style={{
          background: "var(--color-bg-surface)",
          borderColor: "var(--color-border-subtle)",
        }}
      >
        <span
          className="size-2 rounded-full"
          style={{ background: "var(--color-status-warning)" }}
        />
        <h3
          className="text-[13px] font-semibold tracking-wider"
          style={{ color: "var(--color-text-primary)" }}
        >
          AUDITOR
        </h3>
        <span className="font-mono text-xs" style={{ color: "var(--color-text-secondary)" }}>
          · {agentId}
        </span>
        <div className="flex-1" />
        <span className="font-mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
          round {round} · {streaming ? "streaming" : "done"} · {findingsSoFar} findings so far
        </span>
      </header>

      <div
        className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4"
        style={{ background: "var(--color-bg-canvas)" }}
      >
        {findings.map((f, i) => (
          <article
            key={i}
            className="rounded-md px-3 py-3"
            style={{ background: "var(--color-bg-surface)" }}
          >
            <header className="mb-1.5 flex items-center gap-2 text-[10px]">
              <span
                className="rounded px-1.5 py-0.5 font-mono font-bold tracking-wider"
                style={{ background: `var(${SEVERITY_VAR[f.severity]})`, color: "#000" }}
              >
                {f.severity.toUpperCase()}
              </span>
              <span className="font-mono" style={{ color: "var(--color-text-secondary)" }}>
                {f.category}
              </span>
              <span style={{ color: "var(--color-text-tertiary)" }}>·</span>
              <span className="font-mono" style={{ color: "var(--color-text-tertiary)" }}>
                {f.line_ranges.join(", ")}
              </span>
            </header>
            <p className="text-xs" style={{ color: "var(--color-text-primary)" }}>
              {f.description}
            </p>
          </article>
        ))}

        {streaming && (
          <div
            className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-xs"
            style={{ borderColor: "var(--color-border-subtle)" }}
          >
            <span
              className="font-mono font-bold animate-pulse"
              style={{ color: "var(--color-mode-adversarial)" }}
            >
              ▍
            </span>
            <span style={{ color: "var(--color-text-secondary)" }}>auditor streaming…</span>
          </div>
        )}
      </div>
    </section>
  );
}

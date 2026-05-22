interface CodeLine {
  line: number;
  text: string;
  kind: string;
}

interface ImplementerPanelProps {
  agentId: string;
  durationS: number;
  costUsd: number;
  round: number;
  status: "done" | "active";
  output: CodeLine[];
}

const KIND_COLOR_VAR: Record<string, string> = {
  comment: "--color-text-tertiary",
  blank: "--color-text-primary",
  import: "--color-text-secondary",
  code: "--color-text-primary",
};

export function ImplementerPanel({
  agentId,
  durationS,
  costUsd,
  round,
  status,
  output,
}: ImplementerPanelProps) {
  return (
    <section
      className="flex w-[480px] flex-col border-r"
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
          style={{
            background:
              status === "done"
                ? "var(--color-status-success)"
                : "var(--color-status-warning)",
          }}
        />
        <h3
          className="text-[13px] font-semibold tracking-wider"
          style={{ color: "var(--color-text-primary)" }}
        >
          IMPLEMENTER
        </h3>
        <span className="font-mono text-xs" style={{ color: "var(--color-text-secondary)" }}>
          · {agentId}
        </span>
        <div className="flex-1" />
        <span className="font-mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
          round {round} · {status} · {durationS.toFixed(1)}s · ${costUsd.toFixed(2)}
        </span>
      </header>

      <pre
        className="flex flex-1 flex-col overflow-y-auto py-4 font-mono text-xs"
        style={{ background: "var(--color-bg-canvas)" }}
      >
        {output.map((line) => (
          <div key={line.line} className="flex items-center gap-4 px-5 py-px">
            <span
              className="select-none text-right tabular-nums"
              style={{ color: "var(--color-text-disabled)", minWidth: "2ch" }}
            >
              {line.line}
            </span>
            <span
              style={{
                color: `var(${KIND_COLOR_VAR[line.kind] ?? "--color-text-primary"})`,
                whiteSpace: "pre-wrap",
              }}
            >
              {line.text || " "}
            </span>
          </div>
        ))}
      </pre>
    </section>
  );
}

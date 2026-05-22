interface PipelineNode {
  id: string;
  label: string;
  status: "done" | "active" | "pending";
  sub?: string;
}

const STATUS_GLYPH = { done: "✓", active: "●", pending: "○" } as const;
const STATUS_COLOR_VAR = {
  done: "--color-status-success",
  active: "--color-status-warning",
  pending: "--color-text-disabled",
} as const;

export function PipelineStrip({ nodes }: { nodes: PipelineNode[] }) {
  return (
    <div
      className="flex h-[84px] items-center gap-0 border-b px-6 py-4"
      style={{
        background: "var(--color-bg-surface)",
        borderColor: "var(--color-border-subtle)",
      }}
    >
      {nodes.map((n, i) => (
        <div key={n.id} className="flex items-center">
          <PipelinePill node={n} />
          {i < nodes.length - 1 && (
            <span
              className="px-2 font-mono text-sm"
              style={{ color: "var(--color-text-tertiary)" }}
              aria-hidden
            >
              →
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function PipelinePill({ node }: { node: PipelineNode }) {
  const isActive = node.status === "active";
  const isPending = node.status === "pending";
  return (
    <div
      className="flex items-center gap-2 rounded-md px-3 py-2 border"
      style={{
        background: isPending ? "var(--color-bg-canvas)" : "var(--color-bg-raised)",
        borderColor: isActive ? "var(--color-mode-adversarial)" : "var(--color-border-default)",
        borderWidth: isActive ? "2px" : "1px",
      }}
    >
      <span
        className="font-mono text-xs"
        style={{ color: `var(${STATUS_COLOR_VAR[node.status]})` }}
      >
        {STATUS_GLYPH[node.status]}
      </span>
      <div className="flex flex-col gap-0.5">
        <span
          className="font-mono text-xs"
          style={{
            color: isPending ? "var(--color-text-disabled)" : "var(--color-text-primary)",
          }}
        >
          {node.label}
        </span>
        {node.sub && (
          <span
            className="text-[10px]"
            style={{
              color: isPending ? "var(--color-text-disabled)" : "var(--color-text-tertiary)",
            }}
          >
            {node.sub}
          </span>
        )}
      </div>
    </div>
  );
}

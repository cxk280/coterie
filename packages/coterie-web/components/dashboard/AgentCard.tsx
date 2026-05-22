import { MODES, type Mode } from "@/lib/modes";

interface AgentCardProps {
  agentId: string;
  role: string;
  adapter: string;
  strengths: string[];
  modeColor: Mode;
}

export function AgentCard({ agentId, role, adapter, strengths, modeColor }: AgentCardProps) {
  return (
    <div
      className="flex flex-col gap-2.5 rounded-lg border px-4 py-3.5"
      style={{
        background: "var(--color-bg-surface)",
        borderColor: "var(--color-border-default)",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="size-2 rounded-full"
          style={{ background: `var(${MODES[modeColor].colorVar})` }}
          aria-hidden
        />
        <span className="font-mono text-sm" style={{ color: "var(--color-text-primary)" }}>
          {agentId}
        </span>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-medium"
          style={{
            background: "var(--color-bg-raised)",
            color: "var(--color-text-secondary)",
          }}
        >
          {role.toUpperCase()}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-[11px]">
        <span style={{ color: "var(--color-text-tertiary)" }}>adapter:</span>
        <span className="font-mono" style={{ color: "var(--color-text-secondary)" }}>
          {adapter}
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        {strengths.map((s) => (
          <span
            key={s}
            className="rounded px-1.5 py-0.5 text-[10px]"
            style={{
              background: "var(--color-bg-canvas)",
              color: "var(--color-text-tertiary)",
            }}
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

import { MOCK_LIVE_CONSENSUS } from "@/lib/mock-data";

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

export function ConsensusView() {
  const data = MOCK_LIVE_CONSENSUS;
  const confirmedCount = data.clusters.filter((c) => c.label === "confirmed").length;
  const needsCount = data.clusters.filter((c) => c.label === "needs-verification").length;
  const unverifiedCount = data.clusters.filter((c) => c.label === "unverified").length;

  return (
    <>
      {/* Participants strip */}
      <div
        className="flex h-[120px] flex-col gap-2 border-b px-6 py-4"
        style={{
          background: "var(--color-bg-surface)",
          borderColor: "var(--color-border-subtle)",
        }}
      >
        <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
          <span>
            {data.participants.length} agents · {data.participants.reduce((s, p) => s + p.findings, 0)} raw
            findings → engine clustering and labeling
          </span>
        </div>
        <div className="flex items-center gap-3">
          {data.participants.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 rounded-md border px-3 py-2"
              style={{
                background: "var(--color-bg-raised)",
                borderColor: "var(--color-border-default)",
              }}
            >
              <span
                className="size-2 rounded-full"
                style={{ background: "var(--color-status-success)" }}
              />
              <span className="font-mono text-xs" style={{ color: "var(--color-text-primary)" }}>
                {p.id}
              </span>
              <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                {p.findings} findings · ${p.cost_usd.toFixed(2)}
              </span>
            </div>
          ))}
          <div className="flex-1" />
          <div
            className="flex items-center gap-2 rounded-md border-2 px-3 py-2"
            style={{
              background: "var(--color-bg-raised)",
              borderColor: "var(--color-mode-consensus)",
            }}
          >
            <span
              className="font-mono text-sm font-bold"
              style={{ color: "var(--color-mode-consensus)" }}
            >
              ▍
            </span>
            <span className="font-mono text-xs" style={{ color: "var(--color-text-primary)" }}>
              engine
            </span>
            <span className="text-[11px]" style={{ color: "var(--color-status-warning)" }}>
              clustering 18 findings…
            </span>
          </div>
        </div>
      </div>

      {/* Clusters table */}
      <main
        className="flex flex-1 flex-col gap-4 overflow-y-auto px-12 py-8"
        style={{ background: "var(--color-bg-canvas)" }}
      >
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
            Clusters
          </h2>
          <div className="flex-1" />
          <Chip color="var(--color-status-success)">{confirmedCount} CONFIRMED</Chip>
          <Chip color="var(--color-status-warning)">{needsCount} NEEDS-VERIFY</Chip>
          <Chip color="var(--color-text-secondary)">{unverifiedCount} UNVERIFIED</Chip>
        </div>

        <div
          className="grid items-center gap-3 rounded-md border px-4 py-2.5 text-[11px] font-semibold tracking-wider"
          style={{
            background: "var(--color-bg-surface)",
            borderColor: "var(--color-border-subtle)",
            color: "var(--color-text-tertiary)",
            gridTemplateColumns: "130px 60px 100px 1fr 110px 220px",
          }}
        >
          <span>LABEL</span>
          <span>SEV</span>
          <span>CATEGORY</span>
          <span>DESCRIPTION</span>
          <span>AGREEMENT</span>
          <span>AGENTS</span>
        </div>

        {data.clusters.map((c, i) => {
          const labelStyle = LABEL_STYLES[c.label];
          return (
            <div
              key={i}
              className="grid items-center gap-3 px-4 py-3"
              style={{
                gridTemplateColumns: "130px 60px 100px 1fr 110px 220px",
                borderBottom: "1px solid var(--color-border-subtle)",
              }}
            >
              <span
                className="inline-flex w-fit items-center rounded px-2 py-1 font-mono text-[10px] font-bold tracking-wider"
                style={{ background: labelStyle.bg, color: labelStyle.fg }}
              >
                {c.label.toUpperCase()}
              </span>
              <span
                className="inline-flex w-fit items-center rounded px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider"
                style={{ background: `var(${SEVERITY_VAR[c.severity]})`, color: "var(--color-bg-canvas)" }}
              >
                {c.severity.toUpperCase()}
              </span>
              <span className="font-mono text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                {c.category}
              </span>
              <span className="line-clamp-1 text-xs" style={{ color: "var(--color-text-primary)" }}>
                {c.description}
              </span>
              <span className="font-mono text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                {c.agreement}
              </span>
              <span className="flex flex-wrap gap-1">
                {c.agents.map((a) => (
                  <span
                    key={a}
                    className="rounded px-1.5 py-0.5 font-mono text-[9px]"
                    style={{ background: "var(--color-bg-surface)", color: "var(--color-text-secondary)" }}
                  >
                    {a}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </main>
    </>
  );
}

function Chip({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10px] font-bold"
      style={{ background: "var(--color-bg-surface)", color }}
    >
      {children}
    </span>
  );
}

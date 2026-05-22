import { MOCK_LIVE_TOURNAMENT } from "@/lib/mock-data";

export function TournamentView() {
  const data = MOCK_LIVE_TOURNAMENT;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Bracket */}
      <main
        className="relative flex-1 overflow-auto"
        style={{ background: "var(--color-bg-canvas)" }}
      >
        <div className="relative h-full min-w-[1020px] px-10 py-8">
          <Column x={0} label="ROUND 1 · 4 PARTICIPANTS" />
          <Column x={380} label="ROUND 2 · TOP 2" />
          <Column x={760} label="WINNER" />

          {/* R1 cards */}
          {data.r1.map((c, i) => (
            <ParticipantCard
              key={c.agent}
              top={60 + i * 110}
              left={20}
              agent={c.agent}
              status={c.status}
              score={c.score}
              cost={`$${c.cost_usd.toFixed(2)}`}
            />
          ))}

          {/* R2 cards */}
          {data.r2.map((c, i) => (
            <ParticipantCard
              key={c.agent}
              top={120 + i * 210}
              left={400}
              agent={c.agent}
              status={c.status}
              cost={`$${c.cost_usd.toFixed(2)}`}
            />
          ))}

          {/* Winner placeholder */}
          <ParticipantCard top={220} left={780} agent="?" status="placeholder" />

          {/* Connectors */}
          <Connector x1={300} y1={105} x2={400} y2={165} color="var(--color-status-success)" />
          <Connector x1={300} y1={215} x2={400} y2={375} color="var(--color-status-success)" />
          <Connector x1={680} y1={165} x2={780} y2={265} color="var(--color-status-warning)" />
          <Connector x1={680} y1={375} x2={780} y2={265} color="var(--color-status-warning)" />
        </div>
      </main>

      {/* Judge sidebar */}
      <aside
        className="flex w-[420px] flex-col gap-5 overflow-y-auto px-5 py-7"
        style={{ background: "var(--color-bg-surface)" }}
      >
        <h3
          className="text-[11px] font-semibold tracking-wider"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          ROUND {data.round_idx} · JUDGE SCORING
        </h3>
        <article
          className="flex flex-col gap-3 rounded-lg border px-4 py-3.5"
          style={{
            background: "var(--color-bg-raised)",
            borderColor: "var(--color-mode-tournament)",
          }}
        >
          <header className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold" style={{ color: "var(--color-text-primary)" }}>
              ⚖
            </span>
            <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Bracket judge
            </span>
            <div className="flex-1" />
            <span className="font-mono text-[11px]" style={{ color: "var(--color-status-warning)" }}>
              streaming…
            </span>
          </header>
          {data.criteria_progress.map((c) => (
            <div key={c.name} className="flex items-center gap-2">
              <span
                className="font-mono text-xs"
                style={{
                  color:
                    c.status === "done"
                      ? "var(--color-status-success)"
                      : c.status === "active"
                      ? "var(--color-status-warning)"
                      : "var(--color-text-disabled)",
                }}
              >
                {c.status === "done" ? "✓" : c.status === "active" ? "●" : "○"}
              </span>
              <span
                className="font-mono text-xs"
                style={{
                  color: c.status === "pending" ? "var(--color-text-disabled)" : "var(--color-text-primary)",
                }}
              >
                {c.name}
              </span>
              <div className="flex-1" />
              {c.result && (
                <span
                  className="font-mono text-[11px]"
                  style={{
                    color:
                      c.status === "active"
                        ? "var(--color-status-warning)"
                        : "var(--color-text-secondary)",
                  }}
                >
                  {c.result}
                </span>
              )}
            </div>
          ))}
        </article>

        <h3
          className="text-[11px] font-semibold tracking-wider"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          ELIMINATED
        </h3>
        {data.eliminated_reasons.map((e) => (
          <div
            key={e.agent}
            className="flex flex-col gap-1 rounded-md px-3 py-2.5"
            style={{ background: "var(--color-bg-raised)", opacity: 0.75 }}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold" style={{ color: "var(--color-status-error)" }}>
                ✗
              </span>
              <span className="font-mono text-xs" style={{ color: "var(--color-text-primary)" }}>
                {e.agent}
              </span>
            </div>
            <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
              {e.reason}
            </p>
          </div>
        ))}
      </aside>
    </div>
  );
}

function Column({ x, label }: { x: number; label: string }) {
  return (
    <span
      className="absolute text-[11px] font-semibold tracking-wider"
      style={{ left: x + 20, top: 32, color: "var(--color-text-tertiary)" }}
    >
      {label}
    </span>
  );
}

function ParticipantCard({
  top,
  left,
  agent,
  status,
  score,
  cost,
}: {
  top: number;
  left: number;
  agent: string;
  status: "advanced" | "eliminated" | "active" | "winner" | "placeholder";
  score?: number;
  cost?: string;
}) {
  const styles = {
    advanced: { bg: "var(--color-bg-surface)", border: "var(--color-border-default)", opacity: 1 },
    eliminated: { bg: "var(--color-bg-canvas)", border: "var(--color-border-subtle)", opacity: 0.55 },
    active: { bg: "var(--color-bg-raised)", border: "var(--color-mode-tournament)", opacity: 1 },
    winner: { bg: "var(--color-bg-raised)", border: "var(--color-status-success)", opacity: 1 },
    placeholder: { bg: "var(--color-bg-canvas)", border: "var(--color-border-subtle)", opacity: 0.6 },
  }[status];

  return (
    <article
      className="absolute flex w-[280px] flex-col gap-1.5 rounded-lg border px-3.5 py-3"
      style={{
        top,
        left,
        background: styles.bg,
        borderColor: styles.border,
        borderWidth: status === "active" || status === "winner" ? "2px" : "1px",
        opacity: styles.opacity,
        borderStyle: status === "placeholder" ? "dashed" : "solid",
      }}
    >
      <header className="flex items-center gap-2">
        <span
          className="size-2 rounded-full"
          style={{
            background:
              status === "advanced"
                ? "var(--color-status-success)"
                : status === "eliminated"
                ? "var(--color-status-error)"
                : status === "active"
                ? "var(--color-status-warning)"
                : "var(--color-text-tertiary)",
          }}
        />
        <span
          className="font-mono text-xs"
          style={{
            color: status === "eliminated" ? "var(--color-text-secondary)" : "var(--color-text-primary)",
          }}
        >
          {agent}
        </span>
        <div className="flex-1" />
        {score !== undefined && (
          <span
            className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold"
            style={{ background: "var(--color-bg-canvas)", color: "var(--color-text-primary)" }}
          >
            {score}
          </span>
        )}
      </header>
      <div className="flex items-center gap-2 text-[11px]">
        <span
          style={{
            color:
              status === "eliminated"
                ? "var(--color-status-error)"
                : status === "winner"
                ? "var(--color-status-success)"
                : status === "active"
                ? "var(--color-status-warning)"
                : status === "advanced"
                ? "var(--color-status-success)"
                : "var(--color-text-disabled)",
          }}
        >
          {status === "advanced"
            ? "✓ advanced"
            : status === "eliminated"
            ? "✗ eliminated"
            : status === "active"
            ? "● awaiting judge"
            : status === "winner"
            ? "🏆 winner"
            : "winner of R2"}
        </span>
        {cost && (
          <>
            <span style={{ color: "var(--color-text-tertiary)" }}>·</span>
            <span className="font-mono" style={{ color: "var(--color-text-tertiary)" }}>
              {cost}
            </span>
          </>
        )}
      </div>
    </article>
  );
}

function Connector({ x1, y1, x2, y2, color }: { x1: number; y1: number; x2: number; y2: number; color: string }) {
  const midX = (x1 + x2) / 2;
  const top = Math.min(y1, y2);
  const height = Math.abs(y2 - y1) || 1;
  return (
    <>
      <span
        className="absolute h-px"
        style={{ left: x1, top: y1, width: midX - x1, background: color }}
      />
      <span
        className="absolute w-px"
        style={{ left: midX, top, height, background: color }}
      />
      <span
        className="absolute h-px"
        style={{ left: midX, top: y2, width: x2 - midX, background: color }}
      />
    </>
  );
}

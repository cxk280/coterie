import { MOCK_LIVE_DEBATE } from "@/lib/mock-data";

export function DebateView() {
  const data = MOCK_LIVE_DEBATE;

  return (
    <>
      {/* Round tabs */}
      <div
        className="flex h-[60px] items-center gap-2 border-b px-6"
        style={{
          background: "var(--color-bg-surface)",
          borderColor: "var(--color-border-subtle)",
        }}
      >
        {[1, 2, 3].map((r) => {
          const status =
            r < data.rounds_completed + 1
              ? "done"
              : r === data.rounds_completed + 1
              ? "active"
              : "pending";
          return (
            <div
              key={r}
              className="flex items-center gap-2 rounded-md border px-3.5 py-2"
              style={{
                background: status === "pending" ? "var(--color-bg-canvas)" : "var(--color-bg-raised)",
                borderColor:
                  status === "active"
                    ? "var(--color-mode-debate)"
                    : status === "pending"
                    ? "var(--color-border-subtle)"
                    : "var(--color-border-default)",
                borderWidth: status === "active" ? "2px" : "1px",
              }}
            >
              <span
                className="font-mono text-xs font-bold"
                style={{
                  color:
                    status === "done"
                      ? "var(--color-status-success)"
                      : status === "active"
                      ? "var(--color-text-primary)"
                      : "var(--color-text-disabled)",
                }}
              >
                R{r}
              </span>
              <span
                className="text-xs font-medium"
                style={{
                  color:
                    status === "pending" ? "var(--color-text-disabled)" : "var(--color-text-secondary)",
                }}
              >
                {data.exchanges[r - 1]?.title ?? "future"}
              </span>
            </div>
          );
        })}
        <div className="flex-1" />
        <span className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
          {data.pro_agent} (pro) vs {data.con_agent} (con)
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Transcript */}
        <main
          className="flex flex-1 flex-col gap-6 overflow-y-auto px-12 py-7"
          style={{ background: "var(--color-bg-canvas)" }}
        >
          {data.exchanges.map((ex) => (
            <section key={ex.round} className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-bold" style={{ color: "var(--color-text-primary)" }}>
                  Round {ex.round} — {ex.title}
                </h2>
                <div className="h-px flex-1" style={{ background: "var(--color-border-subtle)" }} />
              </div>
              {ex.summary && (
                <p className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
                  {ex.summary}
                </p>
              )}

              <SpeechBubble side="pro" agent={ex.pro.agent} time={ex.pro.time}>
                {ex.pro.text}
              </SpeechBubble>

              <SpeechBubble
                side="con"
                agent={ex.con.agent}
                time={ex.con.time}
                streaming={"streaming" in ex.con && ex.con.streaming}
              >
                {ex.con.text}
              </SpeechBubble>

              {ex.moderator && (
                <div
                  className="flex flex-col gap-1 rounded-md border border-dashed px-4 py-2.5"
                  style={{ borderColor: "var(--color-border-subtle)" }}
                >
                  <span className="font-mono text-[10px] font-bold" style={{ color: "var(--color-text-tertiary)" }}>
                    ⚖ MODERATOR
                  </span>
                  <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                    {ex.moderator}
                  </p>
                </div>
              )}
            </section>
          ))}
        </main>

        {/* Sidebar */}
        <aside
          className="flex w-[420px] flex-col gap-5 overflow-y-auto px-5 py-7"
          style={{ background: "var(--color-bg-surface)" }}
        >
          <h3
            className="text-[11px] font-semibold tracking-wider"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            QUESTION
          </h3>
          <div
            className="rounded-md px-3 py-2.5 text-xs"
            style={{
              background: "var(--color-bg-raised)",
              color: "var(--color-text-primary)",
            }}
          >
            {data.task}
          </div>

          <h3
            className="text-[11px] font-semibold tracking-wider"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            STATE
          </h3>
          <div className="flex flex-col gap-1">
            <StateRow k="rounds" v={`${data.rounds_completed + 1} of ${data.rounds_total}`} />
            <StateRow k="active speaker" v="con" color="var(--color-status-error)" />
            <StateRow k="spend_usd" v={`$${data.spend_usd.toFixed(2)} / $${data.budget_usd.toFixed(2)}`} />
            <StateRow k="moderator model" v="claude-haiku" />
            <StateRow k="judge model" v="claude-opus" />
          </div>
        </aside>
      </div>
    </>
  );
}

function SpeechBubble({
  side,
  agent,
  time,
  children,
  streaming,
}: {
  side: "pro" | "con";
  agent: string;
  time: string;
  children: React.ReactNode;
  streaming?: boolean;
}) {
  const isPro = side === "pro";
  return (
    <div className={`flex items-start gap-3 ${isPro ? "flex-row" : "flex-row-reverse"}`}>
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
        className="flex max-w-[700px] flex-1 flex-col gap-2 rounded-xl px-4 py-3.5"
        style={{
          background: isPro ? "var(--color-bg-surface)" : "var(--color-bg-raised)",
          borderWidth: streaming ? "1px" : "0",
          borderColor: streaming ? "var(--color-mode-debate)" : undefined,
        }}
      >
        <div className="flex items-center gap-2 text-[11px]">
          <span
            className="font-mono font-bold"
            style={{
              color: isPro ? "var(--color-status-success)" : "var(--color-status-error)",
            }}
          >
            {side.toUpperCase()}
          </span>
          <span style={{ color: "var(--color-text-tertiary)" }}>·</span>
          <span className="font-mono" style={{ color: "var(--color-text-secondary)" }}>
            {agent}
          </span>
          <div className="flex-1" />
          <span
            className="font-mono"
            style={{
              color: streaming ? "var(--color-mode-debate)" : "var(--color-text-tertiary)",
            }}
          >
            {time}
          </span>
        </div>
        <p className="text-xs" style={{ color: "var(--color-text-primary)" }}>
          {children}
        </p>
      </div>
    </div>
  );
}

function StateRow({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="font-mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
        {k}
      </span>
      <div className="flex-1" />
      <span
        className="font-mono text-[11px]"
        style={{ color: color ?? "var(--color-text-primary)" }}
      >
        {v}
      </span>
    </div>
  );
}

import { MOCK_LIVE_SINGLE } from "@/lib/mock-data";
import { PipelineStrip } from "@/components/modes/adversarial/PipelineStrip";

const KIND_COLOR_VAR: Record<string, string> = {
  comment: "--color-text-tertiary",
  blank: "--color-text-primary",
  import: "--color-text-secondary",
  code: "--color-text-primary",
  primary: "--color-text-primary",
  secondary: "--color-text-secondary",
  tertiary: "--color-text-tertiary",
  success: "--color-status-success",
  mode: "--color-mode-single",
};

export function SingleView() {
  const data = MOCK_LIVE_SINGLE;
  return (
    <>
      <PipelineStrip nodes={data.pipeline} />

      <div className="flex flex-1 overflow-hidden">
        {/* Live output */}
        <section
          className="flex flex-1 flex-col border-r"
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
              STEP 2
            </h3>
            <span className="font-mono text-xs" style={{ color: "var(--color-text-secondary)" }}>
              · codex
            </span>
            <div className="flex-1" />
            <span className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
              Subtask:
            </span>
            <span
              className="line-clamp-1 max-w-[480px] text-xs"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {data.steps[1]}
            </span>
          </header>

          <pre
            className="flex flex-1 flex-col overflow-y-auto py-4 font-mono text-xs"
            style={{ background: "var(--color-bg-canvas)" }}
          >
            {data.agent_output.map((line) => (
              <div key={line.line} className="flex items-center gap-4 px-5 py-px">
                <span
                  className="select-none text-right tabular-nums"
                  style={{ color: "var(--color-text-disabled)", minWidth: "3ch" }}
                >
                  {line.line}
                </span>
                <span
                  style={{
                    color: `var(${KIND_COLOR_VAR[line.color ?? "primary"] ?? "--color-text-primary"})`,
                  }}
                >
                  {line.text || " "}
                </span>
              </div>
            ))}
          </pre>
        </section>

        {/* Sidebar */}
        <aside
          className="flex w-[420px] flex-col gap-5 overflow-y-auto px-5 py-5"
          style={{ background: "var(--color-bg-surface)" }}
        >
          <Section label="ROUTE HISTORY">
            {data.route_history.map((r) => (
              <div
                key={r.step}
                className="flex flex-col gap-1.5 rounded-md px-3 py-2.5"
                style={{
                  background: "var(--color-bg-raised)",
                  border: r.current ? "1px solid var(--color-mode-single)" : "none",
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
                    S{r.step}
                  </span>
                  <span className="font-mono text-xs" style={{ color: "var(--color-text-primary)" }}>
                    → {r.agent}
                  </span>
                </div>
                <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  {r.reason}
                </p>
              </div>
            ))}
          </Section>

          <Section label="PLAN (LLM-decomposed)">
            {data.steps.map((step, i) => {
              const status = data.step_status[i];
              const sym = status === "done" ? "✓" : status === "active" ? "●" : "○";
              const c =
                status === "done"
                  ? "var(--color-status-success)"
                  : status === "active"
                  ? "var(--color-status-warning)"
                  : "var(--color-text-disabled)";
              return (
                <div key={i} className="flex items-baseline gap-2 py-1">
                  <span className="font-mono text-xs" style={{ color: c }}>
                    {sym}
                  </span>
                  <span
                    className="text-xs"
                    style={{
                      color:
                        status === "pending" ? "var(--color-text-disabled)" : "var(--color-text-primary)",
                    }}
                  >
                    {i + 1}. {step}
                  </span>
                </div>
              );
            })}
          </Section>

          <Section label="STATE">
            <StateRow k="status" v="executing" />
            <StateRow k="current_step_idx" v="1" />
            <StateRow k="plan.length" v="3" />
            <StateRow k="router.strategy" v="llm" />
            <StateRow k="runs.length" v="1" />
            <StateRow k="spend_usd" v={`$${data.spend_usd.toFixed(2)} / $${data.budget_usd.toFixed(2)}`} />
          </Section>
        </aside>
      </div>
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3
        className="text-[11px] font-semibold tracking-wider"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {label}
      </h3>
      {children}
    </section>
  );
}

function StateRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="font-mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
        {k}
      </span>
      <div className="flex-1" />
      <span className="font-mono text-[11px]" style={{ color: "var(--color-text-primary)" }}>
        {v}
      </span>
    </div>
  );
}

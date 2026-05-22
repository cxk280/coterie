import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Header } from "@/components/ui/Header";
import { ModeBadge } from "@/components/ui/ModeBadge";
import { MOCK_RUN_DETAIL, RECENT_RUNS } from "@/lib/mock-data";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RunDetailPage({ params }: PageProps) {
  const { id } = await params;
  const summary = RECENT_RUNS.find((r) => r.id === id);
  if (!summary) notFound();

  // For v0, every detail page uses the same mock event timeline.
  const data = MOCK_RUN_DETAIL;
  const total = data.cost_breakdown.reduce((s, b) => s + b.value, 0);

  return (
    <div className="flex h-screen flex-col">
      <header
        className="flex h-14 items-center gap-3 border-b px-6"
        style={{
          background: "var(--color-bg-surface)",
          borderColor: "var(--color-border-subtle)",
        }}
      >
        <Link
          href={"/runs"}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium"
          style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)" }}
        >
          ‹ Runs
        </Link>

        <span className="font-mono text-base font-bold" style={{ color: "var(--color-text-primary)" }}>
          ▲
        </span>

        <ModeBadge mode={summary.mode} />

        <span
          className="line-clamp-1 max-w-[540px] text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          {summary.task}
        </span>

        <div className="flex-1" />

        <span
          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs"
          style={{
            background: "var(--color-bg-raised)",
            borderColor: "var(--color-status-success)",
            color: "var(--color-status-success)",
          }}
        >
          ✓ done
        </span>

        {summary.trace_url ? (
          <a
            href={summary.trace_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium"
            style={{
              background: "var(--color-bg-raised)",
              borderColor: "var(--color-border-default)",
              color: "var(--color-text-primary)",
            }}
            title={`trace_id: ${summary.trace_id ?? ""}`}
          >
            ↗ View in Langfuse
          </a>
        ) : (
          <Button size="sm">↗ Share</Button>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Timeline */}
        <section
          className="flex flex-1 flex-col gap-3 overflow-y-auto px-8 py-7"
          style={{ background: "var(--color-bg-canvas)" }}
        >
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>
              Timeline
            </h2>
            <div className="flex-1" />
            <span className="font-mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
              {data.events.length} events · {Math.floor(data.total_duration_s / 60)}m {data.total_duration_s % 60}s total
            </span>
          </div>

          {data.events.map((e) => (
            <article
              key={e.num}
              className="flex flex-col gap-1.5 rounded-lg border px-4 py-3"
              style={{
                background: "var(--color-bg-surface)",
                borderColor: "var(--color-border-subtle)",
              }}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="flex size-6 items-center justify-center rounded-full border font-mono text-[11px] font-bold"
                  style={{
                    background: "var(--color-bg-raised)",
                    borderColor: "var(--color-border-default)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {e.num}
                </span>
                <span
                  className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider"
                  style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)" }}
                >
                  {e.role.toUpperCase()}
                </span>
                <span className="font-mono text-xs" style={{ color: "var(--color-text-primary)" }}>
                  {e.agent}
                </span>
                <div className="flex-1" />
                <span className="font-mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {e.duration}
                </span>
                <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  ·
                </span>
                <span className="font-mono text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                  {e.cost}
                </span>
              </div>
              <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                {e.summary}
              </p>
            </article>
          ))}

          <article
            className="flex flex-col gap-2 rounded-lg border px-4 py-3.5"
            style={{
              background: "var(--color-bg-surface)",
              borderColor: "var(--color-status-success)",
            }}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-bold" style={{ color: "var(--color-status-success)" }}>
                ✓
              </span>
              <h3 className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>
                {data.outcome.title}
              </h3>
            </div>
            <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              {data.outcome.description}
            </p>
          </article>
        </section>

        {/* Cost + state sidebar */}
        <aside
          className="flex w-[440px] flex-col gap-6 overflow-y-auto px-5 py-7"
          style={{ background: "var(--color-bg-surface)" }}
        >
          <section className="flex flex-col gap-3">
            <SectionLabel>COST BREAKDOWN</SectionLabel>
            {data.cost_breakdown.map((b) => (
              <div key={b.label} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: "var(--color-text-primary)" }}>
                    {b.label}
                  </span>
                  <div className="flex-1" />
                  <span className="font-mono text-xs" style={{ color: "var(--color-text-primary)" }}>
                    ${b.value.toFixed(2)}
                  </span>
                </div>
                <div
                  className="h-1 rounded-full"
                  style={{ background: "var(--color-bg-raised)" }}
                >
                  <div
                    className="h-1 rounded-full"
                    style={{
                      width: `${(b.value / total) * 100}%`,
                      background: "var(--color-mode-adversarial)",
                    }}
                  />
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-2">
              <span className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>
                Total
              </span>
              <div className="flex-1" />
              <span className="font-mono text-base font-bold" style={{ color: "var(--color-text-primary)" }}>
                ${data.total_spend_usd.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center text-[11px]">
              <span style={{ color: "var(--color-text-tertiary)" }}>Budget</span>
              <div className="flex-1" />
              <span className="font-mono" style={{ color: "var(--color-text-secondary)" }}>
                ${data.budget_usd.toFixed(2)} ({Math.round((data.total_spend_usd / data.budget_usd) * 100)}% used)
              </span>
            </div>
          </section>

          <section className="flex flex-col gap-1">
            <SectionLabel>FINAL STATE</SectionLabel>
            {data.final_state.map(([k, val, tone]) => (
              <div key={k} className="flex items-center gap-2 py-1.5">
                <span className="font-mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {k}
                </span>
                <div className="flex-1" />
                <span
                  className="font-mono text-[11px]"
                  style={{
                    color:
                      tone === "success"
                        ? "var(--color-status-success)"
                        : tone === "warning"
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
            <SectionLabel>ACTIONS</SectionLabel>
            <Button variant="primary" modeColor={summary.mode}>
              Re-run with same config
            </Button>
            <Button>Open diff in GitHub</Button>
            <Button>Export JSONL trace</Button>
          </section>
        </aside>
      </div>
    </div>
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

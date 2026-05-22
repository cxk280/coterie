import Link from "next/link";

import { AppNav } from "@/components/ui/AppNav";
import { Button } from "@/components/ui/Button";
import { ModeBadge } from "@/components/ui/ModeBadge";
import { api, type ApiRunSummary } from "@/lib/api";
import { RECENT_RUNS, RUN_STATS } from "@/lib/mock-data";
import type { RunSummary } from "@/lib/types";

// Try the API; fall back to mock data if unreachable.
async function loadRuns(): Promise<RunSummary[]> {
  try {
    const apiRuns = await api.listRuns();
    return apiRuns.map(toRunSummary);
  } catch {
    return RECENT_RUNS;
  }
}

function toRunSummary(r: ApiRunSummary): RunSummary {
  const status: RunSummary["status"] =
    r.status === "queued" || r.status === "running" || r.status === "awaiting_human"
      ? "running"
      : r.status;
  return {
    id: r.id,
    task: r.task,
    mode: r.mode,
    agents: r.agents,
    duration_s: r.duration_s,
    cost_usd: r.spend_usd,
    status,
    status_reason: r.status_reason ?? undefined,
    when: relative(r.created_at),
  };
}

function relative(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const STATUS_COLOR = {
  done: "var(--color-status-success)",
  failed: "var(--color-status-error)",
  rejected: "var(--color-status-warning)",
  running: "var(--color-status-warning)",
} as const;

export const dynamic = "force-dynamic";

export default async function RunHistoryPage() {
  const runs = await loadRuns();
  return (
    <div className="flex h-screen flex-col">
      <AppNav active="runs" />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 overflow-y-auto px-12 py-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
            Run history
          </h1>
          <div className="flex-1" />
          <Link href="/">
            <Button size="sm">+ new run</Button>
          </Link>
        </div>

        <section className="grid grid-cols-5 gap-3">
          <StatCard label="RUNS THIS WEEK" value={String(RUN_STATS.runs_this_week)} />
          <StatCard label="AVG COST / RUN" value={`$${RUN_STATS.avg_cost_usd.toFixed(2)}`} />
          <StatCard
            label="SUCCESS RATE"
            value={`${Math.round(RUN_STATS.success_rate * 100)}%`}
            color="var(--color-status-success)"
          />
          <StatCard label="TOTAL SPEND" value={`$${RUN_STATS.total_spend_usd.toFixed(2)}`} />
          <StatCard label="AVG DURATION" value={`${RUN_STATS.avg_duration_s}s`} />
        </section>

        <section className="flex items-center gap-2">
          <FilterChip active>all {runs.length}</FilterChip>
          <FilterChip>single</FilterChip>
          <FilterChip>consensus</FilterChip>
          <FilterChip>adversarial</FilterChip>
          <FilterChip>debate</FilterChip>
          <FilterChip>tournament</FilterChip>
          <div className="flex-1" />
          <div
            className="flex w-72 items-center gap-2 rounded-md border px-3 py-1.5 text-xs"
            style={{
              background: "var(--color-bg-surface)",
              borderColor: "var(--color-border-subtle)",
              color: "var(--color-text-tertiary)",
            }}
          >
            <span>🔍</span>
            <span>search task or agent…</span>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          {runs.map((run) => (
            <Link
              key={run.id}
              href={`/runs/${run.id}`}
              className="flex items-center gap-4 rounded-lg border px-4 py-3.5 transition hover:opacity-90"
              style={{
                background: "var(--color-bg-surface)",
                borderColor: "var(--color-border-subtle)",
              }}
            >
              <span className="size-2 rounded-full" style={{ background: STATUS_COLOR[run.status] }} />

              <div className="flex w-[560px] flex-col gap-0.5">
                <span
                  className="line-clamp-1 text-sm font-medium"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {run.task}
                </span>
                {run.status_reason && (
                  <span
                    className="line-clamp-1 text-[11px]"
                    style={{
                      color:
                        run.status === "failed"
                          ? "var(--color-status-error)"
                          : run.status === "rejected"
                          ? "var(--color-status-warning)"
                          : "var(--color-text-tertiary)",
                    }}
                  >
                    {run.status_reason}
                  </span>
                )}
              </div>

              <ModeBadge mode={run.mode} size="sm" />

              <span
                className="w-40 truncate font-mono text-[11px]"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                {run.agents.join(", ")}
              </span>
              <span className="w-14 font-mono text-xs" style={{ color: "var(--color-text-secondary)" }}>
                {run.duration_s !== null
                  ? `${Math.floor(run.duration_s / 60)}m ${run.duration_s % 60}s`
                  : "—"}
              </span>
              <span className="w-16 font-mono text-xs" style={{ color: "var(--color-text-primary)" }}>
                ${run.cost_usd.toFixed(2)}
              </span>
              <span className="w-20 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                {run.when}
              </span>
              <span className="font-mono text-base" style={{ color: "var(--color-text-disabled)" }}>
                ›
              </span>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  color = "var(--color-text-primary)",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-lg border px-4 py-3.5"
      style={{
        background: "var(--color-bg-surface)",
        borderColor: "var(--color-border-subtle)",
      }}
    >
      <span
        className="text-[11px] font-medium tracking-wider"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {label}
      </span>
      <span className="font-mono text-xl font-bold" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

function FilterChip({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <span
      className="cursor-pointer rounded-md border px-2.5 py-1.5 text-xs font-medium"
      style={{
        background: active ? "var(--color-bg-raised)" : "var(--color-bg-surface)",
        borderColor: active ? "var(--color-text-secondary)" : "var(--color-border-subtle)",
        color: active ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
      }}
    >
      {children}
    </span>
  );
}

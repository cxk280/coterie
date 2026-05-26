import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { ModeBadge } from "@/components/ui/ModeBadge";
import { api, type ApiAgentRun, type ApiRunDetail } from "@/lib/api";
import type { Mode } from "@/lib/modes";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_TONE: Record<string, "success" | "warning" | "error" | "pending"> = {
  done: "success",
  failed: "error",
  rejected: "warning",
  running: "pending",
  queued: "pending",
  awaiting_human: "warning",
};
const TONE_COLOR: Record<string, string> = {
  success: "var(--color-status-success)",
  error: "var(--color-status-error)",
  warning: "var(--color-status-warning)",
  pending: "var(--color-status-pending)",
};

export default async function RunDetailPage({ params }: PageProps) {
  const { id } = await params;

  let detail: ApiRunDetail;
  try {
    detail = await api.getRun(id);
  } catch {
    notFound();
  }

  const s = detail.summary;
  const runs = (detail.runs ?? []) as unknown as ApiAgentRun[];
  const tone = STATUS_TONE[s.status] ?? "pending";
  const finalState = (detail.final_state ?? detail.current_state ?? {}) as Record<string, unknown>;

  return (
    <div className="flex h-screen flex-col">
      <header
        className="flex h-14 items-center gap-3 border-b px-4 sm:px-6"
        style={{ background: "var(--color-bg-surface)", borderColor: "var(--color-border-subtle)" }}
      >
        <Link
          href="/runs"
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium"
          style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)" }}
        >
          ‹ Runs
        </Link>
        <ModeBadge mode={s.mode as Mode} />
        <span
          className="hidden max-w-[540px] truncate text-sm font-medium sm:inline"
          style={{ color: "var(--color-text-primary)" }}
        >
          {s.task}
        </span>
        <div className="flex-1" />
        <span
          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-mono"
          style={{ background: "var(--color-bg-raised)", borderColor: TONE_COLOR[tone], color: TONE_COLOR[tone] }}
        >
          {s.status}
        </span>
        {s.status === "running" || s.status === "queued" || s.status === "awaiting_human" ? (
          <Link href={`/runs/${id}/live`}>
            <Button size="sm">● Live</Button>
          </Link>
        ) : null}
        {s.trace_url && (
          <a
            href={s.trace_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium"
            style={{ background: "var(--color-bg-raised)", borderColor: "var(--color-border-default)", color: "var(--color-text-primary)" }}
          >
            ↗ Langfuse
          </a>
        )}
      </header>

      <div className="flex flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <section
          className="flex flex-1 flex-col gap-3 px-4 py-7 sm:px-8 lg:overflow-y-auto"
          style={{ background: "var(--color-bg-canvas)" }}
        >
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>
              Agent runs
            </h2>
            <div className="flex-1" />
            <span className="font-mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
              {runs.length} run{runs.length === 1 ? "" : "s"}
            </span>
          </div>

          {runs.length === 0 ? (
            <div
              className="rounded-md border border-dashed px-4 py-8 text-center text-xs"
              style={{ borderColor: "var(--color-border-subtle)", color: "var(--color-text-tertiary)" }}
            >
              No agent runs recorded{s.status_reason ? ` — ${s.status_reason}` : "."}
            </div>
          ) : (
            runs.map((r, i) => (
              <article
                key={i}
                className="flex flex-col gap-1.5 rounded-lg border px-4 py-3"
                style={{ background: "var(--color-bg-surface)", borderColor: "var(--color-border-subtle)" }}
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <span
                    className="flex size-6 items-center justify-center rounded-full border font-mono text-[11px] font-bold"
                    style={{ background: "var(--color-bg-raised)", borderColor: "var(--color-border-default)", color: "var(--color-text-secondary)" }}
                  >
                    {i + 1}
                  </span>
                  {r.role && (
                    <span
                      className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider"
                      style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)" }}
                    >
                      {String(r.role).toUpperCase()}
                    </span>
                  )}
                  <span className="font-mono text-xs" style={{ color: "var(--color-text-primary)" }}>
                    {r.agent_id}
                  </span>
                  <div className="flex-1" />
                  {typeof r.duration_s === "number" && (
                    <span className="font-mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                      {r.duration_s.toFixed(1)}s
                    </span>
                  )}
                  {typeof r.cost_estimate_usd === "number" && (
                    <span className="font-mono text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                      ${r.cost_estimate_usd.toFixed(4)}
                    </span>
                  )}
                </div>
                {r.stdout && (
                  <pre
                    className="max-h-64 overflow-auto whitespace-pre-wrap rounded px-3 py-2 font-mono text-[11px]"
                    style={{ background: "var(--color-bg-canvas)", color: "var(--color-text-secondary)" }}
                  >
                    {r.stdout.slice(0, 4000)}
                  </pre>
                )}
              </article>
            ))
          )}
        </section>

        <aside
          className="flex w-full flex-col gap-6 border-t px-5 py-7 lg:w-[380px] lg:border-t-0 lg:overflow-y-auto"
          style={{ background: "var(--color-bg-surface)", borderColor: "var(--color-border-subtle)" }}
        >
          <section className="flex flex-col gap-1">
            <SectionLabel>RUN</SectionLabel>
            <Row k="status" v={s.status} />
            <Row k="spend" v={`$${s.spend_usd.toFixed(4)}`} />
            {typeof s.duration_s === "number" && <Row k="duration" v={`${s.duration_s.toFixed(1)}s`} />}
            <Row k="agents" v={s.agents.join(", ")} />
            <Row k="created" v={new Date(s.created_at).toLocaleString()} />
            {s.status_reason && <Row k="reason" v={s.status_reason} />}
          </section>

          {Object.keys(finalState).length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionLabel>FINAL STATE</SectionLabel>
              <pre
                className="max-h-72 overflow-auto whitespace-pre-wrap rounded px-3 py-2 font-mono text-[11px]"
                style={{ background: "var(--color-bg-canvas)", color: "var(--color-text-secondary)" }}
              >
                {JSON.stringify(finalState, null, 2).slice(0, 4000)}
              </pre>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <SectionLabel>ACTIONS</SectionLabel>
            <Link href="/">
              <Button variant="primary" modeColor={s.mode as Mode} className="w-full">
                New run
              </Button>
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
      {children}
    </h3>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className="font-mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
        {k}
      </span>
      <div className="flex-1" />
      <span className="max-w-[60%] break-words text-right font-mono text-[11px]" style={{ color: "var(--color-text-primary)" }}>
        {v}
      </span>
    </div>
  );
}

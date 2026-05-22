import { ModeBadge } from "@/components/ui/ModeBadge";
import { RECENT_RUNS } from "@/lib/mock-data";

export function LeftRail() {
  return (
    <aside
      className="flex w-[280px] flex-col gap-1 border-r px-4 py-5"
      style={{
        background: "var(--color-bg-surface)",
        borderColor: "var(--color-border-subtle)",
      }}
    >
      <h2
        className="px-1 pb-2 text-[11px] font-semibold tracking-wider"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        RECENT RUNS
      </h2>

      {RECENT_RUNS.map((run) => (
        <a
          key={run.id}
          href={`/runs/${run.id}`}
          className="flex flex-col gap-1 rounded-md px-3 py-2.5 transition hover:opacity-90"
          style={{ background: "var(--color-bg-canvas)" }}
        >
          <span
            className="line-clamp-1 text-sm font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            {run.task}
          </span>
          <div className="flex items-center gap-2">
            <ModeBadge mode={run.mode} size="sm" />
            <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
              · {run.when} ·
            </span>
            <span
              className="font-mono text-[11px]"
              style={{
                color:
                  run.status === "done"
                    ? "var(--color-status-success)"
                    : run.status === "failed"
                    ? "var(--color-status-error)"
                    : "var(--color-status-warning)",
              }}
            >
              {run.status === "done" ? "✓" : run.status === "failed" ? "✗" : "●"}
            </span>
          </div>
        </a>
      ))}

      <button
        type="button"
        className="mt-3 rounded-md border px-3 py-2.5 text-sm font-medium transition hover:opacity-90"
        style={{
          background: "var(--color-bg-raised)",
          borderColor: "var(--color-border-default)",
          color: "var(--color-text-secondary)",
        }}
      >
        + new run
      </button>
    </aside>
  );
}

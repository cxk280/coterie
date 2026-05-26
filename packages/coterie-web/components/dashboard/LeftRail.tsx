import { ModeBadge } from "@/components/ui/ModeBadge";
import { api, type ApiRunSummary } from "@/lib/api";

async function recentRuns(): Promise<ApiRunSummary[]> {
  try {
    return (await api.listRuns({ limit: 8 })).items;
  } catch {
    return []; // API unreachable — render the empty state rather than 500.
  }
}

function relative(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function statusGlyph(status: string): { glyph: string; color: string } {
  if (status === "done") return { glyph: "✓", color: "var(--color-status-success)" };
  if (status === "failed" || status === "rejected") return { glyph: "✗", color: "var(--color-status-error)" };
  return { glyph: "●", color: "var(--color-status-warning)" };
}

export async function LeftRail() {
  const runs = await recentRuns();

  return (
    <aside
      className="hidden w-[280px] flex-col gap-1 overflow-y-auto border-r px-4 py-5 md:flex"
      style={{ background: "var(--color-bg-surface)", borderColor: "var(--color-border-subtle)" }}
    >
      <h2 className="px-1 pb-2 text-[11px] font-semibold tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
        RECENT RUNS
      </h2>

      {runs.length === 0 ? (
        <p className="px-1 text-xs" style={{ color: "var(--color-text-tertiary)" }}>
          No runs yet — start one on the right.
        </p>
      ) : (
        runs.map((run) => {
          const sg = statusGlyph(run.status);
          return (
            <a
              key={run.id}
              href={`/runs/${run.id}`}
              className="flex flex-col gap-1 rounded-md px-3 py-2.5 transition hover:opacity-90"
              style={{ background: "var(--color-bg-canvas)" }}
            >
              <span className="line-clamp-1 text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                {run.task}
              </span>
              <div className="flex items-center gap-2">
                <ModeBadge mode={run.mode} size="sm" />
                <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  · {relative(run.created_at)} ·
                </span>
                <span className="font-mono text-[11px]" style={{ color: sg.color }}>
                  {sg.glyph}
                </span>
              </div>
            </a>
          );
        })
      )}
    </aside>
  );
}

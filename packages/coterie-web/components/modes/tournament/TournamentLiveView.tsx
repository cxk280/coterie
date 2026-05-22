"use client";

import type { LiveBodyProps } from "@/lib/live-types";

export function TournamentLiveView({ state }: LiveBodyProps) {
  const ms = state.mode_state as Record<string, any>;
  const ranking = (ms.bracket_ranking as any[]) ?? [];
  const eliminated = (ms.eliminated_participants as string[]) ?? [];
  const survivors = (ms.survivors as string[]) ?? [];
  const winner = ms.winner as string | undefined;

  return (
    <main className="flex flex-1 flex-col gap-6 overflow-y-auto px-12 py-8" style={{ background: "var(--color-bg-canvas)" }}>
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
          Tournament
        </h2>
        <div className="flex-1" />
        <span className="font-mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
          round {ms.tournament_round_idx ?? 0} · {state.status}
        </span>
      </div>

      {winner && (
        <div
          className="rounded-md border px-4 py-3"
          style={{ background: "var(--color-bg-surface)", borderColor: "var(--color-status-success)" }}
        >
          <h3 className="text-sm font-bold" style={{ color: "var(--color-status-success)" }}>
            🏆 Winner: {winner}
          </h3>
          {ms.bracket_summary && (
            <p className="mt-1 text-xs" style={{ color: "var(--color-text-secondary)" }}>
              {ms.bracket_summary as string}
            </p>
          )}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h3
          className="text-[11px] font-semibold tracking-wider"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          PARTICIPANTS
        </h3>
        {ranking.length > 0
          ? ranking.map((r) => (
              <ParticipantRow
                key={r.agent_id}
                agent={r.agent_id as string}
                score={r.score as number | undefined}
                reason={r.reason as string | undefined}
                isEliminated={eliminated.includes(r.agent_id)}
                isWinner={winner === r.agent_id}
                isSurvivor={survivors.includes(r.agent_id)}
              />
            ))
          : (state.runs as any[])
              .filter((r) => r.role === "tournament-participant")
              .map((r) => (
                <ParticipantRow
                  key={r.agent_id}
                  agent={r.agent_id as string}
                  cost={r.cost_estimate_usd as number | undefined}
                  isEliminated={eliminated.includes(r.agent_id)}
                  isWinner={winner === r.agent_id}
                  isSurvivor={survivors.includes(r.agent_id)}
                />
              ))}
      </section>
    </main>
  );
}

function ParticipantRow({
  agent,
  score,
  cost,
  reason,
  isEliminated,
  isWinner,
  isSurvivor,
}: {
  agent: string;
  score?: number;
  cost?: number;
  reason?: string;
  isEliminated: boolean;
  isWinner: boolean;
  isSurvivor: boolean;
}) {
  return (
    <article
      className="flex flex-col gap-1 rounded-md border px-4 py-3"
      style={{
        background: isWinner ? "var(--color-bg-raised)" : "var(--color-bg-surface)",
        borderColor: isWinner
          ? "var(--color-status-success)"
          : isEliminated
          ? "var(--color-border-subtle)"
          : "var(--color-border-default)",
        opacity: isEliminated && !isWinner ? 0.6 : 1,
      }}
    >
      <header className="flex items-center gap-2">
        <span
          className="size-2 rounded-full"
          style={{
            background: isWinner
              ? "var(--color-status-success)"
              : isEliminated
              ? "var(--color-status-error)"
              : isSurvivor
              ? "var(--color-status-warning)"
              : "var(--color-text-tertiary)",
          }}
        />
        <span className="font-mono text-sm" style={{ color: "var(--color-text-primary)" }}>
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
        {cost !== undefined && (
          <span className="font-mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            ${cost.toFixed(2)}
          </span>
        )}
      </header>
      {reason && (
        <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
          {reason}
        </p>
      )}
    </article>
  );
}

import Link from "next/link";

import { Header } from "@/components/ui/Header";
import { LeftRail } from "@/components/dashboard/LeftRail";
import { ModeGrid } from "@/components/dashboard/ModeGrid";
import { AgentCard } from "@/components/dashboard/AgentCard";
import { RunButton } from "@/components/dashboard/RunButton";
import { Button } from "@/components/ui/Button";

export default function DashboardPage() {
  return (
    <div className="flex h-screen flex-col">
      <Header
        rightActions={
          <>
            <span
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1"
              style={{ background: "var(--color-bg-raised)" }}
            >
              <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                spend
              </span>
              <span className="font-mono text-xs" style={{ color: "var(--color-text-primary)" }}>
                $0.00
              </span>
            </span>
            <Button size="sm" variant="secondary">
              ⚙ settings
            </Button>
          </>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        <LeftRail />

        <main className="flex flex-1 flex-col gap-8 overflow-y-auto px-14 py-12">
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
            New run
          </h1>

          {/* Task input */}
          <section className="flex flex-col gap-2">
            <Label>TASK</Label>
            <div
              className="rounded-lg border px-4 py-3.5"
              style={{
                background: "var(--color-bg-surface)",
                borderColor: "var(--color-border-default)",
              }}
            >
              <p style={{ color: "var(--color-text-primary)" }}>
                Refactor src/auth.ts to remove the legacy session middleware. Preserve the public
                API and add tests for the new code path.
              </p>
            </div>
          </section>

          {/* Mode picker */}
          <section className="flex flex-col gap-3">
            <Label>MODE</Label>
            <ModeGrid />
          </section>

          {/* Agents */}
          <section className="flex flex-col gap-3">
            <Label>AGENTS</Label>
            <div className="grid grid-cols-3 gap-3">
              <AgentCard
                agentId="claude-code"
                role="implementer"
                adapter="claude-code"
                strengths={["planning", "refactor"]}
                modeColor="adversarial"
              />
              <AgentCard
                agentId="codex"
                role="auditor"
                adapter="codex"
                strengths={["adversarial-review", "edge-cases"]}
                modeColor="adversarial"
              />
              <button
                type="button"
                className="rounded-lg border border-dashed px-4 py-12 text-sm font-medium transition hover:opacity-90"
                style={{
                  borderColor: "var(--color-border-subtle)",
                  color: "var(--color-text-tertiary)",
                }}
              >
                + add agent
              </button>
            </div>
          </section>

          {/* Advanced */}
          <details
            className="rounded-lg border"
            open
            style={{
              background: "var(--color-bg-surface)",
              borderColor: "var(--color-border-default)",
            }}
          >
            <summary
              className="cursor-pointer list-none px-4 py-3 text-sm font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              Advanced
            </summary>
            <div className="grid gap-2.5 px-4 pb-4 text-sm">
              <AdvancedRow label="max_rounds" value="3" />
              <AdvancedRow label="sustain_threshold" value="medium" mono={false} />
              <AdvancedRow label="budget.max_usd_per_task" value="$5.00" />
              <AdvancedRow label="checkpoints" value="before_judge, before_git_commit" mono={false} />
              <AdvancedRow label="workdir" value="~/code/coterie" />
            </div>
          </details>

          {/* Actions */}
          <div className="flex justify-end gap-3 pb-12">
            <Link href="/runs">
              <Button>Cancel</Button>
            </Link>
            <RunButton
              task="Refactor src/auth.ts to remove the legacy session middleware. Preserve the public API and add tests for the new code path."
              mode="adversarial"
              config={{
                version: 1,
                agents: [
                  { id: "claude-code", adapter: "claude-code", strengths: ["planning", "refactor"] },
                  { id: "codex", adapter: "codex", strengths: ["adversarial-review", "edge-cases"] },
                ],
                adversarial: {
                  implementer: "claude-code",
                  auditor: "codex",
                  judge: { model: "claude-opus-4-7", sustain_threshold: "medium" },
                  max_rounds: 3,
                },
                budget: { max_usd_per_task: 5.0 },
              }}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-[12px] font-medium tracking-wider"
      style={{ color: "var(--color-text-tertiary)" }}
    >
      {children}
    </h2>
  );
}

function AdvancedRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-3 border-t py-2.5 first:border-t-0 first:pt-0"
      style={{ borderColor: "var(--color-border-subtle)" }}>
      <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
      <div className="flex-1" />
      <span
        className={mono ? "font-mono" : "font-medium"}
        style={{ color: "var(--color-text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}

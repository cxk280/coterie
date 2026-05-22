import { notFound } from "next/navigation";

import { AuditorPanel } from "@/components/modes/adversarial/AuditorPanel";
import { ImplementerPanel } from "@/components/modes/adversarial/ImplementerPanel";
import { InspectorPanel } from "@/components/modes/adversarial/InspectorPanel";
import { PipelineStrip } from "@/components/modes/adversarial/PipelineStrip";
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/ui/Header";
import { MOCK_LIVE_ADVERSARIAL } from "@/lib/mock-data";
import { MODE_LIST, type Mode } from "@/lib/modes";

interface PageProps {
  params: Promise<{ mode: Mode }>;
}

export default async function LiveRunPage({ params }: PageProps) {
  const { mode } = await params;
  if (!MODE_LIST.includes(mode)) notFound();

  // v0 ships only the adversarial live view. Other modes redirect to a placeholder.
  if (mode !== "adversarial") {
    return (
      <div className="flex h-screen flex-col">
        <Header
          mode={mode}
          runTitle="Live view not implemented yet for this mode"
          status={{ dotColor: "pending", label: "stub" }}
        />
        <main className="flex flex-1 items-center justify-center text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Phase 2 mock exists in Figma — implementation lands in the next iteration.
        </main>
      </div>
    );
  }

  const data = MOCK_LIVE_ADVERSARIAL;

  return (
    <div className="flex h-screen flex-col">
      <Header
        mode="adversarial"
        runTitle={data.task}
        status={{ dotColor: "warning", label: `${data.status} · round ${data.round_idx} of ${data.max_rounds}` }}
        spend={{ current: data.spend_usd, cap: data.budget_usd }}
        rightActions={
          <Button variant="danger" size="sm">
            ■ abort
          </Button>
        }
      />

      <PipelineStrip nodes={data.pipeline} />

      <div className="flex flex-1 overflow-hidden">
        <ImplementerPanel
          agentId={data.implementer.agent_id}
          durationS={data.implementer.duration_s}
          costUsd={data.implementer.cost_usd}
          round={data.round_idx}
          status={data.implementer.status}
          output={data.implementer.output}
        />
        <AuditorPanel
          agentId={data.auditor.agent_id}
          streaming={data.auditor.streaming}
          findingsSoFar={data.auditor.findings_so_far}
          findings={data.auditor.findings}
          round={data.round_idx}
        />
        <InspectorPanel
          verdicts={data.round_verdicts}
          state={[
            ["status", data.status],
            ["round_idx", String(data.round_idx)],
            ["max_rounds", String(data.max_rounds)],
            ["sustain_threshold", "medium"],
            ["findings (this round)", String(data.auditor.findings_so_far), "warning"],
            ["sustained (last round)", "1", "warning"],
            ["spend_usd", `$${data.spend_usd.toFixed(2)} / $${data.budget_usd.toFixed(2)}`],
            ["runs.length", "5"],
          ]}
          checkpoints={data.checkpoints}
        />
      </div>
    </div>
  );
}

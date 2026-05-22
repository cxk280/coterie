import { notFound } from "next/navigation";

import { AuditorPanel } from "@/components/modes/adversarial/AuditorPanel";
import { ImplementerPanel } from "@/components/modes/adversarial/ImplementerPanel";
import { InspectorPanel } from "@/components/modes/adversarial/InspectorPanel";
import { PipelineStrip } from "@/components/modes/adversarial/PipelineStrip";
import { ConsensusView } from "@/components/modes/consensus/ConsensusView";
import { DebateView } from "@/components/modes/debate/DebateView";
import { SingleView } from "@/components/modes/single/SingleView";
import { TournamentView } from "@/components/modes/tournament/TournamentView";
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/ui/Header";
import {
  MOCK_LIVE_ADVERSARIAL,
  MOCK_LIVE_CONSENSUS,
  MOCK_LIVE_DEBATE,
  MOCK_LIVE_SINGLE,
  MOCK_LIVE_TOURNAMENT,
} from "@/lib/mock-data";
import { MODE_LIST, type Mode } from "@/lib/modes";

interface PageProps {
  params: Promise<{ mode: Mode }>;
}

const HEADERS: Record<Mode, { title: string; status: { dotColor: "warning" | "success" | "error" | "pending"; label: string }; spend: { current: number; cap: number } }> = {
  single: {
    title: MOCK_LIVE_SINGLE.task,
    status: { dotColor: "warning", label: `${MOCK_LIVE_SINGLE.status} · step ${MOCK_LIVE_SINGLE.step_idx + 1} of ${MOCK_LIVE_SINGLE.steps.length}` },
    spend: { current: MOCK_LIVE_SINGLE.spend_usd, cap: MOCK_LIVE_SINGLE.budget_usd },
  },
  consensus: {
    title: MOCK_LIVE_CONSENSUS.task,
    status: { dotColor: "warning", label: `${MOCK_LIVE_CONSENSUS.status} · engine running` },
    spend: { current: MOCK_LIVE_CONSENSUS.spend_usd, cap: MOCK_LIVE_CONSENSUS.budget_usd },
  },
  adversarial: {
    title: MOCK_LIVE_ADVERSARIAL.task,
    status: { dotColor: "warning", label: `${MOCK_LIVE_ADVERSARIAL.status} · round ${MOCK_LIVE_ADVERSARIAL.round_idx} of ${MOCK_LIVE_ADVERSARIAL.max_rounds}` },
    spend: { current: MOCK_LIVE_ADVERSARIAL.spend_usd, cap: MOCK_LIVE_ADVERSARIAL.budget_usd },
  },
  debate: {
    title: MOCK_LIVE_DEBATE.task,
    status: { dotColor: "warning", label: `${MOCK_LIVE_DEBATE.status} · round ${MOCK_LIVE_DEBATE.rounds_completed + 1} of ${MOCK_LIVE_DEBATE.rounds_total} · ${MOCK_LIVE_DEBATE.active_speaker}` },
    spend: { current: MOCK_LIVE_DEBATE.spend_usd, cap: MOCK_LIVE_DEBATE.budget_usd },
  },
  tournament: {
    title: MOCK_LIVE_TOURNAMENT.task,
    status: { dotColor: "warning", label: `${MOCK_LIVE_TOURNAMENT.status} · round ${MOCK_LIVE_TOURNAMENT.round_idx} of ${MOCK_LIVE_TOURNAMENT.total_rounds}` },
    spend: { current: MOCK_LIVE_TOURNAMENT.spend_usd, cap: MOCK_LIVE_TOURNAMENT.budget_usd },
  },
};

export default async function LiveRunPage({ params }: PageProps) {
  const { mode } = await params;
  if (!MODE_LIST.includes(mode)) notFound();
  const ctx = HEADERS[mode];

  return (
    <div className="flex h-screen flex-col">
      <Header
        mode={mode}
        runTitle={ctx.title}
        status={ctx.status}
        spend={ctx.spend}
        rightActions={
          <Button variant="danger" size="sm">
            ■ abort
          </Button>
        }
      />

      {mode === "adversarial" && <AdversarialBody />}
      {mode === "single" && <SingleView />}
      {mode === "consensus" && <ConsensusView />}
      {mode === "debate" && <DebateView />}
      {mode === "tournament" && <TournamentView />}
    </div>
  );
}

function AdversarialBody() {
  const data = MOCK_LIVE_ADVERSARIAL;
  return (
    <>
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
    </>
  );
}

"use client";

import { useMemo, useState } from "react";

import type { ApiRunDetail } from "@/lib/api";
import { useLiveRunState } from "@/lib/live-state";

import { HilModal } from "@/components/ui/HilModal";
import { AdversarialLiveView } from "@/components/modes/adversarial/AdversarialLiveView";
import { ConsensusLiveView } from "@/components/modes/consensus/ConsensusLiveView";
import { DebateLiveView } from "@/components/modes/debate/DebateLiveView";
import { SingleLiveView } from "@/components/modes/single/SingleLiveView";
import { TournamentLiveView } from "@/components/modes/tournament/TournamentLiveView";

interface LiveRunViewProps {
  runId: string;
  initial: ApiRunDetail;
}

export function LiveRunView({ runId, initial }: LiveRunViewProps) {
  const { state, events } = useLiveRunState(runId, initial);
  const [hilDismissed, setHilDismissed] = useState(false);

  const lastRunEvent = useMemo(
    () => [...events].reverse().find((e) => e.kind === "agent_run"),
    [events],
  );

  const Body = pickBody(state.mode);

  return (
    <>
      <Body state={state} runId={runId} initial={initial} events={events} />

      {state.paused_at && state.paused_at.length > 0 && !hilDismissed && (
        <HilModal
          runId={runId}
          nextNodes={state.paused_at}
          preview={{
            lastAgentId: lastRunEvent?.data.agent_id as string | undefined,
            lastRole: lastRunEvent?.data.role as string | undefined,
            lastPreview: lastRunEvent?.data.stdout_preview as string | undefined,
            spend: state.spend_usd,
          }}
          onResolved={() => setHilDismissed(true)}
        />
      )}
    </>
  );
}

function pickBody(mode: ReturnType<typeof useLiveRunState>["state"]["mode"]) {
  switch (mode) {
    case "adversarial":
      return AdversarialLiveView;
    case "consensus":
      return ConsensusLiveView;
    case "debate":
      return DebateLiveView;
    case "single":
      return SingleLiveView;
    case "tournament":
      return TournamentLiveView;
    default:
      return AdversarialLiveView;
  }
}

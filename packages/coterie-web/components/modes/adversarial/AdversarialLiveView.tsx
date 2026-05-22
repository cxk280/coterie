"use client";

import { useMemo } from "react";

import { AuditorPanel } from "./AuditorPanel";
import { ImplementerPanel } from "./ImplementerPanel";
import { InspectorPanel } from "./InspectorPanel";
import { PipelineStrip } from "./PipelineStrip";
import type { LiveBodyProps } from "@/lib/live-types";

const CODE_LINE_PROMPTS_TO_KIND: Array<[RegExp, string]> = [
  [/^\s*\/\//, "comment"],
  [/^\s*import /, "import"],
];

export function AdversarialLiveView({ state }: LiveBodyProps) {
  const runs = state.runs as Array<Record<string, any>>;
  const lastImpl = useMemo(
    () => [...runs].reverse().find((r) => r.role === "implementer"),
    [runs],
  );
  const lastAuditor = useMemo(
    () => [...runs].reverse().find((r) => r.role === "auditor"),
    [runs],
  );

  const ms = state.mode_state as Record<string, any>;
  const auditorFindings = (ms.auditor_findings as any[]) ?? [];
  const sustained = (ms.sustained_findings as any[]) ?? [];
  const roundIdx = (ms.round_idx as number) ?? 0;

  const verdicts = (state.judge_history as any[]).map((j, i) => ({
    round: (j.step ?? i) + 1,
    verdict:
      j.scores?.sustained_count > 0
        ? ("revise" as const)
        : j.winner === "implementer"
        ? ("accept" as const)
        : ("revise" as const),
    reason: j.reason ?? null,
    scores_summary: `sustained ${j.scores?.sustained_count ?? 0}`,
  }));

  const pipeline = buildPipeline(state.status, roundIdx, runs.length);

  return (
    <>
      <PipelineStrip nodes={pipeline} />
      <div className="flex flex-1 overflow-hidden">
        <ImplementerPanel
          agentId={(lastImpl?.agent_id as string) ?? "—"}
          durationS={(lastImpl?.duration_s as number) ?? 0}
          costUsd={(lastImpl?.cost_estimate_usd as number) ?? 0}
          round={Math.max(roundIdx, 1)}
          status={lastImpl ? "done" : "active"}
          output={parseCodeLines((lastImpl?.stdout as string) ?? (lastImpl?.stdout_preview as string) ?? "")}
        />
        <AuditorPanel
          agentId={(lastAuditor?.agent_id as string) ?? "—"}
          streaming={state.status === "auditing"}
          findingsSoFar={auditorFindings.length}
          findings={auditorFindings}
          round={Math.max(roundIdx, 1)}
        />
        <InspectorPanel
          verdicts={verdicts.length > 0 ? verdicts : [{ round: 1, verdict: "pending", reason: null, scores_summary: "waiting" }]}
          state={[
            ["status", state.status],
            ["round_idx", String(roundIdx)],
            ["sustained_findings", String(sustained.length), sustained.length ? "warning" : undefined],
            ["spend_usd", `$${state.spend_usd.toFixed(4)}`],
            ["runs.length", String(runs.length)],
          ]}
          checkpoints={{}}
        />
      </div>
    </>
  );
}

function buildPipeline(status: string, roundIdx: number, runsLen: number) {
  const nodes: Array<{ id: string; label: string; status: "done" | "active" | "pending"; sub?: string }> = [
    { id: "planner", label: "planner", status: "done" },
  ];
  for (let r = 1; r <= Math.max(1, roundIdx + 1); r++) {
    const implIdx = (r - 1) * 3 + 1;
    const audIdx = (r - 1) * 3 + 2;
    const judgeIdx = (r - 1) * 3 + 3;
    nodes.push({
      id: `implementer-r${r}`,
      label: "implementer",
      status: runsLen >= implIdx ? "done" : status === "executing" ? "active" : "pending",
      sub: `r${r}`,
    });
    nodes.push({
      id: `auditor-r${r}`,
      label: "auditor",
      status:
        runsLen >= audIdx
          ? "done"
          : status === "auditing"
          ? "active"
          : "pending",
      sub: `r${r}`,
    });
    nodes.push({
      id: `judge-r${r}`,
      label: "judge",
      status:
        runsLen > audIdx && r <= roundIdx
          ? "done"
          : status === "judging"
          ? "active"
          : "pending",
      sub: `r${r}`,
    });
    if (r > roundIdx) break;
  }
  return nodes;
}

function parseCodeLines(stdout: string) {
  if (!stdout) return [{ line: 1, text: "(no output yet)", kind: "comment" }];
  return stdout.split("\n").slice(0, 200).map((line, i) => ({
    line: i + 1,
    text: line || " ",
    kind: detectKind(line),
  }));
}

function detectKind(line: string): string {
  for (const [re, kind] of CODE_LINE_PROMPTS_TO_KIND) {
    if (re.test(line)) return kind;
  }
  return line.trim() === "" ? "blank" : "code";
}

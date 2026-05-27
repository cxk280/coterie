import { parseJsonLoose } from "../core/json.js";
import type { LLMClient } from "../core/llm/base.js";
import type { CoterieState } from "../core/state.js";
import { parseFindings } from "./auditor.js";

const ENGINE_SYSTEM = `You cluster code-review findings into groups of semantically equivalent items.
Input: a JSON array of findings, each with an \`agent_id\` field identifying which agent produced it.
Output: a JSON array of clusters. Each cluster:
{
  "description": "<canonical phrasing>",
  "category": "<most common category>",
  "severity": "<highest severity in cluster>",
  "supporting_agents": ["<agent_id>", ...],
  "member_indices": [<int>, ...]
}

Two findings belong in the same cluster when they identify the same defect, even if
worded differently. Be strict — do not merge unrelated findings just because they share a category.
Return only the JSON array, no prose, no markdown.`;

export function makeConsensusEngineNode(llm: LLMClient | null) {
  return async (state: CoterieState) => {
    const cfg = state.config;
    const consCfg = cfg.consensus ?? {};
    const engineCfg = consCfg.engine ?? {};
    // `consensus.threshold` is the documented key; `engine.confirm_threshold` is
    // an older alias. Honor either (threshold wins) before falling back.
    const threshold = consCfg.threshold ?? engineCfg.confirm_threshold ?? 0.5;
    const participants = (consCfg.participants ?? (cfg.agents as any[]).map((a: any) => a.id)) as string[];
    const n = participants.length;

    const flat: any[] = [];
    for (const run of state.runs ?? []) {
      if (run.role !== "consensus-participant" || !participants.includes(run.agent_id)) continue;
      for (const f of parseFindings(run.stdout)) {
        if (f && typeof f === "object" && typeof f.description === "string") {
          flat.push({ ...f, agent_id: run.agent_id });
        }
      }
    }

    if (flat.length === 0) {
      return {
        mode_state: { ...(state.mode_state ?? {}), consensus_findings: [] },
        status: "done" as const,
      };
    }

    let clusters: any[];
    if (!llm) {
      clusters = flat.map((f, i) => ({
        description: f.description,
        category: f.category ?? "unknown",
        severity: f.severity ?? "low",
        supporting_agents: [f.agent_id],
        member_indices: [i],
      }));
    } else {
      const raw = await llm.chat(ENGINE_SYSTEM, [
        { role: "user", content: `Cluster these findings:\n${JSON.stringify(flat)}` },
      ]);
      const parsed = parseJsonLoose(raw);
      if (Array.isArray(parsed)) {
        clusters = parsed;
      } else {
        clusters = flat.map((f, i) => ({
          description: f.description,
          category: f.category ?? "unknown",
          severity: f.severity ?? "low",
          supporting_agents: [f.agent_id],
          member_indices: [i],
        }));
      }
    }

    const consensus = clusters.map((c) => {
      // Intersect with the real participant set: a hallucinated/duplicate agent id
      // must not inflate agreement (ratio could otherwise exceed 1.0).
      const supporters = [...new Set<string>(c.supporting_agents ?? [])].filter((s) =>
        participants.includes(s),
      );
      const ratio = supporters.length / Math.max(n, 1);
      const label =
        supporters.length <= 1 ? "unverified" : ratio >= threshold ? "confirmed" : "needs-verification";
      return {
        description: c.description ?? "",
        category: c.category ?? "unknown",
        severity: c.severity ?? "low",
        agreement_count: supporters.length,
        agreement_ratio: ratio,
        participant_count: n,
        label,
        supporting_agents: supporters,
      };
    });

    return {
      mode_state: { ...(state.mode_state ?? {}), consensus_findings: consensus },
      status: "done" as const,
    };
  };
}

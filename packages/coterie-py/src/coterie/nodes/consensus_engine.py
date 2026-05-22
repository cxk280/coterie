"""Consensus engine node for `consensus` mode.

N participant agents independently report findings. The engine clusters
semantically equivalent findings (via an LLM) and labels each cluster by
agreement ratio:

- `confirmed`        — agreement_ratio >= confirm_threshold
- `needs-verification` — agreement_count >= 2 but below threshold
- `unverified`       — single agent only
"""

import json
from typing import Any

from coterie.core.llm.base import LLMClient
from coterie.core.state import CoterieState
from coterie.nodes.auditor import parse_findings_from_output

ENGINE_SYSTEM = """You cluster code-review findings into groups of semantically equivalent items.
Input: a JSON array of findings, each with an `agent_id` field identifying which agent produced it.
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
Return only the JSON array, no prose, no markdown.
"""


def make_consensus_engine_node(llm: LLMClient | None = None):
    def engine(state: CoterieState) -> dict[str, Any]:
        cfg = state["config"]
        cons_cfg = cfg.get("consensus") or {}
        engine_cfg = cons_cfg.get("engine") or {}
        threshold = engine_cfg.get("confirm_threshold", 0.5)
        participants = cons_cfg.get("participants") or [a["id"] for a in cfg["agents"]]
        n_participants = len(participants)

        flat: list[dict] = []
        for run in state.get("runs") or []:
            if run.get("role") != "consensus-participant" or run["agent_id"] not in participants:
                continue
            for f in parse_findings_from_output(run.get("stdout", "")):
                if isinstance(f, dict) and "description" in f:
                    flat.append({**f, "agent_id": run["agent_id"]})

        if not flat:
            return {
                "mode_state": {**(state.get("mode_state") or {}), "consensus_findings": []},
                "status": "done",
            }

        if llm is None:
            # No engine LLM — fall back to one-cluster-per-finding (no merging).
            clusters = [
                {
                    "description": f["description"],
                    "category": f.get("category", "unknown"),
                    "severity": f.get("severity", "low"),
                    "supporting_agents": [f["agent_id"]],
                    "member_indices": [i],
                }
                for i, f in enumerate(flat)
            ]
        else:
            raw = llm.chat(ENGINE_SYSTEM, [{"role": "user", "content": f"Cluster these findings:\n{json.dumps(flat)}"}])
            try:
                clusters = json.loads(raw.strip().lstrip("`").rstrip("`"))
                if not isinstance(clusters, list):
                    raise ValueError("not a list")
            except (json.JSONDecodeError, ValueError):
                clusters = [
                    {
                        "description": f["description"],
                        "category": f.get("category", "unknown"),
                        "severity": f.get("severity", "low"),
                        "supporting_agents": [f["agent_id"]],
                        "member_indices": [i],
                    }
                    for i, f in enumerate(flat)
                ]

        consensus: list[dict] = []
        for c in clusters:
            supporters = list(set(c.get("supporting_agents", [])))
            ratio = len(supporters) / max(n_participants, 1)
            # A single supporter is never `confirmed`, regardless of threshold.
            # Multiple supporters can be `confirmed` (above threshold) or
            # `needs-verification` (below).
            if len(supporters) <= 1:
                label = "unverified"
            elif ratio >= threshold:
                label = "confirmed"
            else:
                label = "needs-verification"
            consensus.append(
                {
                    "description": c.get("description", ""),
                    "category": c.get("category", "unknown"),
                    "severity": c.get("severity", "low"),
                    "agreement_count": len(supporters),
                    "agreement_ratio": ratio,
                    "label": label,
                    "supporting_agents": supporters,
                }
            )

        return {
            "mode_state": {**(state.get("mode_state") or {}), "consensus_findings": consensus},
            "status": "done",
        }

    return engine

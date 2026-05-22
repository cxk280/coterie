import type { LLMClient } from "../core/llm/base.js";
import type { CoterieState } from "../core/state.js";

const SUPERVISOR_SYSTEM = `You route coding subtasks to specialist CLI agents.
Pick the best agent for the given subtask based on each agent's stated strengths.
Be decisive. Return strict JSON only — no prose, no markdown.

Output schema: {"agent_id": "<one of the provided agent ids>", "reason": "<one sentence>"}`;

function formatAgents(agents: any[]): string {
  return agents
    .map((a) => `- ${a.id} (adapter=${a.adapter}, strengths=${JSON.stringify(a.strengths ?? [])})`)
    .join("\n");
}

export function makeSupervisorNode(llm: LLMClient | null) {
  return async (state: CoterieState) => {
    if (state.status === "failed" || state.status === "awaiting_human") return {};
    const plan = state.plan ?? [];
    const idx = state.current_step_idx ?? 0;
    if (idx >= plan.length) {
      return { status: "done" as const, next_agent: null };
    }
    const cfg = state.config;
    const agents = cfg.agents as any[];
    const subtask = plan[idx];
    const routerCfg = cfg.router ?? {};
    const strategy = routerCfg.strategy ?? "llm";
    const enabled = routerCfg.enabled !== false;

    if (!enabled || strategy === "round-robin") {
      const chosen = agents[idx % agents.length];
      return {
        next_agent: chosen.id,
        route_history: [{ step: idx, agent_id: chosen.id, reason: "round-robin", strategy: enabled ? "round-robin" : "disabled" }],
        status: "executing" as const,
      };
    }

    if (!llm) throw new Error("supervisor with strategy='llm' requires an LLMClient");

    const prompt = `Task: ${state.task}\nSubtask: ${subtask}\n\nAvailable agents:\n${formatAgents(agents)}`;
    const raw = await llm.chat(SUPERVISOR_SYSTEM, [{ role: "user", content: prompt }]);
    let agentId: string;
    let reason: string;
    try {
      const decision = JSON.parse(raw);
      agentId = decision.agent_id;
      reason = decision.reason ?? "";
    } catch {
      agentId = agents[0].id;
      reason = `router output unparseable: ${raw.slice(0, 120)}`;
    }
    if (!agents.find((a) => a.id === agentId)) {
      agentId = agents[0].id;
      reason = `router picked unknown agent; fell back to ${agentId}`;
    }
    return {
      next_agent: agentId,
      route_history: [{ step: idx, agent_id: agentId, reason, strategy: "llm" }],
      status: "executing" as const,
    };
  };
}

export function makeStepAdvanceNode() {
  return async (state: CoterieState) => {
    if (state.status === "failed" || state.status === "awaiting_human") return {};
    return { current_step_idx: (state.current_step_idx ?? 0) + 1, status: "routing" as const };
  };
}

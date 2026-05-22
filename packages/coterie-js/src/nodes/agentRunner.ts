/** Generic CLI-invoking node + budget gate. Mirrors Python `nodes/agent_runner.py`. */

import type { CLIAdapter } from "../adapters/base.js";
import type { AdapterExecutor } from "../core/executor.js";
import { ADAPTER_REGISTRY } from "../core/registry.js";
import type { CoterieState } from "../core/state.js";

function instantiate(agentCfg: any): CLIAdapter {
  const ctor = ADAPTER_REGISTRY.require(agentCfg.adapter);
  return new ctor(agentCfg.id, { model: agentCfg.model });
}

function checkBudget(state: CoterieState): { mode_state?: any; status?: any } | null {
  const budget = (state.config?.budget ?? {}) as Record<string, any>;
  const spent = state.spend_usd ?? 0;
  const modeState = { ...(state.mode_state ?? {}) };
  let changed = false;

  const warnAt = budget.warn_at_usd;
  if (warnAt !== undefined && spent >= warnAt && !modeState.budget_warned) {
    console.warn(`coterie budget warning: spent ~$${spent.toFixed(4)} (warn_at=$${warnAt})`);
    modeState.budget_warned = true;
    changed = true;
  }

  const maxUsd = budget.max_usd_per_task;
  if (maxUsd === undefined || spent < maxUsd) {
    return changed ? { mode_state: modeState } : null;
  }

  const onExceed = budget.on_exceed ?? "checkpoint";
  if (onExceed === "warn") {
    console.warn(`coterie budget exceeded: spent ~$${spent.toFixed(4)} (max=$${maxUsd}); continuing`);
    return changed ? { mode_state: modeState } : null;
  }
  modeState.budget_blocked = true;
  if (onExceed === "halt") {
    return { mode_state: modeState, status: "failed" };
  }
  return { mode_state: modeState, status: "awaiting_human" };
}

export interface AgentRunnerOpts {
  role: string;
  workdir: string;
  executor: AdapterExecutor;
  agent_id?: string;
  agent_id_fn?: (state: CoterieState) => string;
  prompt_fn?: (state: CoterieState) => string;
}

export function makeAgentRunner(opts: AgentRunnerOpts) {
  if ((opts.agent_id == null) === (opts.agent_id_fn == null)) {
    throw new Error("exactly one of agent_id or agent_id_fn must be provided");
  }
  return async (state: CoterieState) => {
    if (state.status === "failed" || state.status === "awaiting_human") {
      return {};
    }
    const budgetUpdate = checkBudget(state);
    if (budgetUpdate && budgetUpdate.status) {
      return budgetUpdate;
    }

    const resolvedId = opts.agent_id ?? opts.agent_id_fn!(state);
    const agentCfg = (state.config.agents as any[]).find((a) => a.id === resolvedId);
    if (!agentCfg) throw new Error(`agent id ${resolvedId} not in config.agents`);
    const adapter = instantiate(agentCfg);

    const prompt = opts.prompt_fn
      ? opts.prompt_fn(state)
      : (state.plan ?? [state.task])[state.current_step_idx ?? 0] ?? state.task;

    const result = opts.executor.execute(adapter, prompt, opts.workdir, {
      timeoutMs: (agentCfg.timeout_s ?? 600) * 1000,
    });

    const run = {
      agent_id: resolvedId,
      role: opts.role,
      prompt,
      stdout: result.stdout,
      stderr: result.stderr,
      exit_code: result.exit_code,
      files_changed: result.files_changed,
      duration_s: result.duration_s,
      cost_estimate_usd: result.cost_estimate_usd,
    };
    const update: any = {
      runs: [run],
      spend_usd: result.cost_estimate_usd ?? 0,
    };
    if (budgetUpdate && "mode_state" in budgetUpdate) {
      update.mode_state = budgetUpdate.mode_state;
    }
    return update;
  };
}

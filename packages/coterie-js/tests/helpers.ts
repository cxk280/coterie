import { afterEach, beforeEach } from "vitest";

import { FakeAdapter } from "../src/adapters/fake.js";

export function autoResetFakes() {
  beforeEach(() => FakeAdapter.resetAll());
  afterEach(() => FakeAdapter.resetAll());
}

export function initialState(task: string, cfg: any) {
  return {
    task,
    mode: cfg.mode,
    plan: [],
    current_step_idx: 0,
    runs: [],
    artifacts: {},
    status: "planning",
    config: cfg,
    spend_usd: 0,
    route_history: [],
    judge_history: [],
    next_agent: null,
    mode_state: {},
  };
}

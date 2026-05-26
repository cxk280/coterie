"""Generic agent-runner node factory.

Every CLI invocation in every mode goes through this. The seam between graph
code and subprocess execution is `AdapterExecutor` (slide 10 of the deck) — we
never call `adapter.run()` directly from a node; we go `executor.execute(adapter, ...)`
so swapping to a Docker / K8s executor is a one-line change at the composition root.

A runner is parameterized by:
- `role` — a string that ends up in `AgentRun.role`. Roles are meaningful to
  modes (`implementer`, `auditor`, `pro`, `con`, `consensus-participant`, etc.).
- `agent_id` (static) or `agent_id_fn(state)` (dynamic). One is required.
- `prompt_fn(state)` (optional). Default: current subtask from `state.plan`.

Budget enforcement runs before each execute:
- `warn_at_usd` — log once when crossed (uses `mode_state.budget_warned` flag).
- `max_usd_per_task` — hard cap. `on_exceed` policy:
  - `halt` — return status=failed, skip the call.
  - `warn` — log and proceed (lets the run finish even past the cap).
  - `checkpoint` — return status=awaiting_human (works with LangGraph interrupts
    when paired with HIL gates).
"""

import logging
from collections.abc import Callable
from typing import Any

from coterie.adapters.base import CLIAdapter
from coterie.core.executor import AdapterExecutor
from coterie.core.registry import ADAPTER_REGISTRY
from coterie.core.state import CoterieState
from coterie.observability import span_for_agent

logger = logging.getLogger(__name__)


def _instantiate(agent_cfg: dict) -> CLIAdapter:
    cls = ADAPTER_REGISTRY.require(agent_cfg["adapter"])
    return cls(agent_id=agent_cfg["id"], model=agent_cfg.get("model"))


def _check_budget(state: CoterieState) -> dict[str, Any] | None:
    """Returns a state-update dict if execution should be blocked, else None.

    A non-None return is the agent runner's signal to skip the underlying
    `executor.execute()` call. The mode_state.budget_warned flag is set on the
    first warn crossing so we don't spam the log.
    """
    budget = (state.get("config") or {}).get("budget") or {}
    spent = state.get("spend_usd", 0.0)
    mode_state = dict(state.get("mode_state") or {})

    warn_at = budget.get("warn_at_usd")
    if warn_at is not None and spent >= warn_at and not mode_state.get("budget_warned"):
        logger.warning("coterie budget warning: spent ~$%.4f (warn_at=$%.4f)", spent, warn_at)
        mode_state["budget_warned"] = True

    max_usd = budget.get("max_usd_per_task")
    if max_usd is None or spent < max_usd:
        if mode_state != (state.get("mode_state") or {}):
            return {"mode_state": mode_state}
        return None

    # Over the cap. Apply policy.
    on_exceed = budget.get("on_exceed", "checkpoint")
    if on_exceed == "warn":
        logger.warning("coterie budget exceeded: spent ~$%.4f (max=$%.4f); continuing per policy", spent, max_usd)
        if mode_state != (state.get("mode_state") or {}):
            return {"mode_state": mode_state}
        return None

    if on_exceed == "halt":
        mode_state["budget_blocked"] = True
        return {"mode_state": mode_state, "status": "failed"}

    # checkpoint
    mode_state["budget_blocked"] = True
    return {"mode_state": mode_state, "status": "awaiting_human"}


def make_agent_runner(
    *,
    role: str,
    workdir: str,
    executor: AdapterExecutor,
    agent_id: str | None = None,
    agent_id_fn: Callable[[CoterieState], str] | None = None,
    prompt_fn: Callable[[CoterieState], str] | None = None,
):
    if (agent_id is None) == (agent_id_fn is None):
        raise ValueError("exactly one of agent_id or agent_id_fn must be provided")

    def node(state: CoterieState) -> dict[str, Any]:
        # If a previous node already set a terminal status (budget, HIL), skip.
        if state.get("status") in ("failed", "awaiting_human"):
            return {}

        # Budget gate runs before any work. If it terminates, return immediately.
        budget_update = _check_budget(state)
        if budget_update is not None and ("status" in budget_update):
            return budget_update

        cfg = state["config"]
        resolved_id = agent_id if agent_id is not None else agent_id_fn(state)
        agent_cfg = next((a for a in cfg["agents"] if a["id"] == resolved_id), None)
        if agent_cfg is None:
            raise ValueError(f"agent id {resolved_id!r} not in config.agents")
        adapter = _instantiate(agent_cfg)

        if prompt_fn is not None:
            prompt = prompt_fn(state)
        else:
            plan = state.get("plan") or [state["task"]]
            prompt = plan[state.get("current_step_idx", 0)]

        # A subscriber injected by the orchestration layer (e.g. the API
        # runner) is exposed on the graph state under `_agent_output_sink`.
        # The agent_runner passes it through; everything else stays oblivious.
        sink = state.get("_agent_output_sink")
        on_output = None
        if callable(sink):
            ctx = {"agent_id": resolved_id, "role": role}

            def on_output(chunk: str, _ctx=ctx) -> None:  # noqa: B008
                sink(_ctx, chunk)

        with span_for_agent(
            agent_id=resolved_id, adapter=agent_cfg["adapter"], role=role
        ) as span:
            span.set_attribute("coterie.prompt.length", len(prompt or ""))
            span.set_attribute("coterie.step_idx", state.get("current_step_idx", 0))
            try:
                result = executor.execute(
                    adapter,
                    prompt,
                    workdir,
                    timeout_s=agent_cfg.get("timeout_s", 600),
                    on_output=on_output,
                )
            except Exception as e:  # noqa: BLE001
                span.record_exception(e)
                raise
            span.set_attribute("coterie.agent.exit_code", result.exit_code)
            span.set_attribute("coterie.agent.duration_s", result.duration_s)
            if result.cost_estimate_usd is not None:
                span.set_attribute("coterie.cost_usd", result.cost_estimate_usd)
            span.set_attribute("coterie.agent.stdout_bytes", len(result.stdout or ""))
            span.set_attribute("coterie.agent.files_changed", len(result.files_changed or []))

        run = {
            "agent_id": resolved_id,
            "role": role,
            "prompt": prompt,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.exit_code,
            "files_changed": result.files_changed,
            "duration_s": result.duration_s,
            "cost_estimate_usd": result.cost_estimate_usd,
        }
        # spend_usd reducer is `add`, so each node returns only its own delta.
        update: dict[str, Any] = {
            "runs": [run],
            "spend_usd": result.cost_estimate_usd or 0.0,
        }
        # Persist any mode_state changes from the budget gate (e.g. budget_warned flag).
        if budget_update is not None and "mode_state" in budget_update:
            update["mode_state"] = budget_update["mode_state"]
        return update

    return node

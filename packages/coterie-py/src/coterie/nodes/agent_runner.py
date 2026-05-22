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
"""

from typing import Any, Callable

from coterie.adapters.base import CLIAdapter
from coterie.core.executor import AdapterExecutor
from coterie.core.registry import ADAPTER_REGISTRY
from coterie.core.state import CoterieState


def _instantiate(agent_cfg: dict) -> CLIAdapter:
    cls = ADAPTER_REGISTRY.require(agent_cfg["adapter"])
    return cls(agent_id=agent_cfg["id"], model=agent_cfg.get("model"))


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

        result = executor.execute(
            adapter,
            prompt,
            workdir,
            timeout_s=agent_cfg.get("timeout_s", 600),
        )
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
        return {
            "runs": [run],
            "spend_usd": result.cost_estimate_usd or 0.0,
        }

    return node

"""Shared fixtures.

`reset_fakes` runs before every test so FakeAdapter scripts don't leak.
`initial_state` is a factory fixture returning a function that builds the
initial CoterieState dict for `graph.invoke()`.
"""

import pytest
from coterie.adapters.fake import FakeAdapter


@pytest.fixture(autouse=True)
def reset_fakes():
    FakeAdapter.reset_all()
    yield
    FakeAdapter.reset_all()


@pytest.fixture
def initial_state():
    def make(task: str, cfg: dict) -> dict:
        return {
            "task": task,
            "mode": cfg["mode"],
            "plan": [],
            "current_step_idx": 0,
            "runs": [],
            "artifacts": {},
            "status": "planning",
            "config": cfg,
            "spend_usd": 0.0,
            "route_history": [],
            "judge_history": [],
            "next_agent": None,
            "mode_state": {},
        }

    return make

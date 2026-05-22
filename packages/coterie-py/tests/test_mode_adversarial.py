"""End-to-end tests for `adversarial` mode.

Three scenarios:
1. No findings → judge accepts on round 1.
2. Findings sustained → loop, then accept on round 2.
3. Findings sustained for all max_rounds → finish anyway.
"""

import json

from coterie.adapters.base import AdapterResult
from coterie.adapters.fake import FakeAdapter
from coterie.core.executor import LocalSubprocessExecutor
from coterie.core.llm.scripted import ScriptedLLMClient
from coterie.graph import build_graph



def _cfg(max_rounds: int = 3) -> dict:
    return {
        "version": 1,
        "mode": "adversarial",
        "agents": [
            {"id": "impl", "adapter": "fake"},
            {"id": "auditor", "adapter": "fake"},
        ],
        "adversarial": {
            "implementer": "impl",
            "auditor": "auditor",
            "max_rounds": max_rounds,
        },
    }


def test_accept_on_round_1_when_no_findings(initial_state):
    FakeAdapter.script("impl", [AdapterResult("def foo(): return 42", "", 0)])
    FakeAdapter.script("auditor", [AdapterResult("[]", "", 0)])

    # Judge LLM never called because no findings meet threshold.
    graph = build_graph(
        config=_cfg(), workdir=".", executor=LocalSubprocessExecutor(), judge_llm=ScriptedLLMClient([])
    )
    final = graph.invoke(initial_state("write foo", _cfg()))

    assert final["status"] == "done"
    assert final["judge_history"][-1]["winner"] == "implementer"
    assert final["mode_state"]["verdict"] == "accept"


def test_revise_then_accept_on_round_2(initial_state):
    # Round 1: implementer outputs code; auditor finds a bug; judge sustains and asks to revise.
    # Round 2: implementer revises; auditor finds nothing; judge accepts.
    FakeAdapter.script("impl", [
        AdapterResult("def foo(): pass  # incomplete", "", 0),
        AdapterResult("def foo(): return 42  # fixed", "", 0),
    ])
    FakeAdapter.script("auditor", [
        AdapterResult(json.dumps([{
            "category": "missed-requirement",
            "severity": "high",
            "description": "function doesn't return a value",
            "line_ranges": ["foo.py:1"]
        }]), "", 0),
        AdapterResult("[]", "", 0),
    ])

    # Judge sustains the only finding on round 1 (verdict=revise) and never gets called round 2
    # because the auditor returned no findings (judge short-circuits).
    judge_response = json.dumps({
        "sustained": [0],
        "rejected": [],
        "verdict": "revise",
        "reason": "the function doesn't return a value, which is a clear missed requirement",
    })
    judge_llm = ScriptedLLMClient([judge_response])

    cfg = _cfg()
    graph = build_graph(config=cfg, workdir=".", executor=LocalSubprocessExecutor(), judge_llm=judge_llm)
    final = graph.invoke(initial_state("write foo", cfg))

    assert final["status"] == "done"
    assert len(final["judge_history"]) == 2
    assert final["judge_history"][0]["winner"] == "auditor"  # revise
    assert final["judge_history"][1]["winner"] == "implementer"  # accept

    # Round 2's implementer prompt should include the sustained critique.
    impl_invocations = FakeAdapter.invocations_for("impl")
    assert len(impl_invocations) == 2
    assert "function doesn't return a value" in impl_invocations[1]["prompt"]
    assert "sustained critiques" in impl_invocations[1]["prompt"]


def test_out_of_rounds_terminates(initial_state):
    """When the judge keeps saying revise and rounds run out, finish anyway."""
    cfg = _cfg(max_rounds=2)
    FakeAdapter.script("impl", [
        AdapterResult("v1", "", 0),
        AdapterResult("v2", "", 0),
    ])
    finding = json.dumps([{
        "category": "bug",
        "severity": "high",
        "description": "still broken",
        "line_ranges": []
    }])
    FakeAdapter.script("auditor", [
        AdapterResult(finding, "", 0),
        AdapterResult(finding, "", 0),
    ])
    judge_response = json.dumps({
        "sustained": [0],
        "rejected": [],
        "verdict": "revise",
        "reason": "broken",
    })
    judge_llm = ScriptedLLMClient([judge_response, judge_response])

    graph = build_graph(config=cfg, workdir=".", executor=LocalSubprocessExecutor(), judge_llm=judge_llm)
    final = graph.invoke(initial_state("write", cfg))

    assert final["status"] == "done"
    assert final["mode_state"]["round_idx"] == 2

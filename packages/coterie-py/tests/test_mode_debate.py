"""End-to-end test for `debate` mode."""

import json

from coterie.adapters.base import AdapterResult
from coterie.adapters.fake import FakeAdapter
from coterie.core.executor import LocalSubprocessExecutor
from coterie.core.llm.scripted import ScriptedLLMClient
from coterie.graph import build_graph


def test_single_round_debate(initial_state):
    FakeAdapter.script("pro-agent", [AdapterResult("Postgres scales better.", "", 0)])
    FakeAdapter.script("con-agent", [AdapterResult("SQLite is simpler to operate.", "", 0)])

    cfg = {
        "version": 1,
        "mode": "debate",
        "agents": [
            {"id": "pro-agent", "adapter": "fake"},
            {"id": "con-agent", "adapter": "fake"},
        ],
        "debate": {
            "sides": ["pro-agent", "con-agent"],
            "rounds": 1,
        },
    }

    moderator_response = json.dumps({
        "round_summary": "Pro argued for scalability; Con argued for simplicity.",
        "unresolved": "Whether scale justifies operational complexity.",
        "fact_check_needed": [],
    })
    judge_response = json.dumps({
        "winner": "pro",
        "reason": "Scale argument was more concrete with evidence.",
        "scores": {"pro": 8, "con": 6},
    })

    graph = build_graph(
        config=cfg,
        workdir=".",
        executor=LocalSubprocessExecutor(),
        moderator_llm=ScriptedLLMClient([moderator_response]),
        judge_llm=ScriptedLLMClient([judge_response]),
    )
    final = graph.invoke(initial_state("Postgres or SQLite?", cfg))

    assert final["status"] == "done"
    assert final["judge_history"][-1]["winner"] == "pro-agent"
    assert final["mode_state"]["rounds_completed"] == 1


def test_two_round_debate_threads_pro_argument_to_con(initial_state):
    FakeAdapter.script("pro-agent", [
        AdapterResult("Round 1 pro argument.", "", 0),
        AdapterResult("Round 2 pro argument.", "", 0),
    ])
    FakeAdapter.script("con-agent", [
        AdapterResult("Round 1 con rebuttal.", "", 0),
        AdapterResult("Round 2 con rebuttal.", "", 0),
    ])

    cfg = {
        "version": 1,
        "mode": "debate",
        "agents": [
            {"id": "pro-agent", "adapter": "fake"},
            {"id": "con-agent", "adapter": "fake"},
        ],
        "debate": {
            "sides": ["pro-agent", "con-agent"],
            "rounds": 2,
        },
    }

    mod_resp = json.dumps({"round_summary": "Pro argued scaling", "unresolved": "", "fact_check_needed": []})
    judge_resp = json.dumps({"winner": "con", "reason": "stronger rebuttals", "scores": {"pro": 5, "con": 8}})
    graph = build_graph(
        config=cfg,
        workdir=".",
        executor=LocalSubprocessExecutor(),
        moderator_llm=ScriptedLLMClient([mod_resp, mod_resp]),
        judge_llm=ScriptedLLMClient([judge_resp]),
    )
    final = graph.invoke(initial_state("debate this", cfg))

    assert final["status"] == "done"
    assert final["mode_state"]["rounds_completed"] == 2
    assert final["judge_history"][-1]["winner"] == "con-agent"

    # Round 2's con prompt sees (a) round 1's summary, and (b) round 2's pro
    # argument fresh in the "this round" section. Verify both threads.
    con_invocations = FakeAdapter.invocations_for("con-agent")
    assert "Pro argued scaling" in con_invocations[1]["prompt"]  # round 1 summary
    assert "Round 2 pro argument" in con_invocations[1]["prompt"]  # round 2 pro

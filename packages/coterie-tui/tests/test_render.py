"""Unit tests for the Rich rendering helpers.

End-to-end tests against a live server live in coterie-api/tests/. Here we just
verify the formatters don't crash on representative payloads.
"""

from coterie_tui.render import format_event, format_run_detail, format_runs_table


def test_runs_table_handles_empty_and_populated():
    t = format_runs_table([])
    assert t.row_count == 0
    t = format_runs_table(
        [
            {
                "id": "abc123",
                "task": "Refactor src/auth.ts",
                "mode": "adversarial",
                "status": "done",
                "agents": ["claude-code", "codex"],
                "spend_usd": 1.84,
                "created_at": "2026-05-22T20:00:00+00:00",
            }
        ],
        total=1,
    )
    assert t.row_count == 1


def test_run_detail_renders_without_history():
    detail = {
        "summary": {
            "id": "abc123",
            "task": "say hi",
            "mode": "single",
            "status": "done",
            "spend_usd": 0.01,
        },
        "runs": [],
        "judge_history": [],
    }
    panel = format_run_detail(detail)
    # Smoke check the panel renders to a string
    from rich.console import Console
    out = Console(width=100).render(panel)
    assert any("say hi" in str(line) for line in out)


def test_run_detail_renders_with_history():
    detail = {
        "summary": {
            "id": "r1",
            "task": "...",
            "mode": "adversarial",
            "status": "done",
            "spend_usd": 1.84,
        },
        "runs": [
            {
                "role": "implementer",
                "agent_id": "claude-code",
                "exit_code": 0,
                "duration_s": 8.4,
                "cost_estimate_usd": 0.42,
            }
        ],
        "judge_history": [{"step": 0, "winner": "implementer", "reason": "accept"}],
    }
    panel = format_run_detail(detail)
    assert panel is not None


def test_event_formatter_covers_all_kinds():
    for kind in (
        "state",
        "status_change",
        "spend_update",
        "agent_run",
        "judge_decision",
        "checkpoint",
        "done",
        "error",
        "stream_end",
        "unknown",
    ):
        text = format_event({"kind": kind, "data": {"status": "x", "spend_usd": 0.1}})
        # Format returns a rich.Text; just confirm it's non-empty.
        assert str(text)

"""Tests for the streaming subprocess helper + agent_runner sink threading."""

from __future__ import annotations

import sys

from coterie.core.streaming import run_streaming


def test_streaming_emits_chunks_and_returns_full_stdout(tmp_path):
    """End-to-end PTY (Unix) / pipes (Windows) — verify the callback fires."""
    chunks: list[str] = []
    script = tmp_path / "emit.py"
    script.write_text(
        "import sys, time\n"
        "for line in ['one\\n', 'two\\n', 'three\\n']:\n"
        "    sys.stdout.write(line)\n"
        "    sys.stdout.flush()\n"
        "    time.sleep(0.01)\n"
    )

    result = run_streaming(
        [sys.executable, str(script)],
        cwd=str(tmp_path),
        timeout_s=10,
        on_output=chunks.append,
    )
    joined = "".join(chunks)
    # All three lines arrived at the callback.
    assert "one" in joined and "two" in joined and "three" in joined
    # The aggregated result matches what the callback received.
    assert "one" in result.stdout and "three" in result.stdout
    assert result.exit_code == 0
    assert result.timed_out is False


def test_streaming_respects_timeout(tmp_path):
    """A process that never exits gets SIGKILLed by the deadline."""
    chunks: list[str] = []
    result = run_streaming(
        [sys.executable, "-c", "import time; time.sleep(30)"],
        cwd=str(tmp_path),
        timeout_s=1,
        on_output=chunks.append,
    )
    assert result.timed_out is True
    # exit_code is process-dependent on signals; just assert it's non-zero.
    assert result.exit_code != 0


def test_streaming_swallows_callback_errors(tmp_path):
    """A subscriber that raises mid-stream must not kill the run."""
    def bad_sink(chunk: str) -> None:
        raise RuntimeError("subscriber blew up")

    result = run_streaming(
        [sys.executable, "-c", "print('hello')"],
        cwd=str(tmp_path),
        timeout_s=5,
        on_output=bad_sink,
    )
    assert result.exit_code == 0
    assert "hello" in result.stdout


def test_output_sink_contextvar_round_trip():
    """The agent_runner reads its sink from a contextvar set by the runner."""
    from coterie.core.output_sink import (
        get_output_sink,
        reset_output_sink,
        set_output_sink,
    )

    seen: list[tuple[dict, str]] = []

    def sink(ctx, chunk):
        seen.append((ctx, chunk))

    token = set_output_sink(sink)
    try:
        active = get_output_sink()
        assert active is sink
        active({"agent_id": "x"}, "chunk-1")
    finally:
        reset_output_sink(token)
    assert get_output_sink() is None
    assert seen == [({"agent_id": "x"}, "chunk-1")]


def test_fake_adapter_mirrors_to_sink_when_provided(tmp_path):
    """FakeAdapter is a non-spawning adapter; verify it still calls on_output."""
    from coterie.adapters.base import AdapterResult
    from coterie.adapters.fake import FakeAdapter

    FakeAdapter.reset_all()
    FakeAdapter.script("a", [AdapterResult("scripted stdout", "", 0)])

    chunks: list[str] = []
    adapter = FakeAdapter(agent_id="a")
    result = adapter.run(
        "prompt",
        str(tmp_path),
        timeout_s=5,
        on_output=chunks.append,
    )
    assert result.stdout == "scripted stdout"
    assert chunks == ["scripted stdout"]

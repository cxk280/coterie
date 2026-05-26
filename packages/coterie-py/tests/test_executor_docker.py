"""Unit tests for DockerSwarmExecutor.

Doesn't actually require Docker to be installed — we exercise the
command-shape via a stub adapter and assert what gets handed to subprocess.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from coterie.adapters.base import AdapterResult, CLIAdapter


class _StubAdapter(CLIAdapter):
    name = "stub"

    def build_command(self, prompt, workdir, *, extra):
        return ["sh", "-c", f"echo {prompt}"]

    def parse_result(self, stdout, stderr, exit_code):
        return AdapterResult(stdout, stderr, exit_code)


def test_docker_executor_builds_expected_command(tmp_path):
    from coterie.core.executor import DockerSwarmExecutor

    ex = DockerSwarmExecutor(image="my-image:dev", network="none")
    adapter = _StubAdapter(agent_id="a")

    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(stdout="ok\n", stderr="", returncode=0)
        result = ex.execute(adapter, "hello", str(tmp_path), timeout_s=30)

    # First call is `docker run ...`, second is the cleanup `docker rm -f`.
    assert mock_run.call_count == 2
    docker_cmd = mock_run.call_args_list[0].args[0]
    assert docker_cmd[:2] == ["docker", "run"]
    assert "--rm" in docker_cmd
    assert "my-image:dev" in docker_cmd
    assert "--network=none" in docker_cmd
    # The adapter's command shows up at the tail.
    assert docker_cmd[-3:] == ["sh", "-c", "echo hello"]
    # /workspace bind-mount is present.
    assert any(arg.endswith(":/workspace") for arg in docker_cmd if isinstance(arg, str))

    # Cleanup call kills the named container.
    cleanup_cmd = mock_run.call_args_list[1].args[0]
    assert cleanup_cmd[:3] == ["docker", "rm", "-f"]

    assert result.exit_code == 0
    assert result.stdout == "ok\n"


def test_docker_executor_cleans_up_even_on_failure(tmp_path):
    from coterie.core.executor import DockerSwarmExecutor

    ex = DockerSwarmExecutor(image="x")
    adapter = _StubAdapter(agent_id="a")

    call_count = {"n": 0}

    def fake_run(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise RuntimeError("simulated docker run failure")
        return MagicMock(stdout="", stderr="", returncode=0)

    with (
        patch("subprocess.run", side_effect=fake_run),
        pytest.raises(RuntimeError, match="simulated"),
    ):
        ex.execute(adapter, "hello", str(tmp_path), timeout_s=10)

    # Cleanup runs in finally — both calls happen.
    assert call_count["n"] == 2

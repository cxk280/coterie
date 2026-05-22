"""IsolatedWorktreeExecutor tests."""

import subprocess
from pathlib import Path

import pytest

from coterie.adapters.base import AdapterResult
from coterie.adapters.fake import FakeAdapter
from coterie.core.executor import IsolatedWorktreeExecutor, LocalSubprocessExecutor


def _git_init(path: Path) -> None:
    """Create a git repo with one commit so `worktree add` works."""
    env = {"GIT_AUTHOR_NAME": "test", "GIT_AUTHOR_EMAIL": "t@e", "GIT_COMMITTER_NAME": "test", "GIT_COMMITTER_EMAIL": "t@e"}
    subprocess.run(["git", "init", "-q"], cwd=path, check=True)
    subprocess.run(
        ["git", "commit", "--allow-empty", "-q", "-m", "init"],
        cwd=path,
        env={**dict(__import__("os").environ), **env},
        check=True,
    )


def test_isolated_executor_uses_separate_workdir(tmp_path: Path):
    """The adapter sees a different workdir than the one passed in."""
    _git_init(tmp_path)
    FakeAdapter.script("a", [AdapterResult("ok", "", 0)])
    executor = IsolatedWorktreeExecutor()
    executor.execute(FakeAdapter(agent_id="a"), "prompt", str(tmp_path))

    invocations = FakeAdapter.invocations_for("a")
    actual_workdir = invocations[0]["workdir"]
    assert actual_workdir != str(tmp_path)
    assert "coterie-wt-" in actual_workdir


def test_isolated_executor_cleans_up(tmp_path: Path):
    """After execute() returns, the worktree directory no longer exists."""
    _git_init(tmp_path)
    FakeAdapter.script("a", [AdapterResult("ok", "", 0)])
    executor = IsolatedWorktreeExecutor()
    executor.execute(FakeAdapter(agent_id="a"), "p", str(tmp_path))
    actual = FakeAdapter.invocations_for("a")[0]["workdir"]
    assert not Path(actual).exists()


def test_isolated_executor_cleans_up_on_adapter_error(tmp_path: Path):
    """Cleanup runs even when the adapter raises."""
    _git_init(tmp_path)
    # No script → adapter.run() will raise FakeAdapterError.
    executor = IsolatedWorktreeExecutor()
    captured_workdir = []

    class CapturingFake(FakeAdapter):
        name = "_capturing_fake_for_test"

        def run(self, prompt, workdir, **kw):
            captured_workdir.append(workdir)
            raise RuntimeError("boom")

    with pytest.raises(RuntimeError, match="boom"):
        executor.execute(CapturingFake(agent_id="x"), "p", str(tmp_path))
    assert captured_workdir, "adapter was invoked"
    assert not Path(captured_workdir[0]).exists()


def test_isolated_executor_fallback_when_not_git_repo(tmp_path: Path):
    """Non-git workdir falls back to a plain tempdir; still isolated."""
    # No `git init` — this is just a regular directory.
    FakeAdapter.script("a", [AdapterResult("ok", "", 0)])
    executor = IsolatedWorktreeExecutor()
    executor.execute(FakeAdapter(agent_id="a"), "p", str(tmp_path))
    actual = FakeAdapter.invocations_for("a")[0]["workdir"]
    assert actual != str(tmp_path)
    assert "coterie-wt-" in actual


def test_local_executor_does_not_isolate(tmp_path: Path):
    """LocalSubprocessExecutor passes the workdir straight through."""
    FakeAdapter.script("a", [AdapterResult("ok", "", 0)])
    executor = LocalSubprocessExecutor()
    executor.execute(FakeAdapter(agent_id="a"), "p", str(tmp_path))
    actual = FakeAdapter.invocations_for("a")[0]["workdir"]
    assert actual == str(tmp_path)

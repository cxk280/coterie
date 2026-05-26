"""Subprocess streaming helper.

Spawns ``cmd`` under a pseudoterminal (Unix) so CLIs that detect interactive
sessions keep their rich output, and feeds stdout *chunks* to ``on_output``
as they arrive rather than only after the process exits.

Windows fallback uses ``subprocess.Popen`` with line-buffered pipes — same
shape, slightly less faithful to TTY-only behaviors.

Returned values mirror ``subprocess.run`` so callers can treat the streaming
path as a drop-in for the buffered path.
"""

from __future__ import annotations

import contextlib
import logging
import os
import select
import signal
import subprocess
import sys
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass

logger = logging.getLogger(__name__)

OnOutput = Callable[[str], None]


@dataclass
class StreamResult:
    stdout: str
    stderr: str
    exit_code: int
    timed_out: bool = False


# How much to read at once from the master fd. Tuned to land below most TTY
# read buffers without fragmenting UTF-8 multibyte sequences too often.
_CHUNK_SIZE = 4096

# Best-effort decoding — `errors="replace"` keeps the run going even if a CLI
# emits a binary byte (e.g., a control sequence terminator mid-burst). The
# replacement char is rare enough in normal output to be worth the safety.
_DECODE_ERRORS = "replace"


def run_streaming(
    cmd: list[str],
    *,
    cwd: str,
    timeout_s: int,
    on_output: OnOutput,
    env: dict[str, str] | None = None,
) -> StreamResult:
    """Streaming subprocess run. Drop-in shape for buffered ``subprocess.run``."""
    if _supports_pty():
        return _run_pty(cmd, cwd=cwd, timeout_s=timeout_s, on_output=on_output, env=env)
    return _run_pipes(cmd, cwd=cwd, timeout_s=timeout_s, on_output=on_output, env=env)


def _supports_pty() -> bool:
    return sys.platform != "win32"


# ---------- PTY path (Unix) ----------


def _run_pty(
    cmd: list[str],
    *,
    cwd: str,
    timeout_s: int,
    on_output: OnOutput,
    env: dict[str, str] | None,
) -> StreamResult:
    import pty

    master, slave = pty.openpty()
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=cwd,
            env=env,
            stdin=slave,
            stdout=slave,
            stderr=slave,
            close_fds=True,
            start_new_session=True,
        )
    except Exception:
        os.close(master)
        os.close(slave)
        raise
    os.close(slave)

    chunks: list[str] = []
    deadline = time.monotonic() + timeout_s if timeout_s else float("inf")
    timed_out = False

    try:
        while True:
            now = time.monotonic()
            if now >= deadline:
                timed_out = True
                _terminate(proc)
                break

            remaining = max(0.05, min(0.5, deadline - now))
            try:
                rlist, _, _ = select.select([master], [], [], remaining)
            except (OSError, ValueError):
                break

            if rlist:
                try:
                    raw = os.read(master, _CHUNK_SIZE)
                except OSError:
                    break
                if not raw:
                    break  # EOF
                text = raw.decode("utf-8", errors=_DECODE_ERRORS)
                chunks.append(text)
                try:
                    on_output(text)
                except Exception as e:  # noqa: BLE001
                    # Subscriber blew up — log and keep the stream alive.
                    logger.warning("on_output callback raised %r; continuing", e)
            elif proc.poll() is not None:
                break

        # Drain anything still buffered after the loop.
        try:
            while True:
                rlist, _, _ = select.select([master], [], [], 0.0)
                if not rlist:
                    break
                raw = os.read(master, _CHUNK_SIZE)
                if not raw:
                    break
                text = raw.decode("utf-8", errors=_DECODE_ERRORS)
                chunks.append(text)
                try:
                    on_output(text)
                except Exception as e:  # noqa: BLE001
                    logger.warning("on_output callback raised %r; continuing", e)
        except (OSError, ValueError):
            pass

        exit_code = proc.poll()
        if exit_code is None:
            try:
                exit_code = proc.wait(timeout=2.0)
            except subprocess.TimeoutExpired:
                _terminate(proc)
                exit_code = proc.wait(timeout=2.0) if proc.poll() is None else proc.returncode
    finally:
        with contextlib.suppress(OSError):
            os.close(master)

    return StreamResult(
        stdout="".join(chunks),
        stderr="",  # PTY merges stderr into the master fd.
        exit_code=exit_code if exit_code is not None else -1,
        timed_out=timed_out,
    )


def _terminate(proc: subprocess.Popen) -> None:
    """SIGTERM, wait briefly, then SIGKILL — and bring the whole process group down."""
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
    except (ProcessLookupError, PermissionError, OSError):
        with contextlib.suppress(Exception):
            proc.terminate()
    try:
        proc.wait(timeout=2.0)
        return
    except subprocess.TimeoutExpired:
        pass
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except (ProcessLookupError, PermissionError, OSError):
        with contextlib.suppress(Exception):
            proc.kill()


# ---------- pipes fallback (Windows / non-PTY environments) ----------


def _run_pipes(
    cmd: list[str],
    *,
    cwd: str,
    timeout_s: int,
    on_output: OnOutput,
    env: dict[str, str] | None,
) -> StreamResult:
    proc = subprocess.Popen(
        cmd,
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )

    stdout_chunks: list[str] = []
    stderr_chunks: list[str] = []
    timed_out = [False]
    deadline = time.monotonic() + timeout_s if timeout_s else float("inf")

    def _pump(stream, sink, mirror_to_callback: bool) -> None:
        if stream is None:
            return
        for line in iter(stream.readline, ""):
            sink.append(line)
            if mirror_to_callback:
                try:
                    on_output(line)
                except Exception as e:  # noqa: BLE001
                    logger.warning("on_output callback raised %r; continuing", e)
        stream.close()

    out_t = threading.Thread(target=_pump, args=(proc.stdout, stdout_chunks, True), daemon=True)
    err_t = threading.Thread(target=_pump, args=(proc.stderr, stderr_chunks, False), daemon=True)
    out_t.start()
    err_t.start()

    while True:
        if proc.poll() is not None:
            break
        if time.monotonic() >= deadline:
            timed_out[0] = True
            with contextlib.suppress(Exception):
                proc.terminate()
            try:
                proc.wait(timeout=2.0)
            except subprocess.TimeoutExpired:
                proc.kill()
            break
        time.sleep(0.05)

    out_t.join(timeout=1.0)
    err_t.join(timeout=1.0)

    return StreamResult(
        stdout="".join(stdout_chunks),
        stderr="".join(stderr_chunks),
        exit_code=proc.returncode if proc.returncode is not None else -1,
        timed_out=timed_out[0],
    )

"""Rich rendering helpers shared by every CLI subcommand."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

MODE_STYLE = {
    "single": "cyan",
    "consensus": "magenta",
    "adversarial": "bright_magenta",
    "debate": "blue",
    "tournament": "yellow",
}

STATUS_STYLE = {
    "queued": "dim",
    "running": "yellow",
    "awaiting_human": "yellow bold",
    "done": "green",
    "failed": "red",
    "rejected": "red dim",
}


def format_runs_table(items: list[dict[str, Any]], *, total: int | None = None) -> Table:
    t = Table(title=f"Runs ({total} total)" if total is not None else "Runs", box=None)
    t.add_column("ID", style="dim")
    t.add_column("Mode")
    t.add_column("Status")
    t.add_column("Task")
    t.add_column("Agents", style="dim")
    t.add_column("Spend", justify="right")
    t.add_column("When", style="dim")
    for run in items:
        t.add_row(
            run["id"],
            Text(run["mode"], style=MODE_STYLE.get(run["mode"], "white")),
            Text(run["status"], style=STATUS_STYLE.get(run["status"], "white")),
            (run["task"][:64] + "…") if len(run["task"]) > 65 else run["task"],
            ", ".join(run.get("agents") or []),
            f"${run.get('spend_usd', 0):.2f}",
            _ago(run.get("created_at")),
        )
    return t


def format_run_detail(detail: dict[str, Any]) -> Panel:
    summary = detail["summary"]
    runs = detail.get("runs") or []
    judges = detail.get("judge_history") or []

    lines: list[str | Text] = [
        Text.from_markup(f"[bold]{summary['task']}[/bold]"),
        Text(""),
        Text.from_markup(
            f"[{STATUS_STYLE.get(summary['status'], 'white')}]{summary['status']}[/] · "
            f"[{MODE_STYLE.get(summary['mode'], 'white')}]{summary['mode']}[/] · "
            f"${summary['spend_usd']:.4f} spent"
        ),
        Text(""),
    ]

    if runs:
        lines.append(Text.from_markup("[bold]Agent runs[/bold]"))
        for r in runs:
            lines.append(
                Text(
                    f"  · {r.get('role','?'):>15} {r.get('agent_id','?'):<22}"
                    f" exit={r.get('exit_code','?')}"
                    f" {r.get('duration_s', 0.0):>5.1f}s"
                    f" ${(r.get('cost_estimate_usd') or 0):.4f}"
                )
            )
        lines.append(Text(""))

    if judges:
        lines.append(Text.from_markup("[bold]Judge decisions[/bold]"))
        for j in judges:
            lines.append(Text(f"  · step {j.get('step', '?')}: winner={j.get('winner','?')}  {j.get('reason','')}"))

    return Panel("\n".join(str(line) for line in lines), title=f"run {summary['id']}", border_style="dim")


def format_event(ev: dict[str, Any]) -> Text:
    kind = ev.get("kind", "?")
    data = ev.get("data", {})
    style = {
        "state": "dim",
        "status_change": "yellow",
        "spend_update": "cyan dim",
        "agent_run": "bright_magenta",
        "judge_decision": "magenta",
        "checkpoint": "yellow bold",
        "done": "green bold",
        "error": "red bold",
        "stream_end": "dim",
    }.get(kind, "white")

    summary = _summarize(kind, data)
    return Text.from_markup(f"[{style}]{kind:<15}[/] {summary}")


def _summarize(kind: str, data: dict[str, Any]) -> str:
    if kind == "agent_run":
        return f"{data.get('role')} · {data.get('agent_id')} → exit={data.get('exit_code')} ({data.get('duration_s','?')}s)"
    if kind == "spend_update":
        return f"${data.get('spend_usd', 0):.4f}"
    if kind == "status_change":
        return str(data.get("status"))
    if kind == "judge_decision":
        return f"winner={data.get('winner','?')}"
    if kind == "checkpoint":
        return f"paused before: {', '.join(data.get('next_nodes') or [])}"
    if kind == "done":
        return f"{data.get('status','done')} (duration={data.get('duration_s','?')}s)"
    if kind == "error":
        return str(data.get("message"))[:120]
    if kind == "state":
        s = data.get("state") or {}
        return f"status={s.get('status')} spend=${s.get('spend_usd', 0):.4f} runs={len(s.get('runs') or [])}"
    return ""


def _ago(iso: str | None) -> str:
    if not iso:
        return "—"
    try:
        then = datetime.fromisoformat(iso)
    except ValueError:
        return iso
    delta = datetime.now(then.tzinfo) - then
    secs = int(delta.total_seconds())
    if secs < 60:
        return f"{secs}s ago"
    mins = secs // 60
    if mins < 60:
        return f"{mins}m ago"
    hours = mins // 60
    if hours < 24:
        return f"{hours}h ago"
    return f"{hours // 24}d ago"


def console() -> Console:
    return Console()

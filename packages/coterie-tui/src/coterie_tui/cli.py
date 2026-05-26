"""CLI entry point.

Five subcommands:

    coterie-tui list                       list runs (paginated, filterable)
    coterie-tui show <id>                  print a single run's summary + history
    coterie-tui watch <id>                 stream live SSE events
    coterie-tui run <task> --mode adv …   create a run, then stream it to completion
    coterie-tui resume <id> [--reject]     approve (default) or reject a paused run
    coterie-tui delete <id>                delete a run + its event log
    coterie-tui me                         show the authenticated user

Authenticates via the same env vars as coterie-web:
    COTERIE_API_URL    (default http://127.0.0.1:8000)
    COTERIE_API_TOKEN  (the legacy single token OR a personal access token)
"""

from __future__ import annotations

from pathlib import Path

import click
import yaml

from coterie_tui.client import CoterieClient
from coterie_tui.render import (
    console,
    format_event,
    format_run_detail,
    format_runs_table,
)


@click.group()
@click.option("--api", "api_url", envvar="COTERIE_API_URL", default=None, help="API base URL.")
@click.option("--token", envvar="COTERIE_API_TOKEN", default=None, help="Bearer token.")
@click.pass_context
def main(ctx: click.Context, api_url: str | None, token: str | None) -> None:
    """Coterie TUI — Rich-based client for the coterie-api server."""
    ctx.ensure_object(dict)
    ctx.obj["client"] = CoterieClient(base_url=api_url, token=token)


@main.command(name="me")
@click.pass_context
def me_cmd(ctx: click.Context) -> None:
    """Print the authenticated user."""
    c = console()
    me = ctx.obj["client"].me()
    c.print(
        f"[bold]{me.get('name') or me.get('login') or me['id']}[/] "
        f"[dim]({me['kind']}, id={me['id']})[/]"
    )
    if me.get("is_admin"):
        c.print("[yellow]admin[/]")


@main.command(name="list")
@click.option("--mode", default=None, help="Filter by mode.")
@click.option("--status", default=None, help="Filter by status.")
@click.option("--limit", default=20, show_default=True)
@click.option("--offset", default=0, show_default=True)
@click.pass_context
def list_cmd(ctx: click.Context, mode: str | None, status: str | None, limit: int, offset: int) -> None:
    """List recent runs."""
    c = console()
    resp = ctx.obj["client"].list_runs(limit=limit, offset=offset, mode=mode, status=status)
    c.print(format_runs_table(resp["items"], total=resp["total"]))


@main.command(name="show")
@click.argument("run_id")
@click.pass_context
def show_cmd(ctx: click.Context, run_id: str) -> None:
    """Show a single run's summary + agent runs + judge decisions."""
    c = console()
    detail = ctx.obj["client"].get_run(run_id)
    c.print(format_run_detail(detail))


@main.command(name="watch")
@click.argument("run_id")
@click.option("--show-state", is_flag=True, help="Include the noisy `state` snapshot events.")
@click.pass_context
def watch_cmd(ctx: click.Context, run_id: str, show_state: bool) -> None:
    """Stream live SSE events from a run until it terminates."""
    c = console()
    client: CoterieClient = ctx.obj["client"]

    with client.stream_events(run_id) as events:
        for ev in events:
            if not show_state and ev["kind"] == "state":
                continue
            c.print(format_event(ev))
            if ev["kind"] in ("done", "error", "stream_end"):
                break


@main.command(name="run")
@click.argument("task")
@click.option("--mode", required=True, type=click.Choice(["single", "consensus", "adversarial", "debate", "tournament"]))
@click.option("--config", "config_path", required=True, type=click.Path(exists=True, dir_okay=False, path_type=Path), help="YAML config file (matches schemas/coterie.config.schema.json).")
@click.option("--watch/--no-watch", default=True, help="Stream events after creating the run.")
@click.pass_context
def run_cmd(ctx: click.Context, task: str, mode: str, config_path: Path, watch: bool) -> None:
    """Create a new run from a YAML config and (by default) stream it live."""
    c = console()
    client: CoterieClient = ctx.obj["client"]
    config = yaml.safe_load(config_path.read_text())
    summary = client.create_run(task=task, mode=mode, config=config)
    c.print(f"[green]created[/] run [bold]{summary['id']}[/] · mode={mode}")
    if not watch:
        return
    with client.stream_events(summary["id"]) as events:
        for ev in events:
            if ev["kind"] == "state":
                continue
            c.print(format_event(ev))
            if ev["kind"] in ("done", "error", "stream_end"):
                break


@main.command(name="resume")
@click.argument("run_id")
@click.option("--reject", is_flag=True, help="Reject instead of approve.")
@click.pass_context
def resume_cmd(ctx: click.Context, run_id: str, reject: bool) -> None:
    """Approve (default) or reject a run paused at an HIL checkpoint."""
    c = console()
    resp = ctx.obj["client"].resume(run_id, decision="reject" if reject else "approve")
    c.print(f"[green]{resp['status']}[/] {run_id}")


@main.command(name="delete")
@click.argument("run_id")
@click.confirmation_option(prompt="Delete the run and its event log?")
@click.pass_context
def delete_cmd(ctx: click.Context, run_id: str) -> None:
    """Delete a run + its event log."""
    c = console()
    ctx.obj["client"].delete_run(run_id)
    c.print(f"[red]deleted[/] {run_id}")


if __name__ == "__main__":
    main(prog_name="coterie-tui")

"""Minimal smoke test: build the graph and dry-run without spawning the real CLI.

Run with: python examples/01_single_agent.py
"""

from coterie.graph import build_graph


def main() -> None:
    graph = build_graph(agent_id="claude", adapter_kind="claude-code", workdir=".")
    print("graph compiled:", graph)
    print("nodes:", list(graph.get_graph().nodes))


if __name__ == "__main__":
    main()

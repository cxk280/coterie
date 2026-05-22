"""Role-specific LangGraph node factories.

Each module exports `make_<role>_node(llm: LLMClient | None, ...) -> Callable`,
where the returned callable is a LangGraph node function `(state) -> dict`.

These nodes are the LLM-driven decision points in the graph. The CLI-invoking
node lives in `agent_runner.py` and is parameterized by role + agent_id.
"""

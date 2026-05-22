# coterie (Python)

The Python runtime for [Coterie](https://coterie.dev) — a LangGraph orchestrator for heterogeneous coding agents.

```bash
pip install coterie
coterie run "refactor src/auth.py to remove the legacy middleware" \
  --config examples/fanout_with_judge.coterie.yaml
```

See the [top-level README](../../README.md) for architecture, design, and the JS sibling package.

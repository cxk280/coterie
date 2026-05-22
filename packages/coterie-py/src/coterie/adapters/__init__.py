"""Built-in CLI adapters.

This module is intentionally lean: it imports each concrete adapter module,
which triggers the `@register_adapter` side effect at import time. Nothing
else lives here — the registry itself is in `coterie.core.registry`.

Slide 08 (Open/Closed): adding a new adapter is a new module + a decorator.
Nothing in this file ever changes.
"""

# Imports trigger @register_adapter side effects. Order doesn't matter.
from coterie.adapters import claude_code, codex, fake  # noqa: F401
from coterie.adapters.base import AdapterResult, CLIAdapter

__all__ = ["AdapterResult", "CLIAdapter"]

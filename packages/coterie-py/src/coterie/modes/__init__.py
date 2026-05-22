"""Coordination modes.

Each module exports a `build(workdir, executor, config, **llm_clients)` function
decorated with `@register_mode("<name>")`. Importing this package triggers all
registrations as a side effect.

Slide 08 (Open/Closed): adding a new mode is a new file + a decorator. The
dispatcher in `coterie.graph` never changes.
"""

# Imports trigger @register_mode side effects.
from coterie.modes import adversarial, consensus, debate, single, tournament  # noqa: F401

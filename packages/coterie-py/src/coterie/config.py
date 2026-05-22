"""Config loader + JSON Schema validator."""

from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator

# schemas/ lives at the repo root. Resolve relative to this file:
# .../packages/coterie-py/src/coterie/config.py  → ../../../../schemas/coterie.config.schema.json
SCHEMA_PATH = (
    Path(__file__).resolve().parents[3].parent / "schemas" / "coterie.config.schema.json"
)


def load_config(path: str | Path) -> dict[str, Any]:
    raw = yaml.safe_load(Path(path).read_text())
    if SCHEMA_PATH.exists():
        schema = yaml.safe_load(SCHEMA_PATH.read_text())
        Draft202012Validator(schema).validate(raw)
    return raw


def validate(config: dict[str, Any]) -> None:
    """Validate an already-parsed config dict against the schema."""
    if SCHEMA_PATH.exists():
        schema = yaml.safe_load(SCHEMA_PATH.read_text())
        Draft202012Validator(schema).validate(config)

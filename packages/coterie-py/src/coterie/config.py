from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator

SCHEMA_PATH = Path(__file__).resolve().parents[3].parent / "schemas" / "coterie.config.schema.json"


def load_config(path: str | Path) -> dict[str, Any]:
    raw = yaml.safe_load(Path(path).read_text())
    schema = yaml.safe_load(SCHEMA_PATH.read_text()) if SCHEMA_PATH.exists() else None
    if schema is not None:
        Draft202012Validator(schema).validate(raw)
    return raw

"""Dump the FastAPI OpenAPI schema to a file.

This file (`packages/coterie-api/openapi.json`) is the source of truth for the
web client's generated TypeScript types. Regenerate after any change to the API
models or routes:

    python -m coterie_api.export_openapi

CI regenerates it and fails on a diff, so the committed schema can never drift
from the running app. Output is stable (sorted keys, trailing newline) so the
diff is meaningful.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from coterie_api.main import app

DEFAULT_PATH = Path(__file__).resolve().parents[2] / "openapi.json"


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    out.write_text(json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()

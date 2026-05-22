"""Entry point: `coterie-api` launches uvicorn against `main:app`."""

import os
import sys


def main() -> None:
    import uvicorn

    host = os.environ.get("COTERIE_API_HOST", "127.0.0.1")
    port = int(os.environ.get("COTERIE_API_PORT", "8000"))
    reload = "--reload" in sys.argv

    uvicorn.run(
        "coterie_api.main:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info",
    )


if __name__ == "__main__":
    main()

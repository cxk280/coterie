# syntax=docker/dockerfile:1.7
# Multi-stage build for coterie-api. Final image is a non-root uvicorn server.

# ---------- builder ----------
FROM python:3.13-slim AS builder

WORKDIR /build

# System deps needed for wheel builds. Keep this list short — most of our
# Python deps ship binary wheels for linux/amd64 + linux/arm64.
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential git \
 && rm -rf /var/lib/apt/lists/*

# Copy the three workspace packages we need into the image. The build context
# is expected to be the repo root.
COPY packages/coterie-py /build/coterie-py
COPY packages/coterie-api /build/coterie-api

# Install both editable into a dedicated venv so we can copy it whole into
# the runtime stage.
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir /build/coterie-py \
 && pip install --no-cache-dir /build/coterie-api

# ---------- runtime ----------
FROM python:3.13-slim AS runtime

# git is required for IsolatedWorktreeExecutor; tini for clean PID-1 signal
# handling so SIGTERM from the orchestrator drains the API gracefully.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git tini ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --shell /bin/bash --uid 10001 coterie

COPY --from=builder /opt/venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    COTERIE_DB_PATH=/data/runs.sqlite \
    COTERIE_CHECKPOINT_DB=/data/checkpoints.sqlite \
    COTERIE_API_TOKEN_PATH=/data/api-token \
    COTERIE_API_ALLOW_LOCALHOST=0

WORKDIR /home/coterie
USER coterie

# Persistent state goes here. Mount a volume (or PVC) onto /data in production.
VOLUME ["/data"]

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; \
sys.exit(0 if urllib.request.urlopen('http://localhost:8000/api/health', timeout=2).status == 200 else 1)"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "coterie_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]

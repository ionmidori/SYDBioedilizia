FROM python:3.14-slim

# Copy uv from the official image, pinned to match backend_python's Dockerfile
# (Dependabot docker ecosystem keeps this pin current).
COPY --from=ghcr.io/astral-sh/uv:0.11.29 /uv /uvx /bin/

WORKDIR /app

# System deps for compiled packages
RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

ENV UV_COMPILE_BYTECODE=1

# Copy dependency files first to leverage Docker layer caching
COPY pyproject.toml uv.lock ./

# Runtime dependencies only (no dev group: pytest/pip-audit are not shipped).
#
# --locked, NOT --frozen: `--frozen` only means "do not update uv.lock", it
# does NOT check the lock against pyproject.toml, so a stale lock installs
# silently. Same rationale as backend_python/Dockerfile (Phase 108) -- without
# this, a Dependabot floor bump that never gets re-locked would keep shipping
# the old, vulnerable resolution with a green build.
RUN uv sync --no-install-project --no-dev --locked

# Application files (no .env, no firebase-service-account.json)
COPY app.py .
COPY config.yaml .
COPY pages/ pages/
COPY src/ src/
COPY .streamlit/ .streamlit/

RUN uv sync --no-dev --locked

ENV PATH="/app/.venv/bin:$PATH"

# Non-root user
RUN useradd -m -u 1000 streamlit && chown -R streamlit:streamlit /app
USER streamlit

# Cloud Run requires port 8080
EXPOSE 8080

ENTRYPOINT ["streamlit", "run", "app.py", "--server.port=8080", "--server.address=0.0.0.0", "--server.headless=true", "--server.fileWatcherType=none", "--server.enableCORS=false", "--browser.gatherUsageStats=false"]

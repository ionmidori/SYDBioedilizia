# Use a Python image with uv pre-installed via multi-stage or copy
FROM python:3.14-slim-bookworm

# Copy uv from the official image (Best Practice for speed/reliability).
# Version pinned for reproducible builds — bumped by Dependabot (docker ecosystem).
COPY --from=ghcr.io/astral-sh/uv:0.11.29 /uv /uvx /bin/

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1

# Copy dependency files first to leverage Docker layer caching
COPY pyproject.toml uv.lock ./

# Install runtime dependencies only (no dev group: pytest/ruff/pyright/pip-audit
# are not shipped in the production image). --frozen fails the build if uv.lock
# is out of sync with pyproject.toml, so Cloud Run never builds from a stale lock.
RUN uv sync --no-install-project --no-dev --frozen

# Copy remaining application code
COPY . .

# Final sync to include project code (still runtime-only, still frozen)
RUN uv sync --no-dev --frozen

# Place the virtual environment in the PATH
ENV PATH="/app/.venv/bin:$PATH"

# Verify codebase integrity (compile python to catch syntax errors during build)
RUN python -m compileall src main.py

# Non-root user (defense-in-depth for container escape)
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Expose the port used by Cloud Run
EXPOSE 8080

# Run the application using uvicorn directly (via the venv)
# Run diagnostics and then start app
CMD ["/bin/bash", "-c", "echo '🔍 [Startup] Checking environment...' && echo '🚀 [Startup] Starting Uvicorn...' && exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --log-level info --timeout-keep-alive 600 --timeout-graceful-shutdown 40"]

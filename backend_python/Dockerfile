# Use a Python image with uv pre-installed via multi-stage or copy
FROM python:3.12-slim-bookworm

# Copy uv from the official image (Best Practice for speed/reliability)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

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

# Install dependencies without the project code (creates .venv)
RUN uv sync --no-install-project

# Copy remaining application code
COPY . .

# Final sync to include project code
RUN uv sync

# Place the virtual environment in the PATH
ENV PATH="/app/.venv/bin:$PATH"

# Verify codebase integrity (compile python to catch syntax errors during build)
RUN python -m compileall src main.py

# Expose the port used by Cloud Run
EXPOSE 8080

# Run the application using uvicorn directly (via the venv)
# Run diagnostics and then start app
CMD ["/bin/bash", "-c", "echo '🔍 [Startup] Checking environment...' && echo '🚀 [Startup] Starting Uvicorn...' && exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --log-level info --timeout-keep-alive 600"]

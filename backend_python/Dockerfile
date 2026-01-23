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

# Copy ALL application code first (before creating .venv)
COPY . .

# Install dependencies (creates .venv with all packages including uvicorn)
RUN uv sync

# Place the virtual environment in the PATH
ENV PATH="/app/.venv/bin:$PATH"

# Expose the port used by Cloud Run
EXPOSE 8080

# Run the application using uvicorn directly (via the venv)
# Make entrypoint executable
RUN chmod +x /app/entrypoint.sh

# Use entrypoint script
CMD ["/app/entrypoint.sh"]

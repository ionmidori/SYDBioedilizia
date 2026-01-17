# Use a Python image with uv pre-installed via multi-stage or copy
FROM python:3.12-slim-bookworm

# Copy uv from the official image (Best Practice for speed/reliability)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Set working directory
WORKDIR /app

# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1

# Copy dependency files first (for layer caching)
COPY pyproject.toml uv.lock ./

# Install dependencies
# --frozen: strict lockfile usage
# --no-dev: exclude development dependencies
RUN uv sync --frozen --no-dev

# Copy the rest of the application
COPY . .

# Place the virtual environment in the PATH
ENV PATH="/app/.venv/bin:$PATH"

# Expose the port used by Cloud Run
EXPOSE 8080

# Run the application using uvicorn directly (via the venv)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
